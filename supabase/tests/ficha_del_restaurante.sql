-- La pestaña Usuarios de la ficha (§15.2, RN-EST-01 a 05, RN-EST-11)
-- contra la base de datos real.
--
-- Existe porque la cabecera de la migración 55 decía "se comprueba con
-- este archivo" desde el 09/09/2026 y el archivo no estaba. El ROADMAP lo
-- dejó anotado como la quinta vez que una garantía escrita en un
-- comentario resulta no estar implementada; esta es la que cierra esa
-- anotación.
--
-- Lo que comprueba `establishment_client_users()`, y por qué cada cosa:
--
--   · **Devuelve NOMBRE y CORREO al equipo.** Es su razón de existir:
--     `profiles_select` solo deja ver a quien comparte espacio, un cliente
--     no es miembro del espacio, y sin esta función la pestaña enseñaría
--     una lista de uuids.
--   · **Las dos formas de acceso** (RN-EST-01/03): el propietario global
--     del GRUPO —que alcanza a todos sus restaurantes— y quien lo tiene
--     del restaurante concreto. La columna `source` las distingue.
--   · **RN-EST-11 · los permisos finos**, tal como los ve la pantalla: el
--     editor CON `edit_establishment_data` sale con `true`, el editor SIN
--     él con `false`, y el propietario global con `true` en los dos —no
--     tiene permisos finos porque los tiene todos por serlo—.
--   · **RN-EST-05 · un acceso revocado desaparece.** "Al retirar un acceso
--     desaparece de inmediato": si siguiera saliendo, la pestaña diría que
--     alguien tiene acceso cuando ya no lo tiene.
--   · **La dirección NO es simétrica**, que es el corazón de la migración:
--     a quien no es del espacio se le contesta con CERO filas, no con una
--     lista distinta. Un cliente no puede sacar por aquí ni la identidad
--     del equipo (CLAUDE.md MUST NOT, RN-MSG-02) ni la de sus compañeros
--     de restaurante.
--   · **Un espacio ajeno tampoco.** Ser miembro de UN espacio no da
--     acceso a los restaurantes de otro.
--   · **CLAUDE.md · privilegios**: cerrada a `anon`, abierta a
--     `authenticated`.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ficha_del_restaurante.sql

-- ============================================================
-- Fixture: un espacio con propietaria y trabajadora, un grupo con dos
-- restaurantes, las cuatro identidades de cliente que RN-EST-11 distingue,
-- y un espacio vecino que no pinta nada aquí.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('fc000000-0000-0000-0000-000000000001', 'fic-owner@example.com', 'authenticated', 'authenticated'),
  ('fc000000-0000-0000-0000-000000000002', 'fic-worker@example.com', 'authenticated', 'authenticated'),
  ('fc000000-0000-0000-0000-000000000003', 'fic-global@example.com', 'authenticated', 'authenticated'),
  ('fc000000-0000-0000-0000-000000000004', 'fic-local@example.com', 'authenticated', 'authenticated'),
  ('fc000000-0000-0000-0000-000000000005', 'fic-editor-si@example.com', 'authenticated', 'authenticated'),
  ('fc000000-0000-0000-0000-000000000006', 'fic-editor-no@example.com', 'authenticated', 'authenticated'),
  ('fc000000-0000-0000-0000-000000000007', 'fic-revocado@example.com', 'authenticated', 'authenticated'),
  ('fc000000-0000-0000-0000-000000000008', 'fic-ajeno@example.com', 'authenticated', 'authenticated');

update public.profiles set full_name = 'Nuria Ferreiro'
  where id = 'fc000000-0000-0000-0000-000000000004';
update public.profiles set full_name = 'Ana Global'
  where id = 'fc000000-0000-0000-0000-000000000003';

