-- La prioridad la pone el restaurante, y solo con un plan que la conceda.
--
-- Decisión de producto de Bosco (10/09/2026): "los clientes premium son
-- los únicos que pueden indicar la prioridad, y lo hacen organizando sus
-- cambios por cuál es más importante". Lo que se comprueba aquí es cada
-- una de las tres palabras que llevan carga:
--
--   · **"los únicos"**, literal: ni el propietario del espacio ni un
--     administrador pueden ordenar. Es la comprobación que impide que un
--     `or has_capability(...)` se cuele un día "para poder ayudar al
--     cliente" y convierta la preferencia del cliente en otra cosa.
--   · **"premium"**, entendido como el plan que lo concede y NO como el
--     nombre: un restaurante con plan sin `grants_priority` no ordena, y
--     uno sin plan tampoco.
--   · **"organizando sus cambios"**: es un ORDEN, no una etiqueta. Se
--     comprueba que salen 1..N sin huecos ni empates, y que eso se
--     mantiene cuando se reordena.
--
-- Y las cuatro maneras de romper un orden, que la función rechaza ANTES de
-- escribir nada —media lista reordenada es peor que ninguna—: repetidas,
-- de otro restaurante, en un estado que ya no se ordena, e incompleta.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/prioridad_del_restaurante.sql

-- ============================================================
-- Fixture: un espacio con propietaria; dos restaurantes, uno con plan que
-- concede prioridad y otro con plan que no; y sus clientes.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('bb000000-0000-0000-0000-000000000001', 'pri-owner@example.com', 'authenticated', 'authenticated'),
  ('bb000000-0000-0000-0000-000000000002', 'pri-premium@example.com', 'authenticated', 'authenticated'),
  ('bb000000-0000-0000-0000-000000000003', 'pri-basico@example.com', 'authenticated', 'authenticated'),
  ('bb000000-0000-0000-0000-000000000004', 'pri-consulta@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('bb100000-0000-0000-0000-000000000001', 'Espacio Prioridad', 'espacio-prioridad-test',
   'bb000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('bb100000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'owner', 'active');

-- El plan que la concede se llama aquí "Total" A PROPÓSITO: si la regla
-- estuviera escrita como `name = 'Premium'`, este test la cazaría.
insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium,
   included_large, start_sla_hours, grants_priority) values
  ('bb200000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001',
   'Total', 59900, 25, 24, 5, 1, 24, true),
  ('bb200000-0000-0000-0000-000000000002', 'bb100000-0000-0000-0000-000000000001',
   'Sencillo', 9900, 0, 0, 0, 0, 48, false);

insert into public.groups (id, space_id, name) values
  ('bb300000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001', 'Grupo Prioridad');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('bb400000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001',
   'bb300000-0000-0000-0000-000000000001', 'EST-PRI-A', 'Restaurante Total', 'active'),
  ('bb400000-0000-0000-0000-000000000002', 'bb100000-0000-0000-0000-000000000001',
   'bb300000-0000-0000-0000-000000000001', 'EST-PRI-B', 'Restaurante Sencillo', 'active');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status) values
  ('bb100000-0000-0000-0000-000000000001', 'bb400000-0000-0000-0000-000000000001',
   'plan', 'bb200000-0000-0000-0000-000000000001', 'active'),
  ('bb100000-0000-0000-0000-000000000001', 'bb400000-0000-0000-0000-000000000002',
   'plan', 'bb200000-0000-0000-0000-000000000002', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('bb500000-0000-0000-0000-000000000001', 'bb400000-0000-0000-0000-000000000001',
   'bb000000-0000-0000-0000-000000000002', 'local_owner'),
  ('bb500000-0000-0000-0000-000000000002', 'bb400000-0000-0000-0000-000000000002',
   'bb000000-0000-0000-0000-000000000003', 'local_owner'),
  ('bb500000-0000-0000-0000-000000000003', 'bb400000-0000-0000-0000-000000000001',
   'bb000000-0000-0000-0000-000000000004', 'consulta');

-- Tres cambios pendientes en el restaurante con plan Total, y uno ya
-- publicado que NO se ordena.
insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by) values
  ('bb600000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001',
   'bb400000-0000-0000-0000-000000000001', 'SOL-PRI-1', 'accepted', 'Cambiar la carta',
   'bb000000-0000-0000-0000-000000000002'),
  ('bb600000-0000-0000-0000-000000000002', 'bb100000-0000-0000-0000-000000000001',
   'bb400000-0000-0000-0000-000000000001', 'SOL-PRI-2', 'in_progress', 'Fotos nuevas',
   'bb000000-0000-0000-0000-000000000002'),
  ('bb600000-0000-0000-0000-000000000003', 'bb100000-0000-0000-0000-000000000001',
   'bb400000-0000-0000-0000-000000000001', 'SOL-PRI-3', 'received', 'Horario de agosto',
   'bb000000-0000-0000-0000-000000000002'),
  ('bb600000-0000-0000-0000-000000000004', 'bb100000-0000-0000-0000-000000000001',
   'bb400000-0000-0000-0000-000000000001', 'SOL-PRI-4', 'published', 'Ya publicado',
   'bb000000-0000-0000-0000-000000000002'),
  -- Y uno del OTRO restaurante, para el caso de colar una ajena.
  ('bb600000-0000-0000-0000-000000000005', 'bb100000-0000-0000-0000-000000000001',
   'bb400000-0000-0000-0000-000000000002', 'SOL-PRI-5', 'received', 'Del otro restaurante',
   'bb000000-0000-0000-0000-000000000003');

