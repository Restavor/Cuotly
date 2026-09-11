-- Dar acceso a un restaurante (RN-EST-04, RN-EST-11, RN-FIN-07).
--
-- Lo que se comprueba, y lo tercero es lo que más:
--
--   · Que lo dé quien puede y nadie más.
--   · Que los permisos finos se normalicen según el rol en vez de creerse
--     lo que le manden: un Consulta con `view_billing` sería RN-FIN-07
--     roto desde la propia función que lo concede.
--   · Que devolverle el acceso a quien lo tuvo **reutilice su membresía**,
--     no cree otra. La actividad histórica cuelga de esa fila (RN-EST-05):
--     una fila nueva la dejaría huérfana, y además la tabla tiene
--     `unique (establishment_id, user_id)`, así que el intento acabaría en
--     un error de clave duplicada que no le dice nada a nadie.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dar_acceso_a_un_restaurante.sql

insert into auth.users (id, email, role, aud) values
  ('c0000000-0000-0000-0000-000000000001', 'acceso-owner@example.com', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000002', 'acceso-worker@example.com', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000003', 'Acceso-Nuevo@Example.com', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-000000000004', 'acceso-vuelve@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('c0100000-0000-0000-0000-000000000001', 'Espacio Acceso', 'espacio-acceso-test',
   'c0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('c0100000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('c0100000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('c0300000-0000-0000-0000-000000000001', 'c0100000-0000-0000-0000-000000000001', 'Grupo Acceso');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('c0400000-0000-0000-0000-000000000001', 'c0100000-0000-0000-0000-000000000001',
   'c0300000-0000-0000-0000-000000000001', 'EST-ACC-A', 'Restaurante A', 'active'),
  ('c0400000-0000-0000-0000-000000000002', 'c0100000-0000-0000-0000-000000000001',
   'c0300000-0000-0000-0000-000000000001', 'EST-ACC-B', 'Restaurante B', 'active'),
  -- Un archivado, que NO debe entrar en "todos los actuales".
  ('c0400000-0000-0000-0000-000000000003', 'c0100000-0000-0000-0000-000000000001',
   'c0300000-0000-0000-0000-000000000001', 'EST-ACC-C', 'Restaurante C', 'archived');

-- Alguien que tuvo acceso y se le retiró.
insert into public.establishment_memberships (id, establishment_id, user_id, role, revoked_at, revoked_by) values
  ('c0500000-0000-0000-0000-000000000001', 'c0400000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000004', 'consulta', now() - interval '1 day',
   'c0000000-0000-0000-0000-000000000001');

-- ============================================================
-- La propietaria da acceso. El correo NO distingue mayúsculas.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_membresia uuid;
  v_rol text;
  v_edit boolean;
  v_billing boolean;
begin
  v_membresia := public.grant_establishment_access(
    'c0400000-0000-0000-0000-000000000001', 'acceso-nuevo@example.com', 'editor', true, true);

  select em.role, ep.edit_establishment_data, ep.view_billing
  into v_rol, v_edit, v_billing
  from public.establishment_memberships em
  join public.establishment_permissions ep on ep.establishment_membership_id = em.id
  where em.id = v_membresia;

  if v_rol <> 'editor' or not v_edit or not v_billing then
    raise exception 'FALLIDO: el editor no ha recibido sus permisos (rol=% editar=% facturacion=%)',
      v_rol, v_edit, v_billing using errcode = 'assert_failure';
  end if;

  -- Y aparece en la lista que lee la pestaña Usuarios.
  if not exists (
    select 1 from public.establishment_client_users('c0400000-0000-0000-0000-000000000001') u
    where u.user_id = 'c0000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'FALLIDO: quien acaba de recibir el acceso no sale en la ficha'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Los permisos finos se NORMALIZAN: no vale pedirlos para un Consulta.
-- ============================================================
do $$
declare v_edit boolean; v_billing boolean;
begin
  perform public.grant_establishment_access(
    'c0400000-0000-0000-0000-000000000002', 'acceso-nuevo@example.com', 'consulta', true, true);

  select ep.edit_establishment_data, ep.view_billing into v_edit, v_billing
  from public.establishment_memberships em
  join public.establishment_permissions ep on ep.establishment_membership_id = em.id
  where em.establishment_id = 'c0400000-0000-0000-0000-000000000002'
    and em.user_id = 'c0000000-0000-0000-0000-000000000003';

  if v_edit or v_billing then
    raise exception 'FALLIDO: un Consulta ha recibido permisos finos (editar=% facturacion=%) — RN-FIN-07',
      v_edit, v_billing using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Devolver el acceso REUTILIZA la membresía: la historia cuelga de ella.
-- ============================================================
do $$
declare v_membresia uuid; v_cuantas integer;
begin
  v_membresia := public.grant_establishment_access(
    'c0400000-0000-0000-0000-000000000001', 'acceso-vuelve@example.com', 'editor', false, false);

  if v_membresia <> 'c0500000-0000-0000-0000-000000000001' then
    raise exception 'FALLIDO: devolver el acceso ha creado una membresia nueva y ha dejado huerfana la actividad (RN-EST-05)'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_cuantas from public.establishment_memberships
  where establishment_id = 'c0400000-0000-0000-0000-000000000001'
    and user_id = 'c0000000-0000-0000-0000-000000000004';

  if v_cuantas <> 1 then
    raise exception 'FALLIDO: hay % membresias para la misma persona en el mismo restaurante', v_cuantas
      using errcode = 'assert_failure';
  end if;

  if (select revoked_at from public.establishment_memberships where id = v_membresia) is not null then
    raise exception 'FALLIDO: el acceso devuelto sigue marcado como retirado'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Quien no tiene cuenta NO se añade a medias.
-- ============================================================
do $$
declare v_error text := '';
begin
  begin
    perform public.grant_establishment_access(
      'c0400000-0000-0000-0000-000000000001', 'nadie@example.com', 'editor');
    v_error := 'se ha dado acceso a un correo sin cuenta';
  exception when others then
      -- Comprobar POR QUÉ falló. Tragarse cualquier error hace que el
      -- test pase también cuando la llamada revienta por un motivo
      -- que no es el que se está probando — un uuid mal escrito, una
      -- fila que no existe— y entonces no prueba nada.
    if sqlerrm not like '%cuenta de Cuotly%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- "Todos los actuales": los de hoy, sin el archivado y sin los futuros.
-- ============================================================
do $$
declare v_cuantos integer;
begin
  v_cuantos := public.grant_group_current_establishments_access(
    'c0300000-0000-0000-0000-000000000001', 'acceso-vuelve@example.com', 'consulta');

  if v_cuantos <> 2 then
    raise exception 'FALLIDO: "todos los actuales" ha tocado % restaurantes y hay 2 sin archivar', v_cuantos
      using errcode = 'assert_failure';
  end if;

end $$;

reset role;

-- Un restaurante NUEVO no hereda el acceso: eso es el "y futuros" de
-- RN-EST-04, que NO está construido. Si algún día lo está, esta
-- comprobación es la que hay que cambiar a propósito.
--
-- El alta va fuera de `set role authenticated` porque `establishments` se
-- quedó sin política de INSERT en la migración 58: se da de alta con
-- `create_establishment_with_data()`, y aquí solo hace falta la fila.
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('c0400000-0000-0000-0000-000000000004', 'c0100000-0000-0000-0000-000000000001',
   'c0300000-0000-0000-0000-000000000001', 'EST-ACC-D', 'Restaurante D', 'active');

do $$
begin
  if (select count(*) from public.establishment_memberships
      where establishment_id = 'c0400000-0000-0000-0000-000000000004') <> 0 then
    raise exception 'FALLIDO: un restaurante nuevo ha heredado un acceso, y "y futuros" no esta construido'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Un trabajador no da accesos.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare v_error text := '';
begin
  begin
    perform public.grant_establishment_access(
      'c0400000-0000-0000-0000-000000000002', 'acceso-nuevo@example.com', 'local_owner');
    v_error := 'un trabajador ha dado acceso a un restaurante';
  exception when others then
      -- Comprobar POR QUÉ falló. Tragarse cualquier error hace que el
      -- test pase también cuando la llamada revienta por un motivo
      -- que no es el que se está probando — un uuid mal escrito, una
      -- fila que no existe— y entonces no prueba nada.
    if sqlerrm not like '%Solo el propietario o un administrador%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  begin
    perform public.grant_group_current_establishments_access(
      'c0300000-0000-0000-0000-000000000001', 'acceso-nuevo@example.com', 'consulta');
    v_error := v_error || ' / un trabajador ha dado acceso a un grupo entero';
  exception when others then
      -- Comprobar POR QUÉ falló. Tragarse cualquier error hace que el
      -- test pase también cuando la llamada revienta por un motivo
      -- que no es el que se está probando — un uuid mal escrito, una
      -- fila que no existe— y entonces no prueba nada.
    if sqlerrm not like '%Solo el propietario o un administrador%' then
      v_error := v_error || ' / ha fallado por otro motivo: ' || sqlerrm;
    end if;
  end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · privilegios.
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.grant_establishment_access(uuid, text, text, boolean, boolean)', 'execute')
     or has_function_privilege('anon', 'public.grant_group_current_establishments_access(uuid, text, text, boolean, boolean)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: alguna funcion de dar acceso esta abierta a anon'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'c0100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'c0100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'c0000000-%';

select 'dar_acceso_a_un_restaurante.sql: todas las comprobaciones han pasado' as resultado;
