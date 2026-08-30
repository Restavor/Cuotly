-- Corrige un hallazgo de la auditoría del Hito 2: RN-EST-03 dice que el
-- Propietario global de un grupo (group_memberships) y quien tiene una
-- membresía directa en un establecimiento (establishment_memberships) —
-- el "lado cliente" — deben poder leer esos datos aunque no pertenezcan al
-- espacio de mantenimiento. Las políticas de select de groups y
-- establishments solo comprobaban is_space_member(), así que ese acceso
-- (aunque sin pantalla propia todavía en este hito) no tenía soporte real
-- en la base de datos: la regla estaba documentada pero no aplicada.

drop policy groups_select on public.groups;

create policy groups_select on public.groups
for select
using (
  public.is_space_member(space_id)
  or exists (
    select 1 from public.group_memberships gm
    where gm.group_id = public.groups.id
      and gm.user_id = auth.uid()
  )
);

drop policy establishments_select on public.establishments;

create policy establishments_select on public.establishments
for select
using (
  public.is_space_member(space_id)
  or exists (
    select 1 from public.group_memberships gm
    where gm.group_id = public.establishments.group_id
      and gm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.establishment_memberships em
    where em.establishment_id = public.establishments.id
      and em.user_id = auth.uid()
  )
);
