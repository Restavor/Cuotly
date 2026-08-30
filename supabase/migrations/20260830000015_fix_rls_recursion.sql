-- Corrige una recursión infinita en RLS introducida por la propia
-- migración anterior (20260830000014_client_side_read_access.sql), que
-- añadió a groups_select/establishments_select una referencia directa a
-- group_memberships/establishment_memberships. Esas tablas, a su vez,
-- referencian directamente groups/establishments en sus propias políticas
-- (para saber el space_id) — el resultado es un ciclo: evaluar la
-- política de una tabla dispara la política de la otra, que dispara la
-- primera otra vez (Postgres lo detecta y aborta con 42P17 "infinite
-- recursion detected in policy").
--
-- Descubierto al re-ejecutar supabase/tests/hito2_permisos.sql tras
-- aplicar esa migración — antes de que nada llegara a producción sin
-- probar.
--
-- Arreglo: dos funciones SECURITY DEFINER que consultan el space_id o la
-- pertenencia directamente, saltándose el RLS de la tabla consultada — el
-- mismo patrón que ya usa is_space_member() para evitar exactamente este
-- problema. Ninguna política vuelve a hacer un subselect "en crudo" contra
-- otra tabla protegida por RLS: siempre pasa por una de estas funciones.

create or replace function public.group_space_id(p_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.groups where id = p_group_id;
$$;

comment on function public.group_space_id(uuid) is
  'SECURITY DEFINER a propósito: permite a las políticas de
   group_memberships saber el space_id de un grupo sin volver a evaluar
   RLS sobre groups (evita la recursión 42P17).';

create or replace function public.establishment_space_id(p_establishment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.establishments where id = p_establishment_id;
$$;

comment on function public.establishment_space_id(uuid) is
  'SECURITY DEFINER a propósito: mismo motivo que group_space_id(), para
   establishment_memberships frente a establishments.';

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_memberships
    where group_id = p_group_id
      and user_id = auth.uid()
  );
$$;

comment on function public.is_group_member(uuid) is
  'SECURITY DEFINER a propósito: permite a las políticas de groups (y
   establishments) comprobar si el usuario es Propietario global de un
   grupo (RN-EST-03) sin volver a evaluar RLS sobre group_memberships.';

create or replace function public.is_establishment_member(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.establishment_memberships
    where establishment_id = p_establishment_id
      and user_id = auth.uid()
  );
$$;

comment on function public.is_establishment_member(uuid) is
  'SECURITY DEFINER a propósito: mismo motivo que is_group_member(), para
   establishments frente a establishment_memberships (RN-EST-03).';

-- groups / establishments: usar las funciones en vez del exists() en crudo.
drop policy groups_select on public.groups;

create policy groups_select on public.groups
for select
using (
  public.is_space_member(space_id)
  or public.is_group_member(id)
);

drop policy establishments_select on public.establishments;

create policy establishments_select on public.establishments
for select
using (
  public.is_space_member(space_id)
  or public.is_group_member(group_id)
  or public.is_establishment_member(id)
);

-- group_memberships: usar group_space_id() en vez del subselect en crudo
-- contra groups (que ahora, con la política de arriba, referencia de
-- vuelta a group_memberships).
drop policy group_memberships_select on public.group_memberships;

create policy group_memberships_select on public.group_memberships
for select
using (
  user_id = auth.uid()
  or public.is_space_member(public.group_space_id(group_id))
);

drop policy group_memberships_insert on public.group_memberships;

create policy group_memberships_insert on public.group_memberships
for insert
with check (public.has_capability(public.group_space_id(group_id), 'manage_clients'));

drop policy group_memberships_update on public.group_memberships;

create policy group_memberships_update on public.group_memberships
for update
using (public.has_capability(public.group_space_id(group_id), 'manage_clients'))
with check (public.has_capability(public.group_space_id(group_id), 'manage_clients'));

-- establishment_memberships: mismo motivo, con establishment_space_id().
drop policy establishment_memberships_select on public.establishment_memberships;

create policy establishment_memberships_select on public.establishment_memberships
for select
using (
  user_id = auth.uid()
  or public.is_space_member(public.establishment_space_id(establishment_id))
);

drop policy establishment_memberships_insert on public.establishment_memberships;

create policy establishment_memberships_insert on public.establishment_memberships
for insert
with check (public.has_capability(public.establishment_space_id(establishment_id), 'manage_clients'));

drop policy establishment_memberships_update on public.establishment_memberships;

create policy establishment_memberships_update on public.establishment_memberships
for update
using (public.has_capability(public.establishment_space_id(establishment_id), 'manage_clients'))
with check (public.has_capability(public.establishment_space_id(establishment_id), 'manage_clients'));
