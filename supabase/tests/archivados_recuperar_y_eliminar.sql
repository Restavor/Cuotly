-- ============================================================
-- Suite 80 · Archivados: recuperar de un clic y eliminar definitivamente
-- (migración 142, decisión 82, PRD §32, RN-ADM-22 a RN-ADM-25)
-- ============================================================
--
-- Lo que vigila:
--
--   · RN-ADM-22 · Archivados enseña lo archivado a mano —por Cuotly, por
--     el propietario del espacio, por el equipo del restaurante— y nada
--     más: ni lo archivado solo, ni lo eliminado definitivamente.
--   · RN-ADM-23 · recuperar es un clic, con motivo fijo, y "activa de
--     nuevo": el restaurante vuelve a `active` aunque su equipo lo tuviera
--     archivado, y el espacio vuelve a su modo deshaciendo también el
--     archivado del propietario. La deuda vencida sigue parándolo.
--     Pulsar dos veces no hace nada la segunda.
--   · RN-ADM-24 · eliminar definitivamente exige motivo y que esté en
--     Archivados; ya no se recupera por ninguna vía, tampoco al recuperar
--     la cuenta con la que se fue; no se borra nada.
--   · RN-ADM-25 · el listado de restaurantes dice la deuda vencida y
--     no enseña los eliminados definitivamente.
--   · RN-ADM-14 · todo con el permiso fino y la sesión en dos pasos.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/archivados_recuperar_y_eliminar.sql
--
-- Prefijo de esta suite: e8000000-.

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('e8000000-0000-0000-0000-000000000002', 'adm80-con@example.com', 'authenticated', 'authenticated'),
  ('e8000000-0000-0000-0000-000000000003', 'adm80-sin@example.com', 'authenticated', 'authenticated'),
  ('e8000000-0000-0000-0000-000000000004', 'dueno80@example.com', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('e8000000-0000-0000-0000-000000000002', 'adm80-con@example.com', 'Admin con permiso 80'),
  ('e8000000-0000-0000-0000-000000000003', 'adm80-sin@example.com', 'Admin sin permiso 80'),
  ('e8000000-0000-0000-0000-000000000004', 'dueno80@example.com', 'Dueño 80')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.platform_roles (user_id, role, can_delete_accounts) values
  ('e8000000-0000-0000-0000-000000000002', 'cuotly_admin', true),
  ('e8000000-0000-0000-0000-000000000003', 'cuotly_admin', false);

-- A: activo. B: lo archiva su propietario. C: lo archiva Cuotly desde
-- activo. E: lo archiva el propietario y luego Cuotly.
insert into public.spaces (id, name, slug, timezone, created_by) values
  ('e8010000-0000-0000-0000-00000000000a', 'Espacio A 80', 'espacio-a-80', 'Europe/Madrid', 'e8000000-0000-0000-0000-000000000004'),
  ('e8010000-0000-0000-0000-00000000000b', 'Espacio B 80', 'espacio-b-80', 'Europe/Madrid', 'e8000000-0000-0000-0000-000000000004'),
  ('e8010000-0000-0000-0000-00000000000c', 'Espacio C 80', 'espacio-c-80', 'Europe/Madrid', 'e8000000-0000-0000-0000-000000000004'),
  ('e8010000-0000-0000-0000-00000000000e', 'Espacio E 80', 'espacio-e-80', 'Europe/Madrid', 'e8000000-0000-0000-0000-000000000004');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('e8010000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-000000000004', 'owner', 'active'),
  ('e8010000-0000-0000-0000-00000000000b', 'e8000000-0000-0000-0000-000000000004', 'owner', 'active'),
  ('e8010000-0000-0000-0000-00000000000c', 'e8000000-0000-0000-0000-000000000004', 'owner', 'active'),
  ('e8010000-0000-0000-0000-00000000000e', 'e8000000-0000-0000-0000-000000000004', 'owner', 'active');

-- Los modos se fijan a mano, con su evento, como los dejaría cada
-- función: aquí se prueba lo que viene después.
select set_config('cuotly.space_status_change', 'on', false);
update public.spaces set cuotly_status = 'active' where id::text like 'e8010000-%';
update public.spaces set cuotly_status = 'archived_by_owner', cuotly_archived_at = now()
where id in ('e8010000-0000-0000-0000-00000000000b', 'e8010000-0000-0000-0000-00000000000e');
select set_config('cuotly.space_status_change', 'off', false);
insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, reason, cause) values
  ('e8010000-0000-0000-0000-00000000000b', 'space', 'e8010000-0000-0000-0000-00000000000b', 'active', 'archived_by_owner', 'Cierro el negocio', 'owner_request'),
  ('e8010000-0000-0000-0000-00000000000e', 'space', 'e8010000-0000-0000-0000-00000000000e', 'active', 'archived_by_owner', 'Pausa', 'owner_request');

