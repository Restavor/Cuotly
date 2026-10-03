-- ============================================================
-- Migración 171 · El Propietario añade y quita Propietarios y Encargados
--                (decisión 131, Bosco 03/10/2026; RN-EST-17 ampliada)
-- ============================================================
--
-- El PRD de agents §3.2 dice que el Propietario «añade y quita Propietarios y Encargados» y que el
-- Encargado no. RN-EST-17 (migración 107) decía que a un Propietario solo lo toca el equipo de
-- mantenimiento, ni siquiera otro Propietario. Bosco resolvió la contradicción (decisión 126 → 131):
-- **el Propietario del restaurante es quien añade y quita Propietarios y Encargados** (el Encargado no, ni
-- un Editor con «Usuarios y accesos»); el equipo del espacio sigue pudiendo, porque es quien crea el panel.
--
-- Qué cambia:
--   1 · `assert_can_manage_access()`: tocar a un Propietario lo puede el equipo y un Propietario de ESTE
--       restaurante. Un Editor, con o sin «Usuarios y accesos», sigue sin poder. Es la puerta de
--       `grant_establishment_access()`, `revoke_establishment_access()` e `invite_to_establishment_panel()`.
--   2 · `revoke_establishment_access()`: un Propietario que NO es del equipo no puede dejar al restaurante
--       sin Propietario (ni quitándose a sí mismo). El equipo sí: es quien lo arregla.
--   3 · `reservation_removable_owners()`: quién de los Propietarios de la lista de Reservas lo es del restaurante
--       (y se puede quitar desde aquí) y quién del grupo (se gestiona desde Restavor web).
--
-- Los Encargados ya eran de «solo el Propietario o el equipo» desde la 163 (decisión 110): no cambian.

create or replace function public.assert_can_manage_access(
  p_establishment_id uuid,
  p_target_role text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
begin
  if public.has_capability(v_space_id, 'manage_clients') then
    return;
  end if;

  if not public.client_permission(p_establishment_id, 'manage_users') then
    raise exception 'No tienes permiso para gestionar los accesos de este restaurante';
  end if;

  -- Al Propietario lo toca el equipo y un Propietario de este restaurante (decisión 131). Un Editor no, aunque
  -- tenga «Usuarios y accesos»: si pudiera, el permiso sería una manera de quedarse con el restaurante.
  if p_target_role = 'local_owner'
     and not coalesce(public.reservations_my_role(p_establishment_id) = 'owner', false) then
    raise exception 'El propietario del restaurante solo lo cambia un propietario del restaurante o el equipo de mantenimiento';
  end if;
end;
$$;

comment on function public.assert_can_manage_access(uuid, text) is
  'RN-EST-17 (decisión 131) · quién toca los accesos de un restaurante: el equipo y quien tenga «Usuarios y accesos». Al Propietario, solo el equipo y un Propietario de ese restaurante.';

revoke all on function public.assert_can_manage_access(uuid, text) from public, anon;
grant execute on function public.assert_can_manage_access(uuid, text) to authenticated;

-- revoke_establishment_access(): la de la 107 con la guarda del último Propietario.
create or replace function public.revoke_establishment_access(
  p_establishment_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_membership_id uuid;
  v_role text;
begin
  v_space_id := public.establishment_space_id(p_establishment_id);

  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  select id, role into v_membership_id, v_role
  from public.establishment_memberships
  where establishment_id = p_establishment_id and user_id = p_user_id and revoked_at is null
  for update;

  if v_membership_id is null then
    return false; -- CA-17: idempotente. Ya estaba retirado o nunca existió.
  end if;

  -- RN-EST-17 · va aquí y no antes a propósito: depende del rol de QUIEN
  -- se toca, y para saberlo hay que haberlo leído. Una llamada sobre
  -- alguien que ya no tiene acceso sigue siendo idempotente y no dice si
  -- existió: no se filtra por esta vía.
  perform public.assert_can_manage_access(p_establishment_id, v_role);

  -- Decisión 131 · quien no es del equipo no deja al restaurante sin Propietario. Se bloquean las filas de los
  -- Propietarios vivos para que dos quitando a la vez no dejen cero.
  if v_role = 'local_owner' and not public.has_capability(v_space_id, 'manage_clients') then
    perform 1 from public.establishment_memberships em
    where em.establishment_id = p_establishment_id and em.role = 'local_owner' and em.revoked_at is null
    for update;
    if not exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id and em.role = 'local_owner' and em.revoked_at is null
        and em.user_id <> p_user_id
    ) then
      raise exception 'Tiene que quedar al menos un propietario del restaurante';
    end if;
  end if;

  update public.establishment_memberships
  set revoked_at = now(), revoked_by = auth.uid()
  where id = v_membership_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (
    v_space_id, auth.uid(), 'establishment_access.revoked', 'establishment', p_establishment_id,
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'revoked', false),
    jsonb_build_object('user_id', p_user_id, 'role', v_role, 'revoked', true),
    p_reason
  );

  return true;
end;
$$;

revoke all on function public.revoke_establishment_access(uuid, uuid, text) from public, anon;
grant execute on function public.revoke_establishment_access(uuid, uuid, text) to authenticated;

-- Los Propietarios de este restaurante (no los del grupo) a los que se puede dejar sin acceso desde Reservas.
-- Lo lee quien gestiona el Equipo; solo devuelve identificadores que `reservation_people()` ya le enseña.
create or replace function public.reservation_removable_owners(p_establishment_id uuid)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.reservations_manage_actor(p_establishment_id);
  return query
    select em.user_id
    from public.establishment_memberships em
    where em.establishment_id = p_establishment_id and em.role = 'local_owner' and em.revoked_at is null;
end;
$$;

revoke all on function public.reservation_removable_owners(uuid) from public, anon;
grant execute on function public.reservation_removable_owners(uuid) to authenticated;
