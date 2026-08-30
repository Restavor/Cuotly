-- Invitaciones a un espacio (RN-SUP-05, PRD §4.2: solo el propietario
-- invita). Caducan en 7 días (HU-03).

create table public.space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  email text not null,
  role public.space_role not null,
  invited_by uuid not null references public.profiles (id),
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

comment on table public.space_invitations is
  'Invitación pendiente a alguien que todavía no está en el espacio (HU-03).';

alter table public.space_invitations enable row level security;

create index space_invitations_email_idx on public.space_invitations (lower(email));
