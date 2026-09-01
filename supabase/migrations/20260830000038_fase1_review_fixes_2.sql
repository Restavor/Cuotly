-- Segunda pasada de la revisión de cierre de la Fase 1. Dos de los cuatro
-- arreglos anteriores no aguantaron, y uno de los tests nuevos era vacuo.
--
-- ============================================================
-- R1 (BLOQUEANTE) · la guarda de B2 miraba el ESTADO ANTERIOR, no la DEUDA.
--
-- `establishments.status` admite siete valores y yo solo bloqueé dos como
-- destino (`active` y `configuring`). Pero `assert_establishment_service_running()`
-- solo detiene el servicio en `paused` y `suspended`, así que **cualquier
-- otro estado equivale a servicio en marcha**. Una sola llamada bastaba:
--
--   suspended -> ending    ->  SERVICIO EN MARCHA con 48.279 céntimos vivos
--
-- Y en dos pasos, `suspended -> archived -> active`, se volvía a `active`
-- con la deuda intacta. Peor todavía: después de ese lavado, pagar ya no
-- arreglaba nada, porque `reactivate_establishment_after_payment()` sale
-- por `if v_status not in ('paused','suspended') then return false` y
-- nunca llama a `release_financial_holds()` ni a
-- `resume_establishment_counters()`. Los contadores quedaban congelados
-- para siempre con el servicio corriendo — el mismo daño que el bug
-- original, reintroducido por otra puerta y encima irreversible.
--
-- La guarda pasa a depender de la deuda, que es de lo que habla RN-FIN-13,
-- y no del estado del que se venga. `archived` se exceptúa a propósito:
-- RN-FIN-14 dice que la suspensión no cancela el compromiso y que la deuda
-- se mantiene, así que archivar a un moroso es legítimo — lo que no lo es
-- es seguir dándole servicio.
-- ============================================================

create or replace function public.establishment_has_overdue_debt(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.charges c
    where c.establishment_id = p_establishment_id
      and now() > c.due_at
      and public.charge_outstanding_cents(c.id) > 0
  );
$$;