insert into public.groups (id, space_id, name) values
  ('e8030000-0000-0000-0000-00000000000a', 'e8010000-0000-0000-0000-00000000000a', 'Grupo A 80');

-- R1: activo, lo archivará Cuotly. R2: lo archiva el equipo. R3: lo
-- archiva el equipo y luego Cuotly. R4: activo, se queda activo. R5: lo
-- archiva el equipo, y se eliminará definitivamente.
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('e8040000-0000-0000-0000-000000000001', 'e8010000-0000-0000-0000-00000000000a', 'e8030000-0000-0000-0000-00000000000a', 'EST-80-1', 'Casa uno 80', 'active'),
  ('e8040000-0000-0000-0000-000000000002', 'e8010000-0000-0000-0000-00000000000a', 'e8030000-0000-0000-0000-00000000000a', 'EST-80-2', 'Casa dos 80', 'active'),
  ('e8040000-0000-0000-0000-000000000003', 'e8010000-0000-0000-0000-00000000000a', 'e8030000-0000-0000-0000-00000000000a', 'EST-80-3', 'Casa tres 80', 'active'),
  ('e8040000-0000-0000-0000-000000000004', 'e8010000-0000-0000-0000-00000000000a', 'e8030000-0000-0000-0000-00000000000a', 'EST-80-4', 'Casa cuatro 80', 'active'),
  ('e8040000-0000-0000-0000-000000000005', 'e8010000-0000-0000-0000-00000000000a', 'e8030000-0000-0000-0000-00000000000a', 'EST-80-5', 'Casa cinco 80', 'active');

-- ============================================================
-- Privilegios: nada abierto a `anon`; las guardas, cerradas
-- ============================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.platform_list_archived()',
    'public.platform_list_establishments()',
    'public.platform_recover_space(uuid)',
    'public.platform_recover_establishment(uuid)',
    'public.platform_delete_space_permanently(uuid, text)',
    'public.platform_delete_establishment_permanently(uuid, text)'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar %', f using errcode = 'assert_failure';
    end if;
  end loop;
  foreach f in array array[
    'public.guard_space_permanently_deleted()',
    'public.guard_establishment_permanently_deleted()',
    'public.platform_set_space_archived_internal(uuid, boolean, text)'
  ] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: la interna % está abierta por RPC', f using errcode = 'assert_failure';
    end if;
  end loop;
end $$;

-- El equipo archiva R2, R3 y R5.
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
set role authenticated;
select public.set_establishment_status('e8040000-0000-0000-0000-000000000002', 'archived', 'Cerró el local');
select public.set_establishment_status('e8040000-0000-0000-0000-000000000003', 'archived', 'Obras');
select public.set_establishment_status('e8040000-0000-0000-0000-000000000005', 'archived', 'Traspaso');
reset role;

-- Cuotly archiva R1, R3, C y E.
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', false);
select set_config('request.jwt.claim.aal', 'aal2', false);
set role authenticated;
select public.platform_delete_establishment('e8040000-0000-0000-0000-000000000001', 'Impago largo');
select public.platform_delete_establishment('e8040000-0000-0000-0000-000000000003', 'Limpieza');
select public.platform_delete_space('e8010000-0000-0000-0000-00000000000c', 'Cuenta de prueba');
select public.platform_delete_space('e8010000-0000-0000-0000-00000000000e', 'Abandonado');
reset role;

