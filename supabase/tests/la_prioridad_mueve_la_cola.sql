-- El orden del restaurante sigue siendo un orden cuando la vida pasa.
--
-- Encargo de Bosco (11/09/2026): que lo que ordena el restaurante mueva la
-- cola del equipo. Ordenar la bandeja es de la aplicación
-- (`orderTeamJobs()` en `src/core/priority.ts`, con sus tests); lo que se
-- comprueba aquí es la mitad que sin la base de datos no se sostiene: que
-- `priority_rank` signifique de verdad "el puesto que ocupa AHORA entre
-- los cambios pendientes de su restaurante".
--
-- Sin esto, ordenar la bandeja por esa columna sería peor que no
-- ordenarla:
--
--   · un cambio ya publicado conservaba su `1` y se subía al primer
--     puesto de la bandeja empujando hacia abajo lo que sí hay que hacer;
--   · y al salir el 2 de cinco quedaban 1, 3, 4 y 5, con lo que el "Nº 3
--     de sus cambios pendientes" de la ficha del trabajo pasaba a ser
--     mentira: son cuatro y él es el segundo.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/la_prioridad_mueve_la_cola.sql

-- ============================================================
-- Fixture: un espacio, un plan que concede prioridad y dos restaurantes
-- con cambios pendientes.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('bc000000-0000-0000-0000-000000000001', 'cola-owner@example.com', 'authenticated', 'authenticated'),
  ('bc000000-0000-0000-0000-000000000002', 'cola-cliente@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('bc100000-0000-0000-0000-000000000001', 'Espacio Cola', 'espacio-cola-test',
   'bc000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('bc100000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium,
   included_large, start_sla_hours, grants_priority) values
  ('bc200000-0000-0000-0000-000000000001', 'bc100000-0000-0000-0000-000000000001',
   'Con prioridad', 59900, 25, 24, 5, 1, 24, true);

insert into public.groups (id, space_id, name) values
  ('bc300000-0000-0000-0000-000000000001', 'bc100000-0000-0000-0000-000000000001', 'Grupo Cola');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('bc400000-0000-0000-0000-000000000001', 'bc100000-0000-0000-0000-000000000001',
   'bc300000-0000-0000-0000-000000000001', 'EST-COLA-A', 'Restaurante A', 'active'),
  ('bc400000-0000-0000-0000-000000000002', 'bc100000-0000-0000-0000-000000000001',
   'bc300000-0000-0000-0000-000000000001', 'EST-COLA-B', 'Restaurante B', 'active');

insert into public.subscriptions (space_id, establishment_id, kind, plan_id, status) values
  ('bc100000-0000-0000-0000-000000000001', 'bc400000-0000-0000-0000-000000000001',
   'plan', 'bc200000-0000-0000-0000-000000000001', 'active'),
  ('bc100000-0000-0000-0000-000000000001', 'bc400000-0000-0000-0000-000000000002',
   'plan', 'bc200000-0000-0000-0000-000000000001', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('bc500000-0000-0000-0000-000000000001', 'bc400000-0000-0000-0000-000000000001',
   'bc000000-0000-0000-0000-000000000002', 'local_owner'),
  ('bc500000-0000-0000-0000-000000000002', 'bc400000-0000-0000-0000-000000000002',
   'bc000000-0000-0000-0000-000000000002', 'local_owner');

insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by) values
  ('bc600000-0000-0000-0000-000000000001', 'bc100000-0000-0000-0000-000000000001',
   'bc400000-0000-0000-0000-000000000001', 'SOL-COLA-1', 'accepted', 'El más importante',
   'bc000000-0000-0000-0000-000000000002'),
  ('bc600000-0000-0000-0000-000000000002', 'bc100000-0000-0000-0000-000000000001',
   'bc400000-0000-0000-0000-000000000001', 'SOL-COLA-2', 'accepted', 'El segundo',
   'bc000000-0000-0000-0000-000000000002'),
  ('bc600000-0000-0000-0000-000000000003', 'bc100000-0000-0000-0000-000000000001',
   'bc400000-0000-0000-0000-000000000001', 'SOL-COLA-3', 'received', 'El tercero',
   'bc000000-0000-0000-0000-000000000002'),
  ('bc600000-0000-0000-0000-000000000004', 'bc100000-0000-0000-0000-000000000001',
   'bc400000-0000-0000-0000-000000000001', 'SOL-COLA-4', 'received', 'El cuarto',
   'bc000000-0000-0000-0000-000000000002'),
  -- Del otro restaurante, con su propio orden: lo que le pase a uno no le
  -- pasa al otro.
  ('bc600000-0000-0000-0000-000000000005', 'bc100000-0000-0000-0000-000000000001',
   'bc400000-0000-0000-0000-000000000002', 'SOL-COLA-5', 'accepted', 'El primero de B',
   'bc000000-0000-0000-0000-000000000002'),
  ('bc600000-0000-0000-0000-000000000006', 'bc100000-0000-0000-0000-000000000001',
   'bc400000-0000-0000-0000-000000000002', 'SOL-COLA-6', 'accepted', 'El segundo de B',
   'bc000000-0000-0000-0000-000000000002');

