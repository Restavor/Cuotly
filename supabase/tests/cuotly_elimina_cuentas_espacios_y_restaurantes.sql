-- ============================================================
-- Suite 79 · Cuotly elimina cuentas, espacios y restaurantes
-- (migraciones 140 y 141, decisión 81, PRD §32, RN-ADM-14 a RN-ADM-21)
-- ============================================================
--
-- Lo que vigila:
--
--   · RN-ADM-14 · lo hacen Bosco y los Administradores de Cuotly con el
--     permiso `can_delete_accounts`; sin el permiso, o sin la sesión en
--     dos pasos, nadie. Lo concede Bosco.
--   · RN-ADM-15 · todo con motivo.
--   · RN-ADM-16 · un espacio eliminado queda en `archived_by_platform`:
--     solo lectura, su dueño no lo restaura, los barridos no lo mueven y
--     solo Cuotly lo recupera, al modo que tenía.
--   · RN-ADM-17 · un restaurante eliminado queda archivado y marcado; el
--     equipo no lo reactiva ni por función ni por `update`; Cuotly lo
--     recupera al estado en que lo encontró.
--   · RN-ADM-18 · una cuenta eliminada no entra (`banned_until`, sesiones
--     cerradas), sale de sus equipos y de sus restaurantes, y todo queda
--     en `platform_account_closures`; recuperarla lo devuelve.
--   · RN-ADM-19 · de cada espacio del que era única propietaria, la
--     propiedad pasa al administrador elegido o a uno al azar; a un
--     trabajador solo si no hay administradores; sin nadie, el espacio se
--     elimina con la cuenta.
--   · RN-ADM-20 · Bosco no se elimina; a un Administrador de Cuotly solo
--     lo elimina Bosco, retirándole el rol en el mismo acto.
--   · RN-ADM-21 · se avisa: a la cuenta, por correo ("su cuenta ha sido
--     eliminada"); al equipo del espacio y a quien lleva el restaurante,
--     con un aviso obligatorio.
--   · Nada se borra: todas las filas siguen ahí.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cuotly_elimina_cuentas_espacios_y_restaurantes.sql
--
-- Prefijo de esta suite: e7900000-.

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('e7900000-0000-0000-0000-000000000002', 'adm79-con@example.com', 'authenticated', 'authenticated'),
  ('e7900000-0000-0000-0000-000000000003', 'adm79-sin@example.com', 'authenticated', 'authenticated'),
  -- Ana: dueña única de A (con administrador), de B (solo trabajadores) y
  -- de C (sola), y clienta de un restaurante de D.
  ('e7900000-0000-0000-0000-000000000004', 'ana79@example.com', 'authenticated', 'authenticated'),
  ('e7900000-0000-0000-0000-000000000005', 'luis79@example.com', 'authenticated', 'authenticated'),
  ('e7900000-0000-0000-0000-000000000006', 'marta79@example.com', 'authenticated', 'authenticated'),
  ('e7900000-0000-0000-0000-000000000007', 'pedro79@example.com', 'authenticated', 'authenticated'),
  ('e7900000-0000-0000-0000-000000000008', 'dueno79@example.com', 'authenticated', 'authenticated'),
  ('e7900000-0000-0000-0000-000000000010', 'quique79@example.com', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('e7900000-0000-0000-0000-000000000002', 'adm79-con@example.com', 'Admin con permiso 79'),
  ('e7900000-0000-0000-0000-000000000003', 'adm79-sin@example.com', 'Admin sin permiso 79'),
  ('e7900000-0000-0000-0000-000000000004', 'ana79@example.com', 'Ana 79'),
  ('e7900000-0000-0000-0000-000000000005', 'luis79@example.com', 'Luis 79'),
  ('e7900000-0000-0000-0000-000000000006', 'marta79@example.com', 'Marta 79'),
  ('e7900000-0000-0000-0000-000000000007', 'pedro79@example.com', 'Pedro 79'),
  ('e7900000-0000-0000-0000-000000000008', 'dueno79@example.com', 'Dueño 79'),
  ('e7900000-0000-0000-0000-000000000010', 'quique79@example.com', 'Quique 79')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.platform_roles (user_id, role, can_support) values
  ('e7900000-0000-0000-0000-000000000003', 'cuotly_admin', true);

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('e7910000-0000-0000-0000-00000000000a', 'Espacio A 79', 'espacio-a-79', 'Europe/Madrid', 'e7900000-0000-0000-0000-000000000004'),
  ('e7910000-0000-0000-0000-00000000000b', 'Espacio B 79', 'espacio-b-79', 'Europe/Madrid', 'e7900000-0000-0000-0000-000000000004'),
  ('e7910000-0000-0000-0000-00000000000c', 'Espacio C 79', 'espacio-c-79', 'Europe/Madrid', 'e7900000-0000-0000-0000-000000000004'),
  ('e7910000-0000-0000-0000-00000000000d', 'Espacio D 79', 'espacio-d-79', 'Europe/Madrid', 'e7900000-0000-0000-0000-000000000008');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('e7910000-0000-0000-0000-00000000000a', 'e7900000-0000-0000-0000-000000000004', 'owner', 'active'),
  ('e7910000-0000-0000-0000-00000000000a', 'e7900000-0000-0000-0000-000000000005', 'admin', 'active'),
  ('e7910000-0000-0000-0000-00000000000a', 'e7900000-0000-0000-0000-000000000006', 'worker', 'active'),
  ('e7910000-0000-0000-0000-00000000000b', 'e7900000-0000-0000-0000-000000000004', 'owner', 'active'),
  ('e7910000-0000-0000-0000-00000000000b', 'e7900000-0000-0000-0000-000000000007', 'worker', 'active'),
  ('e7910000-0000-0000-0000-00000000000b', 'e7900000-0000-0000-0000-000000000010', 'worker', 'active'),
  ('e7910000-0000-0000-0000-00000000000c', 'e7900000-0000-0000-0000-000000000004', 'owner', 'active'),
  ('e7910000-0000-0000-0000-00000000000d', 'e7900000-0000-0000-0000-000000000008', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('e7930000-0000-0000-0000-00000000000d', 'e7910000-0000-0000-0000-00000000000d', 'Grupo D 79');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('e7940000-0000-0000-0000-000000000001', 'e7910000-0000-0000-0000-00000000000d', 'e7930000-0000-0000-0000-00000000000d', 'EST-79-1', 'Casa 79', 'active'),
  ('e7940000-0000-0000-0000-000000000002', 'e7910000-0000-0000-0000-00000000000d', 'e7930000-0000-0000-0000-00000000000d', 'EST-79-2', 'Casa cerrada 79', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('e7940000-0000-0000-0000-000000000001', 'e7900000-0000-0000-0000-000000000004', 'local_owner');

-- Una sesión abierta de Ana, para ver que se cierra.
insert into auth.sessions (id, user_id) values
  ('e7950000-0000-0000-0000-000000000001', 'e7900000-0000-0000-0000-000000000004');

-- ============================================================
-- Privilegios: nada abierto a `anon`
-- ============================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.platform_delete_space(uuid, text)',
    'public.platform_restore_space(uuid, text)',
    'public.platform_delete_establishment(uuid, text)',
    'public.platform_restore_establishment(uuid, text)',
    'public.platform_delete_account(uuid, text, jsonb)',
    'public.platform_restore_account(uuid, text)',
    'public.platform_account_deletion_preview(uuid)',
    'public.platform_list_establishments()',
    'public.set_platform_admin(uuid, boolean, boolean, boolean, boolean)'
  ] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar %', f using errcode = 'assert_failure';
    end if;
  end loop;
  foreach f in array array[
    'public.platform_set_space_archived_internal(uuid, boolean, text)',
    'public.guard_platform_archived_establishment()'
  ] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: la interna % está abierta por RPC', f using errcode = 'assert_failure';
    end if;
  end loop;
  if exists (select 1 from pg_proc where proname = 'set_platform_admin'
             and pronamespace = 'public'::regnamespace and pronargs = 4) then
    raise exception 'RN-ADM-14 FALLIDO: sigue viva la firma vieja de set_platform_admin' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ADM-14 · Bosco concede el permiso; sin 2FA no hay plataforma
-- ============================================================
select set_config('request.jwt.claim.aal', 'aal1', false);
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  if public.is_platform_account_manager() then
    raise exception 'RN-ADM-02 FALLIDO: Bosco sin 2FA elimina cuentas' using errcode = 'assert_failure';
  end if;
  begin
    perform public.platform_delete_space('e7910000-0000-0000-0000-00000000000d', 'sin 2FA');
    raise exception 'RN-ADM-02 FALLIDO: se eliminó un espacio sin la sesión en dos pasos' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.aal', 'aal2', false);
set role authenticated;
do $$
begin
  perform public.set_platform_admin('e7900000-0000-0000-0000-000000000002', false, false, false, true);
  if not exists (select 1 from public.audit_log where action = 'platform.admin_granted'
                 and entity_id = 'e7900000-0000-0000-0000-000000000002'
                 and (new_value ->> 'can_delete_accounts')::boolean) then
    raise exception 'RN-ADM-14 FALLIDO: conceder el permiso no quedó en la auditoría' using errcode = 'assert_failure';
  end if;
  if not (public.my_platform_access() ? 'can_delete_accounts') then
    raise exception 'RN-ADM-14 FALLIDO: my_platform_access no dice si se puede eliminar' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El administrador sin el permiso no hace nada de esto, y no se concede a sí mismo.
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if public.is_platform_account_manager() then
    raise exception 'RN-ADM-14 FALLIDO: un administrador sin el permiso elimina cuentas' using errcode = 'assert_failure';
  end if;
  begin
    perform public.platform_delete_establishment('e7940000-0000-0000-0000-000000000001', 'sin permiso');
    raise exception 'RN-ADM-14 FALLIDO: un administrador sin el permiso eliminó un restaurante' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.platform_delete_account('e7900000-0000-0000-0000-000000000004', 'sin permiso');
    raise exception 'RN-ADM-14 FALLIDO: un administrador sin el permiso eliminó una cuenta' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.set_platform_admin('e7900000-0000-0000-0000-000000000003', false, false, true, true);
    raise exception 'RN-ADM-03 FALLIDO: un administrador se concedió el permiso' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;
reset role;

-- Un usuario cualquiera, tampoco: el dueño de D sobre su propio restaurante.
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_delete_space('e7910000-0000-0000-0000-00000000000a', 'no soy Cuotly');
    raise exception 'RN-ADM-14 FALLIDO: un usuario eliminó un espacio ajeno' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;
reset role;

-- ============================================================
-- RN-ADM-17 · restaurantes
-- ============================================================
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_delete_establishment('e7940000-0000-0000-0000-000000000001', '  ');
    raise exception 'RN-ADM-15 FALLIDO: se eliminó un restaurante sin motivo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  if not public.platform_delete_establishment('e7940000-0000-0000-0000-000000000001', 'Lo pide el cliente') then
    raise exception 'RN-ADM-17 FALLIDO: eliminar el restaurante devolvió que no hizo nada' using errcode = 'assert_failure';
  end if;
  if public.platform_delete_establishment('e7940000-0000-0000-0000-000000000001', 'Otra vez') then
    raise exception 'CA-17 FALLIDO: eliminar dos veces hizo algo la segunda' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.platform_list_establishments() e
                 where e.id = 'e7940000-0000-0000-0000-000000000001' and e.platform_archived_at is not null) then
    raise exception 'RN-ADM-17 FALLIDO: el listado del panel no lo enseña eliminado' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
begin
  if (select status from public.establishments where id = 'e7940000-0000-0000-0000-000000000001') <> 'archived'
     or (select platform_archived_at from public.establishments where id = 'e7940000-0000-0000-0000-000000000001') is null then
    raise exception 'RN-ADM-17 FALLIDO: el restaurante no quedó archivado y marcado' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where entity_id = 'e7940000-0000-0000-0000-000000000001'
      and action in ('establishment.archived_by_platform', 'platform.establishment_deleted')) <> 2 then
    raise exception 'RN-ADM-17 FALLIDO: faltan los apuntes de auditoría del espacio y de la plataforma' using errcode = 'assert_failure';
  end if;
  -- RN-ADM-21 · se enteran el dueño del espacio (equipo) y Ana, que es la
  -- propietaria local del restaurante (cliente). Una vez cada uno.
  if (select count(*) from public.notifications where event_type = 'establishment_deleted_by_platform'
      and entity_id = 'e7940000-0000-0000-0000-000000000001'
      and ((recipient_id = 'e7900000-0000-0000-0000-000000000008' and audience = 'staff')
        or (recipient_id = 'e7900000-0000-0000-0000-000000000004' and audience = 'client'))) <> 2 then
    raise exception 'RN-ADM-21 FALLIDO: el aviso del restaurante eliminado no llegó a su equipo y a su propietaria' using errcode = 'assert_failure';
  end if;
  if not public.notification_event_is_mandatory('establishment_deleted_by_platform')
     or not public.notification_event_is_mandatory('space_deleted_by_platform') then
    raise exception 'RN-NOT-03 FALLIDO: perder el acceso por Cuotly se puede desactivar' using errcode = 'assert_failure';
  end if;
end $$;

-- El dueño del espacio no lo reactiva, ni por la ficha ni por PostgREST.
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000008', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
set role authenticated;
do $$
begin
  begin
    perform public.set_establishment_status('e7940000-0000-0000-0000-000000000001', 'active', 'Lo quiero de vuelta');
    raise exception 'RN-ADM-17 FALLIDO: el equipo reactivó un restaurante que eliminó Cuotly' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    update public.establishments set platform_archived_at = null where id = 'e7940000-0000-0000-0000-000000000001';
    if (select platform_archived_at from public.establishments where id = 'e7940000-0000-0000-0000-000000000001') is null then
      raise exception 'RN-ADM-17 FALLIDO: el equipo quitó la marca de Cuotly por PostgREST' using errcode = 'assert_failure';
    end if;
  exception when assert_failure then raise; when others then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.aal', 'aal2', false);

-- El segundo restaurante lo archiva el equipo antes; Cuotly lo elimina y
-- al recuperarlo sigue archivado, como lo encontró.
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000008', false);
set role authenticated;
select public.set_establishment_status('e7940000-0000-0000-0000-000000000002', 'archived', 'Cerró');
reset role;

select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.platform_delete_establishment('e7940000-0000-0000-0000-000000000002', 'Limpieza');
  perform public.platform_restore_establishment('e7940000-0000-0000-0000-000000000002', 'Me equivoqué');
  perform public.platform_restore_establishment('e7940000-0000-0000-0000-000000000001', 'El cliente vuelve');
  if public.platform_restore_establishment('e7940000-0000-0000-0000-000000000001', 'Otra vez') then
    raise exception 'CA-17 FALLIDO: recuperar dos veces hizo algo la segunda' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
begin
  if (select status from public.establishments where id = 'e7940000-0000-0000-0000-000000000001') <> 'active'
     or (select platform_archived_at from public.establishments where id = 'e7940000-0000-0000-0000-000000000001') is not null then
    raise exception 'RN-ADM-17 FALLIDO: recuperar no devolvió el restaurante a activo' using errcode = 'assert_failure';
  end if;
  if (select status from public.establishments where id = 'e7940000-0000-0000-0000-000000000002') <> 'archived' then
    raise exception 'RN-ADM-17 FALLIDO: recuperar sacó del archivo un restaurante que el equipo tenía archivado' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ADM-16 · espacios
-- ============================================================
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if not public.platform_delete_space('e7910000-0000-0000-0000-00000000000d', 'Cuenta de prueba') then
    raise exception 'RN-ADM-16 FALLIDO: eliminar el espacio no hizo nada' using errcode = 'assert_failure';
  end if;
  if public.platform_delete_space('e7910000-0000-0000-0000-00000000000d', 'Otra vez') then
    raise exception 'CA-17 FALLIDO: eliminar dos veces un espacio hizo algo la segunda' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
begin
  if (select cuotly_status from public.spaces where id = 'e7910000-0000-0000-0000-00000000000d') <> 'archived_by_platform' then
    raise exception 'RN-ADM-16 FALLIDO: el espacio no quedó en archived_by_platform' using errcode = 'assert_failure';
  end if;
  -- RN-ADM-21 · su equipo en activo se entera, una sola vez aunque se pulse dos.
  if (select count(*) from public.notifications where event_type = 'space_deleted_by_platform'
      and space_id = 'e7910000-0000-0000-0000-00000000000d'
      and recipient_id = 'e7900000-0000-0000-0000-000000000008') <> 1 then
    raise exception 'RN-ADM-21 FALLIDO: el dueño del espacio eliminado no recibió un aviso (y solo uno)' using errcode = 'assert_failure';
  end if;
  -- Los barridos de la suscripción no lo sacan de ahí.
  perform public.set_space_cuotly_status_internal('e7910000-0000-0000-0000-00000000000d', 'active', 'barrido', 'sweep');
  if (select cuotly_status from public.spaces where id = 'e7910000-0000-0000-0000-00000000000d') <> 'archived_by_platform' then
    raise exception 'RN-ADM-16 FALLIDO: un barrido sacó el espacio del archivo de Cuotly' using errcode = 'assert_failure';
  end if;
end $$;

-- Su dueño no escribe ni lo restaura.
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000008', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
set role authenticated;
do $$
begin
  begin
    perform public.restore_space_by_owner('e7910000-0000-0000-0000-00000000000d', 'Es mío');
    raise exception 'RN-ADM-16 FALLIDO: el dueño restauró un espacio que eliminó Cuotly' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.set_establishment_status('e7940000-0000-0000-0000-000000000001', 'paused', 'Escribo');
    raise exception 'RN-ADM-16 FALLIDO: el equipo escribió en un espacio eliminado' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  -- Lo ve en su auditoría.
  if not exists (select 1 from public.audit_log where space_id = 'e7910000-0000-0000-0000-00000000000d'
                 and action = 'space.archived_by_platform') then
    raise exception 'RN-ADM-16 FALLIDO: el dueño no ve en su auditoría que Cuotly eliminó su espacio' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.aal', 'aal2', false);

select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.platform_restore_space('e7910000-0000-0000-0000-00000000000d', 'Era un error');
reset role;

do $$
begin
  if (select cuotly_status from public.spaces where id = 'e7910000-0000-0000-0000-00000000000d') is not null then
    raise exception 'RN-ADM-16 FALLIDO: recuperar no devolvió el espacio al modo que tenía' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ADM-20 · ni Bosco ni un Administrador de Cuotly se eliminan
-- ============================================================
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  begin
    perform public.platform_delete_account('ffb00000-0000-0000-0000-000000000001', 'Golpe de estado');
    raise exception 'RN-ADM-20 FALLIDO: se eliminó la cuenta de Bosco' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.platform_delete_account('e7900000-0000-0000-0000-000000000003', 'Compañero');
    raise exception 'RN-ADM-20 FALLIDO: se eliminó a un Administrador de Cuotly' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  if not (public.platform_account_deletion_preview('e7900000-0000-0000-0000-000000000003') ->> 'protected')::boolean then
    raise exception 'RN-ADM-20 FALLIDO: el panel no dice que un administrador está protegido' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ADM-19 · a quién pasa cada espacio de Ana
-- ============================================================
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_preview jsonb := public.platform_account_deletion_preview('e7900000-0000-0000-0000-000000000004');
  v_a jsonb;
begin
  if jsonb_array_length(v_preview -> 'sole_owner_spaces') <> 3 then
    raise exception 'RN-ADM-19 FALLIDO: el panel ve % espacios de propiedad única (3)', jsonb_array_length(v_preview -> 'sole_owner_spaces')
      using errcode = 'assert_failure';
  end if;
  select e into v_a from jsonb_array_elements(v_preview -> 'sole_owner_spaces') e
  where e ->> 'space_id' = 'e7910000-0000-0000-0000-00000000000a';
  -- En A hay administrador: solo él se ofrece, no la trabajadora.
  if jsonb_array_length(v_a -> 'candidates') <> 1
     or v_a -> 'candidates' -> 0 ->> 'user_id' <> 'e7900000-0000-0000-0000-000000000005' then
    raise exception 'RN-ADM-19 FALLIDO: en A se ofrecen %', v_a -> 'candidates' using errcode = 'assert_failure';
  end if;

  -- Elegir a la trabajadora de A, habiendo administrador, no se acepta.
  begin
    perform public.platform_delete_account('e7900000-0000-0000-0000-000000000004', 'Baja',
      jsonb_build_object('e7910000-0000-0000-0000-00000000000a', 'e7900000-0000-0000-0000-000000000006'));
    raise exception 'RN-ADM-19 FALLIDO: A pasó a una trabajadora habiendo administrador' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.platform_delete_account('e7900000-0000-0000-0000-000000000004', '');
    raise exception 'RN-ADM-15 FALLIDO: se eliminó una cuenta sin motivo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;
reset role;

-- Nada de lo rechazado dejó rastro.
do $$
begin
  if (select role from public.space_memberships where space_id = 'e7910000-0000-0000-0000-00000000000a'
      and user_id = 'e7900000-0000-0000-0000-000000000004') <> 'owner'
     or exists (select 1 from public.platform_account_closures where user_id = 'e7900000-0000-0000-0000-000000000004') then
    raise exception 'RN-ADM-19 FALLIDO: un intento rechazado dejó cambios' using errcode = 'assert_failure';
  end if;
end $$;

-- Ahora sí: A al azar (su único administrador, Luis), B a Quique elegido
-- (no hay administradores), C sin nadie.
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_result jsonb;
begin
  v_result := public.platform_delete_account('e7900000-0000-0000-0000-000000000004', 'Lo pide por correo',
    jsonb_build_object('e7910000-0000-0000-0000-00000000000b', 'e7900000-0000-0000-0000-000000000010'));
  if (v_result ->> 'already_closed')::boolean then
    raise exception 'RN-ADM-18 FALLIDO: la primera vez dijo que ya estaba eliminada' using errcode = 'assert_failure';
  end if;
  v_result := public.platform_delete_account('e7900000-0000-0000-0000-000000000004', 'Otra vez');
  if not (v_result ->> 'already_closed')::boolean then
    raise exception 'CA-17 FALLIDO: eliminar dos veces una cuenta hizo algo la segunda' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare
  v_ana uuid := 'e7900000-0000-0000-0000-000000000004';
begin
  -- RN-ADM-19
  if (select role from public.space_memberships where space_id = 'e7910000-0000-0000-0000-00000000000a'
      and user_id = 'e7900000-0000-0000-0000-000000000005') <> 'owner' then
    raise exception 'RN-ADM-19 FALLIDO: A no pasó a su administrador' using errcode = 'assert_failure';
  end if;
  if (select role from public.space_memberships where space_id = 'e7910000-0000-0000-0000-00000000000b'
      and user_id = 'e7900000-0000-0000-0000-000000000010') <> 'owner'
     or (select role from public.space_memberships where space_id = 'e7910000-0000-0000-0000-00000000000b'
         and user_id = 'e7900000-0000-0000-0000-000000000007') <> 'worker' then
    raise exception 'RN-ADM-19 FALLIDO: B no pasó al trabajador elegido' using errcode = 'assert_failure';
  end if;
  if (select cuotly_status from public.spaces where id = 'e7910000-0000-0000-0000-00000000000c') <> 'archived_by_platform' then
    raise exception 'RN-ADM-19 FALLIDO: C, sin nadie más, no se eliminó con la cuenta' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.space_lifecycle_operations
                 where space_id = 'e7910000-0000-0000-0000-00000000000a' and kind = 'ownership_transferred'
                   and from_owner_id = v_ana and to_owner_id = 'e7900000-0000-0000-0000-000000000005') then
    raise exception 'RN-ADM-19 FALLIDO: el traspaso de A no está en el libro del espacio' using errcode = 'assert_failure';
  end if;

  -- RN-ADM-18
  if (select count(*) from public.space_memberships where user_id = v_ana and status = 'access_revoked') <> 2 then
    raise exception 'RN-ADM-18 FALLIDO: Ana no salió de los equipos de A y B' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.establishment_memberships where user_id = v_ana and revoked_at is null) then
    raise exception 'RN-ADM-18 FALLIDO: Ana conserva su acceso al restaurante' using errcode = 'assert_failure';
  end if;
  if (select banned_until from auth.users where id = v_ana) is null or (select banned_until from auth.users where id = v_ana) < now() + interval '50 years' then
    raise exception 'RN-ADM-18 FALLIDO: la cuenta de Ana puede seguir entrando' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from auth.sessions where user_id = v_ana) then
    raise exception 'RN-ADM-18 FALLIDO: las sesiones de Ana siguen abiertas' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.platform_account_closures where user_id = v_ana and restored_at is null
                 and reason = 'Lo pide por correo') then
    raise exception 'RN-ADM-18 FALLIDO: falta el apunte en platform_account_closures' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'platform.account_deleted' and entity_id = v_ana) then
    raise exception 'RN-ADM-18 FALLIDO: falta la auditoría de la plataforma' using errcode = 'assert_failure';
  end if;
  -- RN-ADM-21 · el correo "su cuenta ha sido eliminada", uno aunque se
  -- pulsara dos veces.
  if (select count(*) from public.platform_emails where kind = 'account_deleted'
      and to_email = 'ana79@example.com') <> 1 then
    raise exception 'RN-ADM-21 FALLIDO: a Ana no le sale un correo (y solo uno) diciendo que su cuenta se eliminó' using errcode = 'assert_failure';
  end if;
  -- Nada se borra.
  if not exists (select 1 from public.profiles where id = v_ana)
     or (select count(*) from public.space_memberships where user_id = v_ana) <> 3 then
    raise exception 'RN-DAT-06 FALLIDO: eliminar la cuenta borró filas' using errcode = 'assert_failure';
  end if;
