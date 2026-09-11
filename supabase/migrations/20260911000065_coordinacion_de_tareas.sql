-- Maqueta 07 · "Tareas — asignación y coordinación": lo que la pantalla
-- pide y el servidor todavía no sabía hacer.
--
-- El reparto de tareas ya estaba entero (HU-21, migración 47:
-- `create_job_task()`, `assign_task()`, `list_task_candidates()`). El
-- dibujo definitivo del panel "Detalle de la tarea" añade tres campos, y
-- de los tres solo uno era gratis:
--
--   · **Responsable** — ya existía: `assign_task()`.
--   · **Fecha estimada** — no existía **ninguna** fecha en `tasks`. Es la
--     segunda vez que una maqueta la pide: la 04 ponía "Hoy, 12:00" y
--     "Quedan 4 h" en cada fila y se dejó fuera, con motivo escrito, por
--     ser un plazo inventado. Esta vez NO es un plazo: es una casilla de
--     fecha que alguien rellena a mano. Ver el bloque 1.
--   · **Prioridad: Media** — no entra, y el motivo está en el ROADMAP.
--     Bosco decidió el 10/09/2026 que la prioridad no es una etiqueta
--     Alta/Media/Baja sino el ORDEN que pone el restaurante sobre sus
--     cambios pendientes, y que "los clientes premium son los únicos que
--     pueden indicarla". Una casilla Alta/Media/Baja por tarea, editable
--     por el equipo, es exactamente lo que esa decisión quitó, una planta
--     más abajo. No se reintroduce por la puerta de atrás.
--
-- Y el botón que da nombre a la pantalla: **"Solicitar reasignación"**,
-- que hasta hoy solo existía para trabajos enteros.
--
-- Se comprueba con `supabase/tests/coordinacion_de_tareas.sql`.

-- ------------------------------------------------------------
-- 1 · La fecha de planificación de una tarea
-- ------------------------------------------------------------
--
-- **Qué es y qué no es.** Es el día en que el equipo se propone hacer esa
-- tarea. No es un plazo: no arranca ni alimenta ningún contador, no genera
-- avisos, y que llegue y pase NO pone la tarea "fuera de plazo" —
-- RN-SLA-17 es una condición de trabajos, calculada desde T2 y T3, y una
-- fecha que un compañero teclea el martes no puede convertirse en un
-- incumplimiento contractual el jueves.
--
-- Por eso es un `date` y no un `timestamptz`: una hora invitaría a leerla
-- como un vencimiento ("Hoy, 12:00", que es justo lo que la maqueta 04 no
-- pudo tener). Un día es una intención, y se presenta como tal.
--
-- Es `null` mientras nadie la ponga, y la pantalla dice eso —"sin fecha
-- prevista"— en vez de inventarse una a partir del trabajo (CA-20).

alter table public.tasks add column planned_date date;

comment on column public.tasks.planned_date is
  'Maqueta 07 · "Fecha estimada". Día en que el equipo se propone hacer la
   tarea. NO es un plazo: no alimenta T1/T2/T3, no genera avisos y no
   produce "fuera de plazo" (RN-SLA-17 es de trabajos). Nula mientras
   nadie la ponga.';

