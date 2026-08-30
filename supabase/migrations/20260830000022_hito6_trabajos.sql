-- Hito 6 · Trabajos, tareas, asignación y carga (PRD §11 RN-JOB, §13
-- RN-COR, §14 RN-ASG, §8 RN-SLA-05 a 17; ROADMAP Hito 6).
--
-- La lógica de dominio pura vive en src/core/ y tiene sus tests unitarios:
--   · job-states.ts     — máquina de estados de trabajo y tarea (RN-JOB)
--   · assignment.ts     — filtros duros y orden determinista (RN-ASG-06)
--   · load-points.ts    — puntos de carga y niveles (§14.4)
--   · sla-timers.ts     — T2 y T3, y "Fuera de plazo" (RN-SLA, CA-12/13/14)
--   · free-correction.ts— ventana de la corrección mínima (RN-COR)
--   · worker-queue.ts   — cola personal y trabajo recomendado (HU-17)
-- Este archivo guarda los datos y hace cumplir en el servidor exactamente
-- las mismas reglas (CLAUDE.md, MUST: "toda operación se valida en el
-- servidor; ocultar un botón NO es un control de acceso").
--
-- Reparto deliberado entre SQL y src/core, y por qué:
--   · Todo lo que depende del **reloj laborable** (minutos consumidos de
--     T2/T3, "Fuera de plazo", la ventana de 72 h laborables de RN-COR-02)
--     se calcula en src/core con business-clock.ts. Es "el componente más
--     delicado del sistema" (PRD §7) y tiene un único dueño: no se
--     reimplementa en PL/pgSQL, porque dos implementaciones del mismo reloj
--     es exactamente el fallo que RN-CLK no se puede permitir. Ambos son
--     servidor: src/core corre en las acciones de servidor de Next.js,
--     nunca en el navegador.
--   · Lo que sí depende del reloj y aun así tiene que ser comprobable
--     dentro de la base de datos —  la ventana de corrección— se resuelve
--     guardando el instante de cierre calculado en publish_job()
--     (`jobs.correction_window_ends_at`), con una cota de seguridad. Ver la
--     nota de esa función.
--   · La **recomendación** con varios candidatos (RN-ASG-04) también vive
--     en src/core: su tercer criterio de desempate ("menos plazos próximos
--     a vencer") necesita el reloj. La base de datos aporta los candidatos
--     válidos y sus métricas (list_job_candidates) y resuelve por su cuenta
--     el único caso que no necesita orden ninguno: candidato único ->
--     asignación automática (RN-ASG-03, auto_assign_job).
--
-- RN-ASG-06: la fórmula ponderada definitiva está **pendiente de
-- calibración y no se inventa** (CLAUDE.md). `assignment_weights` se crea
-- vacía para poder sustituir el orden lexicográfico cuando se calibre.

-- ============================================================
-- has_capability: dos capacidades nuevas. CREATE OR REPLACE en un archivo
-- nuevo — las migraciones 20260830000007/16/17 nunca se tocan.
--   · 'assign_jobs'  — asignar y reasignar trabajos (RN-ASG-04/05/08),
--     autorizar pausas (RN-JOB-07) y cancelar tareas (RN-JOB-01). §4.2: el
--     administrador "gestiona operación, restaurantes, solicitudes,
--     trabajos, tareas"; el propietario tiene control total.
--   · 'perform_jobs' — ejecutar trabajos. El trabajador siempre; el
--     propietario "puede ejecutar trabajos solo como recurso operativo
--     cuando no hay nadie más disponible" (§4.2), y el administrador
--     **solo si tiene la capacidad** — de ahí la columna
--     space_memberships.can_perform_jobs de más abajo, que es esa capacidad
--     concedida persona a persona y no un rol nuevo.
-- ============================================================
alter table public.space_memberships
  add column can_perform_jobs boolean not null default false;

comment on column public.space_memberships.can_perform_jobs is
  '§4.2: "Puede ejecutar trabajos si tiene la capacidad `perform_jobs`" —
   solo se consulta para el rol admin. El trabajador la tiene por su rol y
   el propietario por su control total (recurso operativo), así que para
   ellos esta columna no decide nada.';

create or replace function public.has_capability(p_space_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.space_role;
  v_can_perform_jobs boolean;
begin
  select sm.role, sm.can_perform_jobs into v_role, v_can_perform_jobs
  from public.space_memberships sm
  where sm.space_id = p_space_id
    and sm.user_id = auth.uid()
    and sm.status = 'active';

  if v_role is null then
    return false;
  end if;

  return case p_capability
    when 'manage_space' then v_role = 'owner'
    when 'invite_member' then v_role = 'owner'
    when 'create_establishment' then v_role in ('owner', 'admin')
    when 'manage_clients' then v_role in ('owner', 'admin')
    when 'view_team' then true
    when 'manage_holidays' then v_role in ('owner', 'admin')
    when 'manage_requests' then v_role in ('owner', 'admin')
    -- Hito 6:
    when 'assign_jobs' then v_role in ('owner', 'admin')
    when 'perform_jobs' then
      v_role = 'worker'
      or v_role = 'owner'
      or (v_role = 'admin' and coalesce(v_can_perform_jobs, false))
    else false
  end;
end;
$$;

-- Variante por persona de las dos comprobaciones que la asignación
-- necesita hacer sobre **otro** usuario (a quién se le puede asignar un
-- trabajo), no sobre quien llama. has_capability() siempre habla de
-- auth.uid(); esta habla de p_user_id.
create or replace function public.member_can_perform_jobs(p_space_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_memberships sm
    where sm.space_id = p_space_id
      and sm.user_id = p_user_id
      and sm.status = 'active'
      and (sm.role in ('owner', 'worker') or (sm.role = 'admin' and sm.can_perform_jobs))
  );
$$;

-- Concede o retira `perform_jobs` a un administrador (§4.2). Solo el
-- propietario del espacio, que es quien "nombra o retira administradores".
create or replace function public.set_admin_can_perform_jobs(p_space_id uuid, p_user_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous boolean;
begin
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede conceder o retirar la capacidad de ejecutar trabajos';
  end if;

  select can_perform_jobs into v_previous
  from public.space_memberships
  where space_id = p_space_id and user_id = p_user_id;

  if v_previous is null then
    raise exception 'Esa persona no pertenece a este espacio';
  end if;

  update public.space_memberships
  set can_perform_jobs = p_value
  where space_id = p_space_id and user_id = p_user_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    p_space_id, auth.uid(), 'membership.perform_jobs_changed', 'space_membership', p_user_id,
    jsonb_build_object('can_perform_jobs', v_previous),
    jsonb_build_object('can_perform_jobs', p_value)
  );
end;
$$;

-- ============================================================
-- Autorización operativa del trabajador: a qué establecimientos está
-- asignado (RN-ASG-01), con qué especialidades (§4.6) y con qué
-- disponibilidad declarada (RN-ASG-10/11).
--
-- Ninguna de estas tablas tiene política de DELETE: RN-EST-05 dice que "al
-- retirar un acceso desaparece de inmediato, pero la actividad histórica
-- permanece", así que retirar es poner `revoked_at`, nunca borrar la fila
-- (CLAUDE.md, MUST NOT).
-- ============================================================
create table public.worker_establishments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id)
);

comment on table public.worker_establishments is
  'RN-ASG-01: a qué establecimientos está asignado un trabajador. El
   propietario y los administradores no necesitan filas aquí — gestionan
   todos los clientes de su espacio por su rol (§4.2). Retirar un acceso es
   poner revoked_at (RN-EST-05), nunca borrar.';

alter table public.worker_establishments enable row level security;

create unique index worker_establishments_active_idx
  on public.worker_establishments (user_id, establishment_id)
  where revoked_at is null;

create index worker_establishments_establishment_idx on public.worker_establishments (establishment_id);

create policy worker_establishments_select on public.worker_establishments
for select
using (public.is_space_member(space_id));

create policy worker_establishments_insert on public.worker_establishments
for insert
with check (
  public.has_capability(space_id, 'assign_jobs')
  and created_by = auth.uid()
  and space_id = (select e.space_id from public.establishments e where e.id = establishment_id)
);

create policy worker_establishments_update on public.worker_establishments
for update
using (public.has_capability(space_id, 'assign_jobs'))
with check (public.has_capability(space_id, 'assign_jobs'));

create table public.worker_specialties (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- §4.6, las siete especialidades. `general` habilita cualquier categoría
  -- sin impedir registrar especialidades concretas además.
  specialty text not null check (specialty in ('web', 'design', 'copy', 'seo', 'daily_menu', 'analytics', 'general')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id)
);

comment on table public.worker_specialties is 'Especialidades de un trabajador (§4.6, RN-ASG-01).';

alter table public.worker_specialties enable row level security;

create unique index worker_specialties_active_idx
  on public.worker_specialties (user_id, specialty)
  where revoked_at is null;

create policy worker_specialties_select on public.worker_specialties
for select
using (public.is_space_member(space_id));

create policy worker_specialties_insert on public.worker_specialties
for insert
with check (public.has_capability(space_id, 'assign_jobs') and created_by = auth.uid());

create policy worker_specialties_update on public.worker_specialties
for update
using (public.has_capability(space_id, 'assign_jobs'))
with check (public.has_capability(space_id, 'assign_jobs'));

create table public.worker_availability (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  available boolean not null,
  note text,
  updated_at timestamptz not null default now(),
  unique (space_id, user_id)
);

comment on table public.worker_availability is
  'RN-ASG-10: no hay horario fijo obligatorio; cada trabajador declara su
   disponibilidad variable. RN-ASG-11: sirve para planificación y
   recomendación y **no modifica el SLA del cliente** — ninguna función de
   este archivo la usa para calcular un plazo.

   Sin fila = disponible. RN-ASG-10 dice justamente que no existe un
   horario obligatorio, así que la ausencia de declaración no puede
   significar "no disponible": solo una declaración explícita de no
   disponibilidad (o una ausencia aprobada, que pone al miembro en
   temporarily_absent, RN-ASG-12) deja a alguien fuera.';

alter table public.worker_availability enable row level security;

create policy worker_availability_select on public.worker_availability
for select
using (public.is_space_member(space_id));

-- Cada uno declara la suya (HU-30 completa la pantalla en el Hito 8); el
-- propietario y los administradores la leen para planificar.
create policy worker_availability_insert on public.worker_availability
for insert
with check (user_id = auth.uid() and public.is_space_member(space_id));

create policy worker_availability_update on public.worker_availability
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ============================================================
-- supervisions — RN-SUP. "Supervisor" NO es un rol: es una relación
-- Administrador–Trabajador (CLAUDE.md, decisiones que no deben
-- reaparecer). RN-SUP-05: solo el propietario del espacio la crea o la
-- cambia.
-- ============================================================
create table public.supervisions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('principal', 'substitute')),
  starts_at timestamptz not null default now(),
  -- RN-SUP-03: el sustituto temporal tiene fecha de inicio y fin, y puede
  -- retirarse antes o ampliarse (un UPDATE de ends_at).
  ends_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint supervisions_principal_has_no_end check (kind = 'substitute' or ends_at is null),
  constraint supervisions_window check (ends_at is null or ends_at > starts_at)
);

