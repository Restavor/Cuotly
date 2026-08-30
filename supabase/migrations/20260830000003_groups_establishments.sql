-- Grupos y establecimientos (PRD §15) + generador de códigos correlativos
-- por espacio (RN-DAT-01: "EST-0048", correlativo por espacio, no global).

create table public.space_sequences (
  space_id uuid not null references public.spaces (id) on delete cascade,
  sequence_name text not null,
  next_value bigint not null default 1,
  primary key (space_id, sequence_name)
);

comment on table public.space_sequences is
  'Contador atómico por espacio y tipo de código (RN-DAT-01). Se usa desde
   next_space_sequence(), nunca se lee ni se escribe directamente.';

alter table public.space_sequences enable row level security;

create or replace function public.next_space_sequence(p_space_id uuid, p_sequence_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value bigint;
begin
  insert into public.space_sequences (space_id, sequence_name, next_value)
  values (p_space_id, p_sequence_name, 2)
  on conflict (space_id, sequence_name)
  do update set next_value = public.space_sequences.next_value + 1
  returning next_value - 1 into v_value;
  return v_value;
end;
$$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.groups is 'Empresa o grupo cliente (RN-EST-01). Contiene establecimientos.';

alter table public.groups enable row level security;

create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'configuring'
    check (status in ('configuring', 'active', 'paused', 'ending', 'read_only', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  unique (space_id, code)
);

comment on table public.establishments is 'Un restaurante concreto (RN-EST-06, §15.1).';

alter table public.establishments enable row level security;

create or replace function public.set_establishment_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    new.code := 'EST-' || lpad(public.next_space_sequence(new.space_id, 'establishment')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger establishments_set_code
  before insert on public.establishments
  for each row execute function public.set_establishment_code();

-- Membresías del lado cliente (RN-EST-01, §14 del PRD).

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'global_owner' check (role = 'global_owner'),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

comment on table public.group_memberships is 'Propietario global de un grupo (§14.1).';

alter table public.group_memberships enable row level security;

create table public.establishment_memberships (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('local_owner', 'editor', 'consulta')),
  created_at timestamptz not null default now(),
  unique (establishment_id, user_id)
);

comment on table public.establishment_memberships is
  'Propietario local, Editor o Consulta de un establecimiento (§14.2-14.4).';

alter table public.establishment_memberships enable row level security;

create table public.establishment_permissions (
  establishment_membership_id uuid primary key
    references public.establishment_memberships (id) on delete cascade,
  edit_establishment_data boolean not null default false,
  view_billing boolean not null default false
);

comment on table public.establishment_permissions is
  'Permisos finos de un Editor (RN-EST-11, RN-FIN-07).';

alter table public.establishment_permissions enable row level security;