-- El restaurante ordena los suyos. **A propósito en un orden distinto del
-- de creación**: si fueran el mismo, un compactado que renumerara por
-- fecha daría el mismo resultado que uno que conserva la decisión del
-- cliente, y esta suite no distinguiría entre los dos.
--   A: el 4 primero, luego el 3, el 1 y el 2.
--   B: el 6 antes que el 5.
select set_config('request.jwt.claim.sub', 'bc000000-0000-0000-0000-000000000002', false);
set role authenticated;

select public.set_request_priority_order(
  'bc400000-0000-0000-0000-000000000001',
  array['bc600000-0000-0000-0000-000000000004',
        'bc600000-0000-0000-0000-000000000003',
        'bc600000-0000-0000-0000-000000000001',
        'bc600000-0000-0000-0000-000000000002']::uuid[]);

select public.set_request_priority_order(
  'bc400000-0000-0000-0000-000000000002',
  array['bc600000-0000-0000-0000-000000000006',
        'bc600000-0000-0000-0000-000000000005']::uuid[]);

reset role;

-- ============================================================
-- Un cambio de estado que NO saca del conjunto ordenable no mueve nada.
-- ============================================================
update public.requests set state = 'analyzing'
where id = 'bc600000-0000-0000-0000-000000000003';

do $$
begin
  if (select string_agg(r.code || '=' || r.priority_rank, ' ' order by r.priority_rank)
      from public.requests r
      where r.establishment_id = 'bc400000-0000-0000-0000-000000000001'
        and r.priority_rank is not null)
     <> 'SOL-COLA-4=1 SOL-COLA-3=2 SOL-COLA-1=3 SOL-COLA-2=4' then
    raise exception 'FALLIDO: pasar de recibida a en análisis ha movido el orden del restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El que el restaurante puso en el puesto 2 se publica: suelta su puesto y
-- los que quedan se compactan a 1, 2, 3 **conservando el orden que puso el
-- cliente**, que no es el de creación.
-- ============================================================
update public.requests set state = 'published'
where id = 'bc600000-0000-0000-0000-000000000003';

do $$
declare v_rangos text;
begin
  if (select priority_rank from public.requests
      where id = 'bc600000-0000-0000-0000-000000000003') is not null then
    raise exception 'FALLIDO: una solicitud publicada conserva su puesto y se cuela en la cola'
      using errcode = 'assert_failure';
  end if;

  select string_agg(r.code || '=' || r.priority_rank, ' ' order by r.priority_rank)
  into v_rangos
  from public.requests r
  where r.establishment_id = 'bc400000-0000-0000-0000-000000000001'
    and r.priority_rank is not null;

  -- Los puestos 1, 3 y 4 pasan a ser 1, 2 y 3: sin huecos y en el mismo
  -- orden relativo. Un compactado que renumerara por fecha de creación en
  -- vez de por el puesto daría 'SOL-COLA-1=1 SOL-COLA-2=2 SOL-COLA-4=3',
  -- así que esta línea sí distingue entre conservar la decisión del
  -- cliente y perderla.
  if v_rangos <> 'SOL-COLA-4=1 SOL-COLA-1=2 SOL-COLA-2=3' then
    raise exception 'FALLIDO: al publicarse el que estaba el segundo, el orden ha quedado en "%"', v_rangos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Y el otro restaurante sigue exactamente igual: compactar uno no toca al
