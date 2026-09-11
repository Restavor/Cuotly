-- El historial de un restaurante (maqueta 19) no es una puerta de atrás a
-- la auditoría del espacio.
--
-- Lo que se comprueba aquí es, sobre todo, **lo que la función NO hace**:
-- acotar la auditoría a un restaurante es acotar, no ampliar. La política
-- de `audit_log` (§21.2) sigue decidiendo fila a fila, y por eso las dos
-- funciones son SECURITY INVOKER. Si alguien las convirtiera algún día en
-- SECURITY DEFINER "para que funcionen mejor", esta suite se cae.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/historial_del_restaurante.sql

-- ============================================================
-- Fixture: un espacio, dos restaurantes, y un cliente en el primero.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('be000000-0000-0000-0000-000000000001', 'hist-owner@example.com', 'authenticated', 'authenticated'),
  ('be000000-0000-0000-0000-000000000002', 'hist-cliente@example.com', 'authenticated', 'authenticated'),
  ('be000000-0000-0000-0000-000000000003', 'hist-worker@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('be100000-0000-0000-0000-000000000001', 'Espacio Historial', 'espacio-historial-test',
   'be000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('be100000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('be100000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('be300000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000001', 'Grupo Historial');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('be400000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000001',
   'be300000-0000-0000-0000-000000000001', 'EST-HIST-A', 'Restaurante A', 'active'),
  ('be400000-0000-0000-0000-000000000002', 'be100000-0000-0000-0000-000000000001',
   'be300000-0000-0000-0000-000000000001', 'EST-HIST-B', 'Restaurante B', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('be500000-0000-0000-0000-000000000001', 'be400000-0000-0000-0000-000000000001',
   'be000000-0000-0000-0000-000000000002', 'local_owner');

-- Una solicitud en cada restaurante, para que haya entidades que resolver.
insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by) values
  ('be600000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000001',
   'be400000-0000-0000-0000-000000000001', 'SOL-HIST-1', 'received', 'Cambio del restaurante A',
   'be000000-0000-0000-0000-000000000002'),
  ('be600000-0000-0000-0000-000000000002', 'be100000-0000-0000-0000-000000000001',
   'be400000-0000-0000-0000-000000000002', 'SOL-HIST-2', 'received', 'Cambio del restaurante B',
   'be000000-0000-0000-0000-000000000002');

-- Apuntes de auditoría: dos del restaurante A, uno del B, y uno que no es
-- de ningún restaurante (la configuración del espacio).
insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value) values
  ('be100000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-000000000001',
   'establishment.data_changed', 'establishment', 'be400000-0000-0000-0000-000000000001',
   '{"name": "Restaurante A"}'::jsonb),
  ('be100000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-000000000001',
   'request.state_changed', 'request', 'be600000-0000-0000-0000-000000000001',
   '{"state": "received"}'::jsonb),
  ('be100000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-000000000001',
   'request.state_changed', 'request', 'be600000-0000-0000-0000-000000000002',
   '{"state": "received"}'::jsonb),
  ('be100000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-000000000001',
   'space.settings_changed', 'space', 'be100000-0000-0000-0000-000000000001',
   '{"timezone": "Europe/Madrid"}'::jsonb);