-- ============================================================
-- RN-ADM-14 · sin el permiso o sin 2FA, nada
-- ============================================================
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_recover_establishment('e8040000-0000-0000-0000-000000000002');
    raise exception 'RN-ADM-14 FALLIDO: un administrador sin el permiso recuperó un restaurante' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.platform_delete_space_permanently('e8010000-0000-0000-0000-00000000000c', 'sin permiso');
    raise exception 'RN-ADM-14 FALLIDO: un administrador sin el permiso eliminó definitivamente un espacio' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  -- Leer Archivados sí: es del panel, como el resto de listados.
  perform count(*) from public.platform_list_archived();
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_recover_space('e8010000-0000-0000-0000-00000000000c');
    raise exception 'RN-ADM-02 FALLIDO: se recuperó un espacio sin la sesión en dos pasos' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.platform_list_archived();
    raise exception 'RN-ADM-02 FALLIDO: Archivados se lee sin la sesión en dos pasos' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;
reset role;

-- El dueño de los espacios, tampoco: ni recupera por aquí ni pone la marca.
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_recover_establishment('e8040000-0000-0000-0000-000000000002');
    raise exception 'RN-ADM-14 FALLIDO: el dueño del espacio usó la función de plataforma' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    update public.establishments set permanently_deleted_at = now() where id = 'e8040000-0000-0000-0000-000000000002';
    if (select permanently_deleted_at from public.establishments where id = 'e8040000-0000-0000-0000-000000000002') is not null then
      raise exception 'RN-ADM-24 FALLIDO: el equipo puso la marca por PostgREST' using errcode = 'assert_failure';
    end if;
  exception when assert_failure then raise; when others then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.aal', 'aal2', false);

-- ============================================================
-- RN-ADM-22 · qué hay en Archivados
-- ============================================================
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_ids uuid[];
begin
  select array_agg(id order by id) into v_ids from public.platform_list_archived() where id::text like 'e80%';
  if v_ids is distinct from array[
       'e8010000-0000-0000-0000-00000000000b', 'e8010000-0000-0000-0000-00000000000c',
       'e8010000-0000-0000-0000-00000000000e',
       'e8040000-0000-0000-0000-000000000001', 'e8040000-0000-0000-0000-000000000002',
       'e8040000-0000-0000-0000-000000000003', 'e8040000-0000-0000-0000-000000000005']::uuid[] then
    raise exception 'RN-ADM-22 FALLIDO: Archivados no enseña justo lo archivado a mano: %', v_ids using errcode = 'assert_failure';
  end if;
  if (select archived_by from public.platform_list_archived() where id = 'e8010000-0000-0000-0000-00000000000b') <> 'owner'
     or (select archived_by from public.platform_list_archived() where id = 'e8010000-0000-0000-0000-00000000000c') <> 'platform'
     or (select archived_by from public.platform_list_archived() where id = 'e8040000-0000-0000-0000-000000000002') <> 'team'
     or (select archived_by from public.platform_list_archived() where id = 'e8040000-0000-0000-0000-000000000003') <> 'platform' then
    raise exception 'RN-ADM-22 FALLIDO: Archivados no dice bien quién lo archivó' using errcode = 'assert_failure';
  end if;
  if (select reason from public.platform_list_archived() where id = 'e8040000-0000-0000-0000-000000000002') <> 'Cerró el local'
     or (select reason from public.platform_list_archived() where id = 'e8040000-0000-0000-0000-000000000003') <> 'Limpieza'
     or (select archived_at from public.platform_list_archived() where id = 'e8010000-0000-0000-0000-00000000000b') is null then
    raise exception 'RN-ADM-22 FALLIDO: Archivados no enseña el motivo o la fecha' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ADM-23 · recuperar de un clic