-- ============================================================
-- El restaurante con plan que lo concede: ordena, y el orden es 1..N.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bb000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_rangos text;
begin
  if not public.client_can_set_priority('bb400000-0000-0000-0000-000000000001') then
    raise exception 'FALLIDO: el propietario local con plan que concede prioridad no puede ordenar'
      using errcode = 'assert_failure';
  end if;

  perform public.set_request_priority_order(
    'bb400000-0000-0000-0000-000000000001',
    array['bb600000-0000-0000-0000-000000000003',
          'bb600000-0000-0000-0000-000000000001',
          'bb600000-0000-0000-0000-000000000002']::uuid[]);

  select string_agg(r.code || '=' || r.priority_rank, ' ' order by r.priority_rank)
  into v_rangos
  from public.requests r
  where r.establishment_id = 'bb400000-0000-0000-0000-000000000001'
    and r.priority_rank is not null;

  -- El array fue [3, 1, 2], asi que ese es el orden que tiene que salir.
  if v_rangos <> 'SOL-PRI-3=1 SOL-PRI-1=2 SOL-PRI-2=3' then
    raise exception 'FALLIDO: el orden ha quedado "%"', v_rangos using errcode = 'assert_failure';
  end if;

  -- El publicado NO se ordena: sigue sin rango.
  if (select priority_rank from public.requests
      where id = 'bb600000-0000-0000-0000-000000000004') is not null then
    raise exception 'FALLIDO: un cambio ya publicado ha recibido un puesto en la cola'
      using errcode = 'assert_failure';
  end if;

  -- Reordenar: el orden nuevo manda entero, sin restos del anterior.
  perform public.set_request_priority_order(
    'bb400000-0000-0000-0000-000000000001',
    array['bb600000-0000-0000-0000-000000000001',
          'bb600000-0000-0000-0000-000000000002',
          'bb600000-0000-0000-0000-000000000003']::uuid[]);

  select string_agg(r.code || '=' || r.priority_rank, ' ' order by r.priority_rank)
  into v_rangos
  from public.requests r
  where r.establishment_id = 'bb400000-0000-0000-0000-000000000001'
    and r.priority_rank is not null;

  if v_rangos <> 'SOL-PRI-1=1 SOL-PRI-2=2 SOL-PRI-3=3' then
    raise exception 'FALLIDO: al reordenar ha quedado "%"', v_rangos using errcode = 'assert_failure';
  end if;
end $$;

