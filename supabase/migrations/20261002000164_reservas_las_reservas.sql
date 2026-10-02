-- Fase B de Restavor agents (AGT-01) · cuarta de siete migraciones.
--
-- Las reservas (PRD de agents §8.4):
--
--   1 · `reservations`: la reserva, con sus datos de comensal. Nunca se borra: se
--       cancela, se marca "No vino" o, a los 24 meses, se anonimiza con un UPDATE
--       del sistema (RN-RES-12).
--   2 · `reservation_events`: solo inserción y SIN datos personales de comensales.
--   3 · `reservation_duplicate_dismissals`: los pares marcados "No es duplicada".
--
-- Los datos de comensales (nombre, teléfono, email, notas) los lee el Propietario
-- o el Encargado del restaurante, y el soporte con sesión de Reservas abierta y
-- segundo paso (`reservations_can_read()`, migración 163). Un administrador del
-- espacio sin sesión de soporte recibe cero filas (decisión 108).
--
-- Se comprueba con `supabase/tests/reservas_cimientos.sql`.

-- ------------------------------------------------------------
-- 1 · Reservas
-- ------------------------------------------------------------
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- Nulo solo cuando una plataforma mete una reserva fuera de turno (RN-RES-02).
  shift_id uuid references public.reservation_shifts (id),
  date date not null,
  time time not null,
  starts_at timestamptz not null,
  party_size integer not null check (party_size >= 1),
  customer_name text not null check (btrim(customer_name) <> ''),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email text,
  notes text check (notes is null or char_length(notes) <= 300),
  language text not null default 'es' check (language in ('es', 'en')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled', 'no_show')),
  source text not null check (source in ('agent', 'platform', 'web', 'manual')),
  -- La clave ajena a `reservation_platform_connections` se añade en la migración 167.
  platform_connection_id uuid,
  external_id text,
  platform_name text,
  is_new boolean not null default false,
  duplicate_flag text not null default 'none' check (duplicate_flag in ('none', 'possible')),
  pending_reminded_at timestamptz,
  whatsapp_consent boolean not null default false,
  cancel_reason text check (cancel_reason in (
    'customer', 'error', 'other', 'rejected', 'platform', 'customer_link', 'agent'
  )),
  cancelled_at timestamptz,
  pending_platform_cancel boolean not null default false,
  created_by_staff_id uuid references public.reservation_staff (id),
  -- Puede ser alguien del equipo de Restavor en una sesión de soporte: identidad,
  -- privilegio de columna. El nombre de quien la creó se busca al enseñarla.
  created_by_user_id uuid references public.profiles (id),
  agent_external_call_id text,
  -- La clave ajena a `agent_calls` se añade en la migración 165.
  agent_call_id uuid,
  -- Enlace secreto de /c/[token]: 244 bits, solo lo lee el servidor.
  cancel_token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Al menos un contacto mientras no esté anonimizada (RN-RES-12).
  check (anonymized_at is not null or phone_e164 is not null or email is not null),
  check (cancel_reason is null or status = 'cancelled')
);

comment on table public.reservations is
  'RN-RES-12 · las reservas de un restaurante, con datos de comensales. Nunca se borra: cambia de estado, y borrar los datos personales es anonimizar con un UPDATE del sistema.';

create index reservations_date_idx on public.reservations (establishment_id, date);
create index reservations_phone_idx on public.reservations (establishment_id, phone_e164);
create index reservations_status_idx on public.reservations (establishment_id, status, date);
-- Idempotencia de las plataformas: una reserva externa entra una sola vez por conexión.
create unique index reservations_external_idx
  on public.reservations (platform_connection_id, external_id)
  where platform_connection_id is not null and external_id is not null;

