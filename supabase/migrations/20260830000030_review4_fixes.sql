-- Cuarta pasada de revisión del Hito 7. Tres bloqueantes, dos de ellos en
-- migraciones YA DESPLEGADAS (Hito 6), no en el Hito 7.
--
--   B1 · `job_assignee()` entrega la identidad del trabajador a cualquiera,
--        incluido `anon`, por llamada RPC directa.
--   B2 · El restaurante lee la identidad del equipo en `assignments`,
--        `tasks` y los `state_events` de tarea.
--   B3 · La suspensión por impago no detiene nada después del instante en
--        que se evalúa: `start_job`, `publish_job`, `submit_request` y
--        `accept_request` no miran el estado del establecimiento.
--
-- ============================================================
-- B1 · Funciones internas del Hito 6 que quedaron abiertas por RPC.
--
-- `job_assignee(uuid)` es SECURITY DEFINER, no comprueba absolutamente
-- nada y devuelve `jobs.assigned_to` — exactamente la columna que la vista
-- barrera `client_jobs` existe para esconder (CA-04). Y no tiene ni un
-- solo llamador: es código muerto que dejó abierta por RPC la identidad
-- que el resto del hito se esfuerza en ocultar.
--
-- Verificado en vivo sobre una réplica del estado desplegado: sin sesión
-- ninguna, `set role anon; select public.job_assignee('<uuid>')` devolvía
-- el uuid de la trabajadora asignada.
--
-- Es la misma clase de fallo que cerró la migración 20260830000024 para
-- otras nueve funciones: en Supabase, `revoke ... from public` no cierra
-- nada, porque el proyecto concede EXECUTE por defecto a `anon` y
-- `authenticated` sobre toda función nueva (CLAUDE.md).
--
-- `is_eligible_job_candidate(uuid, uuid)` es del mismo tipo: SECURITY
-- DEFINER sin comprobación propia. Solo la llaman otras funciones SECURITY
-- DEFINER (`job_candidate_ids`, `assign_job`, `approve_job_reassignment`),
-- que se ejecutan con los privilegios de su propietario, así que revocarla
-- no rompe ninguna de las tres.
-- ============================================================

revoke all on function public.job_assignee(uuid)
  from public, anon, authenticated;

revoke all on function public.is_eligible_job_candidate(uuid, uuid)
  from public, anon, authenticated;

-- ============================================================
-- B2 · El restaurante no ve la organización interna del equipo.
--
-- Principio P7 del PRD (§ tabla de principios): "El cliente no ve la
-- organización interna". Las asignaciones y las tareas SON la organización
-- interna: quién hace qué, quién se lo mandó y con qué carga. El PRD no
-- pide en ninguna parte que el restaurante vea el desglose en tareas de su
-- trabajo; lo que ve es el trabajo, por la vista `client_jobs`.
--
-- La causa es la ya conocida: `can_read_job()` incluye
-- `is_establishment_client()`, y estas tres políticas lo usaban SIN el
-- `is_space_member(space_id)` que sí llevan `jobs_select`, `blocks_select`
-- y la rama `job` de `state_events_select`.
--
-- Verificado en vivo sobre una réplica del estado desplegado: el
-- propietario local del restaurante leía cinco columnas de identidad del
-- equipo — assignments.assignee_id, assignments.assigned_by,
-- tasks.assignee_id, tasks.created_by y state_events.actor_id de un evento
-- de tarea.
--
-- Aquí NO vale el privilegio de columna que se usó en `messages`, `files`
-- o `corrections`: allí el cliente tiene que ver la fila (es su mensaje,
-- su archivo, su corrección) y solo hay que taparle una columna. Una tarea
-- interna no le corresponde entera.
-- ============================================================

drop policy assignments_select on public.assignments;

create policy assignments_select on public.assignments
for select
using (public.is_space_member(space_id) and public.can_read_job(job_id));

comment on policy assignments_select on public.assignments is
  'Solo el equipo del espacio (P7: el cliente no ve la organización
   interna). `can_read_job()` por sí solo incluye al cliente del
   establecimiento — ver la migración 20260830000030.';

drop policy tasks_select on public.tasks;

create policy tasks_select on public.tasks
for select
using (
  public.has_capability(space_id, 'assign_jobs')
  or assignee_id = auth.uid()
  or (job_id is not null and public.is_space_member(space_id) and public.can_read_job(job_id))
);

comment on policy tasks_select on public.tasks is
  'Quien asigna, el responsable de la tarea, y el resto del equipo del
   espacio que pueda leer el trabajo. El cliente no (P7).';

drop policy state_events_select on public.state_events;

create policy state_events_select on public.state_events
for select
using (
  public.has_capability(space_id, 'assign_jobs')
  or (entity_type = 'job' and public.can_read_job(entity_id) and public.is_space_member(space_id))
  or (entity_type = 'task' and public.is_space_member(space_id) and public.can_read_task(entity_id))
);

comment on policy state_events_select on public.state_events is
  'Solo el equipo. El cliente ve el estado de SUS trabajos por la vista
   barrera `client_establishment_status_events`, sin actor_id. La rama de
   tarea llevaba `can_read_task()` a secas, que incluye al cliente vía
   `can_read_job()` — ver la migración 20260830000030.';

