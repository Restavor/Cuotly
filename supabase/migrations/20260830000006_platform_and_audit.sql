-- Rol de plataforma y auditoría (PRD §4.1, §21.2).

create table public.platform_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role = 'cuotly_admin'),
  created_at timestamptz not null default now()
);

comment on table public.platform_roles is
  'Administrador de Cuotly futuro (§4.1). En la Fase 1 solo existe en el
   modelo de datos, sin interfaz — se puede dejar vacía indefinidamente.';

alter table public.platform_roles enable row level security;

-- El Propietario de Cuotly (Bosco) se identifica por correo, igual que en
-- la app (CUOTLY_OWNER_EMAIL). Si ese correo cambia alguna vez, se
-- sustituye con una migración nueva que reemplace esta función — nunca se
-- edita este archivo ya aplicado.
create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(p.email) = lower('info@restavor.com')
  );
$$;

comment on function public.is_platform_owner() is
  'Compara el correo del usuario autenticado con CUOTLY_OWNER_EMAIL. Único
   punto de verdad para "¿es Bosco?" en el servidor — nunca se decide en
   el cliente (MUST de CLAUDE.md).';

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces (id),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Libro de auditoría (§21.2). No se define ninguna política de UPDATE ni
   DELETE a propósito: eso es lo que hace que CA-16 se cumpla — ninguna
   operación de la aplicación puede editar o borrar una fila, ni siquiera
   el propietario de la plataforma.';

alter table public.audit_log enable row level security;

create index audit_log_space_id_idx on public.audit_log (space_id);