revoke all on function public.establishment_has_overdue_debt(uuid)
  from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.set_establishment_status(p_establishment_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- La guarda mira la DEUDA, no el estado del que se venga. Mirar el
  -- estado anterior dejaba `suspended -> ending` como puerta abierta, y
  -- `ending` es servicio en marcha para todos los efectos.
  --
  -- `archived` se exceptúa: RN-FIN-14 mantiene la deuda del que se va, así
  -- que archivar a un moroso es legítimo. Lo que no lo es es darle
  -- servicio.
  if p_status not in ('paused', 'suspended', 'archived')
     and public.establishment_has_overdue_debt(p_establishment_id) then
    raise exception 'Este restaurante tiene deuda vencida: se reactiva al cobrar, no cambiando el estado a mano';
  end if;

  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = p_status where id = p_establishment_id;
  perform set_config('cuotly.status_change', 'off', true);

  perform public.record_state_event(v_space_id, 'establishment', p_establishment_id, v_previous, p_status, p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_space_id, auth.uid(), 'establishment.status_changed', 'establishment', p_establishment_id,
          jsonb_build_object('status', v_previous), jsonb_build_object('status', p_status), p_reason);
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

  -- Se acepta salir también de `ending` y `read_only`: si alguien llevó
  -- ahí un establecimiento moroso, pagar tiene que reanudar sus contadores
  -- igual. Sin esto, el lavado de estado dejaba los contadores congelados
  -- para siempre aunque después se pagara (R1 de la segunda pasada).
  if v_status not in ('paused', 'suspended', 'ending', 'read_only') then
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

-- ============================================================
-- R5 (BLOQUEANTE) · la bandera `cuotly.status_change` era una convención,
-- no una barrera.
--
-- La cabecera de la migración 37 decía "el disparador es la barrera, no el
-- privilegio". Era falso: `set_config()` la puede llamar cualquiera y el
-- GUC no está reservado, así que dentro de una transacción el
-- administrador se abría la puerta él mismo:
--
--   begin;
--     select set_config('cuotly.status_change','on',true);
--     update public.establishments set status='active' …;   -- UPDATE 1
--   commit;
--   auditoría del cambio: 0
--
-- El arreglo es el mecanismo que CLAUDE.md ya usa para SELECT: privilegio
-- de columna. `set_establishment_status()` es SECURITY DEFINER y corre con
-- los privilegios de su propietario, así que sigue funcionando.
--
-- Ojo con la forma: `revoke update (status)` a secas NO sirve, porque no
-- resta de una concesión a nivel de tabla. Hay que revocar el UPDATE de
-- tabla y volver a conceder columna a columna. Es el mismo detalle que ya
-- documenta CLAUDE.md para `select *`.
-- ============================================================

revoke update on public.establishments from anon, authenticated;
grant update (code, name, group_id) on public.establishments to authenticated;

comment on column public.establishments.status is
  'Estado del restaurante (RN-EST-08). NO tiene privilegio de UPDATE para
   `authenticated`: se cambia solo por set_establishment_status(), que
   comprueba permiso, audita, deja evento y no deja reactivar con deuda
   vencida. Ver la migración 20260830000038.';

-- ============================================================
-- R2 (BLOQUEANTE) · dos de los siete emisores nuevos eran código muerto.
--
-- En la migración 37 los puse DETRÁS del `return` de su función. En
-- PL/pgSQL eso no se ejecuta nunca, así que la reactivación por pago y la
-- petición de corrección no emitían nada, y la migración los describía
-- como emitidos. Comprobado: recorrido completo hasta pedir la corrección
-- gratuita -> `correction_requested`: ninguno.
--
-- Ninguna aserción de la suite los miraba, por eso pasaba verde. Los tests
-- de la segunda pasada sí los miran.
-- ============================================================

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

  -- Se acepta salir también de `ending` y `read_only`: si alguien llevó
  -- ahí un establecimiento moroso, pagar tiene que reanudar sus contadores
  -- igual. Sin esto, el lavado de estado dejaba los contadores congelados
  -- para siempre aunque después se pagara (R1 de la segunda pasada).
  if v_status not in ('paused', 'suspended', 'ending', 'read_only') then
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

  -- El aviso va ANTES del return. En la migración 37 estaba después, que
  -- en PL/pgSQL es código inalcanzable: la reactivación no avisaba nunca.
  perform public.notify_establishment_event(p_establishment_id, 'establishment_reactivated');

  return true;
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

  -- Igual que arriba: estaba detrás del return y no se emitía nunca.
  perform public.notify_job_event(p_job_id, 'correction_requested');

  return v_correction_id;
end;
$function$;

-- ============================================================
-- R7 · una excepción dentro de `emit_notification()` revertía la operación
-- de negocio, que es justo lo que CA-18 y RN-NOT-05 prohíben.
--
-- La cola cubre el fallo tardío (Resend caído). El temprano no lo cubría
-- nadie: comprobado en vivo, un `threshold_percent = 150` o un enlace nulo
-- lanzaban una excepción que salía de la función y se llevaba por delante
-- la operación que la había originado. Hoy es latente —ningún llamador
-- pasa umbral todavía—, pero ese parámetro existe precisamente para el
-- barrido de T2/T3 que está por escribir.
--
-- R6 · y la ausencia se calculaba con `current_date`, la fecha del
-- servidor. Era la única aparición de `current_date` en las 38
-- migraciones; el resto del árbol resuelve por la zona del espacio.
-- ============================================================


-- El manejador de R7 no se escribe aquí: `emit_notification()` se rehace
-- entera más abajo, en R4, para ganar `p_send_email`. Escribirla dos veces
-- dejaría DOS funciones con el mismo nombre (once y doce parámetros, todos
-- los de cola con valor por defecto) y cualquier llamada con ocho
-- argumentos pasaría a ser ambigua: `function ... is not unique`. El
-- `exception when others then return null` va en la versión de R4.

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
      -- CLAUDE.md MUST: "las fechas se calculan en la zona horaria del
      -- espacio". `current_date` a secas era la del servidor, y con el
      -- espacio en Europe/Madrid y la sesión en UTC la indisponibilidad
      -- entraba y salía con hasta dos horas de desfase.
      and (now() at time zone coalesce(
             (select s.timezone from public.spaces s where s.id = v_space_id), 'UTC'))::date
          between a.starts_on and a.ends_on
  ) then
    return false;
  end if;

  return true;