-- ============================================================
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if not public.platform_recover_establishment('e8040000-0000-0000-0000-000000000002') then
    raise exception 'RN-ADM-23 FALLIDO: recuperar un restaurante archivado por su equipo no hizo nada' using errcode = 'assert_failure';
  end if;
  if public.platform_recover_establishment('e8040000-0000-0000-0000-000000000002') then
    raise exception 'CA-17 FALLIDO: recuperar dos veces hizo algo la segunda' using errcode = 'assert_failure';
  end if;
  perform public.platform_recover_establishment('e8040000-0000-0000-0000-000000000003');
  perform public.platform_recover_establishment('e8040000-0000-0000-0000-000000000001');
  if public.platform_recover_establishment('e8040000-0000-0000-0000-000000000004') then
    raise exception 'CA-17 FALLIDO: recuperar un restaurante activo hizo algo' using errcode = 'assert_failure';
  end if;

  if not public.platform_recover_space('e8010000-0000-0000-0000-00000000000b') then
    raise exception 'RN-ADM-23 FALLIDO: recuperar un espacio archivado por su propietario no hizo nada' using errcode = 'assert_failure';
  end if;
  if public.platform_recover_space('e8010000-0000-0000-0000-00000000000b') then
    raise exception 'CA-17 FALLIDO: recuperar dos veces un espacio hizo algo la segunda' using errcode = 'assert_failure';
  end if;
  perform public.platform_recover_space('e8010000-0000-0000-0000-00000000000c');
  perform public.platform_recover_space('e8010000-0000-0000-0000-00000000000e');
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.establishments
             where id in ('e8040000-0000-0000-0000-000000000001', 'e8040000-0000-0000-0000-000000000002',
                          'e8040000-0000-0000-0000-000000000003')
               and (status <> 'active' or platform_archived_at is not null)) then
    raise exception 'RN-ADM-23 FALLIDO: recuperar no dejó activos los tres restaurantes (también el que su equipo había archivado antes que Cuotly)'
      using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.spaces
             where id in ('e8010000-0000-0000-0000-00000000000b', 'e8010000-0000-0000-0000-00000000000c',
                          'e8010000-0000-0000-0000-00000000000e')
               and cuotly_status is distinct from 'active') then
    raise exception 'RN-ADM-23 FALLIDO: recuperar no dejó activos los tres espacios (también el que su propietario había archivado antes que Cuotly)'
      using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log
      where entity_id = 'e8040000-0000-0000-0000-000000000002'
        and action in ('establishment.restored_by_platform', 'platform.establishment_restored')
        and reason = 'Recuperado desde Archivados'
        and actor_id = 'e8000000-0000-0000-0000-000000000002') <> 2 then
    raise exception 'RN-ADM-23 FALLIDO: recuperar no dejó su rastro con actor y motivo fijo' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log
                 where entity_id = 'e8010000-0000-0000-0000-00000000000b' and action = 'platform.space_restored'
                   and space_id is null) then
    raise exception 'RN-ADM-23 FALLIDO: recuperar el espacio no quedó en la auditoría de la plataforma' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ADM-24 · eliminar definitivamente
-- ============================================================
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_delete_establishment_permanently('e8040000-0000-0000-0000-000000000005', '  ');
    raise exception 'RN-ADM-15 FALLIDO: se eliminó definitivamente sin motivo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.platform_delete_establishment_permanently('e8040000-0000-0000-0000-000000000004', 'Está activo');
    raise exception 'RN-ADM-24 FALLIDO: se eliminó definitivamente un restaurante que no estaba en Archivados' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.platform_delete_space_permanently('e8010000-0000-0000-0000-00000000000a', 'Está activo');
    raise exception 'RN-ADM-24 FALLIDO: se eliminó definitivamente un espacio que no estaba en Archivados' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  if not public.platform_delete_establishment_permanently('e8040000-0000-0000-0000-000000000005', 'Ya no es cliente') then
    raise exception 'RN-ADM-24 FALLIDO: eliminar definitivamente no hizo nada' using errcode = 'assert_failure';
  end if;
  if public.platform_delete_establishment_permanently('e8040000-0000-0000-0000-000000000005', 'Otra vez') then
    raise exception 'CA-17 FALLIDO: eliminar definitivamente dos veces hizo algo la segunda' using errcode = 'assert_failure';
  end if;
  begin
    perform public.platform_recover_establishment('e8040000-0000-0000-0000-000000000005');
    raise exception 'RN-ADM-24 FALLIDO: se recuperó un restaurante eliminado definitivamente' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.platform_restore_establishment('e8040000-0000-0000-0000-000000000005', 'Por la puerta vieja');
    raise exception 'RN-ADM-24 FALLIDO: la función de la 140 recuperó un restaurante eliminado definitivamente' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- El espacio B lo vuelve a archivar su dueño... aquí, a mano, y Cuotly
  -- lo elimina definitivamente desde el archivado del propietario.
end $$;
reset role;