-- ------------------------------------------------------------
-- 2 · Eventos (solo inserción, sin datos personales)
-- ------------------------------------------------------------
create table public.reservation_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id),
  type text not null check (type in (
    'created', 'updated', 'confirmed', 'rejected', 'cancelled', 'no_show', 'no_show_undone',
    'opened', 'duplicate_dismissed', 'notification_sent', 'notification_failed',
    'notification_skipped', 'platform_sync_failed', 'platform_cancel_failed',
    'platform_cancel_done'
  )),
  actor_type text not null check (actor_type in (
    'member', 'staff', 'agent', 'platform', 'web', 'customer', 'restavor_support', 'system'
  )),
  -- Identidad: puede ser del equipo de Restavor (soporte). Privilegio de columna.
  actor_user_id uuid references public.profiles (id),
  actor_staff_id uuid references public.reservation_staff (id),
  -- Solo etiquetas genéricas ("Agente", "Web", el nombre de la plataforma,
  -- "Restavor (soporte)", "Sistema"): el nombre de una persona se busca al enseñarlo.
  actor_label text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (actor_label is null or actor_type in ('agent', 'platform', 'web', 'customer', 'restavor_support', 'system')),
  -- RN-RES-12 · ni los eventos ni el `audit_log` guardan datos personales de
  -- comensales: solo identificadores y qué cambió ("cambió el teléfono", sin el
  -- número). Esto lo impide por clave, también dentro de objetos anidados.
  check (data::text !~* '"(customer_name|name|phone|phone_e164|email|notes|note|caller|caller_e164|recipient|summary)"[[:space:]]*:')
);

comment on table public.reservation_events is
  'RN-RES-12 · historial de cada reserva. Solo se añaden filas, y data nunca lleva nombre, teléfono, email ni notas.';

create index reservation_events_reservation_idx
  on public.reservation_events (reservation_id, created_at);

-- ------------------------------------------------------------
-- 3 · "No es duplicada"
-- ------------------------------------------------------------
create table public.reservation_duplicate_dismissals (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- Par ordenado: a < b, para que (a, b) y (b, a) sean la misma fila.
  reservation_a uuid not null references public.reservations (id),
  reservation_b uuid not null references public.reservations (id),
  dismissed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (reservation_a < reservation_b),
  unique (reservation_a, reservation_b)
);

comment on table public.reservation_duplicate_dismissals is
  'RN-RES-06 · pares de reservas que una persona ha marcado como "No es duplicada".';

-- ------------------------------------------------------------
-- RLS, privilegios y solo lectura en soporte
-- ------------------------------------------------------------
alter table public.reservations enable row level security;
alter table public.reservation_events enable row level security;
alter table public.reservation_duplicate_dismissals enable row level security;

-- Datos de comensales: NUNCA `is_space_member()` (decisión 108).
create policy reservations_select on public.reservations
  for select to authenticated
  using (public.reservations_can_read(establishment_id));
create policy reservation_events_select on public.reservation_events
  for select to authenticated
  using (public.reservations_can_read(establishment_id));
create policy reservation_duplicate_dismissals_select on public.reservation_duplicate_dismissals
  for select to authenticated
  using (public.reservations_can_read(establishment_id));

revoke all on public.reservations from anon, authenticated;
revoke all on public.reservation_events from anon, authenticated;
revoke all on public.reservation_duplicate_dismissals from anon, authenticated;

-- Sin `created_by_user_id` ni `cancel_token` (el enlace secreto lo usa el servidor),
-- y sin `actor_user_id` ni `dismissed_by` (pueden ser de soporte).
grant select (
  id, space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name,
  phone_e164, email, notes, language, status, source, platform_connection_id, external_id,
  platform_name, is_new, duplicate_flag, pending_reminded_at, whatsapp_consent, cancel_reason,
  cancelled_at, pending_platform_cancel, created_by_staff_id, agent_external_call_id,
  agent_call_id, anonymized_at, created_at, updated_at
) on public.reservations to authenticated;
grant select (
  id, space_id, establishment_id, reservation_id, type, actor_type, actor_staff_id,
  actor_label, data, created_at
) on public.reservation_events to authenticated;
grant select (id, space_id, establishment_id, reservation_a, reservation_b, created_at)
  on public.reservation_duplicate_dismissals to authenticated;

create trigger reservations_guard_support_read_only
  before insert or update or delete on public.reservations
  for each row execute function public.guard_support_read_only();
create trigger reservations_cuotly_read_only
  before insert or update or delete on public.reservations
  for each row execute function public.guard_space_read_only();
create trigger reservation_events_guard_support_read_only
  before insert or update or delete on public.reservation_events
  for each row execute function public.guard_support_read_only();
create trigger reservation_events_cuotly_read_only
  before insert or update or delete on public.reservation_events
  for each row execute function public.guard_space_read_only();
create trigger reservation_duplicate_dismissals_guard_support_read_only
  before insert or update or delete on public.reservation_duplicate_dismissals
  for each row execute function public.guard_support_read_only();
create trigger reservation_duplicate_dismissals_cuotly_read_only
  before insert or update or delete on public.reservation_duplicate_dismissals
  for each row execute function public.guard_space_read_only();