end;
$function$;

-- ============================================================
-- R4 · el §18 tiene siete filas y solo se cubrían dos y media.
--
--   · "Nueva solicitud sin asignar → propietario y todos los
--     administradores": no se emitía.
--   · "Asignación de un trabajo": se emitía al asignar, pero NO al
--     aprobar una reasignación — el nuevo responsable no se enteraba.
--   · "Inicio de un trabajo → visible DENTRO de Cuotly para el cliente,
--     sin correo ni push": estaba invertido. Iba al equipo y encolaba tres
--     correos; el cliente no recibía nada.
--   · "Publicación → cliente y supervisión": el cliente no recibía nada.
--
-- La audiencia `client` existía en el CHECK y en `src/core/notifications.ts`
-- y no la usaba nadie.
--
-- Lo que sigue SIN emitirse, dicho aquí y en el ROADMAP en vez de
-- describirlo como hecho: consumo de bolsa al 80 %/100 %, y los umbrales
-- de T2 y T3. Los dos necesitan el barrido de la cola, que no existe.
-- ============================================================

-- `emit_notification` gana un parámetro para NO encolar correo. Lo pide
-- §18 en una fila concreta: el aviso de inicio es visible dentro de Cuotly
-- "sin correo ni push". Sin esto no hay forma de cumplirla.
-- La firma cambia, así que la versión de once parámetros que dejó la
-- migración 36 hay que retirarla: `create or replace` no la sustituye, la
-- deja al lado como sobrecarga y vuelve ambigua toda llamada existente.
drop function if exists public.emit_notification(
  uuid, uuid, text, text, text, uuid, text, text, uuid, integer, bigint);

