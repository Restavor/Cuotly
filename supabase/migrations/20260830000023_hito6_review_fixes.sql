-- Corrige los hallazgos de la revisión adversarial del Hito 6 (commit
-- 3f4f6da). Migración nueva: ninguna anterior se toca (CLAUDE.md).
--
-- Hallazgos que se cierran aquí, con la regla que incumplían:
--   B2 · RN-JOB-04 / CA-06 — tras pulsar Comenzar, la solicitud pasa a
--        `in_progress` y cancel_accepted_request() solo aceptaba
--        `accepted`: la rama "después de Comenzar" era inalcanzable desde
--        la aplicación, justo la que CA-06 exige.
--   I1 · §4.3 / CA-01 — open_team_error_correction() solo miraba
--        `perform_jobs`, así que cualquier trabajador del espacio podía
--        abrir una corrección sobre un trabajo que ni siquiera puede leer.
--   I2 · §4.3 — corrections_select daba acceso a todo el espacio, no solo
--        a quien puede leer el trabajo.
--   I3 · RN-JOB-08 / CLAUDE.md MUST NOT — el cliente leía la fila entera
--        de `blocks` (notas internas, motivos financieros) y las columnas
--        de identidad del equipo en `jobs`.
--   I4 · RN-COR-02 — "puede usarse durante la ejecución" no estaba
--        implementado: solo se aceptaba la corrección sobre un trabajo ya
--        publicado.
--   I5 · RN-COR-08 — la conversación de una solicitud cerrada seguía
--        aceptando mensajes.
--   I6 · RN-ASG-01 / §4.3 — create_job_task() dejaba repartir una tarea a
--        alguien sin ese establecimiento autorizado.
--   I7 · RN-SUP-01 — el sustituto de supervisión no tenía que ser
--        administrador.
--   M1 · RN-SUP-03 — una sustitución no se podía acortar, ampliar ni
--        retirar: no había ninguna vía de escritura.
--   M2 · CLAUDE.md ("Cuotly es multiempresa") — dos índices únicos y la
--        comprobación de especialidad ignoraban `space_id`.
--   M5 · complete_correction() no distinguía "todavía no empezada" de "ya
--        terminada".

-- ============================================================
-- M2 · Unicidad por espacio.
-- La misma persona puede trabajar en dos espacios de mantenimiento
-- distintos: sus especialidades y su supervisión son de cada espacio, no
-- globales de la plataforma.
-- ============================================================
drop index public.worker_specialties_active_idx;

create unique index worker_specialties_active_idx
  on public.worker_specialties (space_id, user_id, specialty)
  where revoked_at is null;

drop index public.supervisions_one_principal_idx;

-- RN-SUP-02: exactamente un principal por trabajador **en cada espacio**.
create unique index supervisions_one_principal_idx
  on public.supervisions (space_id, worker_id)
  where kind = 'principal' and revoked_at is null;