select set_config('cuotly.space_status_change', 'on', false);
update public.spaces set cuotly_status = 'archived_by_owner' where id = 'e8010000-0000-0000-0000-00000000000b';
select set_config('cuotly.space_status_change', 'off', false);
insert into public.state_events (space_id, entity_type, entity_id, from_state, to_state, reason, cause) values
  ('e8010000-0000-0000-0000-00000000000b', 'space', 'e8010000-0000-0000-0000-00000000000b', 'active', 'archived_by_owner', 'Otra vez', 'owner_request');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if not public.platform_delete_space_permanently('e8010000-0000-0000-0000-00000000000b', 'Lo pide su dueño') then
    raise exception 'RN-ADM-24 FALLIDO: eliminar definitivamente un espacio no hizo nada' using errcode = 'assert_failure';
  end if;
  begin
    perform public.platform_recover_space('e8010000-0000-0000-0000-00000000000b');
    raise exception 'RN-ADM-24 FALLIDO: se recuperó un espacio eliminado definitivamente' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  if public.platform_restore_space('e8010000-0000-0000-0000-00000000000b', 'Por la puerta vieja') then
    raise exception 'RN-ADM-24 FALLIDO: la función de la 140 recuperó un espacio eliminado definitivamente' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.platform_list_archived()
             where id in ('e8010000-0000-0000-0000-00000000000b', 'e8040000-0000-0000-0000-000000000005')) then
    raise exception 'RN-ADM-24 FALLIDO: lo eliminado definitivamente sigue en Archivados' using errcode = 'assert_failure';
  end if;
  -- RN-ADM-25 · tampoco en el listado de restaurantes, que sí dice la deuda.
  if exists (select 1 from public.platform_list_establishments() where id = 'e8040000-0000-0000-0000-000000000005') then
    raise exception 'RN-ADM-25 FALLIDO: el listado de restaurantes enseña uno eliminado definitivamente' using errcode = 'assert_failure';
  end if;
  if (select has_overdue_debt from public.platform_list_establishments() where id = 'e8040000-0000-0000-0000-000000000004') then
    raise exception 'RN-ADM-25 FALLIDO: un restaurante sin deuda sale con deuda vencida' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El dueño ya no lo restaura: pasó a Cuotly antes de la marca.
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  begin
    perform public.restore_space_by_owner('e8010000-0000-0000-0000-00000000000b', 'Lo quiero de vuelta');
    raise exception 'RN-ADM-24 FALLIDO: el propietario restauró un espacio eliminado definitivamente' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.set_establishment_status('e8040000-0000-0000-0000-000000000005', 'active', 'Lo reabro');
    raise exception 'RN-ADM-24 FALLIDO: el equipo reactivó un restaurante eliminado definitivamente' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;
reset role;

-- Ni siquiera por debajo, con las llaves de la plataforma puestas.
do $$
begin
  perform set_config('cuotly.platform_change', 'on', true);
  perform set_config('cuotly.space_status_change', 'on', true);
  begin
    update public.spaces set cuotly_status = 'active' where id = 'e8010000-0000-0000-0000-00000000000b';
    raise exception 'RN-ADM-24 FALLIDO: el modo de un espacio eliminado definitivamente se movió' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    update public.establishments set permanently_deleted_at = null where id = 'e8040000-0000-0000-0000-000000000005';
    raise exception 'RN-ADM-24 FALLIDO: se quitó la marca de eliminado definitivamente' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  perform set_config('cuotly.platform_change', 'off', true);
  perform set_config('cuotly.space_status_change', 'off', true);
end $$;

-- Nada se borra, y todo queda en los dos libros.
do $$
begin
  if (select count(*) from public.spaces where id = 'e8010000-0000-0000-0000-00000000000b'
      and cuotly_status = 'archived_by_platform' and permanently_deleted_at is not null) <> 1
     or (select count(*) from public.establishments where id = 'e8040000-0000-0000-0000-000000000005'
         and status = 'archived' and platform_archived_at is not null and permanently_deleted_at is not null) <> 1 then
    raise exception 'RN-ADM-24 FALLIDO: lo eliminado definitivamente no sigue en la base, archivado y marcado' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log
      where action in ('space.permanently_deleted_by_platform', 'platform.space_permanently_deleted',
                       'establishment.permanently_deleted_by_platform', 'platform.establishment_permanently_deleted')
        and entity_id in ('e8010000-0000-0000-0000-00000000000b', 'e8040000-0000-0000-0000-000000000005')) <> 4 then
    raise exception 'RN-ADM-24 FALLIDO: faltan apuntes de auditoría del eliminado definitivo' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.aal', '', false);

\echo 'Suite 80 · Archivados: recuperar y eliminar definitivamente: OK'