create or replace function public.emit_notification(
  p_space_id uuid,
  p_recipient_id uuid,
  p_event_type text,
  p_audience text,
  p_entity_type text,
  p_entity_id uuid,
  p_deep_link text,
  p_dedupe_key text,
  p_establishment_id uuid default null,
  p_threshold_percent integer default null,
  p_amount_cents bigint default null,
  p_send_email boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
  v_email_enabled boolean;
  v_in_app_enabled boolean;
  v_mandatory boolean := public.notification_event_is_mandatory(p_event_type);
begin
  select coalesce(np.in_app, true), coalesce(np.email, true)
  into v_in_app_enabled, v_email_enabled
  from (select 1) z
  left join public.notification_preferences np
    on np.profile_id = p_recipient_id
   and np.space_id = p_space_id
   and np.event_type = p_event_type;

  if not v_mandatory and not coalesce(v_in_app_enabled, true) then
    return null;
  end if;

  insert into public.notifications (
    space_id, recipient_id, event_type, audience, entity_type, entity_id,
    establishment_id, deep_link, threshold_percent, amount_cents, dedupe_key
  ) values (
    p_space_id, p_recipient_id, p_event_type, p_audience, p_entity_type, p_entity_id,
    p_establishment_id, p_deep_link, p_threshold_percent, p_amount_cents, p_dedupe_key
  )
  on conflict (recipient_id, dedupe_key) do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    return null;
  end if;

  if p_send_email and (v_mandatory or coalesce(v_email_enabled, true)) then
    insert into public.notification_deliveries (space_id, notification_id, channel)
    values (p_space_id, v_notification_id, 'email')
    on conflict (notification_id, channel) do nothing;
  end if;

  return v_notification_id;

exception
  -- CA-18 y RN-NOT-05, igual que arriba.
  when others then
    return null;
end;
$$;

revoke all on function public.emit_notification(uuid, uuid, text, text, text, uuid, text, text, uuid, integer, bigint, boolean)
  from public, anon, authenticated;

-- El aviso de un trabajo, ahora con su lado cliente.
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
  v_link text;
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
  v_link := '/espacios/' || v_slug || '/trabajos/' || p_job_id::text;
  v_key := p_event_type || ':' || p_job_id::text
           || coalesce(':' || p_threshold_percent::text, '');

  -- RN-NOT-01: propietario y administrador, y de los trabajadores SOLO el
  -- responsable asignado.
  for v_recipient in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
    union
    select v_assigned_to where v_assigned_to is not null
  loop
    if public.emit_notification(
         v_space_id, v_recipient, p_event_type, 'staff', 'job', p_job_id,
         v_link, v_key, v_establishment_id, p_threshold_percent) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  -- §18: el inicio y la publicación los ve el CLIENTE. El de inicio,
  -- "dentro de Cuotly, sin correo ni push" — de ahí el último parámetro.
  if p_event_type in ('job_started', 'job_published') then
    for v_recipient in
      select em.user_id from public.establishment_memberships em
      where em.establishment_id = v_establishment_id
    loop
      if public.emit_notification(
           v_space_id, v_recipient, p_event_type, 'client', 'job', p_job_id,
           v_link, v_key || ':client', v_establishment_id, p_threshold_percent, null,
           p_event_type <> 'job_started') is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end if;

  return v_sent;
end;
$$;

revoke all on function public.notify_job_event(uuid, text, integer)
  from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.submit_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_state <> 'draft' then
    return; -- idempotente: ya se envió.
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  perform public.assert_establishment_service_running(v_establishment_id);

  update public.requests set state = 'received' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'started', now(), auth.uid());

  -- §18, fila 1: "Nueva solicitud sin asignar -> propietario y todos los
  -- administradores". No se emitía.
  declare
    v_destinatario uuid;
  begin
    for v_destinatario in
      select sm.user_id from public.space_memberships sm
      where sm.space_id = v_space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
    loop
      perform public.emit_notification(
        v_space_id, v_destinatario, 'request_submitted', 'staff', 'request', p_request_id,
        '/espacios/' || public.space_slug(v_space_id) || '/solicitudes/' || p_request_id::text,
        'request_submitted:' || p_request_id::text, v_establishment_id);
    end loop;
  end;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.submitted', 'request', p_request_id, jsonb_build_object('state', 'draft'), jsonb_build_object('state', 'received'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_job_reassignment(p_job_id uuid, p_new_worker_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_state text;
  v_previous_assignee uuid;
  v_restored_state text;
begin
  select space_id, state, assigned_to into v_space_id, v_state, v_previous_assignee
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden aprobar una reasignación';
  end if;

  if v_state <> 'reassignment_requested' then
    raise exception 'Este trabajo no tiene una reasignación pendiente';
  end if;

  if not public.is_eligible_job_candidate(p_job_id, p_new_worker_id) then
    raise exception 'Esa persona no es un candidato válido para este trabajo';
  end if;

  select from_state into v_restored_state
  from public.state_events
  where entity_type = 'job' and entity_id = p_job_id and to_state = 'reassignment_requested'
  order by occurred_at desc
  limit 1;

  v_restored_state := coalesce(v_restored_state, 'assigned');

  update public.assignments set released_at = now() where job_id = p_job_id and released_at is null;

  insert into public.assignments (space_id, job_id, assignee_id, assigned_by, kind, reason)
  values (v_space_id, p_job_id, p_new_worker_id, auth.uid(), 'reassignment', p_reason);

  update public.jobs
  set assigned_to = p_new_worker_id, assigned_at = now(), state = v_restored_state
  where id = p_job_id;

  perform public.record_state_event(v_space_id, 'job', p_job_id, 'reassignment_requested', v_restored_state, p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.reassigned', 'job', p_job_id,
    jsonb_build_object('state', 'reassignment_requested', 'assigned_to', v_previous_assignee),
    jsonb_build_object('state', v_restored_state, 'assigned_to', p_new_worker_id, 'timers_restarted', false),
    p_reason
  );

  -- §18, fila 2: aprobar una reasignación es una asignación. Sin esto, el
  -- nuevo responsable no se enteraba de que el trabajo era suyo.
  perform public.notify_job_event(p_job_id, 'job_assigned');
end;
$function$;