-- ============================================================
-- La propietaria: ve los DOS apuntes del restaurante A, y solo esos.
-- ============================================================
select set_config('request.jwt.claim.sub', 'be000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare v_acciones text;
begin
  select string_agg(action, ' | ' order by action)
  into v_acciones
  from public.establishment_audit('be400000-0000-0000-0000-000000000001');

  if v_acciones is distinct from 'establishment.data_changed | request.state_changed' then
    raise exception 'FALLIDO: el historial del restaurante A trae "%"', coalesce(v_acciones, '(nada)')
      using errcode = 'assert_failure';
  end if;

  -- El apunte del OTRO restaurante no se cuela...
  if exists (
    select 1 from public.establishment_audit('be400000-0000-0000-0000-000000000001') h
    where h.entity_id = 'be600000-0000-0000-0000-000000000002'
  ) then
    raise exception 'FALLIDO: el historial de A trae una solicitud de B'
      using errcode = 'assert_failure';
  end if;

  -- ...y el que no es de ningún restaurante, tampoco.
  if exists (
    select 1 from public.establishment_audit('be400000-0000-0000-0000-000000000001') h
    where h.entity_type = 'space'
  ) then
    raise exception 'FALLIDO: el historial del restaurante trae la configuracion del espacio'
      using errcode = 'assert_failure';
  end if;
end $$;

-- El filtro por familia y el de persona acotan de verdad.
do $$
begin
  if (select count(*) from public.establishment_audit(
        'be400000-0000-0000-0000-000000000001', null, null, 'request')) <> 1 then
    raise exception 'FALLIDO: el filtro por familia no acota' using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.establishment_audit(
        'be400000-0000-0000-0000-000000000001', null, null, null,
        'be000000-0000-0000-0000-000000000003')) <> 0 then
    raise exception 'FALLIDO: el filtro por persona no acota' using errcode = 'assert_failure';
  end if;

  -- El tope de filas es un tope: pedir un millón no trae un millón.
  if (select count(*) from public.establishment_audit(
        'be400000-0000-0000-0000-000000000001', null, null, null, null, 1)) <> 1 then
    raise exception 'FALLIDO: p_limit no limita' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- EL CLIENTE: el historial de SU restaurante no le devuelve nada.
--
-- No es miembro del espacio, así que `audit_log_select` no le deja pasar
-- ni una fila. La función acota; no concede.
-- ============================================================
select set_config('request.jwt.claim.sub', 'be000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.establishment_audit('be400000-0000-0000-0000-000000000001')) <> 0 then
    raise exception 'FALLIDO GRAVE: el cliente lee la auditoria de su restaurante (§21.2)'
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.establishment_audit_actors('be400000-0000-0000-0000-000000000001')) <> 0 then
    raise exception 'FALLIDO GRAVE: el cliente lee quien ha actuado en su restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- El trabajador: ve lo suyo y lo que la política le deja, no todo.
--
-- Ninguno de los apuntes es suyo y no tiene `manage_clients`, así que el
-- de `establishment.data_changed` —clasificado por capacidad— no le
-- corresponde. El de la solicitud depende de si puede ver esa fila.
-- ============================================================
select set_config('request.jwt.claim.sub', 'be000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  if exists (
    select 1 from public.establishment_audit('be400000-0000-0000-0000-000000000001') h
    where h.action = 'establishment.data_changed'
  ) then
    raise exception 'FALLIDO: un trabajador sin manage_clients ve la ficha del cliente en el historial'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · las funciones no pueden ser SECURITY DEFINER, y ese es el
-- punto entero de este archivo.
-- ============================================================
do $$
begin
  if (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'establishment_audit') then
    raise exception 'FALLIDO GRAVE: establishment_audit() es SECURITY DEFINER y se salta la politica de audit_log'
      using errcode = 'assert_failure';
  end if;

  if (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'audit_entity_establishment') then
    raise exception 'FALLIDO GRAVE: audit_entity_establishment() es SECURITY DEFINER'
      using errcode = 'assert_failure';
  end if;

  if (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'establishment_audit_actors') then
    raise exception 'FALLIDO GRAVE: establishment_audit_actors() es SECURITY DEFINER'
      using errcode = 'assert_failure';
  end if;

  if has_function_privilege('anon', 'public.establishment_audit(uuid, timestamptz, timestamptz, text, uuid, integer, integer)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: establishment_audit() esta abierta a anon'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'be100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'be100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'be000000-%';

select 'historial_del_restaurante.sql: todas las comprobaciones han pasado' as resultado;
