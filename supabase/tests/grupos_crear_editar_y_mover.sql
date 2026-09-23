-- ============================================================
-- Suite 75 · Grupos: crear, renombrar y mover un restaurante de grupo
--            (M82; PRD RN-EST-20, decisión 74, migración 135)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · **Quién**: crear y editar un grupo, el equipo con `manage_clients`.
--     Mover un restaurante, el equipo a cualquier grupo del espacio o su
--     propietario solo a un grupo del que también sea propietario global.
--     Un trabajador, un Editor o un propietario sin grupo de destino
--     reciben un "no" del SERVIDOR aunque llamen por RPC.
--   · **Idempotencia**: la misma clave crea un grupo; mover adonde ya está
--     no hace nada y no deja un segundo apunte; guardar sin cambios, igual.
--   · **Los accesos al mover**: el grupo de destino entra en el acto; quien
--     entraba por el de origen se queda como Editor (con los operativos y
--     sin los de propietario) o pierde el acceso; los accesos del propio
--     restaurante no cambian; los demás restaurantes del grupo de origen
--     siguen igual.
--   · **Lo que viaja**: `files.group_id` y los informes individuales.
--   · **Auditoría** con actor, valor anterior y nuevo.
--   · **Privilegios**: nada abierto a `anon`, y la interna cerrada.
--
-- Prefijo de esta suite: d7500000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('d7500000-0000-0000-0000-000000000001', 'duena@suite75.test', 'authenticated', 'authenticated'),
  ('d7500000-0000-0000-0000-000000000002', 'admin@suite75.test', 'authenticated', 'authenticated'),
  ('d7500000-0000-0000-0000-000000000003', 'trabajador@suite75.test', 'authenticated', 'authenticated'),
  ('d7500000-0000-0000-0000-000000000004', 'global-a@suite75.test', 'authenticated', 'authenticated'),
  ('d7500000-0000-0000-0000-000000000005', 'global-b@suite75.test', 'authenticated', 'authenticated'),
  ('d7500000-0000-0000-0000-000000000006', 'editor-grupo-a@suite75.test', 'authenticated', 'authenticated'),
  ('d7500000-0000-0000-0000-000000000007', 'local@suite75.test', 'authenticated', 'authenticated'),
  ('d7500000-0000-0000-0000-000000000008', 'global-a-y-c@suite75.test', 'authenticated', 'authenticated'),
  ('d7500000-0000-0000-0000-000000000009', 'editor-r1@suite75.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d7500000-0000-0000-0000-000000000001', 'duena@suite75.test', 'Dueña 75'),
  ('d7500000-0000-0000-0000-000000000002', 'admin@suite75.test', 'Admin 75'),
  ('d7500000-0000-0000-0000-000000000003', 'trabajador@suite75.test', 'Trabajador 75'),
  ('d7500000-0000-0000-0000-000000000004', 'global-a@suite75.test', 'Global A'),
  ('d7500000-0000-0000-0000-000000000005', 'global-b@suite75.test', 'Global B'),
  ('d7500000-0000-0000-0000-000000000006', 'editor-grupo-a@suite75.test', 'Editor de grupo A'),
  ('d7500000-0000-0000-0000-000000000007', 'local@suite75.test', 'Local R1'),
  ('d7500000-0000-0000-0000-000000000008', 'global-a-y-c@suite75.test', 'Global A y C'),
  ('d7500000-0000-0000-0000-000000000009', 'editor-r1@suite75.test', 'Editor R1')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('d7500000-0000-0000-0000-000000000010', 'Espacio 75', 'espacio-75', 'Europe/Madrid',
   'd7500000-0000-0000-0000-000000000001'),
  ('d7500000-0000-0000-0000-000000000011', 'Otro espacio 75', 'otro-espacio-75', 'Europe/Madrid',
   'd7500000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d7500000-0000-0000-0000-000000000010', 'd7500000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d7500000-0000-0000-0000-000000000010', 'd7500000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('d7500000-0000-0000-0000-000000000010', 'd7500000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('d7500000-0000-0000-0000-000000000011', 'd7500000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('d7500000-0000-0000-0000-00000000000a', 'd7500000-0000-0000-0000-000000000010', 'Grupo A'),
  ('d7500000-0000-0000-0000-00000000000b', 'd7500000-0000-0000-0000-000000000010', 'Grupo B'),
  ('d7500000-0000-0000-0000-00000000000c', 'd7500000-0000-0000-0000-000000000010', 'Grupo C'),
  ('d7500000-0000-0000-0000-00000000000d', 'd7500000-0000-0000-0000-000000000011', 'Grupo de otro espacio');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d7500000-0000-0000-0000-000000000020', 'd7500000-0000-0000-0000-000000000010',
   'd7500000-0000-0000-0000-00000000000a', 'R75A', 'Restaurante uno', 'active'),
  ('d7500000-0000-0000-0000-000000000021', 'd7500000-0000-0000-0000-000000000010',
   'd7500000-0000-0000-0000-00000000000a', 'R75B', 'Restaurante dos', 'active');

insert into public.group_memberships (group_id, user_id, role) values
  ('d7500000-0000-0000-0000-00000000000a', 'd7500000-0000-0000-0000-000000000004', 'global_owner'),
  ('d7500000-0000-0000-0000-00000000000a', 'd7500000-0000-0000-0000-000000000006', 'editor'),
  ('d7500000-0000-0000-0000-00000000000a', 'd7500000-0000-0000-0000-000000000008', 'global_owner'),
  ('d7500000-0000-0000-0000-00000000000b', 'd7500000-0000-0000-0000-000000000005', 'global_owner'),
  ('d7500000-0000-0000-0000-00000000000c', 'd7500000-0000-0000-0000-000000000008', 'global_owner');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d7500000-0000-0000-0000-000000000020', 'd7500000-0000-0000-0000-000000000007', 'local_owner'),
  ('d7500000-0000-0000-0000-000000000020', 'd7500000-0000-0000-0000-000000000009', 'editor');

insert into public.files (id, space_id, group_id, establishment_id, category, visibility, name, created_by) values
  ('d7500000-0000-0000-0000-000000000030', 'd7500000-0000-0000-0000-000000000010',
   'd7500000-0000-0000-0000-00000000000a', 'd7500000-0000-0000-0000-000000000020',
   'photos', 'shared_with_client', 'terraza.jpg', 'd7500000-0000-0000-0000-000000000001');

insert into public.reports (id, space_id, establishment_id, group_id, category, name, period_start, period_end) values
  ('d7500000-0000-0000-0000-000000000040', 'd7500000-0000-0000-0000-000000000010',
   'd7500000-0000-0000-0000-000000000020', 'd7500000-0000-0000-0000-00000000000a',
   'operation', 'Informe de agosto', '2026-08-01', '2026-08-31');

-- ------------------------------------------------------------
-- 1 · Crear un grupo
-- ------------------------------------------------------------
do $$
declare
  v_group uuid;
  v_again uuid;
begin
  -- Un trabajador no, aunque llame por RPC.
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000003';
  begin
    perform public.create_group('d7500000-0000-0000-0000-000000000010', 'Grupo del trabajador');
    raise exception 'RN-EST-20 FALLA: un trabajador creó un grupo';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  -- Un cliente, tampoco.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000004';
  begin
    perform public.create_group('d7500000-0000-0000-0000-000000000010', 'Grupo del cliente');
    raise exception 'RN-EST-20 FALLA: un cliente creó un grupo';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  -- El administrador crea uno VACÍO, con descripción.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000002';
  v_group := public.create_group('d7500000-0000-0000-0000-000000000010', '  Grupo Norte  ',
                                 'Los tres locales del norte', 'suite75-clave-1');

  -- La misma clave, el mismo grupo (CLAUDE.md: dos pulsaciones, un efecto).
  v_again := public.create_group('d7500000-0000-0000-0000-000000000010', 'Grupo Norte',
                                 'Los tres locales del norte', 'suite75-clave-1');
  if v_again <> v_group then
    raise exception 'RN-EST-20 FALLA: la misma clave creó dos grupos';
  end if;

  -- Un nombre repetido, con otra clave, no.
  begin
    perform public.create_group('d7500000-0000-0000-0000-000000000010', 'grupo norte', null, 'suite75-clave-2');
    raise exception 'RN-EST-20 FALLA: se creó un segundo grupo con el mismo nombre';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  -- Sin nombre, tampoco.
  begin
    perform public.create_group('d7500000-0000-0000-0000-000000000010', '   ');
    raise exception 'RN-EST-20 FALLA: se creó un grupo sin nombre';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  set local role postgres;

  if (select name from public.groups where id = v_group) <> 'Grupo Norte'
     or (select description from public.groups where id = v_group) <> 'Los tres locales del norte' then
    raise exception 'RN-EST-20 FALLA: el grupo no guardó su nombre limpio y su descripción';
  end if;
  if exists (select 1 from public.establishments where group_id = v_group) then
    raise exception 'RN-EST-20 FALLA: el grupo vacío nació con restaurantes';
  end if;
  if (select count(*) from public.audit_log
      where entity_id = v_group and action = 'group.created'
        and actor_id = 'd7500000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'RN-EST-20 FALLA: crear el grupo no dejó exactamente un apunte';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2 · Renombrar y describir
-- ------------------------------------------------------------
do $$
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000003';
  begin
    perform public.update_group('d7500000-0000-0000-0000-00000000000b', 'Grupo B renombrado');
    raise exception 'RN-EST-20 FALLA: un trabajador renombró un grupo';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000001';
  perform public.update_group('d7500000-0000-0000-0000-00000000000b', 'Grupo Costa', 'Los del litoral');
  -- Guardar otra vez lo mismo no escribe.
  perform public.update_group('d7500000-0000-0000-0000-00000000000b', 'Grupo Costa', 'Los del litoral');

  -- Chocar con el nombre de otro grupo, no.
  begin
    perform public.update_group('d7500000-0000-0000-0000-00000000000b', 'grupo a');
    raise exception 'RN-EST-20 FALLA: dos grupos del espacio acabaron con el mismo nombre';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  set local role postgres;
  if (select name from public.groups where id = 'd7500000-0000-0000-0000-00000000000b') <> 'Grupo Costa' then
    raise exception 'RN-EST-20 FALLA: el grupo no se renombró';
  end if;
  if (select count(*) from public.audit_log
      where entity_id = 'd7500000-0000-0000-0000-00000000000b' and action = 'group.updated'
        and old_value ->> 'name' = 'Grupo B' and new_value ->> 'name' = 'Grupo Costa') <> 1 then
    raise exception 'RN-EST-20 FALLA: renombrar no dejó exactamente un apunte con antes y después';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3 · A dónde puede moverlo cada uno
-- ------------------------------------------------------------
do $$
declare
  v_ids uuid[];
  v_user uuid;
begin
  set local role authenticated;

  -- El equipo: todos los grupos del espacio menos el suyo.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000002';
  select array_agg(id order by id) into v_ids
  from public.establishment_move_targets('d7500000-0000-0000-0000-000000000020');
  if not (v_ids @> array['d7500000-0000-0000-0000-00000000000b',
                          'd7500000-0000-0000-0000-00000000000c']::uuid[])
     or 'd7500000-0000-0000-0000-00000000000a'::uuid = any(v_ids)
     or 'd7500000-0000-0000-0000-00000000000d'::uuid = any(v_ids) then
    raise exception 'RN-EST-20 FALLA: el equipo no ve los grupos del espacio que le tocan: %', v_ids;
  end if;

  -- El propietario de A y de C: solo C.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000008';
  select array_agg(id) into v_ids
  from public.establishment_move_targets('d7500000-0000-0000-0000-000000000020');
  if v_ids is distinct from array['d7500000-0000-0000-0000-00000000000c']::uuid[] then
    raise exception 'RN-EST-20 FALLA: el propietario ve grupos de los que no es propietario: %', v_ids;
  end if;

  -- Propietario solo de A, propietario local sin grupo, trabajador y
  -- Editor: ninguno.
  foreach v_user in array array[
    'd7500000-0000-0000-0000-000000000004', 'd7500000-0000-0000-0000-000000000007',
    'd7500000-0000-0000-0000-000000000003', 'd7500000-0000-0000-0000-000000000009']::uuid[]
  loop
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    if exists (select 1 from public.establishment_move_targets('d7500000-0000-0000-0000-000000000020')) then
      raise exception 'RN-EST-20 FALLA: % puede mover el restaurante y no debería', v_user;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 4 · Mover: quién no puede
-- ------------------------------------------------------------
do $$
begin
  set local role authenticated;

  -- Un trabajador.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000003';
  begin
    perform public.move_establishment_to_group('d7500000-0000-0000-0000-000000000020',
      'd7500000-0000-0000-0000-00000000000b', 'revoke');
    raise exception 'RN-EST-20 FALLA: un trabajador movió un restaurante de grupo';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  -- El propietario de A, a un grupo que no es suyo.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000004';
  begin
    perform public.move_establishment_to_group('d7500000-0000-0000-0000-000000000020',
      'd7500000-0000-0000-0000-00000000000b', 'revoke');
    raise exception 'RN-EST-20 FALLA: un propietario metió su restaurante en un grupo ajeno';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  -- Un Editor del restaurante.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000009';
  begin
    perform public.move_establishment_to_group('d7500000-0000-0000-0000-000000000020',
      'd7500000-0000-0000-0000-00000000000c', 'revoke');
    raise exception 'RN-EST-20 FALLA: un Editor movió el restaurante';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  -- El equipo, a un grupo de otro espacio.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000001';
  begin
    perform public.move_establishment_to_group('d7500000-0000-0000-0000-000000000020',
      'd7500000-0000-0000-0000-00000000000d', 'revoke');
    raise exception 'RN-EST-20 FALLA: un restaurante acabó en un grupo de otro espacio';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  -- Sin decir qué pasa con los accesos de origen.
  begin
    perform public.move_establishment_to_group('d7500000-0000-0000-0000-000000000020',
      'd7500000-0000-0000-0000-00000000000b', null);
    raise exception 'RN-EST-20 FALLA: se movió sin elegir qué pasa con los accesos de origen';
  exception when others then
    if sqlerrm like 'RN-EST-20 FALLA%' then raise; end if;
  end;

  set local role postgres;
  if (select group_id from public.establishments where id = 'd7500000-0000-0000-0000-000000000020')
     <> 'd7500000-0000-0000-0000-00000000000a' then
    raise exception 'RN-EST-20 FALLA: un intento rechazado movió el restaurante';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 5 · El equipo lo mueve y los de origen se quedan como Editor
-- ------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_perm record;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000002';
  v_result := public.move_establishment_to_group('d7500000-0000-0000-0000-000000000020',
    'd7500000-0000-0000-0000-00000000000b', 'keep_as_editor');

  -- Los tres que entraban por A (propietarios 4 y 8, editor de grupo 6).
  if (v_result ->> 'moved')::boolean is not true or (v_result ->> 'kept_as_editor')::int <> 3 then
    raise exception 'RN-EST-20 FALLA: el resultado no cuenta los tres que se quedan: %', v_result;
  end if;

  -- Mover otra vez al mismo grupo no hace nada.
  v_result := public.move_establishment_to_group('d7500000-0000-0000-0000-000000000020',
    'd7500000-0000-0000-0000-00000000000b', 'keep_as_editor');
  if (v_result ->> 'moved')::boolean then
    raise exception 'RN-EST-20 FALLA: mover adonde ya estaba volvió a mover';
  end if;

  -- El grupo de destino entra en el acto.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000005';
  if not public.can_read_establishment_as_client('d7500000-0000-0000-0000-000000000020') then
    raise exception 'RN-EST-20 FALLA: el propietario del grupo de destino no entra';
  end if;

  -- Los de origen siguen entrando, ahora como Editor.
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000004';
  if not public.can_read_establishment_as_client('d7500000-0000-0000-0000-000000000020') then
    raise exception 'RN-EST-20 FALLA: el propietario de origen se quedó fuera aunque se eligió Editor';
  end if;
  if public.client_permission('d7500000-0000-0000-0000-000000000020', 'view_billing') then
    raise exception 'RN-EST-20 FALLA: quien pasa a Editor sigue viendo la facturación';
  end if;
  if not public.client_permission('d7500000-0000-0000-0000-000000000020', 'create_requests') then
    raise exception 'RN-EST-20 FALLA: quien pasa a Editor perdió los permisos operativos';
  end if;

  -- Y el otro restaurante del grupo A sigue siendo suyo como antes.
  if not public.client_permission('d7500000-0000-0000-0000-000000000021', 'view_billing') then
    raise exception 'RN-EST-20 FALLA: mover uno le quitó al propietario los demás restaurantes del grupo';
  end if;

  set local role postgres;

  select role, ep.* into v_perm
  from public.establishment_memberships em
  join public.establishment_permissions ep on ep.establishment_membership_id = em.id
  where em.establishment_id = 'd7500000-0000-0000-0000-000000000020'
    and em.user_id = 'd7500000-0000-0000-0000-000000000006' and em.revoked_at is null;
  if v_perm.role <> 'editor' or v_perm.manage_users or v_perm.edit_establishment_data
     or not v_perm.view_reports or not v_perm.use_messages then
    raise exception 'RN-EST-20 FALLA: el editor de grupo no quedó como Editor con los operativos';
  end if;

  -- Los accesos del propio restaurante, intactos.
  if (select role from public.establishment_memberships
      where establishment_id = 'd7500000-0000-0000-0000-000000000020'
        and user_id = 'd7500000-0000-0000-0000-000000000007' and revoked_at is null) <> 'local_owner' then
    raise exception 'RN-EST-20 FALLA: el propietario local dejó de serlo';
  end if;
  if (select count(*) from public.establishment_memberships
      where establishment_id = 'd7500000-0000-0000-0000-000000000020'
        and user_id = 'd7500000-0000-0000-0000-000000000009') <> 1 then
    raise exception 'RN-EST-20 FALLA: el Editor del restaurante ganó una segunda membresía';
  end if;

  -- Lo que viaja con él.
  if (select group_id from public.files where id = 'd7500000-0000-0000-0000-000000000030')
     <> 'd7500000-0000-0000-0000-00000000000b' then
    raise exception 'RN-EST-20 FALLA: el archivo se quedó en el grupo de origen';
  end if;
  if (select group_id from public.reports where id = 'd7500000-0000-0000-0000-000000000040')
     <> 'd7500000-0000-0000-0000-00000000000b' then
    raise exception 'RN-EST-20 FALLA: el informe individual se quedó en el grupo de origen';
  end if;

  -- Un solo apunte, con antes y después.
  if (select count(*) from public.audit_log
      where entity_id = 'd7500000-0000-0000-0000-000000000020'
        and action = 'establishment.group_changed'
        and actor_id = 'd7500000-0000-0000-0000-000000000002'
        and old_value ->> 'group_id' = 'd7500000-0000-0000-0000-00000000000a'
        and new_value ->> 'group_id' = 'd7500000-0000-0000-0000-00000000000b'
        and new_value ->> 'previous_access' = 'keep_as_editor'
        and jsonb_array_length(new_value -> 'kept_as_editor') = 3) <> 1 then
    raise exception 'RN-EST-20 FALLA: mover no dejó exactamente un apunte completo';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 6 · El propietario lo mueve a un grupo suyo, y los de origen salen
-- ------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000008';
  v_result := public.move_establishment_to_group('d7500000-0000-0000-0000-000000000021',
    'd7500000-0000-0000-0000-00000000000c', 'revoke');

  -- Pierden el acceso el propietario 4 y el editor de grupo 6; el 8 sigue
  -- porque también es de C.
  if (v_result ->> 'lost_access')::int <> 2 then
    raise exception 'RN-EST-20 FALLA: no perdieron el acceso los dos que entraban solo por A: %', v_result;
  end if;
  if not public.client_permission('d7500000-0000-0000-0000-000000000021', 'view_billing') then
    raise exception 'RN-EST-20 FALLA: quien lo movió a su otro grupo perdió la propiedad';
  end if;

  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000004';
  if public.can_read_establishment_as_client('d7500000-0000-0000-0000-000000000021') then
    raise exception 'RN-EST-20 FALLA: el propietario de origen sigue entrando aunque se eligió quitarle el acceso';
  end if;
  set local "request.jwt.claim.sub" = 'd7500000-0000-0000-0000-000000000006';
  if public.can_read_establishment_as_client('d7500000-0000-0000-0000-000000000021') then
    raise exception 'RN-EST-20 FALLA: el editor de grupo de origen sigue entrando';
  end if;

  set local role postgres;
  if not exists (
    select 1 from public.audit_log
    where entity_id = 'd7500000-0000-0000-0000-000000000021'
      and action = 'establishment.group_changed'
      and actor_id = 'd7500000-0000-0000-0000-000000000008'
      and new_value ->> 'previous_access' = 'revoke'
      and jsonb_array_length(new_value -> 'lost_access') = 2
  ) then
    raise exception 'RN-EST-20 FALLA: el apunte no dice quién perdió el acceso';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 7 · Privilegios (CLAUDE.md)
-- ------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.create_group(uuid, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.update_group(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.establishment_move_targets(uuid)', 'execute')
     or has_function_privilege('anon', 'public.move_establishment_to_group(uuid, uuid, text)', 'execute') then
    raise exception 'RN-EST-20 FALLA: una función de grupos está abierta a anon';
  end if;
  if has_function_privilege('authenticated', 'public.is_establishment_owner_user(uuid, uuid)', 'execute') then
    raise exception 'RN-EST-20 FALLA: la función interna está abierta por RPC';
  end if;
end;
$$;

rollback;