-- ============================================================
-- B3 · "Servicio detenido" tiene que detener el servicio.
--
-- RN-FIN-11: "+72 h naturales → servicio detenido y establecimiento
-- Suspendido por impago". RN-FIN-12: "se detienen trabajos, publicaciones
-- y contadores".
--
-- `apply_financial_hold_on_jobs()` solo pausaba los trabajos que estaban
-- en curso en el instante exacto en que se evaluó el impago. Nada impedía
-- reanudar el servicio después: `start_job()`, `publish_job()`,
-- `submit_request()` y `accept_request()` no consultaban el estado del
-- establecimiento, así que bastaba con pulsar un botón para que arrancara
-- un T3 nuevo, o un T1 nuevo, corriendo durante la suspensión.
--
-- La guarda mira SOLO `suspended`, no `paused`. RN-FIN-10 dice que a las
-- +24 h el establecimiento queda "Pausado por impago" y no menciona que el
-- servicio se detenga; el servicio se detiene a las +72 h (RN-FIN-11).
-- Guardar también `paused` sería una regla más dura que la escrita, y este
-- repositorio no inventa reglas.
--
-- La guarda va DESPUÉS de las comprobaciones de permiso y de los retornos
-- idempotentes de cada función, y antes de la primera escritura: así
-- pulsar "Comenzar" dos veces en un establecimiento suspendido sigue
-- teniendo un único efecto (CA-17) en vez de cambiar de error.
-- ============================================================

create or replace function public.assert_establishment_not_suspended(p_establishment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.establishments where id = p_establishment_id;

  if v_status = 'suspended' then
    raise exception 'El establecimiento está suspendido por impago: el servicio está detenido';
  end if;
end;
$$;

comment on function public.assert_establishment_not_suspended(uuid) is
  'RN-FIN-11 / RN-FIN-12: con el establecimiento suspendido por impago no
   se comienzan ni publican trabajos, ni se envían o aceptan solicitudes
   (que arrancarían contadores nuevos). Interna: no comprueba permisos por
   su cuenta, la llaman funciones que sí lo hacen.';

revoke all on function public.assert_establishment_not_suspended(uuid)
  from public, anon, authenticated;

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

  perform public.assert_establishment_not_suspended(v_establishment_id);

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

  perform public.assert_establishment_not_suspended(v_establishment_id);

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
end;
$function$;

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

  perform public.assert_establishment_not_suspended(v_establishment_id);

  update public.requests set state = 'received' where id = p_request_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't1', 'request', p_request_id, 'started', now(), auth.uid());

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space_id, auth.uid(), 'request.submitted', 'request', p_request_id, jsonb_build_object('state', 'draft'), jsonb_build_object('state', 'received'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_category text;
  v_subscription_id uuid;
  v_included_small integer;
  v_included_photo integer;
  v_included_medium integer;
  v_included_large integer;
  v_included integer;
  v_budgeted boolean := true;
  v_cycle_id uuid;
  v_cycle_included integer;
  v_balance integer;
  v_seq bigint;
  v_job_code text;
  v_job_id uuid;
  v_entry_id uuid;
begin
  select space_id, establishment_id, state, validated_category
  into v_space_id, v_establishment_id, v_state, v_category
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  if v_state = 'accepted' then
    return; -- CA-17: pulsar aceptar dos veces no duplica el efecto.
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  if v_category is null then
    raise exception 'La solicitud no tiene una categoría validada';
  end if;

  perform public.assert_establishment_not_suspended(v_establishment_id);

  select s.id, p.included_small, p.included_photo, p.included_medium, p.included_large
  into v_subscription_id, v_included_small, v_included_photo, v_included_medium, v_included_large
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
  limit 1;

  if v_subscription_id is not null then
    v_included := case v_category
      when 'small' then v_included_small
      when 'photo' then v_included_photo
      when 'medium' then v_included_medium
      when 'large' then v_included_large
    end;

    if v_included > 0 then
      v_budgeted := false;
      v_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

      select case v_category
        when 'small' then included_small
        when 'photo' then included_photo
        when 'medium' then included_medium
        when 'large' then included_large
      end into v_cycle_included
      from public.consumption_cycles where id = v_cycle_id;

      select v_cycle_included + coalesce(sum(amount), 0) into v_balance
      from public.consumption_entries
      where consumption_cycle_id = v_cycle_id and category = v_category;

      if v_balance <= 0 then
        raise exception 'Sin crédito disponible en el ciclo actual para la categoría %', v_category;
      end if;
    end if;
  end if;

  insert into public.space_sequences (space_id, sequence_name, next_value)
  values (v_space_id, 'job', 2)
  on conflict (space_id, sequence_name)
  do update set next_value = public.space_sequences.next_value + 1
  returning next_value - 1 into v_seq;
  v_job_code := 'TRB-' || lpad(v_seq::text, 4, '0');

  insert into public.jobs (space_id, establishment_id, request_id, code, category)
  values (v_space_id, v_establishment_id, p_request_id, v_job_code, v_category)
  returning id into v_job_id;

  if not v_budgeted then
    insert into public.consumption_entries
      (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, created_by)
    values
      (v_space_id, v_establishment_id, v_cycle_id, v_category, -1, 'debit', p_request_id, v_job_id, auth.uid())
    returning id into v_entry_id;
  end if;

  insert into public.acceptances
    (space_id, establishment_id, request_id, job_id, category, consumption_cycle_id, consumption_entry_id, budgeted, accepted_by)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted, auth.uid());

  update public.requests set state = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted', 'request', p_request_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'accepted', 'job_id', v_job_id, 'job_code', v_job_code, 'budgeted', v_budgeted)
  );
end;
$function$;
