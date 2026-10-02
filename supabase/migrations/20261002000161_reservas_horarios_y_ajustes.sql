-- Fase B de Restavor agents (AGT-01) · primera de siete migraciones.
--
-- Lo que se configura de Reservas en un restaurante (PRD de agents §8.2):
--
--   1 · `reservation_settings` pasa de "solo el ciclo de vida" a llevar toda su
--       configuración: dirección pública, zona horaria, huecos, grupos grandes,
--       antelaciones, teléfonos, avisos, color y logo, saldo bajo.
--   2 · `reservation_shifts`: los turnos (comida, cena, tandas).
--   3 · `reservation_closed_dates`: los días cerrados.
--
-- Cada tabla nueva sigue el patrón de la migración 158: `space_id` y
-- `establishment_id` NOT NULL, RLS con política explícita, ninguna política de
-- escritura (escriben las RPC de las fases siguientes), privilegios de columna y
-- los dos disparadores de solo lectura (Modo soporte y espacio archivado).
--
-- Se comprueba con `supabase/tests/reservas_cimientos.sql`.

-- ------------------------------------------------------------
-- 1 · La configuración de `reservation_settings`
-- ------------------------------------------------------------
-- Hasta ahora esta tabla tenía un `grant select` de TABLA ENTERA: cualquier
-- columna que se añadiera quedaba abierta al restaurante sin que nadie lo
-- decidiera. Se cambia a una lista de columnas antes de añadir ninguna.
revoke select on public.reservation_settings from authenticated;

alter table public.reservation_settings
  add column public_slug text,
  add column timezone text not null default 'Europe/Madrid',
  add column slot_interval_minutes smallint not null default 30,
  add column large_group_threshold smallint not null default 9,
  add column min_notice_minutes integer not null default 120,
  add column max_advance_days integer not null default 60,
  add column customer_cancel_limit_minutes integer not null default 120,
  add column local_phone_e164 text,
  add column transfer_phone_e164 text,
  add column forwarding_note text,
  add column messaging_enabled boolean not null default true,
  add column brand_color text,
  add column logo_file_id uuid references public.files (id),
  add column low_balance_threshold_cents integer not null default 500,
  add column low_balance_notified_at timestamptz;

alter table public.reservation_settings
  add constraint reservation_settings_public_slug_format
    check (public_slug is null or (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(public_slug) <= 60)),
  add constraint reservation_settings_slot_interval_check
    check (slot_interval_minutes in (15, 30)),
  add constraint reservation_settings_large_group_check
    check (large_group_threshold >= 2),
  add constraint reservation_settings_min_notice_check
    check (min_notice_minutes >= 0),
  add constraint reservation_settings_max_advance_check
    check (max_advance_days >= 1),
  add constraint reservation_settings_cancel_limit_check
    check (customer_cancel_limit_minutes >= 0),
  add constraint reservation_settings_local_phone_format
    check (local_phone_e164 is null or local_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  add constraint reservation_settings_transfer_phone_format
    check (transfer_phone_e164 is null or transfer_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  -- RN-LLA-06 · si el agente pasara la llamada al mismo número que se le desvía,
  -- la llamada daría vueltas.
  add constraint reservation_settings_phones_differ
    check (local_phone_e164 is null or transfer_phone_e164 is null or local_phone_e164 <> transfer_phone_e164),
  add constraint reservation_settings_forwarding_note_len
    check (forwarding_note is null or char_length(forwarding_note) <= 500),
  add constraint reservation_settings_brand_color_format
    check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint reservation_settings_low_balance_check
    check (low_balance_threshold_cents >= 0);

create unique index reservation_settings_public_slug_idx
  on public.reservation_settings (public_slug) where public_slug is not null;

comment on column public.reservation_settings.public_slug is
  'PRD de agents §8.2 · la dirección pública de /r/[slug] y del formulario; la pone Restavor.';
comment on column public.reservation_settings.transfer_phone_e164 is
  'RN-LLA-06 · a dónde pasa el agente la llamada. Distinto del teléfono del local que se le desvía.';

-- Las columnas que ve el restaurante (y el equipo del espacio). Ninguna lleva
-- identidad de nadie; si alguna la lleva, se deja fuera de esta lista.
grant select (
  id, space_id, establishment_id, subscription_id, service_status, grace_days,
  onboarding_completed_at, activated_at, ending_at, closed_at, data_purged_at,
  created_at, updated_at,
  public_slug, timezone, slot_interval_minutes, large_group_threshold,
  min_notice_minutes, max_advance_days, customer_cancel_limit_minutes,
  local_phone_e164, transfer_phone_e164, forwarding_note, messaging_enabled,
  brand_color, logo_file_id, low_balance_threshold_cents, low_balance_notified_at
) on public.reservation_settings to authenticated;

-- ------------------------------------------------------------
-- 2 · Turnos
-- ------------------------------------------------------------
create table public.reservation_shifts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 60),
  -- 1 = lunes … 7 = domingo.
  weekdays smallint[] not null check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  start_time time not null,
  end_time time not null,
  last_booking_time time not null,
  capacity integer not null check (capacity > 0),
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- RN-RES-01 · apertura < última hora de reserva <= cierre, sin cruzar la medianoche.
  check (start_time < last_booking_time and last_booking_time <= end_time)
);

comment on table public.reservation_shifts is
  'RN-RES-01 · los turnos de un restaurante (comida, cena, tandas). Que dos turnos del mismo día no se solapen lo valida la RPC que los guarda (Fase C) y el dominio de src/core/reservations.';

create index reservation_shifts_establishment_idx
  on public.reservation_shifts (establishment_id, sort_order);

-- ------------------------------------------------------------
-- 3 · Días cerrados
-- ------------------------------------------------------------
create table public.reservation_closed_dates (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  date date not null,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  unique (establishment_id, date)
);

comment on table public.reservation_closed_dates is
  'RN-RES-01 · un día concreto en el que el restaurante cierra aunque sus turnos abran ese día de la semana.';

-- ------------------------------------------------------------
-- RLS, privilegios y solo lectura en soporte
-- ------------------------------------------------------------
alter table public.reservation_shifts enable row level security;
alter table public.reservation_closed_dates enable row level security;

-- La configuración la ve el equipo del espacio (PRD §8.8) y el restaurante
-- (Propietario y Encargado). No es un dato de comensales.
create policy reservation_shifts_select on public.reservation_shifts
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

create policy reservation_closed_dates_select on public.reservation_closed_dates
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

revoke all on public.reservation_shifts from anon, authenticated;
revoke all on public.reservation_closed_dates from anon, authenticated;
grant select on public.reservation_shifts to authenticated;
grant select on public.reservation_closed_dates to authenticated;

create trigger reservation_shifts_guard_support_read_only
  before insert or update or delete on public.reservation_shifts
  for each row execute function public.guard_support_read_only();
create trigger reservation_shifts_cuotly_read_only
  before insert or update or delete on public.reservation_shifts
  for each row execute function public.guard_space_read_only();
create trigger reservation_closed_dates_guard_support_read_only
  before insert or update or delete on public.reservation_closed_dates
  for each row execute function public.guard_support_read_only();
create trigger reservation_closed_dates_cuotly_read_only
  before insert or update or delete on public.reservation_closed_dates
  for each row execute function public.guard_space_read_only();
