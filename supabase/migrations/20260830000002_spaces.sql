-- Espacios de mantenimiento y sus membresías (PRD §4.2, §7).

create type public.space_role as enum ('owner', 'admin', 'worker');
create type public.member_status as enum (
  'invited',
  'active',
  'temporarily_absent',
  'inactive',
  'access_revoked'
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Europe/Madrid',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.spaces is 'Un espacio de mantenimiento (proveedor). Restavor es el primero.';

alter table public.spaces enable row level security;

create table public.space_memberships (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.space_role not null,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);

comment on table public.space_memberships is
  'Pertenencia de una persona a un espacio, con su rol (RN-SUP, §4.2).';

alter table public.space_memberships enable row level security;

create index space_memberships_user_id_idx on public.space_memberships (user_id);
