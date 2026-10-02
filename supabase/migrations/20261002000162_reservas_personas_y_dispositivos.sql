-- Fase B de Restavor agents (AGT-01) · segunda de siete migraciones.
--
-- Quién entra en Reservas y desde dónde (PRD de agents §3.3, §3.4 y §8.3):
--
--   1 · `reservation_staff`: el Equipo sin cuenta (nombre y PIN) y el PIN de los
--       Propietarios y Encargados.
--   2 · `reservation_devices`: las tablets del local, con el hash de su token.
--   3 · `reservation_pin_attempts`: los intentos fallidos de PIN por dispositivo.
--   4 · `reservation_support_sessions`: las sesiones de soporte de Reservas
--       (decisión 92). Las abre una RPC de la Fase D; aquí solo existe la tabla,
--       que ya cuenta para decidir quién ve los datos de los comensales.
--
-- El PIN no se guarda en claro: es un HMAC con una clave del servidor
-- (`AGENTS_PIN_SECRET`). Ni el HMAC, ni el hash del token, ni quién activó un
-- dispositivo o abrió una sesión de soporte salen de la base hacia el cliente.
--
-- Se comprueba con `supabase/tests/reservas_cimientos.sql`.

-- ------------------------------------------------------------
-- 1 · Equipo y PIN
-- ------------------------------------------------------------
create table public.reservation_staff (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- `staff`: del Equipo, sin cuenta. `member`: Propietario o Encargado, con cuenta.
  kind text not null check (kind in ('staff', 'member')),
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  user_id uuid references public.profiles (id),
  -- HMAC del PIN de 4 cifras con `AGENTS_PIN_SECRET`: permite comprobar que no
  -- se repite dentro del restaurante sin guardarlo en claro.
  pin_hmac text,
  active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  -- Solo un `member` tiene cuenta; el Equipo no.
  check ((kind = 'member') = (user_id is not null)),
  check (active or deactivated_at is not null)
);

comment on table public.reservation_staff is
  'PRD de agents §8.3 · el Equipo sin cuenta y el PIN de Propietarios y Encargados. Quitar a alguien lo desactiva y conserva su historial; no se borra.';

-- El PIN es único dentro del restaurante entre los activos.
create unique index reservation_staff_pin_idx
  on public.reservation_staff (establishment_id, pin_hmac)
  where active and pin_hmac is not null;
create unique index reservation_staff_user_idx
  on public.reservation_staff (establishment_id, user_id)
  where user_id is not null;
create index reservation_staff_establishment_idx
  on public.reservation_staff (establishment_id, active);

-- ------------------------------------------------------------
-- 2 · Dispositivos del local
-- ------------------------------------------------------------
create table public.reservation_devices (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  -- El token vive en una cookie httpOnly del dispositivo; aquí solo su hash.
  token_hash text not null unique,
  -- Puede ser alguien del equipo de Restavor: identidad, privilegio de columna.
  activated_by uuid references public.profiles (id),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.reservation_devices is
  'PRD de agents §3.3 · tablets del local activadas. Un dispositivo no es un usuario de Supabase: sus peticiones pasan por el servidor, que valida el token y el PIN.';

create index reservation_devices_establishment_idx
  on public.reservation_devices (establishment_id) where revoked_at is null;

-- ------------------------------------------------------------
-- 3 · Intentos de PIN
-- ------------------------------------------------------------
create table public.reservation_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  device_id uuid not null unique references public.reservation_devices (id),
  failed_count smallint not null default 0 check (failed_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.reservation_pin_attempts is
  'PRD de agents §3.3 · 5 PIN erróneos bloquean el dispositivo 1 minuto. Solo la lee y escribe el servidor.';

-- ------------------------------------------------------------
-- 4 · Sesiones de soporte de Reservas
-- ------------------------------------------------------------
create table public.reservation_support_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- Quién entró: el restaurante nunca lo ve (P7), ve "Restavor (soporte)".
  actor_id uuid not null references public.profiles (id),
  reason text not null check (btrim(reason) <> '' and char_length(reason) <= 500),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > started_at)
);

comment on table public.reservation_support_sessions is
  'Decisión 92 · quien esté marcado como soporte abre una sesión con motivo y segundo paso para ver los datos de los comensales. Distinta de support_sessions, la del Modo soporte de la plataforma.';

create index reservation_support_sessions_open_idx
  on public.reservation_support_sessions (establishment_id, actor_id)
  where ended_at is null;

-- ------------------------------------------------------------
-- RLS, privilegios y solo lectura en soporte
-- ------------------------------------------------------------
alter table public.reservation_staff enable row level security;
alter table public.reservation_devices enable row level security;
alter table public.reservation_pin_attempts enable row level security;
alter table public.reservation_support_sessions enable row level security;

create policy reservation_staff_select on public.reservation_staff
  for select to authenticated
  using (public.reservations_team_can_read(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

create policy reservation_devices_select on public.reservation_devices
  for select to authenticated
  using (public.reservations_team_can_read(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

-- Solo el servidor: la política dice que nadie con sesión la lee.
create policy reservation_pin_attempts_select on public.reservation_pin_attempts
  for select to authenticated
  using (false);

-- El Historial de Reservas del restaurante (Propietario y Encargado) y el equipo.
create policy reservation_support_sessions_select on public.reservation_support_sessions
  for select to authenticated
  using (public.reservations_team_can_read(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

revoke all on public.reservation_staff from anon, authenticated;
revoke all on public.reservation_devices from anon, authenticated;
revoke all on public.reservation_pin_attempts from anon, authenticated;
revoke all on public.reservation_support_sessions from anon, authenticated;

grant select (id, space_id, establishment_id, kind, name, user_id, active, deactivated_at, created_at)
  on public.reservation_staff to authenticated;
grant select (id, space_id, establishment_id, name, last_used_at, revoked_at, created_at)
  on public.reservation_devices to authenticated;
grant select (id, space_id, establishment_id, reason, started_at, expires_at, ended_at, created_at)
  on public.reservation_support_sessions to authenticated;

create trigger reservation_staff_guard_support_read_only
  before insert or update or delete on public.reservation_staff
  for each row execute function public.guard_support_read_only();
create trigger reservation_staff_cuotly_read_only
  before insert or update or delete on public.reservation_staff
  for each row execute function public.guard_space_read_only();
create trigger reservation_devices_guard_support_read_only
  before insert or update or delete on public.reservation_devices
  for each row execute function public.guard_support_read_only();
create trigger reservation_devices_cuotly_read_only
  before insert or update or delete on public.reservation_devices
  for each row execute function public.guard_space_read_only();
create trigger reservation_pin_attempts_guard_support_read_only
  before insert or update or delete on public.reservation_pin_attempts
  for each row execute function public.guard_support_read_only();
create trigger reservation_pin_attempts_cuotly_read_only
  before insert or update or delete on public.reservation_pin_attempts
  for each row execute function public.guard_space_read_only();
create trigger reservation_support_sessions_guard_support_read_only
  before insert or update or delete on public.reservation_support_sessions
  for each row execute function public.guard_support_read_only();
create trigger reservation_support_sessions_cuotly_read_only
  before insert or update or delete on public.reservation_support_sessions
  for each row execute function public.guard_space_read_only();
