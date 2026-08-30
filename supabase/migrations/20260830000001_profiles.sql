-- Hito 2 · Identidad, espacios y permisos.
-- Un perfil por usuario de Supabase Auth. Se crea automáticamente al
-- registrarse (RN-DAT-02: toda entidad de plataforma tiene su propio
-- registro; aquí es 1 a 1 con auth.users).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Un perfil por persona registrada en Cuotly (HU-01).';

alter table public.profiles enable row level security;
-- Sin políticas todavía: por defecto, nadie puede leer ni escribir aquí
-- salvo el rol de servicio. Las políticas llegan en
-- 20260830000008_rls_policies.sql, una vez existen todas las tablas a las
-- que hacen referencia.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