-- ------------------------------------------------------------
-- 2 · Quién puede recibir una tarea, en un solo sitio
-- ------------------------------------------------------------
--
-- `create_job_task()` (migración 22) y `assign_task()` (migración 47) ya
-- llevan esta comprobación escrita dos veces. Aprobar una reasignación
-- sería la tercera copia, y una regla escrita tres veces es una regla que
-- algún día se corrige en dos sitios.
--
-- RN-ASG-01 / §4.3: dar una tarea a alguien **no puede concederle acceso**
-- a un establecimiento que no tiene autorizado. Es el agujero que la
-- revisión del Hito 6 cerró en `create_job_task()` (arreglo I6).
create or replace function public.task_assignee_is_valid(
  p_space_id uuid,
  p_establishment_id uuid,
  p_assignee_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
begin
  if p_assignee_id is null then
    return false;
  end if;

  if not public.member_can_perform_jobs(p_space_id, p_assignee_id) then
    return false;
  end if;

  -- Una tarea suelta (sin establecimiento) no concede acceso a ninguno.
  if p_establishment_id is null then
    return true;
  end if;

  select sm.role into v_role
  from public.space_memberships sm
  where sm.space_id = p_space_id and sm.user_id = p_assignee_id and sm.status = 'active';

  -- Propietario y administradores ven toda la operación del espacio; el
  -- filtro por establecimiento es lo que acota a un trabajador (§4.3).
  return v_role is distinct from 'worker'
      or public.is_authorized_for_establishment(p_establishment_id, p_assignee_id);
end;
$$;

comment on function public.task_assignee_is_valid(uuid, uuid, uuid) is
  'RN-ASG-01 · quién puede recibir una tarea, en un solo sitio. La usan
   assign_task() y approve_task_reassignment(); repartir una tarea nunca
   concede acceso a un establecimiento ajeno.';

-- Interna: no comprueba quién llama, solo responde una pregunta. Sin este
-- revoke quedaría abierta por RPC a cualquiera con sesión y sin ella
-- (CLAUDE.md: revocar solo a PUBLIC no basta en Supabase).
revoke all on function public.task_assignee_is_valid(uuid, uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3 · La solicitud de reasignación de una tarea
-- ------------------------------------------------------------
--
-- RN-ASG-07: "el trabajador puede solicitarla explicando el motivo".
-- RN-ASG-08: "la aprueba el propietario o el administrador principal".
-- RN-ASG-09: "se conserva todo el historial, el contador no se reinicia".
--
-- **Por qué una tabla y no un sexto estado de tarea.** Un trabajo sí tiene
-- el estado `reassignment_requested` (§36), y para un trabajo está bien:
-- pedir la reasignación de un trabajo lo detiene. §37 enumera los estados
-- de tarea y son cinco —Pendiente, En curso, Bloqueada, Completada,
-- Cancelada—; añadir un sexto contradiría la especificación. Y además
-- sería peor producto: mientras alguien decide, la tarea sigue estando
-- Pendiente o En curso, que es la verdad. Lo que hay es una solicitud
-- colgando de ella, y eso es una fila.
--
-- **RN-ASG-09 aquí.** Una tarea no tiene contadores —T1, T2 y T3 son de
-- solicitud y de trabajo—, así que no hay nada que reiniciar. Eso no es
-- una laguna: la suite comprueba que aprobar una reasignación de tarea
-- escribe **cero** `timer_events`, igual que hace la del trabajo. La
-- ausencia es la regla.
create table public.task_reassignment_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  -- RN-ASG-07: "explicando el motivo". Un motivo en blanco no es un
  -- motivo, y el CHECK lo dice antes que ninguna pantalla.
  reason text not null check (length(btrim(reason)) > 0),
  requested_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_reason text,
  new_assignee_id uuid references public.profiles (id),
  -- Una fila resuelta sin quién ni cuándo es historia perdida (CLAUDE.md
  -- MUST: actor, fecha, valor anterior, valor nuevo). Y una aprobada sin
  -- nuevo responsable no es una aprobación de nada.
  constraint task_reassignment_requests_decision_ck check (
    (state = 'pending'
       and decided_by is null and decided_at is null and new_assignee_id is null)
    or (state = 'rejected'
       and decided_by is not null and decided_at is not null and new_assignee_id is null)
    or (state = 'approved'
       and decided_by is not null and decided_at is not null and new_assignee_id is not null)
  )
);

comment on table public.task_reassignment_requests is
  'RN-ASG-07/08/09 · HU-22 aplicada a una tarea (maqueta 07). Libro de
   solicitudes: ninguna fila se borra ni se reescribe desde la aplicación,
   solo se resuelve. Sin política de INSERT/UPDATE/DELETE — toda mutación
   pasa por las funciones SECURITY DEFINER de este archivo.';

-- Dos solicitudes abiertas sobre la misma tarea no significan nada: la
-- segunda no añade información y deja a quien decide sin saber cuál
-- resuelve. El índice lo hace imposible por construcción, no por cuidado.
create unique index task_reassignment_requests_one_open
  on public.task_reassignment_requests (task_id)
  where state = 'pending';

create index task_reassignment_requests_task_idx
  on public.task_reassignment_requests (task_id, requested_at desc);

alter table public.task_reassignment_requests enable row level security;

-- P7 · el cliente no ve la organización interna. `can_read_task()` por sí
-- sola NO sirve aquí: incluye al restaurante a través de `can_read_job()`,
-- que es exactamente el bloqueante B2 de la cuarta revisión (migración
-- 30). Va acompañada de `is_space_member()`, igual que `tasks_select` y
-- que la rama de tarea de `state_events_select`.
create policy task_reassignment_requests_select on public.task_reassignment_requests
for select
using (public.is_space_member(space_id) and public.can_read_task(task_id));

comment on policy task_reassignment_requests_select on public.task_reassignment_requests is
  'Solo el equipo del espacio que puede leer la tarea (P7). Sin
   is_space_member(), can_read_task() le entregaría al restaurante la
   identidad de quien pide la reasignación y su motivo.';

-- ------------------------------------------------------------
-- 4 · Pedirla (RN-ASG-07)
-- ------------------------------------------------------------
create or replace function public.request_task_reassignment(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assignee_id uuid;
  v_job_id uuid;
  v_job_state text;
begin
  select t.space_id, t.state, t.assignee_id, t.job_id
  into v_space_id, v_state, v_assignee_id, v_job_id
  from public.tasks t where t.id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  -- P7, dicho por la propia función y no confiado a que un cliente nunca
  -- llegue a ser responsable de una tarea. Hoy no puede serlo; el día que
  -- alguien afloje esa invariante, esto sigue cerrado.
  if not public.is_space_member(v_space_id) then
    raise exception 'Solo el equipo del espacio trabaja con tareas';
  end if;

  -- RN-ASG-07: la pide el trabajador, y el trabajador es el responsable de
  -- la tarea. Un administrador no la "pide": reparte directamente con
  -- assign_task(), que para eso puede.
  if v_assignee_id is null or v_assignee_id <> auth.uid() then
    raise exception 'Solo el responsable de la tarea puede pedir su reasignación (RN-ASG-07)';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Hay que explicar el motivo de la reasignación (RN-ASG-07)';
  end if;

  if v_state in ('completed', 'cancelled') then
    raise exception 'Una tarea % no se reasigna', v_state;
  end if;

  if v_job_id is not null then
    select j.state into v_job_state from public.jobs j where j.id = v_job_id;
    if v_job_state in ('published', 'completed', 'cancelled_before_start', 'cancelled_after_start') then
      raise exception 'No se reasignan tareas de un trabajo ya terminado';
    end if;
  end if;

  -- CA-17 · pulsar dos veces no duplica el efecto. El índice parcial lo
  -- impediría de todas formas, pero con un error de clave duplicada que no
  -- le dice nada a nadie.
  if exists (
    select 1 from public.task_reassignment_requests r
    where r.task_id = p_task_id and r.state = 'pending'
  ) then
    return;
  end if;

  insert into public.task_reassignment_requests (space_id, task_id, requested_by, reason)
  values (v_space_id, p_task_id, auth.uid(), btrim(p_reason));

  -- No hay `record_state_event`: el estado de la tarea NO cambia (§37 no
  -- tiene un sexto estado), y escribir un evento de un cambio que no ha
  -- ocurrido ensuciaría el libro del que se derivan los estados
  -- (RN-DAT-05).
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'task.reassignment_requested', 'task', p_task_id,
    jsonb_build_object('assignee_id', v_assignee_id, 'reassignment_pending', false),
    jsonb_build_object('assignee_id', v_assignee_id, 'reassignment_pending', true),
    btrim(p_reason)
  );
end;
$$;

comment on function public.request_task_reassignment(uuid, text) is
  'RN-ASG-07 · la pide el responsable de la tarea explicando el motivo. No
   cambia el estado de la tarea: mientras alguien decide, el trabajo sigue
   donde estaba.';

-- ------------------------------------------------------------
-- 5 · Aprobarla (RN-ASG-08/09)
-- ------------------------------------------------------------
create or replace function public.approve_task_reassignment(
  p_task_id uuid,
  p_new_assignee_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_assignee_id uuid;
  v_request_id uuid;
begin
  select t.space_id, t.establishment_id, t.state, t.assignee_id
  into v_space_id, v_establishment_id, v_state, v_assignee_id
  from public.tasks t where t.id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  -- RN-ASG-08 literal: "la aprueba el propietario o el administrador
  -- principal correspondiente". El responsable del trabajo reparte sus
  -- tareas con assign_task(), pero aprobar una reasignación que alguien ha
  -- pedido es otra cosa y no es suya.
  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden aprobar una reasignación (RN-ASG-08)';
  end if;

  select r.id into v_request_id
  from public.task_reassignment_requests r
  where r.task_id = p_task_id and r.state = 'pending'
  for update;

  if v_request_id is null then
    raise exception 'Esta tarea no tiene una reasignación pendiente';
  end if;

  if v_state in ('completed', 'cancelled') then
    raise exception 'Una tarea % no se reasigna', v_state;
  end if;

  -- Aprobar dejando el mismo responsable no es una reasignación: es
  -- cerrar la solicitud sin resolverla, y para eso está rechazarla — con
  -- su motivo, que es lo que el solicitante necesita leer.
  if p_new_assignee_id is null or p_new_assignee_id = v_assignee_id then
    raise exception 'Una reasignación aprobada tiene que cambiar de responsable; si no cambia, recházala con su motivo';
  end if;

  if not public.task_assignee_is_valid(v_space_id, v_establishment_id, p_new_assignee_id) then
    raise exception 'Esa persona no puede recibir esta tarea (RN-ASG-01)';
  end if;

  update public.tasks set assignee_id = p_new_assignee_id where id = p_task_id;

  update public.task_reassignment_requests
  set state = 'approved',
      decided_by = auth.uid(),
      decided_at = now(),
      decision_reason = p_reason,
      new_assignee_id = p_new_assignee_id
  where id = v_request_id;

  -- RN-ASG-09 · ni un solo `timer_events` aquí, y esa ausencia es la
  -- regla: una reasignación no reinicia nada. Una tarea no tiene
  -- contadores propios, y los del trabajo al que pertenece siguen
  -- corriendo exactamente igual.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'task.reassigned', 'task', p_task_id,
    jsonb_build_object('assignee_id', v_assignee_id, 'reassignment_pending', true),
    jsonb_build_object('assignee_id', p_new_assignee_id, 'reassignment_pending', false, 'timers_restarted', false),
    p_reason
  );
end;
$$;

comment on function public.approve_task_reassignment(uuid, uuid, text) is
  'RN-ASG-08/09 · la aprueba quien tiene assign_jobs, y no escribe ni un
   timer_event: la reasignación no reinicia ningún contador.';

-- ------------------------------------------------------------
-- 6 · Rechazarla
-- ------------------------------------------------------------
--
-- Rechazar no es borrar. La fila se queda con su motivo y su decisión: que
-- alguien pidiera salirse de una tarea y se le dijera que no es
-- información de la que un día hará falta acordarse (CLAUDE.md MUST NOT:
-- no se borran registros de negocio).
create or replace function public.reject_task_reassignment(p_task_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_request_id uuid;
  v_assignee_id uuid;
begin
  select t.space_id, t.assignee_id into v_space_id, v_assignee_id
  from public.tasks t where t.id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden resolver una reasignación (RN-ASG-08)';
  end if;

  select r.id into v_request_id
  from public.task_reassignment_requests r
  where r.task_id = p_task_id and r.state = 'pending'
  for update;

  if v_request_id is null then
    raise exception 'Esta tarea no tiene una reasignación pendiente';
  end if;

  update public.task_reassignment_requests
  set state = 'rejected',
      decided_by = auth.uid(),
      decided_at = now(),
      decision_reason = p_reason
  where id = v_request_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'task.reassignment_rejected', 'task', p_task_id,
    jsonb_build_object('assignee_id', v_assignee_id, 'reassignment_pending', true),
    jsonb_build_object('assignee_id', v_assignee_id, 'reassignment_pending', false),
    p_reason
  );
end;
$$;

-- ------------------------------------------------------------
-- 7 · La fecha, con las mismas guardas que el reparto
-- ------------------------------------------------------------
--
-- Quien reparte una tarea es quien la planifica, así que las guardas son
-- las de `assign_task()` y no otras: el responsable del trabajo o
-- `assign_jobs`. Pasar `null` quita la fecha — "ya no sé cuándo" es una
-- respuesta legítima y mejor que dejar una fecha que nadie sostiene.
create or replace function public.set_task_planned_date(p_task_id uuid, p_planned_date date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_job_id uuid;
  v_state text;
  v_planned_date date;
  v_job_assigned_to uuid;
  v_job_state text;
begin
  select t.space_id, t.job_id, t.state, t.planned_date
  into v_space_id, v_job_id, v_state, v_planned_date
  from public.tasks t where t.id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  -- Sin esta línea, `anon` entra. La guarda de abajo compara
  -- `v_job_assigned_to is distinct from auth.uid()`, y sobre un trabajo
  -- **sin responsable** eso es `null is distinct from null` = FALSO: la
  -- guarda se da por satisfecha y sigue. Encontrado al comprobar los
  -- privilegios de esta migración, no leyendo el código. El `revoke` de
  -- `anon` de más abajo lo cierra por fuera; esto lo cierra por dentro,
  -- que es donde tiene que estar cerrado.
  if auth.uid() is null then
    raise exception 'Hace falta una sesión para planificar una tarea';
  end if;

  if v_job_id is not null then
    select j.assigned_to, j.state into v_job_assigned_to, v_job_state
    from public.jobs j where j.id = v_job_id;

    if (v_job_assigned_to is distinct from auth.uid())
       and not public.has_capability(v_space_id, 'assign_jobs') then
      raise exception 'Solo el responsable asignado o un administrador pueden planificar las tareas de este trabajo';
    end if;

    if v_job_state in ('published', 'completed', 'cancelled_before_start', 'cancelled_after_start') then
      raise exception 'No se planifican tareas de un trabajo ya terminado';
    end if;
  elsif not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para planificar esta tarea';
  end if;

  if v_state in ('completed', 'cancelled') then
    raise exception 'Una tarea % ya no se planifica', v_state;
  end if;

  -- CA-17, y de paso una auditoría que no miente: poner la misma fecha no
  -- es un cambio y no deja apunte.
  if v_planned_date is not distinct from p_planned_date then
    return;
  end if;

  update public.tasks set planned_date = p_planned_date where id = p_task_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'task.planned_date_set', 'task', p_task_id,
    jsonb_build_object('planned_date', v_planned_date),
    jsonb_build_object('planned_date', p_planned_date)
  );
end;
$$;

comment on function public.set_task_planned_date(uuid, date) is
  'Maqueta 07 · "Fecha estimada". Planificación, no plazo: no toca ningún
   contador ni genera avisos. Mismas guardas que assign_task().';

-- ------------------------------------------------------------
-- 8 · `assign_task()` deja de poder saltarse a quien aprueba
-- ------------------------------------------------------------
--
-- Dos motivos para reescribirla, y el segundo es el que importa:
--
--   1. Deja de llevar su propia copia de RN-ASG-01 y usa
--      `task_assignee_is_valid()`, que ahora comparte con la aprobación.
--   2. **Con una solicitud de reasignación abierta, la tarea solo cambia
--      de manos por `approve_task_reassignment()`.** Sin esto, el
--      responsable del trabajo —que no es administrador— podría repartir
--      la tarea él mismo y dejar la solicitud abierta para siempre:
--      RN-ASG-08 dice quién aprueba, y una puerta de al lado que hace lo
--      mismo sin aprobar a nadie no es una puerta de al lado, es la
--      regla rota.
create or replace function public.assign_task(p_task_id uuid, p_assignee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_job_id uuid;
  v_state text;
  v_assignee_id uuid;
  v_job_assigned_to uuid;
  v_job_state text;
begin
  select t.space_id, t.establishment_id, t.job_id, t.state, t.assignee_id
  into v_space_id, v_establishment_id, v_job_id, v_state, v_assignee_id
  from public.tasks t where t.id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  -- La misma línea que `set_task_planned_date`, y por el mismo motivo: en
  -- un trabajo sin responsable, `null is distinct from null` es FALSO y la
  -- guarda de abajo se daría por satisfecha. Aquí `anon` ya tenía el
  -- EXECUTE revocado desde la migración 47, así que no era alcanzable;
  -- se deja dicho igualmente para que no dependa de eso.
  if auth.uid() is null then
    raise exception 'Hace falta una sesión para repartir una tarea';
  end if;

  -- Mismo criterio que para desglosar: el responsable del trabajo reparte
  -- sus propias tareas, y un administrador reparte las de cualquiera
  -- (§4.2). Una tarea suelta (sin `job_id`) la reparte quien tiene
  -- `assign_jobs`.
  if v_job_id is not null then
    select j.assigned_to, j.state into v_job_assigned_to, v_job_state
    from public.jobs j where j.id = v_job_id;

    if (v_job_assigned_to is distinct from auth.uid())
       and not public.has_capability(v_space_id, 'assign_jobs') then
      raise exception 'Solo el responsable asignado o un administrador pueden repartir las tareas de este trabajo';
    end if;

    if v_job_state in ('published', 'completed', 'cancelled_before_start', 'cancelled_after_start') then
      raise exception 'No se reparten tareas de un trabajo ya terminado';
    end if;
  elsif not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para repartir esta tarea';
  end if;

  -- Una tarea terminada o cancelada no cambia de manos: sería reescribir
  -- historial (CLAUDE.md MUST NOT).
  if v_state in ('completed', 'cancelled') then
    raise exception 'Una tarea % no se reparte', v_state;
  end if;

  if p_assignee_id is null then
    raise exception 'Hay que decir a quién se le reparte la tarea';
  end if;

  -- Idempotente: repartirle otra vez a la misma persona no escribe nada ni
  -- ensucia la auditoría con un cambio que no ocurrió (CA-17).
  if v_assignee_id is not distinct from p_assignee_id then
    return;
  end if;

  -- RN-ASG-08 · con una solicitud abierta decide quien aprueba, no quien
  -- reparte. Se comprueba DESPUÉS de la idempotencia a propósito: dejar
  -- al responsable "reasignar" a la misma persona no cambia nada y no
  -- tiene por qué dar error.
  if exists (
    select 1 from public.task_reassignment_requests r
    where r.task_id = p_task_id and r.state = 'pending'
  ) then
    raise exception 'Esta tarea tiene una reasignación pendiente: la resuelve un administrador (RN-ASG-08)';
  end if;

  if not public.task_assignee_is_valid(v_space_id, v_establishment_id, p_assignee_id) then
    raise exception 'Esa persona no puede recibir esta tarea (RN-ASG-01)';
  end if;

  update public.tasks set assignee_id = p_assignee_id where id = p_task_id;

  -- CLAUDE.md MUST: actor, valor anterior, valor nuevo. El estado de la
  -- tarea no cambia al repartirla, así que esto no es un `state_event`.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'task.assigned', 'task', p_task_id,
    jsonb_build_object('assignee_id', v_assignee_id),
    jsonb_build_object('assignee_id', p_assignee_id)
  );
end;
$$;

comment on function public.assign_task(uuid, uuid) is
  'HU-21 · repartir una tarea ya creada. Con una solicitud de reasignación
   abierta lanza y remite a approve_task_reassignment(): RN-ASG-08 dice
   quién aprueba, y repartir por la puerta de al lado sería saltárselo.';

-- ------------------------------------------------------------
-- 9 · Privilegios de las cuatro funciones nuevas
-- ------------------------------------------------------------
--
-- CLAUDE.md, verificado en vivo el 30/08/2026: un proyecto de Supabase
-- concede `EXECUTE` por defecto a `anon` y `authenticated` sobre **toda**
-- función nueva. Estas cuatro comprueban permisos por su cuenta, así que
-- `authenticated` conserva el EXECUTE —es quien las llama por RPC—, pero
-- `anon` no pinta nada aquí: sin sesión no se reparte, ni se planifica, ni
-- se pide, ni se aprueba nada.
--
-- Ninguna de las cuatro aparece en la expresión de una política de RLS
-- (`select polname, pg_get_expr(polqual, polrelid) from pg_policy`), así
-- que quitarle el EXECUTE a `anon` no rompe ninguna política.
revoke all on function public.request_task_reassignment(uuid, text) from public, anon;
revoke all on function public.approve_task_reassignment(uuid, uuid, text) from public, anon;
revoke all on function public.reject_task_reassignment(uuid, text) from public, anon;
revoke all on function public.set_task_planned_date(uuid, date) from public, anon;

-- ------------------------------------------------------------
-- 10 · Un agujero que apareció al comprobar los privilegios de arriba
-- ------------------------------------------------------------
--
-- **`anon` podía cambiar el estado de una tarea sin responsable.** No es
-- una sospecha de lectura: se reprodujo contra esta misma base, sin sesión
-- ninguna, y la tarea pasó de `pending` a `in_progress`.
--
--     set role anon;
--     select public.update_task_state('<tarea sin responsable>', 'in_progress');
--     -- la tarea queda en in_progress
--
-- El mecanismo es el mismo que el de la migración 32, y el mismo que me
-- hizo añadir `auth.uid() is null` a `set_task_planned_date()` en el
-- bloque 7. La guarda de `update_task_state()` dice:
--
--     if (v_assignee_id is distinct from auth.uid())
--        and not public.has_capability(v_space_id, 'assign_jobs') then
--
-- Sobre una tarea **sin repartir** y sin sesión, eso es
-- `null is distinct from null`, que es FALSO: la guarda se da por
-- satisfecha y la función sigue. `has_capability()` nunca llega a
-- evaluarse. La tarea sin repartir es justo el caso normal —nace así
-- cuando el responsable desglosa primero y reparte después (migración
-- 47)—, no un caso raro.
--
-- Las hermanas de al lado NO son explotables, y conviene decir por qué
-- para no dar por cerrado lo que no se ha mirado:
--
--   · `cancel_task()` exige `has_capability()` de entrada, que para `anon`
--     es falso.
--   · `create_job_task()` tiene la guarda con la misma forma, pero escribe
--     `created_by = auth.uid()` en una columna `not null`: `anon` muere
--     ahí. Es un tope afortunado, no una decisión, así que también se le
--     quita el EXECUTE.
--
-- Se cierra por los dos lados, como el bloque 7: por dentro con una
-- comprobación explícita de sesión, y por fuera quitándole a `anon` un
-- EXECUTE que no necesita. Ninguna de las tres aparece en la expresión de
-- una política de RLS, así que el revoke no rompe ninguna.
create or replace function public.update_task_state(p_task_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assignee_id uuid;
begin
  select space_id, state, assignee_id into v_space_id, v_state, v_assignee_id
  from public.tasks where id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  -- La línea nueva. Sin ella, sobre una tarea sin repartir la guarda de
  -- debajo es `null is distinct from null` = falso y deja pasar a quien no
  -- tiene sesión.
  if auth.uid() is null then
    raise exception 'Hace falta una sesión para mover una tarea';
  end if;

  if (v_assignee_id is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo quien tiene la tarea asignada o un administrador pueden cambiarla';
  end if;

  if p_state = 'cancelled' then
    -- RN-JOB-01: el trabajador no puede cancelar una tarea; debe pedírselo
    -- a un administrador, que lo hace con cancel_task().
    raise exception 'Una tarea se cancela con cancel_task() (RN-JOB-01)';
  end if;

  if v_state = p_state then
    return; -- Idempotente.
  end if;

  if not (
    (v_state = 'pending' and p_state = 'in_progress')
    or (v_state = 'in_progress' and p_state in ('blocked', 'completed'))
    or (v_state = 'blocked' and p_state = 'in_progress')
  ) then
    raise exception 'Transición de tarea no permitida: % -> %', v_state, p_state;
  end if;

  update public.tasks
  set state = p_state,
      started_at = case when p_state = 'in_progress' and started_at is null then now() else started_at end,
      completed_at = case when p_state = 'completed' then now() else completed_at end
  where id = p_task_id;

  perform public.record_state_event(v_space_id, 'task', p_task_id, v_state, p_state, null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'task.state_changed', 'task', p_task_id,
    jsonb_build_object('state', v_state), jsonb_build_object('state', p_state)
  );
end;
$$;

comment on function public.update_task_state(uuid, text) is
  '§11.2 · el avance de una tarea. La comprobación de sesión no es
   decorativa: sin ella, sobre una tarea SIN responsable la guarda de
   permiso es null is distinct from null = falso, y anon podía mover la
   tarea. Reproducido y cerrado en la migración 65.';

revoke all on function public.update_task_state(uuid, text) from public, anon;
revoke all on function public.cancel_task(uuid, text) from public, anon;
revoke all on function public.create_job_task(uuid, text, integer, uuid, text) from public, anon;