insert into public.spaces (id, name, slug, created_by) values
  ('fc100000-0000-0000-0000-000000000001', 'Espacio Ficha', 'espacio-ficha-test',
   'fc000000-0000-0000-0000-000000000001'),
  ('fc100000-0000-0000-0000-000000000002', 'Espacio Vecino Ficha', 'espacio-vecino-ficha-test',
   'fc000000-0000-0000-0000-000000000008');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('fc100000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('fc100000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'worker', 'active'),
  ('fc100000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000008', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('fc300000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000001', 'Grupo Ficha');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('fc400000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000001',
   'fc300000-0000-0000-0000-000000000001', 'EST-FIC-A', 'Restaurante Ficha', 'active'),
  ('fc400000-0000-0000-0000-000000000002', 'fc100000-0000-0000-0000-000000000001',
   'fc300000-0000-0000-0000-000000000001', 'EST-FIC-B', 'Restaurante Vecino', 'active');

-- El propietario global del grupo: alcanza a los DOS restaurantes sin
-- estar apuntado en ninguno (RN-EST-03).
insert into public.group_memberships (group_id, user_id, role) values
  ('fc300000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000003', 'global_owner');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('fc500000-0000-0000-0000-000000000001', 'fc400000-0000-0000-0000-000000000001',
   'fc000000-0000-0000-0000-000000000004', 'local_owner'),
  ('fc500000-0000-0000-0000-000000000002', 'fc400000-0000-0000-0000-000000000001',
   'fc000000-0000-0000-0000-000000000005', 'editor'),
  ('fc500000-0000-0000-0000-000000000003', 'fc400000-0000-0000-0000-000000000001',
   'fc000000-0000-0000-0000-000000000006', 'editor'),
  -- RN-EST-05 · éste tenía acceso y se le retiró.
  ('fc500000-0000-0000-0000-000000000004', 'fc400000-0000-0000-0000-000000000001',
   'fc000000-0000-0000-0000-000000000007', 'consulta');

insert into public.establishment_permissions
  (establishment_membership_id, edit_establishment_data, view_billing) values
  ('fc500000-0000-0000-0000-000000000002', true, false),
  ('fc500000-0000-0000-0000-000000000003', false, false);

update public.establishment_memberships
set revoked_at = now(), revoked_by = 'fc000000-0000-0000-0000-000000000001'
where id = 'fc500000-0000-0000-0000-000000000004';

-- ============================================================
-- El equipo ve la lista, con nombre y correo, y con las dos procedencias.
-- ============================================================
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_filas integer;
  v_fila record;
begin
  select count(*) into v_filas
  from public.establishment_client_users('fc400000-0000-0000-0000-000000000001');

  -- Cuatro: propietario global, propietario local y los dos editores. El
  -- revocado NO (RN-EST-05).
  if v_filas <> 4 then
    raise exception 'RN-EST-05 FALLIDO: la pestaña Usuarios enseña % filas y tenían que ser 4 (el acceso revocado no cuenta)', v_filas
      using errcode = 'assert_failure';
  end if;

  if exists (
    select 1 from public.establishment_client_users('fc400000-0000-0000-0000-000000000001')
    where user_id = 'fc000000-0000-0000-0000-000000000007'
  ) then
    raise exception 'RN-EST-05 FALLIDO: un acceso retirado sigue apareciendo en la ficha'
      using errcode = 'assert_failure';
  end if;

  -- El nombre y el correo, que es para lo que existe la función: sin ella
  -- la pantalla enseñaría uuids.
  select * into v_fila
  from public.establishment_client_users('fc400000-0000-0000-0000-000000000001')
  where user_id = 'fc000000-0000-0000-0000-000000000004';

  if v_fila.display_name is distinct from 'Nuria Ferreiro' then
    raise exception 'FALLIDO: el nombre del propietario local sale como "%"', v_fila.display_name
      using errcode = 'assert_failure';
  end if;
  if v_fila.email is distinct from 'fic-local@example.com' then
    raise exception 'FALLIDO: el correo sale como "%"', v_fila.email
      using errcode = 'assert_failure';
  end if;
  if v_fila.source <> 'establishment' then
    raise exception 'RN-EST-01 FALLIDO: el propietario local sale con procedencia "%"', v_fila.source
      using errcode = 'assert_failure';
  end if;

  -- RN-EST-03 · el propietario global del grupo alcanza al restaurante sin
  -- estar apuntado en él, y se distingue por su procedencia.
  select * into v_fila
  from public.establishment_client_users('fc400000-0000-0000-0000-000000000001')
  where user_id = 'fc000000-0000-0000-0000-000000000003';

  if v_fila.user_id is null then
    raise exception 'RN-EST-03 FALLIDO: el propietario global del grupo no alcanza a este restaurante'
      using errcode = 'assert_failure';
  end if;
  if v_fila.source <> 'group' then
    raise exception 'RN-EST-03 FALLIDO: el propietario global sale con procedencia "%"', v_fila.source
      using errcode = 'assert_failure';
  end if;
  -- No tiene permisos finos: los tiene todos por serlo.
  if not (v_fila.edit_establishment_data and v_fila.view_billing) then
    raise exception 'RN-EST-11 FALLIDO: el propietario global sale sin poder editar o sin ver facturación'
      using errcode = 'assert_failure';
  end if;

  -- Y alcanza también al SEGUNDO restaurante del grupo, que es lo que
  -- significa "global".
  if not exists (
    select 1 from public.establishment_client_users('fc400000-0000-0000-0000-000000000002')
    where user_id = 'fc000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'RN-EST-03 FALLIDO: el propietario global no alcanza al otro restaurante de su grupo'
      using errcode = 'assert_failure';
  end if;

  -- RN-EST-11 · los dos editores se distinguen por el permiso fino.
  select * into v_fila
  from public.establishment_client_users('fc400000-0000-0000-0000-000000000001')
  where user_id = 'fc000000-0000-0000-0000-000000000005';
  if not v_fila.edit_establishment_data then
    raise exception 'RN-EST-11 FALLIDO: el editor CON el permiso sale sin él'
      using errcode = 'assert_failure';
  end if;

  select * into v_fila
  from public.establishment_client_users('fc400000-0000-0000-0000-000000000001')
  where user_id = 'fc000000-0000-0000-0000-000000000006';
  if v_fila.edit_establishment_data then
    raise exception 'RN-EST-11 FALLIDO: el editor SIN el permiso sale con él; el permiso sería decorativo'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- La trabajadora también: es miembro del espacio y le escribe al cliente.
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.establishment_client_users('fc400000-0000-0000-0000-000000000001')) = 0 then
    raise exception 'FALLIDO: una trabajadora del espacio no ve quién tiene acceso al restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- La dirección NO es simétrica: al cliente, cero filas.
--
-- Es el corazón de la migración 55. El propietario local pregunta por SU
-- restaurante y no obtiene ni la identidad del equipo ni la de sus
-- compañeros: una función con dos respuestas según quién pregunta es una
-- función a la que un día se le olvida cuál toca.
-- ============================================================
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare v_filas integer;
begin
  select count(*) into v_filas
  from public.establishment_client_users('fc400000-0000-0000-0000-000000000001');

  if v_filas <> 0 then
    raise exception 'CLAUDE.md FALLIDO: un cliente ha sacado % filas de la pestaña Usuarios de su propio restaurante', v_filas
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- Y un miembro de OTRO espacio tampoco: pertenecer a un espacio no da
-- acceso a los restaurantes de otro.
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000008', false);
set role authenticated;

do $$
declare v_filas integer;
begin
  select count(*) into v_filas
  from public.establishment_client_users('fc400000-0000-0000-0000-000000000001');

  if v_filas <> 0 then
    raise exception 'FALLIDO: el propietario de otro espacio ha sacado % filas de este restaurante', v_filas
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · privilegios de la función.
-- ============================================================
do $$
declare
  v_firma text := 'public.establishment_client_users(uuid)';
begin
  if has_function_privilege('anon', v_firma, 'execute') then
    raise exception 'CLAUDE.md FALLIDO: establishment_client_users() esta abierta a anon'
      using errcode = 'assert_failure';
  end if;

  if not has_function_privilege('authenticated', v_firma, 'execute') then
    raise exception 'FALLIDO: authenticated no puede ejecutarla; la pestaña Usuarios no funcionaría'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log
where space_id in ('fc100000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000002');
delete from public.spaces
where id in ('fc100000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000002');
delete from auth.users where id::text like 'fc000000-%';

select 'ficha_del_restaurante.sql: todas las comprobaciones han pasado' as resultado;