comment on table public.supervisions is
  'RN-SUP-01/02/03: relación entre un Administrador (principal) y un
   Trabajador, con posible sustituto temporal. RN-SUP-04: principal y
   sustituto reciben ambos los avisos mientras la sustitución esté vigente
   (los avisos en sí son del Hito 8, RN-NOT).';

alter table public.supervisions enable row level security;

-- RN-SUP-02: cada trabajador tiene exactamente un Administrador principal.
create unique index supervisions_one_principal_idx
  on public.supervisions (worker_id)
  where kind = 'principal' and revoked_at is null;

create index supervisions_worker_idx on public.supervisions (worker_id);

create policy supervisions_select on public.supervisions
for select
using (public.is_space_member(space_id));

-- Sin política de INSERT/UPDATE: RN-SUP-05 exige que solo el propietario
-- las cree o cambie, y eso lo hacen las funciones de más abajo.

create or replace function public.set_principal_supervisor(p_worker_id uuid, p_admin_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_previous_id uuid;
  v_supervision_id uuid;
begin
  select sm.space_id into v_space_id
  from public.space_memberships sm
  where sm.user_id = p_worker_id and sm.role = 'worker' and sm.status = 'active'
  limit 1;

  if v_space_id is null then
    raise exception 'Esa persona no es un trabajador activo de ningún espacio';
  end if;

  -- RN-SUP-05: solo el propietario del espacio.
  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede asignar supervisores';
  end if;

  if not exists (
    select 1 from public.space_memberships
    where space_id = v_space_id and user_id = p_admin_id and role in ('admin', 'owner') and status = 'active'
  ) then
    raise exception 'El supervisor principal debe ser un administrador activo del mismo espacio';
  end if;

  -- RN-SUP-02: exactamente uno. El anterior se revoca, no se borra
  -- (queda el historial).
  update public.supervisions
  set revoked_at = now()
  where worker_id = p_worker_id and kind = 'principal' and revoked_at is null
  returning id into v_previous_id;

  insert into public.supervisions (space_id, worker_id, admin_id, kind, created_by)
  values (v_space_id, p_worker_id, p_admin_id, 'principal', auth.uid())
  returning id into v_supervision_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'supervision.principal_set', 'supervision', v_supervision_id,
    jsonb_build_object('previous_supervision_id', v_previous_id),
    jsonb_build_object('worker_id', p_worker_id, 'admin_id', p_admin_id)
  );

  return v_supervision_id;
end;
$$;

