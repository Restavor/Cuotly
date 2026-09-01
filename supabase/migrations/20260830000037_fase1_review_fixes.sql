-- Revisión adversarial de cierre de la Fase 1. Cuatro bloqueantes, y los
-- cuatro de la misma familia: piezas construidas y probadas en aislamiento
-- a las que nadie llama, y puertas laterales por UPDATE directo que
-- esquivan las funciones que sí hacen las cosas bien.
--
-- ============================================================
-- B2 (BLOQUEANTE) · `establishments.status` se cambiaba con un UPDATE
-- directo: sin auditoría, sin evento, y levantando la parada por impago.
--
-- `establishments_update` deja a propietario y administrador escribir
-- CUALQUIER columna, y `authenticated` tiene los privilegios de tabla por
-- los valores por defecto de Supabase. Comprobado en vivo: con el
-- establecimiento `suspended` por impago, el administrador hace
--
--   update public.establishments set status = 'active' where id = …;
--
-- y el servicio vuelve a estar en marcha con CERO pagos registrados y CERO
-- filas de auditoría de la reactivación. Y peor: los contadores siguen
-- pausados, porque nadie llamó a `resume_establishment_counters()`. Es
-- exactamente lo contrario de RN-FIN-13.
--
-- Incumple además la regla MUST de CLAUDE.md ("todo cambio de estado
-- relevante genera un evento y un registro de auditoría con actor, fecha,
-- valor anterior, valor nuevo y motivo"), RN-EST-08, HU-09 y CA-15.
--
-- El arreglo no es quitar el UPDATE —el nombre, el logotipo o la zona
-- horaria sí se editan— sino cerrar la columna `status`: se cambia por las
-- funciones que auditan, y solo por ellas. El disparador es la barrera,
-- no el privilegio: así también cubre cualquier camino futuro.
-- ============================================================

create or replace function public.guard_establishment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('cuotly.status_change', true), '') <> 'on' then
    raise exception 'El estado de un establecimiento se cambia con set_establishment_status(), que lo audita';
  end if;
  return new;
end;
$$;

comment on function public.guard_establishment_status_change() is
  'CLAUDE.md MUST: todo cambio de estado deja evento y auditoría. Sin esto,
   un UPDATE directo del administrador levantaba la suspensión por impago
   sin pago y sin rastro (bloqueante B2 de la revisión de cierre).';

create trigger establishments_guard_status
  before update on public.establishments
  for each row execute function public.guard_establishment_status_change();

