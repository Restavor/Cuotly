-- Planes de mantenimiento y servicios (PRD §6). Versión mínima: lo
-- necesario para poder registrar los tres planes y Menú Diario de
-- Restavor al crear el espacio (semilla del Hito 2). El versionado de
-- planes (RN-DAT-07) y las suscripciones/ciclos de consumo llegan en un
-- hito posterior — no se adelanta esa parte.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  included_small integer not null default 0 check (included_small >= 0),
  included_photo integer not null default 0 check (included_photo >= 0),
  included_medium integer not null default 0 check (included_medium >= 0),
  included_large integer not null default 0 check (included_large >= 0),
  start_sla_hours integer not null check (start_sla_hours > 0),
  created_at timestamptz not null default now()
);

comment on table public.plans is
  'Plan de mantenimiento que un espacio vende a sus establecimientos (RN-COM-01 a 03).';

alter table public.plans enable row level security;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  price_premium_cents integer check (price_premium_cents >= 0),
  created_at timestamptz not null default now()
);

comment on table public.services is
  'Servicio adicional con precio propio, como Menú Diario (RN-COM-08 a 10).';

alter table public.services enable row level security;