create or replace function public.set_substitute_supervisor(
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
  v_space_id uuid;
  v_supervision_id uuid;
begin
  select sm.space_id into v_space_id
  from public.space_memberships sm
  where sm.user_id = p_worker_id and sm.role = 'worker' and sm.status = 'active'
  limit 1;

  if v_space_id is null then
    raise exception 'Esa persona no es un trabajador activo de ningún espacio';
  end if;

  if not public.has_capability(v_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede asignar supervisores';
  end if;

  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Una sustitución necesita fecha de inicio y de fin (RN-SUP-03)';
  end if;

  insert into public.supervisions (space_id, worker_id, admin_id, kind, starts_at, ends_at, created_by)
  values (v_space_id, p_worker_id, p_admin_id, 'substitute', p_starts_at, p_ends_at, auth.uid())
  returning id into v_supervision_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (
    v_space_id, auth.uid(), 'supervision.substitute_set', 'supervision', v_supervision_id,
    jsonb_build_object('worker_id', p_worker_id, 'admin_id', p_admin_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at)
  );

  return v_supervision_id;
end;
$$;

-- RN-SUP-04: quién debe recibir los avisos de un trabajador ahora mismo —
-- su principal y, si la sustitución está vigente, también el sustituto.
create or replace function public.current_supervisors(p_worker_id uuid)
returns table (admin_id uuid, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select s.admin_id, s.kind
  from public.supervisions s
  where s.worker_id = p_worker_id
    and s.revoked_at is null
    and s.starts_at <= now()
    and (s.ends_at is null or s.ends_at > now())
    -- SECURITY DEFINER con su propia comprobación de acceso: quién
    -- supervisa a quién es información interna del espacio, no un dato
    -- público de la plataforma.
    and public.is_space_member(s.space_id)
  order by s.kind;
$$;

-- ============================================================
-- jobs — columnas del Hito 6. La tabla la creó el Hito 5 con el enum
-- completo de estados de RN-JOB-01; aquí se añade lo que la ejecución
-- necesita, con una migración nueva (nunca editando la anterior).
-- ============================================================
alter table public.jobs
  add column assigned_to uuid references public.profiles (id),
  add column assigned_at timestamptz,
  add column started_by uuid references public.profiles (id),
  add column published_at timestamptz,
  add column published_by uuid references public.profiles (id),
  add column completed_at timestamptz,
  -- RN-COR-01/02: la corrección mínima gratuita se gasta una sola vez.
  add column free_correction_used_at timestamptz,
  -- Ver publish_job(): instante de cierre de la ventana de corrección
  -- (RN-COR-02, 72 h laborables), calculado con el reloj laborable de
  -- src/core y guardado aquí para que la comprobación sea exigible dentro
  -- de la base de datos.
  add column correction_window_ends_at timestamptz,
  -- RN-ASG-01: la especialidad que exige este trabajo, si exige alguna.
  -- NULL = no exige ninguna. A propósito no se deduce de `category`: el PRD
  -- no define ningún mapeo entre categoría de cambio (§10.1) y especialidad
  -- (§4.6), y no se inventa uno — lo fija una persona con
  -- set_job_required_specialty().
  add column required_specialty text
    check (required_specialty in ('web', 'design', 'copy', 'seo', 'daily_menu', 'analytics', 'general'));

create index jobs_assigned_to_idx on public.jobs (assigned_to);
create index jobs_state_idx on public.jobs (state);

-- Helpers para las políticas de las tablas que cuelgan de un trabajo
-- (mismo motivo que request_space_id()/request_establishment_id() del Hito
-- 4: evitar un subselect en crudo contra una tabla con RLS y su recursión).
create or replace function public.job_space_id(p_job_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.jobs where id = p_job_id;
$$;

create or replace function public.job_establishment_id(p_job_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select establishment_id from public.jobs where id = p_job_id;
$$;

create or replace function public.job_assignee(p_job_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select assigned_to from public.jobs where id = p_job_id;
$$;

-- ------------------------------------------------------------
-- Quién puede leer un trabajo (§4.3). Hasta el Hito 5, `jobs_select` daba
-- acceso a cualquier miembro del espacio porque no existía todavía forma
-- de expresar "los establecimientos autorizados de un trabajador" — la
-- tabla worker_establishments es de este hito. Ahora sí, y §4.3 lo exige:
-- el Trabajador tiene "acceso operativo limitado a los establecimientos,
-- trabajos y tareas autorizados".
-- ------------------------------------------------------------

-- El lado cliente de can_read_establishment(), sin la parte de
-- is_space_member(): quién lo lee **por ser el restaurante**, no por
-- pertenecer al espacio de mantenimiento.
create or replace function public.is_establishment_client(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_group_member((select e.group_id from public.establishments e where e.id = p_establishment_id))
    or public.is_establishment_member(p_establishment_id);
$$;

create or replace function public.is_authorized_worker_establishment(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.worker_establishments we
    where we.user_id = auth.uid()
      and we.establishment_id = p_establishment_id
      and we.revoked_at is null
  );
$$;

create or replace function public.can_read_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Propietario y administradores ven toda la operación de su espacio.
    public.has_capability((select j.space_id from public.jobs j where j.id = p_job_id), 'assign_jobs')
    -- El responsable ve el suyo aunque le retiren después el
    -- establecimiento (§4.3: "conserva acceso de lectura al historial
    -- operativo").
    or (select j.assigned_to from public.jobs j where j.id = p_job_id) = auth.uid()
    or public.is_authorized_worker_establishment((select j.establishment_id from public.jobs j where j.id = p_job_id))
    -- Y el restaurante, su propio trabajo.
    or public.is_establishment_client((select j.establishment_id from public.jobs j where j.id = p_job_id));
$$;

drop policy jobs_select on public.jobs;

create policy jobs_select on public.jobs
for select
using (public.can_read_job(id));

-- ============================================================
-- state_events — RN-DAT-05: "los estados derivados se calculan a partir de
-- eventos, no se almacenan como estado", y CLAUDE.md, MUST: "todo cambio de
-- estado relevante genera un evento y un registro de auditoría". Libro
-- inmutable: solo SELECT, y solo para el equipo del espacio (el motivo de
-- un bloqueo o de una reasignación es información interna — el cliente ve
-- el estado de su solicitud, no el historial operativo).
-- ============================================================
create table public.state_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  entity_type text not null check (entity_type in ('job', 'task')),
  entity_id uuid not null,
  from_state text,
  to_state text not null,
  actor_id uuid references public.profiles (id),
  reason text,
  occurred_at timestamptz not null default now()
);

comment on table public.state_events is
  'Libro inmutable de cambios de estado de trabajos y tareas (RN-DAT-05).
   Sin política de INSERT/UPDATE/DELETE, igual que timer_events: solo lo
   escriben las funciones SECURITY DEFINER de este archivo.';

alter table public.state_events enable row level security;

create index state_events_entity_idx on public.state_events (entity_type, entity_id, occurred_at);

-- Su política se crea al final del archivo: depende de can_read_task(),
-- que a su vez necesita la tabla `tasks`, creada más abajo.

create or replace function public.record_state_event(
  p_space_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_from_state text,
  p_to_state text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, actor_id, reason)
  values (p_space_id, p_entity_type, p_entity_id, p_from_state, p_to_state, auth.uid(), p_reason);
end;
$$;

comment on function public.record_state_event(uuid, text, uuid, text, text, text) is
  'Solo invocable desde las funciones de este archivo (REVOKE de más
   abajo): sin comprobación de permiso propia, asume que quien la llama ya
   validó el suyo — mismo principio que get_or_create_request_conversation()
   del Hito 4.';

revoke all on function public.record_state_event(uuid, text, uuid, text, text, text) from public;

-- ============================================================
-- assignments — historial de asignaciones de un trabajo (RN-ASG-09: "se
-- conserva todo el historial"). La fila vigente es la que tiene
-- released_at null.
-- ============================================================
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  assignee_id uuid not null references public.profiles (id),
  assigned_by uuid references public.profiles (id),
  -- 'auto' = candidato único (RN-ASG-03); 'manual' = una persona
  -- autorizada eligió (RN-ASG-04/15); 'reassignment' = aprobación de una
  -- reasignación (RN-ASG-08).
  kind text not null check (kind in ('auto', 'manual', 'reassignment')),
  reason text,
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);

comment on table public.assignments is
  'Historial de asignaciones de un trabajo (RN-ASG-09). Una reasignación
   cierra la fila anterior con released_at y abre otra — nunca sobrescribe
   la anterior (P4: historial antes que sobrescritura).';

alter table public.assignments enable row level security;

create unique index assignments_one_active_idx on public.assignments (job_id) where released_at is null;
create index assignments_assignee_idx on public.assignments (assignee_id);

-- §4.3: quien puede leer el trabajo puede leer su historial de
-- asignaciones. RN-ASG-17 (no hay ranking público entre trabajadores) es
-- otra cosa: esto es el historial de un trabajo, no una comparación.
create policy assignments_select on public.assignments
for select
using (public.can_read_job(job_id));

-- ============================================================
-- tasks — PRD §11.2, HU-21. Un paso interno de un trabajo, o una actividad
-- interna independiente (§3, glosario) — de ahí que `job_id` sea nulable.
-- RN-JOB-02: son opcionales en trabajos pequeños y recomendables u
-- obligatorias en trabajos grandes; nada aquí las exige, es una
-- recomendación operativa, no una restricción de datos.
-- ============================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid references public.establishments (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text,
  state text not null default 'pending' check (state in ('pending', 'in_progress', 'blocked', 'completed', 'cancelled')),
  -- §14.4: Ligera 1 · Normal 3 · Alta 6 · Muy alta 10.
  weight text not null check (weight in ('light', 'normal', 'high', 'very_high')),
  -- RN-ASG-16: "la categoría de puntos para tareas de más de 4 horas está
  -- pendiente. Estas tareas deben dividirse. No inventes una categoría
  -- nueva." El CHECK es esa regla: una tarea de más de 240 minutos no se
  -- puede guardar, hay que dividirla.
  estimated_minutes integer not null check (estimated_minutes > 0 and estimated_minutes <= 240),
  assignee_id uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancelled_reason text
);

comment on table public.tasks is
  'Tareas de un trabajo o actividades internas independientes (§11.2,
   HU-21). Sin política de INSERT/UPDATE: toda mutación pasa por las
   funciones SECURITY DEFINER de este archivo, que hacen cumplir
   TASK_TRANSITIONS de src/core/job-states.ts — incluida RN-JOB-01 (el
   trabajador no puede cancelar una tarea).';

alter table public.tasks enable row level security;

create index tasks_job_id_idx on public.tasks (job_id);
create index tasks_assignee_idx on public.tasks (assignee_id);

-- Las tareas son internas: el cliente nunca las ve (§20.2 las lista en el
-- menú del espacio, no en el del restaurante; RN-MSG-04 es el mismo
-- principio para las notas internas). Y dentro del equipo, un trabajador
-- solo ve las de sus trabajos autorizados o las suyas (§4.3).
create policy tasks_select on public.tasks
for select
using (
  public.has_capability(space_id, 'assign_jobs')
  or assignee_id = auth.uid()
  or (job_id is not null and public.can_read_job(job_id))
);

create or replace function public.can_read_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_capability((select t.space_id from public.tasks t where t.id = p_task_id), 'assign_jobs')
    or (select t.assignee_id from public.tasks t where t.id = p_task_id) = auth.uid()
    or public.can_read_job((select t.job_id from public.tasks t where t.id = p_task_id));
$$;

-- ============================================================
-- blocks — RN-JOB-07/08/09. Un bloqueo o una pausa autorizada, con su
-- motivo, quién lo marcó y cuándo se levantó.
-- ============================================================
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  -- RN-JOB-07, las cuatro razones válidas, sin inventar ninguna más.
  reason_type text not null check (reason_type in (
    'client_information', 'external_incident', 'authorized_pause', 'financial_hold'
  )),
  note text,
  started_at timestamptz not null default now(),
  started_by uuid references public.profiles (id),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id),
  -- RN-JOB-09: el administrador puede revertir un bloqueo marcado por el
  -- trabajador, y queda registrado.
  reverted boolean not null default false
);

comment on table public.blocks is
  'Bloqueos y pausas de un trabajo (RN-JOB-07/08/09). El tiempo que T3
   estuvo parado no se guarda aquí: se recalcula desde timer_events
   (RN-SLA-14, CA-13) — esta tabla guarda el motivo, no el contador.';

alter table public.blocks enable row level security;

create unique index blocks_one_open_idx on public.blocks (job_id) where ended_at is null;
create index blocks_job_idx on public.blocks (job_id);

-- RN-JOB-08: el estado visible para el cliente es "Bloqueado · Esperando
-- al restaurante", así que tiene que poder leerlo. can_read_job() ya
-- incluye al restaurante y limita al trabajador a lo suyo (§4.3).
create policy blocks_select on public.blocks
for select
using (public.can_read_job(job_id));

-- ============================================================
-- corrections — RN-COR. Una fila por corrección abierta sobre un trabajo.
-- ============================================================
create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  -- RN-COR-07 / RN-JOB-12: solo 'client_request' gasta la corrección
  -- mínima gratuita; un error imputable al equipo se corrige sin consumir
  -- ni la corrección ni créditos.
  kind text not null check (kind in ('client_request', 'team_error')),
  description text not null check (length(btrim(description)) > 0),
  requested_by uuid references public.profiles (id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id)
);

comment on table public.corrections is
  'RN-COR-01: una sola corrección mínima gratuita por trabajo — el índice
   único parcial de más abajo es quien lo hace cumplir. Las correcciones
   por error del equipo (RN-COR-07) no están limitadas: no gastan nada del
   cliente.';

alter table public.corrections enable row level security;

-- RN-COR-01: "una sola corrección en total por trabajo".
create unique index corrections_one_client_request_idx
  on public.corrections (job_id)
  where kind = 'client_request';

create index corrections_job_idx on public.corrections (job_id);

create policy corrections_select on public.corrections
for select
using (
  public.is_space_member(space_id)
  or public.can_read_establishment(establishment_id)
);

-- ============================================================
-- assignment_weights — RN-ASG-06: "La función vive aislada en
-- src/core/assignment.ts con una tabla `assignment_weights` preparada y
-- vacía, para poder sustituir el orden por una fórmula ponderada cuando se
-- calibre." Se crea vacía **a propósito**: ni una fila de semilla, ni un
-- peso por defecto. Inventar aquí un número sería inventar la fórmula.
-- ============================================================
create table public.assignment_weights (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  criterion text not null,
  weight numeric not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (space_id, criterion)
);

comment on table public.assignment_weights is
  'Vacía a propósito (RN-ASG-06): la fórmula ponderada está pendiente de
   calibración y no debe inventarse. Mientras esté vacía, el orden de
   candidatos es el lexicográfico determinista de src/core/assignment.ts.';

alter table public.assignment_weights enable row level security;

create policy assignment_weights_select on public.assignment_weights
for select
using (public.is_space_member(space_id));

create policy assignment_weights_insert on public.assignment_weights
for insert
with check (public.has_capability(space_id, 'manage_space') and created_by = auth.uid());

create policy assignment_weights_update on public.assignment_weights
for update
using (public.has_capability(space_id, 'manage_space'))
with check (public.has_capability(space_id, 'manage_space'));

-- ============================================================
-- Puntos de carga (§14.4). Mismos números que src/core/load-points.ts —
-- ahí se prueban con tests unitarios, aquí se usan para poder ordenar
-- candidatos dentro de la propia consulta sin traerse toda la operación
-- del espacio al servidor de aplicación.
-- ============================================================
create or replace function public.job_load_points(p_category text)
returns integer
language sql
immutable
as $$
  select case p_category
    when 'photo' then 1
    when 'small' then 1
    when 'medium' then 4
    when 'large' then 10
  end;
$$;

create or replace function public.task_load_points(p_weight text)
returns integer
language sql
immutable
as $$
  select case p_weight
    when 'light' then 1
    when 'normal' then 3
    when 'high' then 6
    when 'very_high' then 10
  end;
$$;

-- §14.4: Ligera hasta 15 min · Normal 15–45 · Alta 45–120 · Muy alta 2–4 h.
-- RN-ASG-16: más de 4 h no tiene categoría — la tarea debe dividirse, así
-- que esta función falla en vez de inventar un peso.
create or replace function public.task_weight_for_minutes(p_minutes integer)
returns text
language plpgsql
immutable
as $$
begin
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'La duración estimada de una tarea debe ser mayor que cero';
  elsif p_minutes <= 15 then
    return 'light';
  elsif p_minutes <= 45 then
    return 'normal';
  elsif p_minutes <= 120 then
    return 'high';
  elsif p_minutes <= 240 then
    return 'very_high';
  end if;

  raise exception 'Una tarea de más de 4 horas debe dividirse (RN-ASG-16: su categoría de puntos está pendiente)';
end;
$$;

-- RN-ASG-13/14: puntos de carga activos de una persona. Un trabajo
-- desglosado en tareas deja de sumar sus puntos generales; cada
-- participante recibe los de sus tareas.
create or replace function public.worker_active_load_points(p_space_id uuid, p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(public.job_load_points(j.category))
      from public.jobs j
      where j.space_id = p_space_id
        and j.assigned_to = p_user_id
        and j.state in ('assigned', 'in_progress')
        and not exists (
          select 1 from public.tasks t where t.job_id = j.id and t.state <> 'cancelled'
        )
    ), 0)
    + coalesce((
      select sum(public.task_load_points(t.weight))
      from public.tasks t
      where t.space_id = p_space_id
        and t.assignee_id = p_user_id
        and t.state in ('pending', 'in_progress', 'blocked')
    ), 0);
$$;

comment on function public.worker_active_load_points(uuid, uuid) is
  'RN-ASG-13/14, §14.4. Mide trabajo humano activo: no es consumo del plan
   (RN-CON-01) ni una nota de productividad, y RN-ASG-17 prohíbe cualquier
   ranking público entre trabajadores — esta función mide a una persona,
   nunca compara a unas con otras.';

-- La carga de una persona, para la interfaz: cada uno ve la suya (§20.4,
-- inicio del Trabajador) y el propietario y los administradores ven la del
-- equipo ("carga del equipo", §20.4). Nadie más — RN-ASG-17: no existe
-- ranking público entre trabajadores.
create or replace function public.worker_load(p_space_id uuid, p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() and not public.has_capability(p_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para ver la carga de esa persona';
  end if;

  return public.worker_active_load_points(p_space_id, p_user_id);
end;
$$;

-- ============================================================
-- Candidatos (RN-ASG-01 a 06).
-- ============================================================

-- Los cinco filtros duros de RN-ASG-06, en el mismo orden que
-- isEligibleCandidate() de src/core/assignment.ts.
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

  -- Capacidad de realizar el trabajo + estado activo (RN-ASG-02).
  if not public.member_can_perform_jobs(v_space_id, p_user_id) then
    return false;
  end if;

  select role into v_role
  from public.space_memberships
  where space_id = v_space_id and user_id = p_user_id and status = 'active';

  -- RN-ASG-01: asignado al establecimiento. El propietario y los
  -- administradores lo están por su rol (§4.2: gestionan la operación de
  -- todos sus clientes), así que no necesitan fila en
  -- worker_establishments.
  if v_role = 'worker' and not exists (
    select 1 from public.worker_establishments we
    where we.user_id = p_user_id and we.establishment_id = v_establishment_id and we.revoked_at is null
  ) then
    return false;
  end if;

  -- Especialidad compatible (§4.6). Si el trabajo no exige ninguna, este
  -- filtro no excluye a nadie.
  if v_required_specialty is not null and not exists (
    select 1 from public.worker_specialties ws
    where ws.user_id = p_user_id
      and ws.revoked_at is null
      and ws.specialty in ('general', v_required_specialty)
  ) then
    return false;
  end if;

  -- Disponibilidad declarada (RN-ASG-10/11). Sin fila = disponible; ver el
  -- comentario de worker_availability.
  if exists (
    select 1 from public.worker_availability wa
    where wa.space_id = v_space_id and wa.user_id = p_user_id and wa.available = false
  ) then
    return false;
  end if;

  return true;
end;
$$;

-- Los candidatos de un trabajo. El propietario del espacio queda fuera
-- aunque cumpla todos los filtros: §4.2 le deja ejecutar trabajos "solo
-- como recurso operativo cuando no hay nadie más disponible", y RN-ASG-05
-- dice qué pasa cuando no hay nadie más — el trabajo queda pendiente y se
-- avisa, no se le adjudica solo. Puede asumirlo con una asignación manual
-- (assign_job, que sí le acepta). Misma regla que rankCandidates() en
-- src/core/assignment.ts.
create or replace function public.job_candidate_ids(p_job_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select sm.user_id
  from public.space_memberships sm
  where sm.space_id = (select j.space_id from public.jobs j where j.id = p_job_id)
    and sm.status = 'active'
    and sm.role <> 'owner'
    and public.is_eligible_job_candidate(p_job_id, sm.user_id);
$$;

-- HU-16: los candidatos válidos de un trabajo, con las métricas que el
-- desempate de RN-ASG-06 necesita.
--
-- Devuelve tres de los cuatro criterios de desempate. El tercero ("menos
-- plazos próximos a vencer") **no** está aquí a propósito: depende del
-- reloj laborable, que tiene un único dueño en src/core/business-clock.ts
-- (ver la nota de cabecera del archivo). Quien recomienda —
-- src/core/assignment.ts, en el servidor — lo calcula a partir de
-- timer_events y ordena con los cuatro.
create or replace function public.list_job_candidates(p_job_id uuid)
returns table (
  worker_id uuid,
  active_load_points integer,
  active_job_count integer,
  last_assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
begin
  select j.space_id into v_space_id from public.jobs j where j.id = p_job_id;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para ver los candidatos de este trabajo';
  end if;

  return query
  select
    c.user_id,
    public.worker_active_load_points(v_space_id, c.user_id),
    (
      select count(*)::integer from public.jobs j2
      where j2.space_id = v_space_id and j2.assigned_to = c.user_id and j2.state in ('assigned', 'in_progress')
    ),
    (
      select max(a.assigned_at) from public.assignments a
      where a.space_id = v_space_id and a.assignee_id = c.user_id
    )
  from public.job_candidate_ids(p_job_id) as c(user_id)
  order by 2, 3, 4 nulls first, 1;
end;
$$;

comment on function public.list_job_candidates(uuid) is
  'RN-ASG-02/06. El ORDER BY reproduce los criterios de desempate que se
   pueden calcular en SQL; el orden completo (con "menos plazos próximos a
   vencer") lo hace src/core/assignment.ts, que es quien tiene el reloj
   laborable.';

-- Estas tres solo las llaman otras funciones SECURITY DEFINER de este
-- archivo (que se ejecutan como su propietario y no necesitan el permiso
-- de quien las invoca). Fuera de ahí no tienen comprobación de acceso
-- propia, así que no deben poder invocarse por RPC: quién es candidato a
-- qué y cuánta carga lleva cada persona es información interna del espacio
-- (RN-ASG-17). No participan en ninguna política de RLS — las que sí
-- (can_read_job, can_read_task, job_space_id…) se quedan como están,
-- porque una política se evalúa con los privilegios de quien consulta.
revoke all on function public.member_can_perform_jobs(uuid, uuid) from public;
revoke all on function public.worker_active_load_points(uuid, uuid) from public;
revoke all on function public.job_candidate_ids(uuid) from public;

-- ============================================================
-- Asignación (RN-ASG-03/04/05, HU-16).
-- ============================================================

-- Núcleo compartido por assign_job() y auto_assign_job(): ya con el
-- permiso comprobado y la fila del trabajo bloqueada por quien llama.
create or replace function public.apply_job_assignment(
  p_job_id uuid,
  p_worker_id uuid,
  p_kind text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_previous_assignee uuid;
begin
  select space_id, state, assigned_to into v_space_id, v_state, v_previous_assignee
  from public.jobs where id = p_job_id;

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
end;
$$;

comment on function public.apply_job_assignment(uuid, uuid, text, text) is
  'Solo invocable desde assign_job()/auto_assign_job()/approve_job_reassignment()
   (REVOKE de más abajo): no comprueba permisos por su cuenta.';

revoke all on function public.apply_job_assignment(uuid, uuid, text, text) from public;

-- RN-ASG-01: fija (o quita, con null) la especialidad que exige un
-- trabajo. La decide una persona del equipo: el PRD no define ningún mapeo
-- entre la categoría del cambio (§10.1) y la especialidad (§4.6), y no se
-- inventa uno.
create or replace function public.set_job_required_specialty(p_job_id uuid, p_specialty text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_previous text;
begin
  select space_id, required_specialty into v_space_id, v_previous
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para cambiar la especialidad que exige este trabajo';
  end if;

  update public.jobs set required_specialty = p_specialty where id = p_job_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'job.required_specialty_changed', 'job', p_job_id,
    jsonb_build_object('required_specialty', v_previous),
    jsonb_build_object('required_specialty', p_specialty)
  );
end;
$$;

-- HU-16 / RN-ASG-04/15: una persona autorizada asigna a quien decide. No
-- se bloquea por carga: RN-ASG-15 dice que "no existe un máximo duro. El
-- sistema avisa y recomienda, pero una persona autorizada puede asignar
-- manualmente por encima del nivel".
create or replace function public.assign_job(p_job_id uuid, p_worker_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
begin
  select space_id, state, assigned_to into v_space_id, v_state, v_assigned_to
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para asignar trabajos en este espacio';
  end if;

  if v_state = 'assigned' and v_assigned_to = p_worker_id then
    return; -- CA-17: pulsar dos veces asignar no duplica nada.
  end if;

  if v_state <> 'pending_assignment' then
    raise exception 'Solo se puede asignar un trabajo pendiente de asignación (una reasignación se aprueba con approve_job_reassignment)';
  end if;

  -- RN-ASG-02: los filtros duros se comprueban también aquí, no solo al
  -- recomendar — asignar a alguien inactivo, sin la capacidad de ejecutar
  -- trabajos o sin acceso a ese establecimiento sería concederle acceso
  -- por la puerta de atrás.
  if not public.is_eligible_job_candidate(p_job_id, p_worker_id) then
    raise exception 'Esa persona no es un candidato válido para este trabajo';
  end if;

  perform public.apply_job_assignment(p_job_id, p_worker_id, 'manual', p_reason);
end;
$$;

-- HU-16 / RN-ASG-03: "si existe exactamente un trabajador activo,
-- disponible, con la especialidad adecuada y asignado a ese restaurante,
-- Cuotly lo asigna automáticamente". Con cero o con varios no asigna nada
-- y devuelve null: con cero el trabajo queda pendiente y se avisa
-- (RN-ASG-05), con varios manda la recomendación humana (RN-ASG-04).
create or replace function public.auto_assign_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_candidate_count integer;
  v_worker_id uuid;
begin
  select space_id, state into v_space_id, v_state
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para asignar trabajos en este espacio';
  end if;

  if v_state <> 'pending_assignment' then
    return null; -- Idempotente: ya está asignado o más allá.
  end if;

  select count(*), min(c.user_id::text)::uuid
  into v_candidate_count, v_worker_id
  from public.job_candidate_ids(p_job_id) as c(user_id);

  if v_candidate_count <> 1 then
    return null;
  end if;

  perform public.apply_job_assignment(p_job_id, v_worker_id, 'auto', null);
  return v_worker_id;
end;
$$;

-- ============================================================
-- Comenzar, bloquear, pausar, publicar (RN-JOB-03 a 12; HU-18, HU-19,
-- HU-20).
-- ============================================================

-- HU-18 / RN-JOB-03: el responsable pulsa Comenzar dentro del plazo T2.
-- RN-SLA-07: T2 se detiene. RN-SLA-11: T3 arranca.
create or replace function public.start_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_request_id uuid;
begin
  select space_id, state, assigned_to, request_id
  into v_space_id, v_state, v_assigned_to, v_request_id
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
$$;

-- HU-19 / RN-JOB-07/08/09: bloqueo o pausa autorizada. T3 se pausa y
-- conserva el tiempo restante exacto (RN-SLA-14, CA-13).
create or replace function public.block_job(p_job_id uuid, p_reason_type text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_new_state text;
  v_block_id uuid;
begin
  select space_id, state, assigned_to into v_space_id, v_state, v_assigned_to
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  -- RN-JOB-09: el trabajador puede marcar un bloqueo por cliente. Las
  -- demás razones de RN-JOB-07 (incidente externo, pausa autorizada, pausa
  -- financiera por impago) son decisiones del propietario o del
  -- administrador.
  if p_reason_type = 'client_information' then
    if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
      raise exception 'Solo el responsable asignado o un administrador pueden bloquear este trabajo';
    end if;
  elsif not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden autorizar esta pausa';
  end if;

  if v_state in ('blocked_by_client', 'authorized_pause') then
    -- Idempotente: ya está parado; se devuelve el bloqueo abierto.
    select id into v_block_id from public.blocks where job_id = p_job_id and ended_at is null;
    return v_block_id;
  end if;

  if v_state <> 'in_progress' then
    raise exception 'Solo se puede bloquear un trabajo en curso';
  end if;

  v_new_state := case when p_reason_type = 'client_information' then 'blocked_by_client' else 'authorized_pause' end;

  insert into public.blocks (space_id, job_id, reason_type, note, started_by)
  values (v_space_id, p_job_id, p_reason_type, p_note, auth.uid())
  returning id into v_block_id;

  update public.jobs set state = v_new_state where id = p_job_id;

  -- RN-SLA-14: T3 se pausa; el tiempo restante se conserva exacto porque
  -- el contador se recalcula sumando tramos, no restando de un número
  -- guardado (CA-13).
  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't3', 'job', p_job_id, 'paused', now(), auth.uid());

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, v_new_state, p_note);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.blocked', 'job', p_job_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', v_new_state, 'reason_type', p_reason_type),
    p_note
  );

  return v_block_id;
end;
$$;

-- RN-JOB-08: al recibir lo que faltaba, T3 se reanuda con el tiempo
-- restante exacto (CA-13). `p_reverted` marca el caso de RN-JOB-09: el
-- administrador revierte un bloqueo que el trabajador no debió marcar, y
-- queda registrado en auditoría.
create or replace function public.unblock_job(p_job_id uuid, p_note text default null, p_reverted boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
begin
  select space_id, state, assigned_to into v_space_id, v_state, v_assigned_to
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden reanudar este trabajo';
  end if;

  if p_reverted and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden revertir un bloqueo';
  end if;

  -- RN-JOB-07: una pausa autorizada la levanta quien la autorizó, no el
  -- trabajador (a diferencia del bloqueo por falta de información, que
  -- termina cuando llega lo que faltaba).
  if v_state = 'authorized_pause' and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el propietario o un administrador pueden levantar una pausa autorizada';
  end if;

  if v_state = 'in_progress' then
    return; -- Idempotente: ya está en curso.
  end if;

  if v_state not in ('blocked_by_client', 'authorized_pause') then
    raise exception 'El trabajo no está bloqueado ni en pausa';
  end if;

  update public.blocks
  set ended_at = now(), ended_by = auth.uid(), reverted = p_reverted
  where job_id = p_job_id and ended_at is null;

  update public.jobs set state = 'in_progress' where id = p_job_id;

  insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
  values (v_space_id, 't3', 'job', p_job_id, 'resumed', now(), auth.uid());

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, 'in_progress', p_note);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.unblocked', 'job', p_job_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'in_progress', 'reverted', p_reverted),
    p_note
  );
end;
$$;

-- HU-20 / RN-JOB-10: "el trabajador publica directamente al terminar. **No
-- necesita aprobación previa del supervisor**." Aquí no hay ninguna
-- comprobación de aprobación porque la regla es que no existe;
-- RN-JOB-11 (el supervisor recibe una notificación posterior y puede
-- revisar) llega con el centro de notificaciones del Hito 8, y hasta
-- entonces el state_event de esta función es el registro del que partirá.
--
-- `p_correction_window_ends_at`: instante en el que se cierran las 72 h
-- laborables de RN-COR-02, calculado por la acción de servidor con
-- addBusinessMinutes() de src/core/business-clock.ts — el único reloj
-- laborable del sistema (ver la nota de cabecera del archivo). Se guarda
-- para que request_free_correction() pueda hacer cumplir la ventana dentro
-- de la base de datos en vez de fiarse de quien llama. La cota de los 60
-- días naturales de más abajo no es una regla de negocio: es un tope de
-- seguridad para que un valor erróneo no pueda abrir una ventana infinita
-- (72 h laborables nunca llegan ni de lejos a 60 días naturales, ni con
-- festivos).
create or replace function public.publish_job(p_job_id uuid, p_correction_window_ends_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
  v_request_id uuid;
begin
  select space_id, state, assigned_to, request_id
  into v_space_id, v_state, v_assigned_to, v_request_id
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
$$;

-- RN-COR-08: al terminar la ventana de corrección el trabajo queda
-- finalizado y la conversación de esa solicitud pasa a solo lectura. No
-- hay recordatorio automático (RN-COR-09): esto se ejecuta cuando alguien
-- del equipo cierra el trabajo o cuando lo haga el proceso programado del
-- Hito 8.
create or replace function public.complete_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_request_id uuid;
  v_window_ends_at timestamptz;
begin
  select space_id, state, request_id, correction_window_ends_at
  into v_space_id, v_state, v_request_id, v_window_ends_at
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'No tienes permiso para cerrar trabajos en este espacio';
  end if;

  if v_state = 'completed' then
    return; -- CA-17.
  end if;

  if v_state <> 'published' then
    raise exception 'Solo se puede cerrar un trabajo publicado';
  end if;

  if v_window_ends_at is null or v_window_ends_at > now() then
    raise exception 'La ventana de corrección de este trabajo todavía está abierta (RN-COR-02)';
  end if;

  update public.jobs set state = 'completed', completed_at = now() where id = p_job_id;
  update public.requests set state = 'closed' where id = v_request_id;

  perform public.record_state_event(v_space_id, 'job', p_job_id, 'published', 'completed', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'job.completed', 'job', p_job_id,
    jsonb_build_object('state', 'published'), jsonb_build_object('state', 'completed')
  );
end;
$$;

-- ============================================================
-- Reasignación (RN-ASG-07/08/09, HU-22, CA-12).
-- ============================================================

-- HU-22 / RN-ASG-07: el trabajador la pide explicando el motivo. No toca
-- ningún contador.
create or replace function public.request_job_reassignment(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_assigned_to uuid;
begin
  select space_id, state, assigned_to into v_space_id, v_state, v_assigned_to
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if v_assigned_to is null or v_assigned_to <> auth.uid() then
    raise exception 'Solo el responsable asignado puede pedir la reasignación de este trabajo';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Hay que explicar el motivo de la reasignación (RN-ASG-07)';
  end if;

  if v_state = 'reassignment_requested' then
    return; -- Idempotente.
  end if;

  if v_state not in ('assigned', 'in_progress') then
    raise exception 'Solo se puede pedir la reasignación de un trabajo asignado o en curso';
  end if;

  update public.jobs set state = 'reassignment_requested' where id = p_job_id;

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, 'reassignment_requested', p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'job.reassignment_requested', 'job', p_job_id,
    jsonb_build_object('state', v_state),
    jsonb_build_object('state', 'reassignment_requested'),
    p_reason
  );
end;
$$;

-- HU-22 / RN-ASG-08/09 · CA-12: la aprueba el propietario o el
-- administrador. **No se escribe ningún timer_event**: ni T2 ni T3 se
-- reinician, y el nuevo responsable recibe el tiempo restante exacto. El
-- estado al que vuelve el trabajo es el que tenía antes de pedirla, que se
-- recupera del último state_event (RN-DAT-05: los estados derivados salen
-- de los eventos).
create or replace function public.approve_job_reassignment(p_job_id uuid, p_new_worker_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
end;
$$;

comment on function public.approve_job_reassignment(uuid, uuid, text) is
  'RN-ASG-09 / CA-12: "una reasignación NO reinicia T2. El nuevo
   responsable recibe el tiempo restante exacto." Esta función no escribe
   ni un solo timer_event — esa ausencia es la regla.';

-- ============================================================
-- Tareas (HU-21, §11.2, RN-JOB-01, RN-ASG-14/16).
-- ============================================================

-- HU-21: el responsable desglosa su trabajo en tareas y las reparte. Un
-- administrador también puede hacerlo (§4.2: gestiona tareas).
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

  -- RN-ASG-16: si pasa de 4 h, esta llamada falla y la tarea debe
  -- dividirse. No se inventa una categoría nueva.
  v_weight := public.task_weight_for_minutes(p_estimated_minutes);

  if p_assignee_id is not null and not public.member_can_perform_jobs(v_space_id, p_assignee_id) then
    raise exception 'Esa persona no puede recibir tareas en este espacio';
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

-- §11.2: pending -> in_progress -> completed, con bloqueo intermedio. Solo
-- quien la tiene asignada o un administrador. **Nunca `cancelled`**: eso es
-- cancel_task(), y RN-JOB-01 lo reserva al administrador.
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

-- RN-JOB-01: cancelar una tarea es cosa del propietario o del
-- administrador, nunca del trabajador.
create or replace function public.cancel_task(p_task_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
begin
  select space_id, state into v_space_id, v_state
  from public.tasks where id = p_task_id
  for update;

  if v_space_id is null then
    raise exception 'Tarea no encontrada';
  end if;

  if not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Un trabajador no puede cancelar una tarea: debe pedírselo a un administrador (RN-JOB-01)';
  end if;

  if v_state = 'cancelled' then
    return; -- Idempotente.
  end if;

  if v_state = 'completed' then
    raise exception 'Una tarea completada no se cancela';
  end if;

  update public.tasks
  set state = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancelled_reason = p_reason
  where id = p_task_id;

  perform public.record_state_event(v_space_id, 'task', p_task_id, v_state, 'cancelled', p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'task.cancelled', 'task', p_task_id,
    jsonb_build_object('state', v_state), jsonb_build_object('state', 'cancelled'), p_reason
  );
end;
$$;

-- ============================================================
-- Corrección mínima gratuita (RN-COR, HU-23).
-- ============================================================

-- HU-23: el restaurante pide la corrección mínima de un cambio publicado
-- dentro de su ventana. RN-COR-01: una sola por trabajo (índice único).
-- RN-COR-02: dentro de las 72 h laborables posteriores a la publicación —
-- la ventana la cerró publish_job() con el reloj laborable de src/core, y
-- aquí solo se compara con ella.
--
-- RN-COR-03/04 (qué entra en el alcance de una corrección mínima) no se
-- automatiza: lo juzga una persona al leer la petición. No se inventa
-- ninguna heurística.
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
  v_correction_id uuid;
begin
  select space_id, establishment_id, state, request_id, correction_window_ends_at, free_correction_used_at
  into v_space_id, v_establishment_id, v_state, v_request_id, v_window_ends_at, v_used_at
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

  if v_used_at is not null then
    raise exception 'Este trabajo ya usó su corrección mínima gratuita (RN-COR-01)';
  end if;

  if v_state <> 'published' then
    raise exception 'Solo se puede pedir la corrección de un trabajo publicado';
  end if;

  if v_window_ends_at is null or now() > v_window_ends_at then
    raise exception 'La ventana de corrección de este trabajo ya se cerró (RN-COR-02)';
  end if;

  insert into public.corrections
    (space_id, establishment_id, job_id, request_id, kind, description, requested_by)
  values
    (v_space_id, v_establishment_id, p_job_id, v_request_id, 'client_request', p_description, auth.uid())
  returning id into v_correction_id;

  -- RN-COR-01/02: la corrección queda gastada desde que se pide, se
  -- ejecute cuando se ejecute.
  update public.jobs set free_correction_used_at = now() where id = p_job_id;
  update public.requests set state = 'correction_requested' where id = v_request_id;

  perform public.record_state_event(v_space_id, 'job', p_job_id, 'published', 'published', 'correction_requested');

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (
    v_space_id, auth.uid(), 'correction.requested', 'correction', v_correction_id,
    jsonb_build_object('job_id', p_job_id, 'kind', 'client_request', 'consumes_free_correction', true),
    p_description
  );

  return v_correction_id;
end;
$$;

-- RN-COR-07 / RN-JOB-12: un error imputable al equipo se corrige **sin
-- consumir** cambios ni la corrección mínima del cliente. Por eso esta
-- función no toca `free_correction_used_at` ni ningún consumo.
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
  v_correction_id uuid;
begin
  select space_id, establishment_id, state, request_id
  into v_space_id, v_establishment_id, v_state, v_request_id
  from public.jobs where id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'perform_jobs') then
    raise exception 'No tienes permiso para abrir una corrección en este espacio';
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

-- RN-COR-06: la realiza preferentemente el mismo trabajador. Mueve el
-- trabajo a `in_correction` (published -> in_correction de
-- src/core/job-states.ts). No toca T3: RN-SLA-13 lo detuvo al publicar y
-- el PRD no define ningún contador para la corrección.
create or replace function public.start_correction(p_correction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_job_id uuid;
  v_request_id uuid;
  v_state text;
  v_assigned_to uuid;
begin
  select c.space_id, c.job_id, c.request_id into v_space_id, v_job_id, v_request_id
  from public.corrections c where c.id = p_correction_id;

  if v_space_id is null then
    raise exception 'Corrección no encontrada';
  end if;

  select state, assigned_to into v_state, v_assigned_to from public.jobs where id = v_job_id for update;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden empezar esta corrección';
  end if;

  if v_state = 'in_correction' then
    return; -- Idempotente.
  end if;

  if v_state <> 'published' then
    raise exception 'Solo se puede corregir un trabajo publicado';
  end if;

  update public.corrections set started_at = now() where id = p_correction_id and started_at is null;
  update public.jobs set state = 'in_correction' where id = v_job_id;
  update public.requests set state = 'in_correction' where id = v_request_id;

  perform public.record_state_event(v_space_id, 'job', v_job_id, 'published', 'in_correction', null);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'correction.started', 'correction', p_correction_id,
    jsonb_build_object('job_state', 'published'), jsonb_build_object('job_state', 'in_correction')
  );
end;
$$;

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
  v_state text;
  v_assigned_to uuid;
begin
  select c.space_id, c.job_id, c.request_id into v_space_id, v_job_id, v_request_id
  from public.corrections c where c.id = p_correction_id;

  if v_space_id is null then
    raise exception 'Corrección no encontrada';
  end if;

  select state, assigned_to into v_state, v_assigned_to from public.jobs where id = v_job_id for update;

  if (v_assigned_to is distinct from auth.uid()) and not public.has_capability(v_space_id, 'assign_jobs') then
    raise exception 'Solo el responsable asignado o un administrador pueden cerrar esta corrección';
  end if;

  if v_state = 'published' then
    return; -- Idempotente: ya se publicó la corrección.
  end if;

  if v_state <> 'in_correction' then
    raise exception 'Este trabajo no está en corrección';
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

-- ============================================================
-- Nueva aceptación por cambio de clasificación (RN-SLA-08, RN-CLS-09,
-- CA-12) — la otra mitad de CA-12: "una nueva aceptación por cambio de
-- clasificación reinicia T2 desde cero".
--
-- Dos pasos, como en el flujo original: el equipo pide una nueva
-- aceptación (la solicitud vuelve a pending_client_acceptance y T2 se
-- detiene) y el cliente vuelve a aceptar (T2 arranca otra vez, desde
-- cero). El trabajo **no** se recrea: es el mismo trabajo, con su historial
-- intacto — `acceptances` ya preveía varios intentos por solicitud.
--
-- Solo antes de Comenzar: RN-SLA-08 habla de lo que cambia "durante la
-- validación", y una vez pulsado Comenzar el plazo vivo es T3, no T2.
-- ============================================================
create or replace function public.request_new_client_acceptance(
  p_job_id uuid,
  p_new_category text,
  p_summary text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_state text;
  v_request_id uuid;
  v_old_category text;
begin
  select j.space_id, j.state, j.request_id, j.category
  into v_space_id, v_state, v_request_id, v_old_category
  from public.jobs j where j.id = p_job_id
  for update;

  if v_space_id is null then
    raise exception 'Trabajo no encontrado';
  end if;

  if not public.has_capability(v_space_id, 'manage_requests') then
    raise exception 'No tienes permiso para reabrir la aceptación de esta solicitud';
  end if;

  if v_state not in ('pending_assignment', 'assigned') then
    raise exception 'Solo se puede pedir una nueva aceptación antes de que el trabajo comience (RN-SLA-08)';
  end if;

  if (select r.state from public.requests r where r.id = v_request_id) <> 'accepted' then
    raise exception 'La solicitud no está aceptada: no hay nada que volver a aceptar';
  end if;

  if p_new_category not in ('small', 'photo', 'medium', 'large') then
    raise exception 'Categoría no válida';
  end if;

  update public.requests
  set state = 'pending_client_acceptance',
      validated_category = p_new_category,
      validated_summary = p_summary,
      validated_by = auth.uid(),
      validated_at = now()
  where id = v_request_id;

  -- El contador del intento anterior se cierra aquí; el nuevo arranca
  -- cuando el cliente vuelve a aceptar (accept_revised_request).
  if v_state = 'assigned' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_space_id, 't2', 'job', p_job_id, 'stopped', now(), auth.uid());
  end if;

  perform public.record_state_event(v_space_id, 'job', p_job_id, v_state, v_state, p_reason);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'request.new_acceptance_requested', 'request', v_request_id,
    jsonb_build_object('category', v_old_category),
    jsonb_build_object('category', p_new_category, 'job_id', p_job_id),
    p_reason
  );
end;
$$;

-- El cliente vuelve a aceptar (RN-SLA-08, RN-CLS-09). Es la segunda
-- aceptación en adelante: la primera es accept_request(), que además crea
-- el trabajo (RN-REQ-02). Aquí el trabajo ya existe, así que lo que se
-- hace es registrar la nueva aceptación, ajustar el consumo si cambió la
-- categoría (RN-CLS-08: el consumo se registra al aceptar; RN-CON-04: toda
-- devolución con motivo y actor) y **reiniciar T2 desde cero**.
create or replace function public.accept_revised_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
  v_state text;
  v_category text;
  v_job_id uuid;
  v_job_state text;
  v_old_category text;
  v_debit_entry_id uuid;
  v_original_cycle_id uuid;
  v_subscription_id uuid;
  v_current_cycle_id uuid;
  v_included integer;
  v_cycle_included integer;
  v_balance integer;
  v_budgeted boolean := true;
  v_cycle_id uuid;
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

  select id, state, category into v_job_id, v_job_state, v_old_category
  from public.jobs where request_id = p_request_id
  for update;

  if v_job_id is null then
    raise exception 'Esta solicitud todavía no tiene trabajo: la primera aceptación es accept_request()';
  end if;

  if v_state = 'accepted' then
    return; -- CA-17: aceptar dos veces produce un único efecto.
  end if;

  if v_state <> 'pending_client_acceptance' then
    raise exception 'La solicitud no está pendiente de aceptación';
  end if;

  if v_job_state not in ('pending_assignment', 'assigned') then
    raise exception 'El trabajo ya comenzó: no cabe una nueva aceptación (RN-SLA-08)';
  end if;

  -- Si la categoría cambió, el débito anterior se devuelve y se registra
  -- el de la categoría nueva. El libro es inmutable: se añaden apuntes con
  -- signo, nunca se corrige el anterior (RN-DAT-04, CA-08).
  if v_old_category is distinct from v_category then
    select ce.id, ce.consumption_cycle_id into v_debit_entry_id, v_original_cycle_id
    from public.consumption_entries ce
    where ce.job_id = v_job_id and ce.entry_type = 'debit'
    order by ce.created_at desc
    limit 1;

    if v_debit_entry_id is not null then
      select subscription_id into v_subscription_id from public.consumption_cycles where id = v_original_cycle_id;
      v_current_cycle_id := public.get_or_create_consumption_cycle(v_subscription_id);

      insert into public.consumption_entries
        (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, related_entry_id, reason, created_by)
      values (
        v_space_id, v_establishment_id,
        case when v_current_cycle_id = v_original_cycle_id then v_original_cycle_id else v_current_cycle_id end,
        v_old_category, 1,
        -- RN-CON-10: si el ciclo original ya cerró, no se reabre — el
        -- apunte es un crédito compensatorio en el ciclo vigente.
        case when v_current_cycle_id = v_original_cycle_id then 'return' else 'compensatory_credit' end,
        p_request_id, v_job_id, v_debit_entry_id,
        'Nueva aceptación por cambio de clasificación (RN-CLS-09)', auth.uid()
      );
    end if;
  end if;

  -- Consumo de la categoría nueva, con las mismas reglas que
  -- accept_request() (RN-COM-01/02/12, RN-CON-03/06).
  select s.id, case v_category
      when 'small' then p.included_small
      when 'photo' then p.included_photo
      when 'medium' then p.included_medium
      when 'large' then p.included_large
    end
  into v_subscription_id, v_included
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.establishment_id = v_establishment_id and s.kind = 'plan' and s.status = 'active'
  limit 1;

  if v_subscription_id is not null and v_included > 0 then
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

    -- Solo se debita de nuevo si la categoría cambió: si es la misma, el
    -- débito original sigue en pie y volver a debitar cobraría dos veces
    -- el mismo cambio.
    if v_old_category is distinct from v_category then
      insert into public.consumption_entries
        (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, request_id, job_id, reason, created_by)
      values (
        v_space_id, v_establishment_id, v_cycle_id, v_category, -1, 'debit', p_request_id, v_job_id,
        'Nueva aceptación por cambio de clasificación (RN-CLS-09)', auth.uid()
      )
      returning id into v_entry_id;
    else
      -- Misma categoría: el débito original sigue en pie, y la nueva
      -- aceptación apunta a él para que el rastro no se rompa (CA-15).
      select ce.id into v_entry_id
      from public.consumption_entries ce
      where ce.job_id = v_job_id and ce.entry_type = 'debit'
      order by ce.created_at desc
      limit 1;
    end if;
  end if;

  update public.jobs set category = v_category where id = v_job_id;

  insert into public.acceptances
    (space_id, establishment_id, request_id, job_id, category, consumption_cycle_id, consumption_entry_id, budgeted, accepted_by)
  values
    (v_space_id, v_establishment_id, p_request_id, v_job_id, v_category, v_cycle_id, v_entry_id, v_budgeted, auth.uid());

  update public.requests set state = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = p_request_id;

  -- CA-12 / RN-SLA-08: T2 se reinicia **desde cero**. El libro conserva
  -- todos los eventos anteriores (nada se borra); es el arranque nuevo el
  -- que hace que el contador vigente empiece de cero
  -- (eventsSinceLastStart() en src/core/timer-events.ts).
  if v_job_state = 'assigned' then
    insert into public.timer_events (space_id, counter_kind, entity_type, entity_id, event_type, occurred_at, actor_id)
    values (v_space_id, 't2', 'job', v_job_id, 'started', now(), auth.uid());
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (
    v_space_id, auth.uid(), 'request.accepted_again', 'request', p_request_id,
    jsonb_build_object('state', v_state, 'category', v_old_category),
    jsonb_build_object('state', 'accepted', 'category', v_category, 'job_id', v_job_id, 't2_restarted', v_job_state = 'assigned')
  );
end;
$$;

comment on function public.accept_revised_request(uuid) is
  'RN-SLA-08 / RN-CLS-09 / CA-12. Segunda aceptación y siguientes de una
   misma solicitud: no crea un trabajo nuevo (RN-REQ-02 ya lo creó), ajusta
   el consumo si cambió la categoría y reinicia T2 desde cero conservando
   todos los intentos anteriores.';

-- ============================================================
-- Política de state_events (aquí abajo porque necesita can_read_task(),
-- definida junto a la tabla `tasks`). §4.3: el trabajador ve el historial
-- de estados de lo suyo y de sus establecimientos autorizados; el
-- propietario y los administradores, todo el de su espacio. El cliente no
-- lo ve: los motivos de un bloqueo o de una reasignación son internos.
-- ============================================================
create policy state_events_select on public.state_events
for select
using (
  public.has_capability(space_id, 'assign_jobs')
  or (entity_type = 'job' and public.can_read_job(entity_id) and public.is_space_member(space_id))
  or (entity_type = 'task' and public.can_read_task(entity_id))
);