-- La comprobación de especialidad de is_eligible_job_candidate() tenía el
-- mismo hueco: miraba las especialidades de la persona en cualquier
-- espacio. Se sustituye entera (mismo cuerpo, con el filtro por espacio).
create or replace function public.is_eligible_job_candidate(p_job_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
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

  return true;
end;
$$;

-- Variante por persona de is_authorized_worker_establishment() (que habla
-- siempre de auth.uid()): la necesitan is_eligible_job_candidate() y
-- create_job_task(), que deciden sobre **otra** persona.
create or replace function public.is_authorized_for_establishment(p_establishment_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.worker_establishments we
    where we.user_id = p_user_id
      and we.establishment_id = p_establishment_id
      and we.revoked_at is null
  );
$$;

revoke all on function public.is_authorized_for_establishment(uuid, uuid) from public;

-- ============================================================
-- I7 · RN-SUP-01 + M1 · RN-SUP-03 + M2 · espacio explícito.
-- Las funciones de supervisión se rehacen con `p_space_id` como primer
-- parámetro (deducir el espacio de la membresía del trabajador falla en
-- cuanto esa persona trabaja en dos espacios), el sustituto tiene que ser
-- administrador igual que el principal (RN-SUP-01), y aparecen las dos
-- operaciones que RN-SUP-03 exige y no existían: ampliar/acortar y
-- retirar. Se eliminan las versiones anteriores: no las llama todavía
-- ninguna pantalla, así que no hay nada que migrar.
-- ============================================================
drop function public.set_principal_supervisor(uuid, uuid);
drop function public.set_substitute_supervisor(uuid, uuid, timestamptz, timestamptz);

create or replace function public.set_principal_supervisor(p_space_id uuid, p_worker_id uuid, p_admin_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_id uuid;
  v_supervision_id uuid;
begin
  -- RN-SUP-05: solo el propietario del espacio.
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede asignar supervisores';
  end if;

  if not exists (
    select 1 from public.space_memberships
    where space_id = p_space_id and user_id = p_worker_id and role = 'worker' and status = 'active'
  ) then
    raise exception 'Esa persona no es un trabajador activo de este espacio';
  end if;

  -- RN-SUP-01: la supervisión es una relación Administrador–Trabajador.
  if not exists (
    select 1 from public.space_memberships
    where space_id = p_space_id and user_id = p_admin_id and role in ('admin', 'owner') and status = 'active'
  ) then
    raise exception 'El supervisor debe ser un administrador activo del mismo espacio';
  end if;

  update public.supervisions
  set revoked_at = now()
  where space_id = p_space_id and worker_id = p_worker_id and kind = 'principal' and revoked_at is null
  returning id into v_previous_id;

  insert into public.supervisions (space_id, worker_id, admin_id, kind, created_by)
  values (p_space_id, p_worker_id, p_admin_id, 'principal', auth.uid())
  returning id into v_supervision_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    p_space_id, auth.uid(), 'supervision.principal_set', 'supervision', v_supervision_id,
    jsonb_build_object('previous_supervision_id', v_previous_id),
    jsonb_build_object('worker_id', p_worker_id, 'admin_id', p_admin_id)
  );

  return v_supervision_id;
end;
$$;

create or replace function public.set_substitute_supervisor(
  p_space_id uuid,
  p_worker_id uuid,
  p_admin_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervision_id uuid;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede asignar supervisores';
  end if;

  if not exists (
    select 1 from public.space_memberships
    where space_id = p_space_id and user_id = p_worker_id and role = 'worker' and status = 'active'
  ) then
    raise exception 'Esa persona no es un trabajador activo de este espacio';
  end if;

  -- RN-SUP-01: el sustituto es también un Administrador — recibe los
  -- mismos avisos que el principal mientras la sustitución esté vigente
  -- (RN-SUP-04), así que no puede ser otro trabajador.
  if not exists (
    select 1 from public.space_memberships
    where space_id = p_space_id and user_id = p_admin_id and role in ('admin', 'owner') and status = 'active'
  ) then
    raise exception 'El supervisor sustituto debe ser un administrador activo del mismo espacio';
  end if;

  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Una sustitución necesita fecha de inicio y de fin (RN-SUP-03)';
  end if;

  insert into public.supervisions (space_id, worker_id, admin_id, kind, starts_at, ends_at, created_by)
  values (p_space_id, p_worker_id, p_admin_id, 'substitute', p_starts_at, p_ends_at, auth.uid())
  returning id into v_supervision_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    p_space_id, auth.uid(), 'supervision.substitute_set', 'supervision', v_supervision_id,
    jsonb_build_object('worker_id', p_worker_id, 'admin_id', p_admin_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at)
  );

  return v_supervision_id;
end;
$$;

-- M1 · RN-SUP-03: "puede retirarse antes o ampliarse". Cambiar la fecha de
-- fin cubre las dos cosas; retirarla del todo es revoke_supervision().
create or replace function public.reschedule_substitute_supervision(p_supervision_id uuid, p_ends_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_kind text;
  v_starts_at timestamptz;
  v_previous_ends_at timestamptz;
begin
  select space_id, kind, starts_at, ends_at
  into v_space_id, v_kind, v_starts_at, v_previous_ends_at
  from public.supervisions where id = p_supervision_id and revoked_at is null
  for update;

  if v_space_id is null then
    raise exception 'Sustitución no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede cambiar una sustitución';
  end if;

  if v_kind <> 'substitute' then
    raise exception 'Solo una sustitución tiene fecha de fin (RN-SUP-03)';
  end if;

  if p_ends_at is null or p_ends_at <= v_starts_at then
    raise exception 'La nueva fecha de fin tiene que ser posterior al inicio de la sustitución';
  end if;

  update public.supervisions set ends_at = p_ends_at where id = p_supervision_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'supervision.substitute_rescheduled', 'supervision', p_supervision_id,
    jsonb_build_object('ends_at', v_previous_ends_at), jsonb_build_object('ends_at', p_ends_at)
  );
end;
$$;

create or replace function public.revoke_supervision(p_supervision_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_kind text;
begin
  select space_id, kind into v_space_id, v_kind
  from public.supervisions where id = p_supervision_id
  for update;

  if v_space_id is null then
    raise exception 'Supervisión no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede retirar una supervisión';
  end if;

  -- Idempotente y sin borrado físico: retirar es marcar revoked_at, la
  -- fila se conserva como historial (CLAUDE.md MUST NOT).
  update public.supervisions set revoked_at = now()
  where id = p_supervision_id and revoked_at is null;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (
    v_space_id, auth.uid(), 'supervision.revoked', 'supervision', p_supervision_id,
    jsonb_build_object('kind', v_kind), p_reason
  );
end;
$$;

-- ============================================================
-- I3 · Lo que el cliente ve de un trabajo.
-- RN-JOB-08 le da derecho a saber que su trabajo está esperándole, y
-- RN-NOT ("Inicio de un trabajo: visible dentro de Cuotly para el
-- cliente") a ver su estado. Nada de eso incluye las columnas de identidad
-- del equipo (`assigned_to`, `started_by`, `published_by`, `cancelled_by`),
-- y CLAUDE.md prohíbe mostrarle la identidad individual de nadie del
-- equipo de mantenimiento — un UUID estable es identidad individual
-- aunque no lleve nombre.
--
-- Como RLS no filtra columnas, el cliente deja de leer `jobs` y pasa a
-- leer `client_jobs`, una vista barrera con las columnas que sí le
-- corresponden. La vista se ejecuta con los privilegios de su propietario
-- (no `security_invoker`), así que su propio WHERE es el control de
-- acceso: solo devuelve los trabajos de los establecimientos del cliente.
-- ============================================================
drop policy jobs_select on public.jobs;

create policy jobs_select on public.jobs
for select
using (public.is_space_member(space_id) and public.can_read_job(id));

create view public.client_jobs
with (security_barrier)
as
select
  j.id,
  j.space_id,
  j.establishment_id,
  j.request_id,
  j.code,
  j.state,
  j.category,
  j.started_at,
  j.published_at,
  j.completed_at,
  j.correction_window_ends_at,
  j.free_correction_used_at,
  j.cancelled_reason,
  j.cancelled_at,
  j.created_at
from public.jobs j
where public.is_establishment_client(j.establishment_id);

comment on view public.client_jobs is
  'Lo que el restaurante ve de sus trabajos (RN-JOB-08, RN-NOT). Sin
   assigned_to, started_by, published_by ni cancelled_by: el cliente nunca
   ve la identidad individual de nadie del equipo (CLAUDE.md MUST NOT,
   CA-04) — para él siempre es "Equipo de mantenimiento".';

grant select on public.client_jobs to authenticated;

-- I3 · `blocks` pasa a ser interno. El cliente ya sabe que su trabajo está
-- bloqueado por el estado del propio trabajo ("Bloqueado · Esperando al
-- restaurante", RN-JOB-08, visible en client_jobs); lo que no le
-- corresponde es la nota interna, el tipo de motivo (una pausa por impago
-- o un incidente externo no son suyos) ni quién del equipo lo marcó.
drop policy blocks_select on public.blocks;

create policy blocks_select on public.blocks
for select
using (public.is_space_member(space_id) and public.can_read_job(job_id));

-- I2 · `corrections` se cierra igual que el resto de tablas del hito: quien
-- puede leer el trabajo. Un trabajador sin ese establecimiento autorizado
-- leía el texto que escribió el restaurante (§4.3).
drop policy corrections_select on public.corrections;

create policy corrections_select on public.corrections
for select
using (public.can_read_job(job_id));

-- ============================================================
-- I5 · RN-COR-08: "al terminar la ventana de corrección, la conversación
-- de esa solicitud pasa a solo lectura. Una necesidad nueva exige una
-- solicitud nueva." La política de INSERT de `messages` no miraba el
-- estado de la solicitud, así que se podía seguir escribiendo en un hilo
-- cerrado. Los mensajes ya escritos no se tocan (RN-MSG-08: no se eliminan
-- nunca).
-- ============================================================
create or replace function public.conversation_request_state(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.request_state(c.request_id)
  from public.conversations c
  where c.id = p_conversation_id;
$$;

drop policy messages_insert on public.messages;

create policy messages_insert on public.messages
for insert
with check (
  sender_id = auth.uid()
  -- RN-COR-08 / RN-REQ-03: la conversación de una solicitud cerrada,
  -- rechazada o cancelada es de solo lectura para todos, equipo incluido.
  and public.conversation_request_state(conversation_id) not in (
    'closed', 'rejected', 'cancelled_before_start', 'cancelled_after_start'
  )
  and (
    (sender_role = 'staff' and public.has_capability(space_id, 'manage_requests'))
    or (sender_role = 'client' and public.can_write_establishment(public.conversation_establishment_id(conversation_id)))
  )
);

-- ============================================================
-- B2 · RN-JOB-04 / CA-06: cancelar después de Comenzar.
-- Mismo cuerpo que la versión de la migración 20260830000021, con una
-- única diferencia: la solicitud puede estar en `accepted` (aún no
-- comenzado) o en `in_progress` (ya comenzado, que es exactamente el caso
-- que RN-JOB-04 llama "después de Comenzar"). Quién decide si se devuelve
-- el consumo sigue siendo `jobs.started_at`, no el estado de la solicitud.
-- ============================================================
create or replace function public.cancel_accepted_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_request_state text;
  v_job_id uuid;
  v_job_state text;
  v_started_at timestamptz;
  v_new_state text;
  v_before_start boolean;
  v_debit_entry_id uuid;
  v_original_cycle_id uuid;
  v_category text;
  v_subscription_id uuid;
  v_current_cycle_id uuid;
begin
  select space_id, establishment_id, state into v_space_id, v_establishment_id, v_request_state
  from public.requests where id = p_request_id
  for update;

  if v_space_id is null then
    raise exception 'Solicitud no encontrada';
  end if;

  if not public.can_write_establishment(v_establishment_id) then
    raise exception 'No tienes acceso de escritura a este establecimiento';
  end if;

  select id, state, started_at into v_job_id, v_job_state, v_started_at
  from public.jobs where request_id = p_request_id
  for update;

  if v_job_id is null then
    raise exception 'La solicitud no tiene un trabajo asociado, no se puede cancelar';
  end if;

  if v_job_state in ('cancelled_before_start', 'cancelled_after_start') then
    return; -- Idempotente: ya se canceló.
  end if;

  -- RN-JOB-04: el cliente puede cancelar antes y después de Comenzar. Una
  -- vez publicado ya no hay nada que cancelar: lo que cabe entonces es la
  -- corrección mínima (RN-COR-02).
  if v_request_state not in ('accepted', 'in_progress') then
    raise exception 'La solicitud no está en un estado que se pueda cancelar';
  end if;

  v_before_start := v_started_at is null;
  v_new_state := case when v_before_start then 'cancelled_before_start' else 'cancelled_after_start' end;

  update public.jobs
  set state = v_new_state, cancelled_reason = p_reason, cancelled_by = auth.uid(), cancelled_at = now()
  where id = v_job_id;

  update public.requests set state = v_new_state where id = p_request_id;

  -- RN-SLA-14 en su versión terminal: al cancelar, los contadores vivos se
  -- paran. Sin esto, T2 o T3 seguirían corriendo para siempre sobre un
  -- trabajo cancelado y "Fuera de plazo" (RN-SLA-17) seguiría creciendo.
  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  select v_space_id, te.counter_kind, 'job', v_job_id, 'stopped', now(), auth.uid()
  from (select distinct counter_kind from public.timer_events
        where entity_type = 'job' and entity_id = v_job_id) te
  where (
    select event_type from public.timer_events
    where entity_type = 'job' and entity_id = v_job_id and counter_kind = te.counter_kind
    order by occurred_at desc, id desc limit 1
  ) in ('started', 'resumed');

  perform public.record_state_event(v_space_id, 'job', v_job_id, v_job_state, v_new_state, p_reason);

  if v_before_start then
    select ce.id, ce.consumption_cycle_id, ce.category
    into v_debit_entry_id, v_original_cycle_id, v_category
    from public.consumption_entries ce
    where ce.job_id = v_job_id and ce.entry_type = 'debit'
    order by ce.created_at desc
    limit 1;

    if v_debit_entry_id is not null then
      select subscription_id into v_subscription_id
      from public.consumption_cycles where id = v_original_cycle_id;

      v_current_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

      if v_current_cycle_id = v_original_cycle_id then
        insert into public.consumption_entries
          (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
        values
          (v_space_id, v_establishment_id, v_original_cycle_id, v_category, 1, 'return', p_request_id, v_job_id, v_debit_entry_id, p_reason, auth.uid());
      else
        insert into public.consumption_entries
          (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
        values
          (v_space_id, v_establishment_id, v_current_cycle_id, v_category, 1, 'compensatory_credit', p_request_id, v_job_id, v_debit_entry_id,
           coalesce(p_reason || ' ', '') || '(crédito compensatorio: el ciclo original ya había cerrado)', auth.uid());
      end if;
    end if;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'request.cancelled', 'request', p_request_id,
    jsonb_build_object('state', v_request_state, 'job_state', v_job_state),
    jsonb_build_object('state', v_new_state, 'consumption_returned', v_before_start and v_debit_entry_id is not null),
    p_reason
  );
end;
$$;

comment on function public.cancel_accepted_request(uuid, text) is
  'RN-JOB-04 / CA-06 / CA-07. Sustituye a la versión de la migración
   20260830000021: acepta también una solicitud en `in_progress` — el
   estado en el que la deja "Comenzar" (RN-JOB-03) — que es precisamente
   el caso "después de Comenzar" de RN-JOB-04, inalcanzable hasta ahora.
   Además detiene los contadores vivos del trabajo cancelado.';

-- ============================================================
-- I6 · RN-ASG-01 / §4.3: repartir una tarea no puede conceder acceso.
-- Mismo cuerpo que la versión del Hito 6, con la comprobación que faltaba
-- sobre quien recibe la tarea.
-- ============================================================
create or replace function public.create_job_task(
  p_job_id uuid,
  p_title text,
  p_estimated_minutes integer,
  p_assignee_id uuid default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_assignee_role public.space_role;
  v_weight text;
  v_task_id uuid;
begin
  select space_id, establishment_id, state, assigned_to
  into v_space_id, v_establishment_id, v_state, v_assigned_to
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden desglosar este trabajo';
  end if;

  if v_state in ('published', 'completed', 'cancelled_before_start', 'cancelled_after_start') then
    raise exception 'No se pueden añadir tareas a un trabajo ya terminado';
  end if;

  v_weight := public.task_weight_for_minutes(p_estimated_minutes);

  if p_assignee_id is not null then
    if not public.member_can_perform_jobs(v_space_id, p_assignee_id) then
      raise exception 'Esa persona no puede recibir tareas en este espacio';
    end if;

    -- RN-ASG-01 / §4.3: repartir una tarea no puede darle a un trabajador
    -- acceso a un establecimiento que no tiene autorizado. Autorizar es
    -- escribir en worker_establishments, y eso exige 'assign_jobs'; sin
    -- esta comprobación, cualquier responsable podía saltárselo repartiendo
    -- una tarea.
    select role into v_assignee_role
    from public.space_memberships
    where space_id = v_space_id and user_id = p_assignee_id and status = 'active';

    if v_assignee_role = 'worker'
       and not public.is_authorized_for_establishment(v_establishment_id, p_assignee_id) then
      raise exception 'Esa persona no tiene autorizado el establecimiento de este trabajo';
    end if;
  end if;

  insert into public.tasks
    (space_id, establishment_id, job_id, title, description, weight, estimated_minutes, assignee_id, created_by)
  values
    (v_space_id, v_establishment_id, p_job_id, p_title, p_description, v_weight, p_estimated_minutes, p_assignee_id, auth.uid())
  returning id into v_task_id;

  perform public.record_state_event(v_space_id, 'task', v_task_id, null, 'pending', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id, auth.uid(), 'task.created', 'task', v_task_id,
    jsonb_build_object('job_id', p_job_id, 'weight', v_weight, 'assignee_id', p_assignee_id)
  );

  return v_task_id;
end;
$$;

-- ============================================================
-- I4 · RN-COR-02, primera mitad: "puede usarse **durante la ejecución** o
-- durante las 72 h laborables posteriores a la publicación. Si se usa
-- durante la ejecución, no vuelve a estar disponible después."
-- La versión anterior solo aceptaba un trabajo ya publicado, así que esa
-- primera mitad no existía en el servidor aunque src/core/free-correction.ts
-- ya la calculaba.
-- ============================================================
create or replace function public.request_free_correction(p_job_id uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
end;
$$;

-- ============================================================
-- I1 · §4.3 / CA-01: abrir una corrección por error del equipo es una
-- operación sobre un trabajo concreto, no sobre "el espacio". Ahora exige
-- ser el responsable asignado o tener 'assign_jobs', el mismo criterio que
-- start_correction()/complete_correction().
-- ============================================================
create or replace function public.open_team_error_correction(p_job_id uuid, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_request_id uuid;
  v_assigned_to uuid;
  v_correction_id uuid;
begin
  select space_id, establishment_id, state, request_id, assigned_to
  into v_space_id, v_establishment_id, v_state, v_request_id, v_assigned_to
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden abrir una corrección sobre este trabajo';
  end if;

  if btrim(coalesce(p_description, '')) = '' then
    raise exception 'Hay que explicar qué hay que corregir';
  end if;

  if v_state <> 'published' then
    raise exception 'Solo se puede corregir un trabajo publicado';
  end if;

  insert into public.corrections
    (space_id, establishment_id, job_id, request_id, kind, description, requested_by)
  values
    (v_space_id, v_establishment_id, p_job_id, v_request_id, 'team_error', p_description, auth.uid())
  returning id into v_correction_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (
    v_space_id, auth.uid(), 'correction.team_error_opened', 'correction', v_correction_id,
    jsonb_build_object('job_id', p_job_id, 'kind', 'team_error', 'consumes_free_correction', false),
    p_description
  );

  return v_correction_id;
end;
$$;

-- ============================================================
-- M5 · complete_correction() daba éxito silencioso sobre una corrección
-- que nadie había empezado (el trabajo está en `published` en los dos
-- casos: antes de empezarla y después de terminarla). Ahora distingue las
-- dos situaciones por la propia fila de la corrección.
-- ============================================================
create or replace function public.complete_correction(p_correction_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_job_id uuid;
  v_request_id uuid;
  v_completed_at timestamptz;
  v_state text;
  v_assigned_to uuid;
begin
  select c.space_id, c.job_id, c.request_id, c.completed_at
  into v_space_id, v_job_id, v_request_id, v_completed_at
  from public.corrections c where c.id = p_correction_id;

  if v_space_id is null then
    raise exception 'Corrección no encontrada';
  end if;

  select state, assigned_to into v_state, v_assigned_to from public.jobs where id = v_job_id for update;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden cerrar esta corrección';
  end if;

  if v_completed_at is not null then
    return; -- CA-17: cerrarla dos veces produce un único efecto.
  end if;

  if v_state <> 'in_correction' then
    raise exception 'Esta corrección todavía no se ha empezado (start_correction)';
  end if;

  update public.corrections set completed_at = now(), completed_by = auth.uid() where id = p_correction_id;
  update public.jobs set state = 'published' where id = v_job_id;
  update public.requests set state = 'published' where id = v_request_id;

  perform public.record_state_event(v_space_id, 'job', v_job_id, 'in_correction', 'published', p_note);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'correction.completed', 'correction', p_correction_id,
    jsonb_build_object('job_state', 'in_correction'), jsonb_build_object('job_state', 'published'), p_note
  );
end;
$$;