end $$;

-- Ya no entra en A.
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000004', false);
set role authenticated;
do $$
begin
  if public.is_space_member('e7910000-0000-0000-0000-00000000000a') then
    raise exception 'RN-ADM-18 FALLIDO: Ana sigue siendo miembro de A' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Los clientes no leen el libro de cuentas eliminadas.
select set_config('request.jwt.claim.sub', 'e7900000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.platform_account_closures) then
    raise exception 'RN-ADM-18 FALLIDO: un usuario normal lee platform_account_closures' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-ADM-18 · recuperar la cuenta
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_result jsonb;
begin
  begin
    perform public.platform_restore_account('e7900000-0000-0000-0000-000000000004', ' ');
    raise exception 'RN-ADM-15 FALLIDO: se recuperó una cuenta sin motivo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  v_result := public.platform_restore_account('e7900000-0000-0000-0000-000000000004', 'Se equivocó al pedirlo');
  if (v_result ->> 'restored')::int <> 2 then
    raise exception 'RN-ADM-18 FALLIDO: se devolvieron % pertenencias (2): %', v_result ->> 'restored', v_result
      using errcode = 'assert_failure';
  end if;
  v_result := public.platform_restore_account('e7900000-0000-0000-0000-000000000004', 'Otra vez');
  if not (v_result ->> 'already_restored')::boolean then
    raise exception 'CA-17 FALLIDO: recuperar dos veces hizo algo la segunda' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare
  v_ana uuid := 'e7900000-0000-0000-0000-000000000004';
begin
  if (select banned_until from auth.users where id = v_ana) is not null then
    raise exception 'RN-ADM-18 FALLIDO: recuperada, la cuenta sigue sin poder entrar' using errcode = 'assert_failure';
  end if;
  -- Vuelve a A y B como trabajadora: los espacios ya tienen dueño
  -- (confirmado por Bosco el 26/09/2026).
  if (select count(*) from public.space_memberships where user_id = v_ana and status = 'active' and role = 'worker'
      and space_id in ('e7910000-0000-0000-0000-00000000000a', 'e7910000-0000-0000-0000-00000000000b')) <> 2 then
    raise exception 'RN-ADM-18 FALLIDO: Ana no volvió a A y B como trabajadora' using errcode = 'assert_failure';
  end if;
  if (select role from public.space_memberships where space_id = 'e7910000-0000-0000-0000-00000000000a'
      and user_id = 'e7900000-0000-0000-0000-000000000005') <> 'owner' then
    raise exception 'RN-ADM-18 FALLIDO: recuperar quitó la propiedad a quien la recibió' using errcode = 'assert_failure';
  end if;
  -- C vuelve con ella, y ella sigue siendo su dueña.
  if (select cuotly_status from public.spaces where id = 'e7910000-0000-0000-0000-00000000000c') is not null
     or (select role from public.space_memberships where space_id = 'e7910000-0000-0000-0000-00000000000c'
         and user_id = v_ana) <> 'owner' then
    raise exception 'RN-ADM-19 FALLIDO: C no volvió con su dueña' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.establishment_memberships where user_id = v_ana and revoked_at is null) then
    raise exception 'RN-ADM-18 FALLIDO: Ana no recuperó su acceso al restaurante' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.platform_account_closures where user_id = v_ana
                 and restored_at is not null and restored_by = 'ffb00000-0000-0000-0000-000000000001') then
    raise exception 'RN-ADM-18 FALLIDO: el libro no dice quién la recuperó' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-ADM-20 · Bosco sí elimina a un Administrador de Cuotly
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_preview jsonb := public.platform_account_deletion_preview('e7900000-0000-0000-0000-000000000003');
begin
  if (v_preview ->> 'protected')::boolean or not (v_preview ->> 'platform_admin')::boolean then
    raise exception 'RN-ADM-20 FALLIDO: para Bosco, el administrador sale protegido o sin marcar: %', v_preview
      using errcode = 'assert_failure';
  end if;
  begin
    perform public.platform_delete_account('ffb00000-0000-0000-0000-000000000001', 'Yo mismo');
    raise exception 'RN-ADM-20 FALLIDO: Bosco se eliminó a sí mismo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  perform public.platform_delete_account('e7900000-0000-0000-0000-000000000003', 'Deja Cuotly');
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.platform_roles where user_id = 'e7900000-0000-0000-0000-000000000003') then
    raise exception 'RN-ADM-20 FALLIDO: eliminado, sigue siendo Administrador de Cuotly' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'platform.admin_revoked'
                 and entity_id = 'e7900000-0000-0000-0000-000000000003')
     or not exists (select 1 from public.platform_account_closures
                    where user_id = 'e7900000-0000-0000-0000-000000000003' and restored_at is null) then
    raise exception 'RN-ADM-20 FALLIDO: falta el rol retirado o la cuenta cerrada en los libros' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.aal', '', false);

\echo 'Suite 79 · Cuotly elimina cuentas, espacios y restaurantes: OK'
