-- Políticas RLS de todas las tablas del Hito 2. Ninguna tabla queda sin
-- política de SELECT: sin política, RLS deniega por defecto (CA-02).

-- profiles ------------------------------------------------------------
create policy profiles_select on public.profiles
for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.space_memberships mine
    join public.space_memberships theirs on theirs.space_id = mine.space_id
    where mine.user_id = auth.uid()
      and theirs.user_id = public.profiles.id
  )
);

create policy profiles_update_own on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

-- spaces ----------------------------------------------------------------
create policy spaces_select on public.spaces
for select
using (public.is_space_member(id));

create policy spaces_insert_platform_owner on public.spaces
for insert
with check (public.is_platform_owner());

create policy spaces_update_owner on public.spaces
for update
using (public.has_capability(id, 'manage_space'))
with check (public.has_capability(id, 'manage_space'));

-- space_memberships -------------------------------------------------------
create policy space_memberships_select on public.space_memberships
for select
using (public.is_space_member(space_id));

create policy space_memberships_insert_owner on public.space_memberships
for insert
with check (public.has_capability(space_id, 'invite_member'));

create policy space_memberships_update_owner on public.space_memberships
for update
using (public.has_capability(space_id, 'invite_member'))
with check (public.has_capability(space_id, 'invite_member'));

-- space_invitations -----------------------------------------------------
create policy space_invitations_select on public.space_invitations
for select
using (public.has_capability(space_id, 'invite_member'));

create policy space_invitations_insert on public.space_invitations
for insert
with check (public.has_capability(space_id, 'invite_member') and invited_by = auth.uid());

create policy space_invitations_update on public.space_invitations
for update
using (public.has_capability(space_id, 'invite_member'))
with check (public.has_capability(space_id, 'invite_member'));

-- groups ------------------------------------------------------------------
create policy groups_select on public.groups
for select
using (public.is_space_member(space_id));

create policy groups_insert on public.groups
for insert
with check (public.has_capability(space_id, 'create_establishment'));

create policy groups_update on public.groups
for update
using (public.has_capability(space_id, 'create_establishment'))
with check (public.has_capability(space_id, 'create_establishment'));

-- establishments ------------------------------------------------------
create policy establishments_select on public.establishments
for select
using (public.is_space_member(space_id));

create policy establishments_insert on public.establishments
for insert
with check (public.has_capability(space_id, 'create_establishment'));

create policy establishments_update on public.establishments
for update
using (public.has_capability(space_id, 'create_establishment'))
with check (public.has_capability(space_id, 'create_establishment'));

-- group_memberships / establishment_memberships / establishment_permissions
-- (lado cliente; sin pantalla propia todavía, pero con RLS real desde ya).
create policy group_memberships_select on public.group_memberships
for select
using (
  user_id = auth.uid()
  or public.is_space_member((select g.space_id from public.groups g where g.id = group_id))
);

create policy group_memberships_write on public.group_memberships
for all
using (public.has_capability((select g.space_id from public.groups g where g.id = group_id), 'manage_clients'))
with check (public.has_capability((select g.space_id from public.groups g where g.id = group_id), 'manage_clients'));

create policy establishment_memberships_select on public.establishment_memberships
for select
using (
  user_id = auth.uid()
  or public.is_space_member((select e.space_id from public.establishments e where e.id = establishment_id))
);

create policy establishment_memberships_write on public.establishment_memberships
for all
using (public.has_capability((select e.space_id from public.establishments e where e.id = establishment_id), 'manage_clients'))
with check (public.has_capability((select e.space_id from public.establishments e where e.id = establishment_id), 'manage_clients'));

create policy establishment_permissions_select on public.establishment_permissions
for select
using (
  exists (
    select 1 from public.establishment_memberships em
    where em.id = establishment_membership_id
      and (
        em.user_id = auth.uid()
        or public.is_space_member((select e.space_id from public.establishments e where e.id = em.establishment_id))
      )
  )
);

create policy establishment_permissions_write on public.establishment_permissions
for all
using (
  exists (
    select 1 from public.establishment_memberships em
    join public.establishments e on e.id = em.establishment_id
    where em.id = establishment_membership_id
      and public.has_capability(e.space_id, 'manage_clients')
  )
)
with check (
  exists (
    select 1 from public.establishment_memberships em
    join public.establishments e on e.id = em.establishment_id
    where em.id = establishment_membership_id
      and public.has_capability(e.space_id, 'manage_clients')
  )
);

-- plans / services --------------------------------------------------------
create policy plans_select on public.plans
for select
using (public.is_space_member(space_id));

create policy plans_write on public.plans
for all
using (public.has_capability(space_id, 'manage_space'))
with check (public.has_capability(space_id, 'manage_space'));

create policy services_select on public.services
for select
using (public.is_space_member(space_id));

create policy services_write on public.services
for all
using (public.has_capability(space_id, 'manage_space'))
with check (public.has_capability(space_id, 'manage_space'));

-- platform_roles ------------------------------------------------------
create policy platform_roles_select on public.platform_roles
for select
using (user_id = auth.uid() or public.is_platform_owner());

create policy platform_roles_write on public.platform_roles
for all
using (public.is_platform_owner())
with check (public.is_platform_owner());

-- audit_log: solo INSERT y SELECT. Sin política de UPDATE ni DELETE en
-- ningún sitio → esas operaciones quedan denegadas siempre (CA-16).
create policy audit_log_select on public.audit_log
for select
using (
  (space_id is not null and public.is_space_member(space_id))
  or public.is_platform_owner()
);

create policy audit_log_insert on public.audit_log
for insert
with check (
  actor_id = auth.uid()
  and (space_id is null or public.is_space_member(space_id))
);

-- space_sequences: de uso interno exclusivo de next_space_sequence()
-- (SECURITY DEFINER). Ninguna política = nadie accede directamente desde
-- el cliente, ni siquiera para leer.