-- vecino.
-- ============================================================
do $$
begin
  if (select string_agg(r.code || '=' || r.priority_rank, ' ' order by r.priority_rank)
      from public.requests r
      where r.establishment_id = 'bc400000-0000-0000-0000-000000000002'
        and r.priority_rank is not null)
     <> 'SOL-COLA-6=1 SOL-COLA-5=2' then
    raise exception 'FALLIDO: compactar un restaurante ha movido el orden de otro'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- También sale del orden lo que se rechaza: no solo lo que se termina.
-- ============================================================
update public.requests set state = 'rejected'
where id = 'bc600000-0000-0000-0000-000000000004';

do $$
declare v_rangos text;
begin
  select string_agg(r.code || '=' || r.priority_rank, ' ' order by r.priority_rank)
  into v_rangos
  from public.requests r
  where r.establishment_id = 'bc400000-0000-0000-0000-000000000001'
    and r.priority_rank is not null;

  if v_rangos <> 'SOL-COLA-1=1 SOL-COLA-2=2' then
    raise exception 'FALLIDO: al rechazarse el primero, el orden ha quedado en "%"', v_rangos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Y cuando no queda ninguno, no queda ningún puesto suelto.
-- ============================================================
update public.requests set state = 'published'
where id in ('bc600000-0000-0000-0000-000000000001', 'bc600000-0000-0000-0000-000000000002');

do $$
begin
  if exists (select 1 from public.requests
             where establishment_id = 'bc400000-0000-0000-0000-000000000001'
               and priority_rank is not null) then
    raise exception 'FALLIDO: sin cambios pendientes queda algún puesto sin soltar'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Después de todo eso, el restaurante puede volver a ordenar: el orden no
-- se ha quedado en un estado del que no se pueda salir.
-- ============================================================
insert into public.requests
  (id, space_id, establishment_id, code, state, description, created_by) values
  ('bc600000-0000-0000-0000-000000000007', 'bc100000-0000-0000-0000-000000000001',
   'bc400000-0000-0000-0000-000000000001', 'SOL-COLA-7', 'received', 'Uno nuevo',
   'bc000000-0000-0000-0000-000000000002');

select set_config('request.jwt.claim.sub', 'bc000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  perform public.set_request_priority_order(
    'bc400000-0000-0000-0000-000000000001',
    array['bc600000-0000-0000-0000-000000000007']::uuid[]);

  if (select priority_rank from public.requests
      where id = 'bc600000-0000-0000-0000-000000000007') <> 1 then
    raise exception 'FALLIDO: el restaurante no puede volver a ordenar después de vaciarse la lista'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · la función del disparador es interna: nadie la llama por RPC.
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.compact_request_priority_order()', 'execute')
     or has_function_privilege('authenticated', 'public.compact_request_priority_order()', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: compact_request_priority_order() está abierta por RPC'
      using errcode = 'assert_failure';
  end if;

  -- Y el disparador existe: sin él la función no la llama nadie y todo lo
  -- anterior habría pasado por casualidad.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.requests'::regclass
      and tgname = 'requests_compact_priority'
      and not tgisinternal
  ) then
    raise exception 'FALLIDO: el disparador requests_compact_priority no está'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'bc100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'bc100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'bc000000-%';

select 'la_prioridad_mueve_la_cola.sql: todas las comprobaciones han pasado' as resultado;
