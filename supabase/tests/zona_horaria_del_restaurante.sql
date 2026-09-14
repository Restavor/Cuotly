-- Migración 83 · `establishment_timezone()`: la zona horaria del espacio,
-- y solo eso, para las pantallas del restaurante.
--
-- **Qué defiende esta suite.** CLAUDE.md manda calcular las fechas en la
-- zona horaria del espacio. Las pantallas del restaurante no podían
-- cumplirlo —`spaces_select` exige ser miembro del espacio— y tenían
-- `"Europe/Madrid"` escrito en el código, que da la hora correcta
-- mientras Cuotly sea solo Restavor. Por eso el fixture crea un espacio
-- en **Atlantic/Canary**: si la función devolviera el valor por defecto
-- de la columna en vez del del espacio, o si alguien volviera a escribir
-- la zona a mano, aquí se ve. Una suite montada sobre un espacio en
-- Europe/Madrid habría pasado con el fallo dentro.
--
-- Las cuatro comprobaciones:
--   1. El restaurante lee la zona de SU espacio (no la de la columna).
--   2. El equipo del espacio también.
--   3. Un restaurante de otro espacio recibe una excepción, no la zona
--      ajena: es una lectura de `spaces` por la puerta estrecha y tiene
--      que seguir cerrada (P7).
--   4. La función no está abierta a `anon`, y sí a `authenticated`, que
--      es quien la llama (CLAUDE.md: no es interna, comprueba permisos).
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/zona_horaria_del_restaurante.sql

insert into auth.users (id, email, role, aud) values
  ('c6000000-0000-0000-0000-000000000001', 'zona-owner@example.com', 'authenticated', 'authenticated'),
  ('c6000000-0000-0000-0000-000000000002', 'zona-cliente@example.com', 'authenticated', 'authenticated'),
  ('c6000000-0000-0000-0000-000000000003', 'zona-ajeno@example.com', 'authenticated', 'authenticated');

-- Un espacio que NO está en la zona por defecto de la columna: es la
-- única forma de que la comprobación distinga "lee el espacio" de
-- "devuelve Europe/Madrid pase lo que pase".
insert into public.spaces (id, name, slug, timezone, created_by) values
  ('c6100000-0000-0000-0000-000000000001', 'Espacio Canarias', 'espacio-zona-test',
   'Atlantic/Canary', 'c6000000-0000-0000-0000-000000000001'),
  ('c6100000-0000-0000-0000-000000000002', 'Espacio Ajeno', 'espacio-zona-ajeno-test',
   'Europe/Madrid', 'c6000000-0000-0000-0000-000000000003');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('c6100000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('c6100000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000003', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('c6300000-0000-0000-0000-000000000001', 'c6100000-0000-0000-0000-000000000001', 'Grupo Zona');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('c6400000-0000-0000-0000-000000000001', 'c6100000-0000-0000-0000-000000000001',
   'c6300000-0000-0000-0000-000000000001', 'EST-ZON-A', 'Restaurante Canario', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('c6500000-0000-0000-0000-000000000001', 'c6400000-0000-0000-0000-000000000001',
   'c6000000-0000-0000-0000-000000000002', 'local_owner');

-- ============================================================
-- 1 · El restaurante lee la zona de su espacio.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c6000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare v_zona text;
begin
  select public.establishment_timezone('c6400000-0000-0000-0000-000000000001') into v_zona;

  if v_zona is distinct from 'Atlantic/Canary' then
    raise exception 'FALLIDO: el restaurante recibe la zona "%" y su espacio esta en Atlantic/Canary (CLAUDE.md)',
      coalesce(v_zona, '(nulo)') using errcode = 'assert_failure';
  end if;

  -- Y sigue sin poder leer `spaces`: la función es una puerta estrecha,
  -- no una apertura de la tabla (P7).
  if exists (select 1 from public.spaces where id = 'c6100000-0000-0000-0000-000000000001') then
    raise exception 'FALLIDO: el restaurante lee la fila de spaces de su espacio; solo debe ver la zona horaria'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- 2 · El equipo del espacio, lo mismo.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c6000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  if public.establishment_timezone('c6400000-0000-0000-0000-000000000001')
     is distinct from 'Atlantic/Canary' then
    raise exception 'FALLIDO: el equipo del espacio no recibe la zona de su propio restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- 3 · Alguien de otro espacio no saca la zona ajena.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c6000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare v_zona text;
begin
  begin
    select public.establishment_timezone('c6400000-0000-0000-0000-000000000001') into v_zona;
    raise exception 'FALLIDO: un espacio ajeno ha obtenido la zona "%" de un restaurante que no es suyo',
      coalesce(v_zona, '(nulo)') using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      -- La propia aserción de arriba también llega aquí: se distingue por
      -- el texto, para que un fallo no se trague a sí mismo.
      if position('FALLIDO' in sqlerrm) > 0 then
        raise;
      end if;
  end;
end $$;

-- Un restaurante que no existe tampoco filtra nada distinto.
do $$
begin
  begin
    perform public.establishment_timezone('c6400000-0000-0000-0000-0000000000ff');
    raise exception 'FALLIDO: un restaurante inexistente no ha dado excepcion'
      using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if position('FALLIDO' in sqlerrm) > 0 then
        raise;
      end if;
  end;
end $$;

reset role;

-- ============================================================
-- 4 · Quién puede llamarla por RPC.
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.establishment_timezone(uuid)', 'execute') then
    raise exception 'FALLIDO: establishment_timezone() esta abierta a anon (CLAUDE.md)'
      using errcode = 'assert_failure';
  end if;

  -- Y sí a `authenticated`: es quien la llama desde las pantallas, y
  -- revocársela la dejaría inservible en vez de cerrada.
  if not has_function_privilege('authenticated', 'public.establishment_timezone(uuid)', 'execute') then
    raise exception 'FALLIDO: authenticated no puede ejecutar establishment_timezone()'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id in
  ('c6100000-0000-0000-0000-000000000001', 'c6100000-0000-0000-0000-000000000002');
delete from public.spaces where id in
  ('c6100000-0000-0000-0000-000000000001', 'c6100000-0000-0000-0000-000000000002');
delete from auth.users where id::text like 'c6000000-%';

select 'zona_horaria_del_restaurante.sql: todas las comprobaciones han pasado' as resultado;
