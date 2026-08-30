-- Corrige un hallazgo bloqueante de la auditoría del Hito 2: las políticas
-- "for all" de group_memberships, establishment_memberships,
-- establishment_permissions, plans y services incluían DELETE, así que
-- cualquiera con el permiso de escritura podía borrar físicamente un
-- registro de negocio con una llamada directa a la API (DELETE
-- /rest/v1/plans?id=eq...) — contra el MUST NOT de CLAUDE.md ("no se borra
-- físicamente un registro de negocio, se archiva o se marca"). Ninguna
-- pantalla del Hito 2 ejecuta ese borrado, pero la regla es sobre lo que
-- la API permite, no sobre lo que ofrece la pantalla.
--
-- Se sustituyen por políticas separadas de INSERT y UPDATE. Sin política
-- de DELETE, esa operación queda denegada por defecto — mismo patrón que
-- ya usaba audit_log_select/audit_log_insert (CA-16).

drop policy group_memberships_write on public.group_memberships;

create policy group_memberships_insert on public.group_memberships
for insert
with check (public.has_capability((select g.space_id from public.groups g where g.id = group_id), 'manage_clients'));

create policy group_memberships_update on public.group_memberships
for update
using (public.has_capability((select g.space_id from public.groups g where g.id = group_id), 'manage_clients'))
with check (public.has_capability((select g.space_id from public.groups g where g.id = group_id), 'manage_clients'));

drop policy establishment_memberships_write on public.establishment_memberships;

create policy establishment_memberships_insert on public.establishment_memberships
for insert
with check (public.has_capability((select e.space_id from public.establishments e where e.id = establishment_id), 'manage_clients'));

create policy establishment_memberships_update on public.establishment_memberships
for update
using (public.has_capability((select e.space_id from public.establishments e where e.id = establishment_id), 'manage_clients'))
with check (public.has_capability((select e.space_id from public.establishments e where e.id = establishment_id), 'manage_clients'));

drop policy establishment_permissions_write on public.establishment_permissions;

create policy establishment_permissions_insert on public.establishment_permissions
for insert
with check (
  exists (
    select 1 from public.establishment_memberships em
    join public.establishments e on e.id = em.establishment_id
    where em.id = establishment_membership_id
      and public.has_capability(e.space_id, 'manage_clients')
  )
);

create policy establishment_permissions_update on public.establishment_permissions
for update
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

drop policy plans_write on public.plans;

create policy plans_insert on public.plans
for insert
with check (public.has_capability(space_id, 'manage_space'));

create policy plans_update on public.plans
for update
using (public.has_capability(space_id, 'manage_space'))
with check (public.has_capability(space_id, 'manage_space'));

drop policy services_write on public.services;

create policy services_insert on public.services
for insert
with check (public.has_capability(space_id, 'manage_space'));

create policy services_update on public.services
for update
using (public.has_capability(space_id, 'manage_space'))
with check (public.has_capability(space_id, 'manage_space'));