-- La puerta legítima. Comprueba permiso, audita, deja evento y —lo que el
-- UPDATE directo no hacía— mantiene coherentes los contadores: salir de
-- una parada por impago pasa por la reactivación de verdad.
create or replace function public.set_establishment_status(
  p_establishment_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_previous text;
begin
  select space_id, status into v_space_id, v_previous
  from public.establishments where id = p_establishment_id for update;

  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_clients') then
    raise exception 'Solo el propietario o un administrador pueden cambiar el estado de un restaurante';
  end if;

  if v_previous = p_status then
    return; -- CA-17: pulsar dos veces produce un único efecto.
  end if;

  -- RN-FIN-13: de una parada por impago solo se sale cobrando. Dejar que
  -- se saliera a mano era el agujero: el servicio arrancaba con la deuda
  -- viva y los contadores pausados.
  -- Solo se bloquea VOLVER A ACTIVO: reactivar sin cobrar era el agujero.
  -- Archivar o dar por finalizado un restaurante moroso sí es legítimo —se
  -- va sin pagar, y RN-FIN-14 dice que la deuda se mantiene—, así que la
  -- guarda no puede ser "no se sale del impago" a secas.
  if v_previous in ('paused', 'suspended') and p_status in ('active', 'configuring') then
    raise exception 'Este restaurante está parado por impago: se reactiva al cobrar, no cambiando el estado a mano';
  end if;

  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = p_status where id = p_establishment_id;
  perform set_config('cuotly.status_change', 'off', true);

  perform public.record_state_event(v_space_id, 'establishment', p_establishment_id, v_previous, p_status, p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.status_changed', 'establishment', p_establishment_id,
          jsonb_build_object('status', v_previous), jsonb_build_object('status', p_status), p_reason);
end;
$$;

comment on function public.set_establishment_status(uuid, text, text) is
  'HU-09 y RN-EST-08: la única puerta para cambiar el estado de un
   restaurante. Audita, deja evento y no permite salir de una parada por
   impago sin cobrar (RN-FIN-13).';
CREATE OR REPLACE FUNCTION public.set_establishment_nonpayment_status(p_establishment_id uuid, p_status text, p_cause text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_current text;
begin
  select space_id, status into v_space_id, v_current
  from public.establishments where id = p_establishment_id
  for update;

  if v_current = p_status then
    return; -- Idempotente.
  end if;

  -- La barrera de B2 deja pasar a quien audita. Esta función es la del
  -- ciclo de impago: audita y deja evento más abajo, y es interna.
  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = p_status where id = p_establishment_id;
  perform set_config('cuotly.status_change', 'off', true);

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (v_space_id, 'establishment', p_establishment_id, v_current, p_status, auth.uid(),
          'Ciclo de impago', p_cause);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.' || p_cause, 'establishment', p_establishment_id,
          jsonb_build_object('status', v_current), jsonb_build_object('status', p_status), 'Ciclo de impago');
end;
$function$;

-- ============================================================
-- B3 (BLOQUEANTE) · un trabajador leía la auditoría financiera completa.
--
-- CA-03 dice que un trabajador no puede ver finanzas globales, y las
-- tablas financieras sí están bien cerradas (`can_read_establishment_finance`).
-- Pero `audit_log` guarda los importes dentro de `new_value` y su política
-- se lo abría a TODO miembro del espacio.
--
-- Comprobado en vivo, como trabajador que ni siquiera tiene ese
-- establecimiento autorizado:
--
--   cobros visibles directamente ............. 0   ← la puerta estrecha, cerrada
--   filas financieras de audit_log ........... 2   ← la ancha, abierta
--   charge.issued -> {"total_cents": 72479, …}
--
-- El test de CA-03 del Hito 7 solo miraba la puerta estrecha (los archivos
-- de categoría `billing`), así que la regla se cumplía donde se probaba y
-- no donde no. Guarda enmascarado de manual.
--
-- La visibilidad financiera de la auditoría pasa a ser la misma que la de
-- las tablas financieras: `manage_finance`. Lo demás del espacio se sigue
-- viendo igual, porque CA-16 y HU-36 dependen de ello.
-- ============================================================

drop policy audit_log_select on public.audit_log;

create policy audit_log_select on public.audit_log
for select
using (
  public.is_platform_owner()
  or (
    space_id is not null
    and public.is_space_member(space_id)
    and (
      -- Las acciones con dinero dentro, solo para quien puede ver dinero.
      action not like 'charge.%'
      and action not like 'payment.%'
      and action not like 'subscription.%'
      and action not like 'financial%'
      or public.has_capability(space_id, 'manage_finance')
    )
  )
);

comment on policy audit_log_select on public.audit_log is
  'CA-03: un trabajador no ve finanzas globales, tampoco por la auditoría.
   Las acciones de cobro, pago y suscripción llevan importes en
   `new_value`, así que se gobiernan con `manage_finance`, igual que las
   tablas financieras.';

-- ============================================================
-- B4 (BLOQUEANTE) · RN-ASG-12: una ausencia aprobada no dejaba
-- indisponible a nadie.
--
-- "Una ausencia aprobada marca automáticamente al trabajador como no
-- disponible y, si deja trabajos sin cobertura, se avisa para reasignar."
-- Ni lo uno ni lo otro: `decide_absence()` no tocaba la disponibilidad e
-- `is_eligible_job_candidate()` solo miraba `worker_availability`.
--
-- Comprobado en vivo: ausencia de hoy a +5 días, APROBADA, y acto seguido
-- `auto_assign_job()` le asignaba un trabajo a la persona ausente.
--
-- Se arregla derivando la indisponibilidad de la ausencia en vez de
-- escribir en `worker_availability`: esa tabla es la disponibilidad que el
-- trabajador declara (HU-30), y pisársela dejaría el dato mal cuando la
-- ausencia termine. El evento `absence_uncovered_jobs`, que estaba
-- declarado y traducido pero no lo emitía nadie, se emite ahora.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_eligible_job_candidate(p_job_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_required_specialty text;
  v_role public.space_role;
begin
  select j.space_id, j.establishment_id, j.required_specialty
  into v_space_id, v_establishment_id, v_required_specialty
  from public.jobs j where j.id = p_job_id;

  if v_space_id is null then
    return false;
  end if;

  if not public.member_can_perform_jobs(v_space_id, p_user_id) then
    return false;
  end if;

  select role into v_role
  from public.space_memberships
  where space_id = v_space_id and user_id = p_user_id and status = 'active';

  if v_role = 'worker' and not public.is_authorized_for_establishment(v_establishment_id, p_user_id) then
    return false;
  end if;

  if v_required_specialty is not null and not exists (
    select 1 from public.worker_specialties ws
    where ws.user_id = p_user_id
      and ws.space_id = v_space_id
      and ws.revoked_at is null
      and ws.specialty in ('general', v_required_specialty)
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.worker_availability wa
    where wa.space_id = v_space_id and wa.user_id = p_user_id and wa.available = false
  ) then
    return false;
  end if;

  -- RN-ASG-12: "una ausencia aprobada marca automáticamente al trabajador
  -- como no disponible". Se comprueba aquí, contra la tabla de ausencias,
  -- en vez de escribir en `worker_availability` al aprobarla: la
  -- disponibilidad declarada es del trabajador (HU-30) y una ausencia no
  -- debe pisársela ni dejarla mal cuando la ausencia termina. Es un estado
  -- derivado, como manda RN-DAT-05.
  if exists (
    select 1 from public.absences a
    where a.space_id = v_space_id
      and a.user_id = p_user_id
      and a.state = 'approved'
      and current_date between a.starts_on and a.ends_on
  ) then
    return false;
  end if;

  return true;
end;
$function$;

-- ============================================================
-- B1 (BLOQUEANTE) · toda la maquinaria de avisos estaba montada y nadie
-- la usaba.
--
-- `emit_notification()` solo se llamaba desde `request_absence()` y
-- `decide_absence()`. Asignar, comenzar, publicar, pedir corrección,
-- pausar o suspender por impago y reactivar no emitían nada. Comprobado en
-- vivo: un trabajo asignado, comenzado y publicado dejaba CERO avisos.
--
-- Además, las cabeceras de las migraciones 35 y 36 citaban tres funciones
-- y un fichero que no existen (`notify_job_event`, `emit_sla_notification`,
-- `enqueue_scheduled_job`, `src/services/queue-runner.ts`), descritos como
-- si estuvieran hechos. Esto crea el primero de verdad; lo que siga sin
-- existir se dice en el ROADMAP en vez de describirlo como hecho.
--
-- RN-NOT-01 —"no se avisa a trabajadores que no estén asignados"— se
-- cumple aquí, eligiendo los destinatarios, y no en `emit_notification()`,
-- que no sabe quién está asignado a qué. La misma regla vive en
-- `src/core/notifications.ts` con sus tests; esta es su mitad de servidor.
-- ============================================================

create or replace function public.notify_job_event(
  p_job_id uuid,
  p_event_type text,
  p_threshold_percent integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_assigned_to uuid;
  v_slug text;
  v_recipient uuid;
  v_sent integer := 0;
  v_key text;
begin
  select j.space_id, j.establishment_id, j.assigned_to
  into v_space_id, v_establishment_id, v_assigned_to
  from public.jobs j where j.id = p_job_id;

  if v_space_id is null then
    return 0;
  end if;

  v_slug := public.space_slug(v_space_id);
  v_key := p_event_type || ':' || p_job_id::text
           || coalesce(':' || p_threshold_percent::text, '');

  -- RN-NOT-01: propietario y administrador (§20.4: su inicio es el
  -- resumen de la operación) y, de los trabajadores, SOLO el responsable
  -- asignado. Un trabajador sin asignar no recibe nada.
  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
    union
    select v_assigned_to where v_assigned_to is not null
  loop
    if public.emit_notification(
         v_space_id, v_recipient, p_event_type, 'staff', 'job', p_job_id,
         '/espacios/' || v_slug || '/trabajos/' || p_job_id::text,
         v_key, v_establishment_id, p_threshold_percent) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.notify_job_event(uuid, text, integer)
  from public, anon, authenticated;

create or replace function public.notify_establishment_event(
  p_establishment_id uuid,
  p_event_type text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_slug text;
  v_recipient uuid;
  v_sent integer := 0;
begin
  select e.space_id into v_space_id from public.establishments e where e.id = p_establishment_id;
  if v_space_id is null then
    return 0;
  end if;

  v_slug := public.space_slug(v_space_id);

  -- Un impago es cosa de quien lleva las finanzas, no de todo el equipo.
  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
  loop
    if public.emit_notification(
         v_space_id, v_recipient, p_event_type, 'staff', 'establishment', p_establishment_id,
         '/espacios/' || v_slug || '/restaurantes/' || p_establishment_id::text,
         p_event_type || ':' || p_establishment_id::text || ':' || to_char(now(), 'YYYY-MM-DD'),
         p_establishment_id) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.notify_establishment_event(uuid, text)
  from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.apply_job_assignment(p_job_id uuid, p_worker_id uuid, p_kind text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_previous_assignee uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, establishment_id
  into v_space_id, v_state, v_previous_assignee, v_establishment_id
  from public.jobs where id = p_job_id;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.assignments set released_at = now()
  where job_id = p_job_id and released_at is null;

  insert into public.assignments (space_id, job_id, assignee_id, assigned_by, kind, reason)
  values (v_space_id, p_job_id, p_worker_id, auth.uid(), p_kind, p_reason);

  update public.jobs
  set assigned_to = p_worker_id, assigned_at = now(), state = 'assigned'
  where id = p_job_id;

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, 'assigned', p_reason);

  -- RN-SLA-05: T2 arranca cuando el trabajo queda asignado. Una
  -- reasignación NO vuelve a arrancarlo (RN-SLA-09, CA-12) — por eso el
  -- evento solo se escribe en la primera asignación, cuando el trabajo
  -- venía de pending_assignment.
  if v_state = 'pending_assignment' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_space_id, 't2', 'job', p_job_id, 'started', now(), auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.assigned', 'job', p_job_id,
    jsonb_build_object('state', v_state, 'assigned_to', v_previous_assignee),
    jsonb_build_object('state', 'assigned', 'assigned_to', p_worker_id, 'kind', p_kind),
    p_reason
  );

  perform public.notify_job_event(p_job_id, 'job_assigned');
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_job(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_request_id uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, request_id, establishment_id
  into v_space_id, v_state, v_assigned_to, v_request_id, v_establishment_id
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  -- RN-JOB-05: un cambio incluido en el plan es una obligación contractual
  -- del espacio; el responsable no lo rechaza por preferencia. Quien
  -- comienza es el responsable asignado, nadie más.
  if v_assigned_to is null or v_assigned_to <> auth.uid() then
    raise exception 'Solo el responsable asignado puede comenzar este trabajo';
  end if;

  if v_state = 'in_progress' then
    return; -- CA-17: pulsar Comenzar dos veces produce un único efecto.
  end if;

  if v_state <> 'assigned' then
    raise exception 'El trabajo no está asignado y pendiente de comenzar';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.jobs set state = 'in_progress', started_at = now(), started_by = auth.uid() where id = p_job_id;
  update public.requests set state = 'in_progress' where id = v_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values
    (v_space_id, 't2', 'job', p_job_id, 'stopped', now(), auth.uid()),
    (v_space_id, 't3', 'job', p_job_id, 'started', now(), auth.uid());

  perform public.record_state_event(v_space_id, 'job', p_job_id, 'assigned', 'in_progress', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'job.started', 'job', p_job_id,
    jsonb_build_object('state', 'assigned'),
    jsonb_build_object('state', 'in_progress')
  );

  perform public.notify_job_event(p_job_id, 'job_started');
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_job(p_job_id uuid, p_correction_window_ends_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_request_id uuid;
  v_establishment_id uuid;
begin
  select space_id, state, assigned_to, request_id, establishment_id
  into v_space_id, v_state, v_assigned_to, v_request_id, v_establishment_id
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if v_assigned_to is null or v_assigned_to <> auth.uid() then
    raise exception 'Solo el responsable asignado puede publicar este trabajo';
  end if;

  if v_state = 'published' then
    return; -- CA-17: publicar dos veces produce un único efecto.
  end if;

  if v_state <> 'in_progress' then
    raise exception 'Solo se puede publicar un trabajo en curso';
  end if;

  if p_correction_window_ends_at is null
     or p_correction_window_ends_at <= now()
     or p_correction_window_ends_at > now() + interval '60 days' then
    raise exception 'La ventana de corrección recibida no es válida';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.jobs
  set state = 'published',
      published_at = now(),
      published_by = auth.uid(),
      correction_window_ends_at = p_correction_window_ends_at
  where id = p_job_id;

  update public.requests set state = 'published' where id = v_request_id;

  -- RN-SLA-13: T3 se detiene al publicar.
  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't3', 'job', p_job_id, 'stopped', now(), auth.uid());

  perform public.record_state_event(v_space_id, 'job', p_job_id, 'in_progress', 'published', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'job.published', 'job', p_job_id,
    jsonb_build_object('state', 'in_progress'),
    jsonb_build_object('state', 'published', 'correction_window_ends_at', p_correction_window_ends_at)
  );

  perform public.notify_job_event(p_job_id, 'job_published');
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_establishment_nonpayment_status(p_establishment_id uuid, p_status text, p_cause text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_current text;
begin
  select space_id, status into v_space_id, v_current
  from public.establishments where id = p_establishment_id
  for update;

  if v_current = p_status then
    return; -- Idempotente.
  end if;

  -- La barrera de B2 deja pasar a quien audita. Esta función es la del
  -- ciclo de impago: audita y deja evento más abajo, y es interna.
  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = p_status where id = p_establishment_id;
  perform set_config('cuotly.status_change', 'off', true);

  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason, cause)
  values (v_space_id, 'establishment', p_establishment_id, v_current, p_status, auth.uid(),
          'Ciclo de impago', p_cause);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.' || p_cause, 'establishment', p_establishment_id,
          jsonb_build_object('status', v_current), jsonb_build_object('status', p_status), 'Ciclo de impago');

  -- RN-FIN-10/11 y §18: el impago avisa. Es uno de los cuatro eventos que
  -- RN-NOT-03 no deja desactivar.
  if p_status = 'paused' then
    perform public.notify_establishment_event(p_establishment_id, 'establishment_paused_nonpayment');
  elsif p_status = 'suspended' then
    perform public.notify_establishment_event(p_establishment_id, 'establishment_suspended_nonpayment');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reactivate_establishment_after_payment(p_establishment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_status text;
  v_restore text;
  v_last_reactivation timestamptz;
begin
  select space_id, status into v_space_id, v_status
  from public.establishments where id = p_establishment_id
  for update;

  if v_status not in ('paused', 'suspended') then
    return false;
  end if;

  -- RN-FIN-14: la deuda no desaparece al reactivar. Si queda algún cobro
  -- vencido sin saldar, no se reactiva nada.
  if exists (
    select 1 from public.charges c
    where c.establishment_id = p_establishment_id
      and now() > c.due_at
      and public.charge_outstanding_cents(c.id) > 0
  ) then
    return false;
  end if;

  select max(se.occurred_at) into v_last_reactivation
  from public.state_events se
  where se.entity_type = 'establishment' and se.entity_id = p_establishment_id
    and se.cause = 'nonpayment_reactivation';

  select se.from_state into v_restore
  from public.state_events se
  where se.entity_type = 'establishment' and se.entity_id = p_establishment_id
    and se.cause in ('nonpayment_pause', 'nonpayment_suspension')
    and se.occurred_at > coalesce(v_last_reactivation, '-infinity'::timestamptz)
  order by se.occurred_at asc
  limit 1;

  perform public.release_financial_holds(p_establishment_id);
  perform public.set_establishment_nonpayment_status(
    p_establishment_id, coalesce(v_restore, 'active'), 'nonpayment_reactivation'
  );
  perform public.resume_establishment_counters(p_establishment_id);

  return true;

  perform public.notify_establishment_event(p_establishment_id, 'establishment_reactivated');
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_free_correction(p_job_id uuid, p_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_request_id uuid;
  v_window_ends_at timestamptz;
  v_used_at timestamptz;
  v_published_at timestamptz;
  v_correction_id uuid;
begin
  select space_id, establishment_id, state, request_id, correction_window_ends_at, free_correction_used_at, published_at
  into v_space_id, v_establishment_id, v_state, v_request_id, v_window_ends_at, v_used_at, v_published_at
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'Hay que explicar qué hay que corregir';
  end if;

  -- RN-COR-01: una sola corrección en total por trabajo, se pida durante
  -- la ejecución o después de publicar.
  if v_used_at is not null then
    raise exception 'Este trabajo ya usó su corrección mínima gratuita (RN-COR-01)';
  end if;

  if v_state not in ('in_progress', 'blocked_by_client', 'authorized_pause', 'published') then
    raise exception 'Este trabajo no está en un estado en el que quepa una corrección mínima';
  end if;

  -- La ventana solo corre desde la publicación (RN-COR-02). Durante la
  -- ejecución no hay ventana que agotar: el trabajo todavía no ha
  -- terminado.
  if v_published_at is not null and (v_window_ends_at is null or now() > v_window_ends_at) then
    raise exception 'La ventana de corrección de este trabajo ya se cerró (RN-COR-02)';
  end if;

  insert into public.corrections
    (space_id, establishment_id, job_id, request_id, kind, description, requested_by)
  values
    (v_space_id, v_establishment_id, p_job_id, v_request_id, 'client_request', p_description, auth.uid())
  returning id into v_correction_id;

  update public.jobs set free_correction_used_at = now() where id = p_job_id;

  -- Pedida durante la ejecución, la corrección forma parte del trabajo que
  -- ya está en marcha: el estado de la solicitud no cambia (sigue "En
  -- curso"). Pedida sobre un trabajo publicado, la solicitud pasa a
  -- "Corrección pedida" (request-states.ts: published -> correction_requested).
  if v_state = 'published' then
    update public.requests set state = 'correction_requested' where id = v_request_id;
  end if;

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, v_state, 'correction_requested');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (
    v_space_id, auth.uid(), 'correction.requested', 'correction', v_correction_id,
    jsonb_build_object('job_id', p_job_id, 'kind', 'client_request', 'consumes_free_correction', true, 'during_execution', v_state <> 'published'),
    p_description
  );

  return v_correction_id;

  perform public.notify_job_event(p_job_id, 'correction_requested');
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_absence(p_absence_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_user_id uuid;
  v_state text;
  v_slug text;
begin
  select space_id, user_id, state into v_space_id, v_user_id, v_state
  from public.absences where id = p_absence_id for update;

  if v_space_id is null then
    raise exception 'Ausencia no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_absences') then
    raise exception 'Solo el propietario o un administrador pueden decidir una ausencia';
  end if;

  if v_state <> 'requested' then
    return; -- CA-17: decidir dos veces produce un único efecto.
  end if;

  update public.absences
  set state = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = p_note
  where id = p_absence_id;

  select slug into v_slug from public.spaces where id = v_space_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'absence.decided', 'absence', p_absence_id,
          jsonb_build_object('state', 'requested'),
          jsonb_build_object('state', case when p_approve then 'approved' else 'rejected' end), p_note);

  perform public.emit_notification(
    v_space_id, v_user_id, 'absence_decided', 'staff', 'absence', p_absence_id,
    '/espacios/' || v_slug || '/calendario',
    'absence_decided:' || p_absence_id::text
  );

  -- RN-ASG-12, segunda mitad: "si deja trabajos sin cobertura, se avisa
  -- para reasignar". El evento estaba declarado y traducido, y no lo
  -- emitía nadie.
  if p_approve and exists (
    select 1 from public.jobs j
    where j.assigned_to = v_user_id and j.space_id = v_space_id
      and j.state in ('assigned', 'in_progress', 'blocked_by_client', 'authorized_pause')
  ) then
    declare
      v_decisor uuid;
    begin
      for v_decisor in
        select sm.user_id from public.space_memberships sm
        where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
      loop
        perform public.emit_notification(
          v_space_id, v_decisor, 'absence_uncovered_jobs', 'staff', 'absence', p_absence_id,
          '/espacios/' || v_slug || '/calendario',
          'absence_uncovered_jobs:' || p_absence_id::text);
      end loop;
    end;
  end if;
end;
$function$;