-- Las cuatro maneras de romper el orden, todas rechazadas.
do $$
declare v_error text := '';
begin
  begin  -- repetida
    perform public.set_request_priority_order(
      'bb400000-0000-0000-0000-000000000001',
      array['bb600000-0000-0000-0000-000000000001',
            'bb600000-0000-0000-0000-000000000001',
            'bb600000-0000-0000-0000-000000000002']::uuid[]);
    v_error := v_error || ' / una lista con repetidas se ha aceptado';
  exception when others then null; end;

  begin  -- de otro restaurante
    perform public.set_request_priority_order(
      'bb400000-0000-0000-0000-000000000001',
      array['bb600000-0000-0000-0000-000000000001',
            'bb600000-0000-0000-0000-000000000002',
            'bb600000-0000-0000-0000-000000000005']::uuid[]);
    v_error := v_error || ' / una solicitud de otro restaurante se ha aceptado';
  exception when others then null; end;

  begin  -- una ya publicada
    perform public.set_request_priority_order(
      'bb400000-0000-0000-0000-000000000001',
      array['bb600000-0000-0000-0000-000000000001',
            'bb600000-0000-0000-0000-000000000002',
            'bb600000-0000-0000-0000-000000000004']::uuid[]);
    v_error := v_error || ' / una solicitud ya publicada se ha aceptado';
  exception when others then null; end;

  begin  -- incompleta
    perform public.set_request_priority_order(
      'bb400000-0000-0000-0000-000000000001',
      array['bb600000-0000-0000-0000-000000000001',
            'bb600000-0000-0000-0000-000000000002']::uuid[]);
    v_error := v_error || ' / una lista incompleta se ha aceptado';
  exception when others then null; end;

  if v_error <> '' then
    raise exception 'FALLIDO: %', v_error using errcode = 'assert_failure';
  end if;

  -- Y despues de los cuatro intentos, el orden sigue intacto: la funcion
  -- comprueba ANTES de escribir, no a medias.
  if (select string_agg(r.code || '=' || r.priority_rank, ' ' order by r.priority_rank)
      from public.requests r
      where r.establishment_id = 'bb400000-0000-0000-0000-000000000001'
        and r.priority_rank is not null)
     <> 'SOL-PRI-1=1 SOL-PRI-2=2 SOL-PRI-3=3' then
    raise exception 'FALLIDO: un intento rechazado ha dejado el orden a medias'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- El plan que NO la concede: no ordena. Y el plan se llama "Total" y
-- "Sencillo", no "Premium": si la regla mirara el nombre, esto fallaría.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bb000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  if public.client_can_set_priority('bb400000-0000-0000-0000-000000000002') then
    raise exception 'FALLIDO: un plan sin grants_priority deja ordenar'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.set_request_priority_order(
      'bb400000-0000-0000-0000-000000000002',
      array['bb600000-0000-0000-0000-000000000005']::uuid[]);
    raise exception 'FALLIDO: un restaurante sin plan que lo conceda ha ordenado'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- El rol Consulta del restaurante Total tampoco: no escribe en él.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bb000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  if public.client_can_set_priority('bb400000-0000-0000-0000-000000000001') then
    raise exception 'FALLIDO: el rol Consulta puede ordenar los cambios'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- "Los únicos", literal: la PROPIETARIA DEL ESPACIO tampoco.
--
-- Es la comprobación que impide que un día se cuele un
-- `or has_capability(space, 'manage_requests')` "para poder ayudar al
-- cliente": eso convertiría la preferencia del restaurante en una decisión
-- del equipo, que es justo lo contrario de lo que se pidió.
-- ============================================================
select set_config('request.jwt.claim.sub', 'bb000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  if public.client_can_set_priority('bb400000-0000-0000-0000-000000000001') then
    raise exception 'FALLIDO: la propietaria del espacio puede ordenar los cambios de un cliente'
      using errcode = 'assert_failure';
  end if;

  begin
    perform public.set_request_priority_order(
      'bb400000-0000-0000-0000-000000000001',
      array['bb600000-0000-0000-0000-000000000002',
            'bb600000-0000-0000-0000-000000000001',
            'bb600000-0000-0000-0000-000000000003']::uuid[]);
    raise exception 'FALLIDO: la propietaria del espacio ha reordenado los cambios de un cliente'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · privilegios.
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.set_request_priority_order(uuid, uuid[])', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: set_request_priority_order() esta abierta a anon'
      using errcode = 'assert_failure';
  end if;
  if not has_function_privilege('authenticated', 'public.set_request_priority_order(uuid, uuid[])', 'execute') then
    raise exception 'FALLIDO: authenticated no puede ordenar; ninguna pantalla funcionaria'
      using errcode = 'assert_failure';
  end if;
  -- `request_is_rankable()` es interna: no la llama ninguna pantalla.
  if has_function_privilege('authenticated', 'public.request_is_rankable(text)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: request_is_rankable() es interna y esta abierta'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'bb100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'bb100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'bb000000-%';

select 'prioridad_del_restaurante.sql: todas las comprobaciones han pasado' as resultado;
