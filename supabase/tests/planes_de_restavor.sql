-- Los planes de mantenimiento de Restavor (migraciones 96, 146 y 148;
-- PRD §6.1, RN-COM-01 a 03, RN-COM-08 y RN-COM-27; decisiones 39, 83 y 84).
--
--   · §6.1: desde el 26/09/2026 (decisión 84) `create_restavor_space()`
--     siembra solo Básico, Impulso y Premium, con los números de sus
--     fichas, y Menú Diario con sus dos precios.
--   · RN-COM-01: Básico no incluye ningún cambio.
--   · RN-COM-02: ningún plan de Restavor incluye ya un cambio grande (solo
--     lo incluía Premium+, que se archiva).
--   · RN-COM-03: ninguno concede ya la prioridad; ordenar los cambios
--     propios es de Premium; el turno, Premium delante de Impulso y el
--     Básico por detrás de todos.
--   · RN-SLA-02: Básico e Impulso arrancan a 48 h; Premium a 24.
--   · RN-COM-08: el precio reducido de Menú Diario sale solo con un plan que
--     conceda la prioridad (`grants_priority`), que ya no es ninguno del
--     catálogo; se prueba con un plan de prueba que la tiene.
--   · La migración de datos: un espacio con el catálogo del Hito 2 queda
--     con Impulso+ y Premium+ (las mismas filas, mismas suscripciones) y
--     con Impulso y Premium nuevos; repetirla no duplica nada, y no toca
--     Básico ni un plan de otro nombre.
--   · La ficha del Básico del 26/09/2026 (migración 146, decisión 83):
--     20 € + IVA, informe trimestral (RN-REP-32) y por detrás de todos en
--     la cola (RN-COM-03). La función que lo aplica es idempotente, no
--     toca lo que no toca y se para si alguien tiene ya un plan que cambia
--     (RN-COM-20).
--   · Migración 148 (decisión 84): Impulso+ y Premium+ se archivan
--     (RN-COM-27): nadie los contrata, quien los tiene los conserva, nada
--     se borra, y aplicarla dos veces no hace nada más.
--   · La guía del centro de ayuda nombra solo Básico, Impulso y Premium.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/planes_de_restavor.sql

-- Bosco: el correo que reconoce `is_platform_owner()`. Mismo id que en las
-- suites de plataforma, que lo dejan creado si corren antes que esta.
insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('ffd00000-0000-0000-0000-000000000002', 'planes-propietaria@example.com', 'authenticated', 'authenticated');

create temp table pr_ids (k text primary key, v uuid);
grant select, insert, update on pr_ids to authenticated, service_role;

-- ============================================================
-- §6.1 · La semilla de Restavor
-- ============================================================
select set_config('request.jwt.claim.sub', 'ffb00000-0000-0000-0000-000000000001', false);
-- RN-ADM-02: el sombrero de plataforma solo existe en dos pasos.
select set_config('request.jwt.claim.aal', 'aal2', false);
set role authenticated;
do $$
declare
  v_space uuid;
  v_n integer;
  r record;
begin
  v_space := public.create_restavor_space();
  insert into pr_ids values ('restavor', v_space);

  select count(*) into v_n from public.plans where space_id = v_space;
  if v_n <> 3 then
    raise exception '§6.1 FALLIDO: Restavor debía nacer con 3 planes y tiene %', v_n using errcode = 'assert_failure';
  end if;

  -- Decisión 84 · Impulso+ y Premium+ ya no se siembran.
  if exists (select 1 from public.plans where space_id = v_space and name in ('Impulso+', 'Premium+')) then
    raise exception '§6.1 FALLIDO: Restavor nace con Impulso+ o Premium+ (decisión 84)' using errcode = 'assert_failure';
  end if;

  -- Cada plan, con los números de su ficha (precio, pequeños,
  -- fotográficos, medianos, grandes, plazo de inicio, prioridad).
  for r in
    select * from (values
      -- Decisión 83 · la ficha del Básico del 26/09/2026: 20 €.
      ('Básico',    2000,  0,  0, 0, 0, 48, false),
      ('Impulso',  29900,  6,  6, 1, 0, 48, false),
      ('Premium',  49900, 10, 12, 2, 0, 24, false)
    ) as f(name, price, small, photo, medium, large, sla, priority)
  loop
    if not exists (
      select 1 from public.plans p
      where p.space_id = v_space and p.name = r.name
        and p.price_cents = r.price
        and p.included_small = r.small and p.included_photo = r.photo
        and p.included_medium = r.medium and p.included_large = r.large
        and p.start_sla_hours = r.sla and p.grants_priority = r.priority
    ) then
      raise exception '§6.1 FALLIDO: el plan % no coincide con su ficha', r.name using errcode = 'assert_failure';
    end if;
  end loop;

  -- RN-COM-01 · Básico no incluye nada.
  if (select included_small + included_photo + included_medium + included_large
      from public.plans where space_id = v_space and name = 'Básico') <> 0 then
    raise exception 'RN-COM-01 FALLIDO: Básico incluye algún cambio' using errcode = 'assert_failure';
  end if;

  -- RN-COM-02 · el cambio grande solo lo incluía Premium+; archivado
  -- (decisión 84), ya no lo incluye ningún plan de Restavor.
  if exists (select 1 from public.plans where space_id = v_space and included_large > 0) then
    raise exception 'RN-COM-02 FALLIDO: un plan de Restavor incluye cambios grandes sin que ninguna ficha lo diga' using errcode = 'assert_failure';
  end if;

  -- RN-COM-03 · las TRES cosas que el plan decide, desde la decisión 55
  -- (19/09/2026). Hasta entonces salían de un solo booleano y por eso se
  -- comprueban juntas: separarlas mal es lo que le daría a Premium el
  -- precio rebajado de Menú Diario sin que nadie lo decidiera.

  -- 1 · El plan alto era solo Premium+. De ahí cuelgan el precio de Menú
  --     Diario (RN-COM-08) y las oportunidades avanzadas (RN-OPP). Con
  --     Premium+ archivado no lo es ninguno: dárselo a Premium sería
  --     decidir por Bosco.
  if exists (select 1 from public.plans where space_id = v_space and grants_priority) then
    raise exception 'RN-COM-03 FALLIDO: un plan de Restavor concede la prioridad sin que ninguna ficha lo diga' using errcode = 'assert_failure';
  end if;

  -- 2 · Ordenar los cambios propios: Premium (19/09/2026; Premium+ ya no
  --     está).
  if (select string_agg(name, ',' order by name) from public.plans
      where space_id = v_space and can_order_requests) is distinct from 'Premium' then
    raise exception 'RN-COM-03 FALLIDO: ordenar los cambios propios no es exactamente de Premium'
      using errcode = 'assert_failure';
  end if;

  -- 3 · El turno: Premium por delante de los planes de abajo.
  if (select queue_rank from public.plans where space_id = v_space and name = 'Premium')
     <= (select max(queue_rank) from public.plans
         where space_id = v_space and name in ('Básico', 'Impulso')) then
    raise exception 'RN-COM-03 FALLIDO: Premium no se atiende antes que los planes de abajo' using errcode = 'assert_failure';
  end if;

  -- Decisión 83 · "las solicitudes del Plan Básico tendrán prioridad
  -- inferior a los planes Impulso y Premium". Por detrás de todos, y en
  -- el 0, que es el turno de quien no tiene plan (RN-COM-12).
  if (select queue_rank from public.plans where space_id = v_space and name = 'Básico') <> 0
     or (select min(queue_rank) from public.plans where space_id = v_space and name <> 'Básico') <= 0 then
    raise exception 'RN-COM-03 FALLIDO: el Básico no va por detrás de Impulso y Premium' using errcode = 'assert_failure';
  end if;

  -- RN-REP-32 · el Básico recibe su informe cada trimestre; los demás,
  -- cada mes.
  if (select string_agg(name, ',' order by name) from public.plans
      where space_id = v_space and report_period = 'quarter') is distinct from 'Básico' then
    raise exception 'RN-REP-32 FALLIDO: el informe trimestral no es exactamente del Básico' using errcode = 'assert_failure';
  end if;

  -- RN-SLA-02 · Básico e Impulso a 48 h; Premium a 24.
  if (select string_agg(name, ',' order by name) from public.plans
      where space_id = v_space and start_sla_hours = 24) is distinct from 'Premium' then
    raise exception 'RN-SLA-02 FALLIDO: las 24 h no son exactamente de Premium' using errcode = 'assert_failure';
  end if;

  -- RN-SLA-18 (decisión 61) · los plazos de realización cortos (48, 48, 72
  -- y 96 h) eran solo de Premium+; los tres que quedan tienen los de la
  -- tabla de RN-SLA-12.
  if exists (
    select 1 from public.plans
    where space_id = v_space
      and (execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large)
          is distinct from (72, 72, 72, 120)
  ) then
    raise exception 'RN-SLA-18 FALLIDO: un plan de Restavor no tiene los plazos de RN-SLA-12' using errcode = 'assert_failure';
  end if;

  -- RN-INT-10 (decisión 60) · la vigilancia de reseñas la concede el plan,
  -- y en Restavor era solo Premium+: ya no la concede ninguno.
  if exists (select 1 from public.plans where space_id = v_space and watches_reviews) then
    raise exception 'RN-INT-10 FALLIDO: un plan de Restavor vigila reseñas sin que ninguna ficha lo diga' using errcode = 'assert_failure';
  end if;

  -- RN-COM-08 a 10 · Menú Diario: 229 € y 199 €, 30 actualizaciones.
  if not exists (
    select 1 from public.services
    where space_id = v_space and kind = 'daily_menu'
      and price_cents = 22900 and price_premium_cents = 19900 and included_updates = 30
  ) then
    raise exception 'RN-COM-08 FALLIDO: Menú Diario no tiene 229 € / 199 € y 30 actualizaciones' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-COM-08 · el precio reducido de Menú Diario sale solo con el plan que
-- concede la prioridad
--
-- Un restaurante con Premium (499 €) o con Impulso paga 229 €. Es lo que
-- Bosco subrayó como MUY IMPORTANTE: los planes sin prioridad no tienen
-- descuento en Menú Diario. Hasta el 26/09/2026 el que la concedía era
-- Premium+; archivado (decisión 84), el catálogo ya no tiene ninguno, así
-- que el mecanismo se prueba con un plan de prueba que la tiene.
-- ============================================================
insert into public.space_memberships (space_id, user_id, role, status) values
  ((select v from pr_ids where k = 'restavor'), 'ffd00000-0000-0000-0000-000000000002', 'admin', 'active');

-- Turno 3, por delante de todos: si empatara con el Básico, la ficha del
-- Básico de abajo lo querría subir y se pararía por tener restaurante.
insert into public.plans
  (space_id, name, price_cents, included_small, included_photo, included_medium, included_large,
   start_sla_hours, grants_priority, queue_rank)
values
  ((select v from pr_ids where k = 'restavor'), 'Plan de prueba con prioridad', 59900, 25, 24, 5, 1, 24, true, 3);

insert into public.groups (id, space_id, name) values
  ('ffd30000-0000-0000-0000-000000000001', (select v from pr_ids where k = 'restavor'), 'Grupo Planes');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ffd40000-0000-0000-0000-000000000001', (select v from pr_ids where k = 'restavor'),
   'ffd30000-0000-0000-0000-000000000001', 'PLN-0001', 'Casa Premium', 'active'),
  ('ffd40000-0000-0000-0000-000000000002', (select v from pr_ids where k = 'restavor'),
   'ffd30000-0000-0000-0000-000000000001', 'PLN-0002', 'Casa Prioridad', 'active'),
  ('ffd40000-0000-0000-0000-000000000003', (select v from pr_ids where k = 'restavor'),
   'ffd30000-0000-0000-0000-000000000001', 'PLN-0003', 'Casa Impulso', 'active');

select set_config('request.jwt.claim.sub', 'ffd00000-0000-0000-0000-000000000002', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
set role authenticated;
do $$
declare
  v_space uuid := (select v from pr_ids where k = 'restavor');
  v_service uuid := (select id from public.services where space_id = v_space and kind = 'daily_menu');
  v_sub uuid;
  v_base integer;
  v_premium boolean;
begin
  perform public.create_plan_subscription('ffd40000-0000-0000-0000-000000000001',
    (select id from public.plans where space_id = v_space and name = 'Premium'));
  perform public.create_plan_subscription('ffd40000-0000-0000-0000-000000000002',
    (select id from public.plans where space_id = v_space and name = 'Plan de prueba con prioridad'));
  perform public.create_plan_subscription('ffd40000-0000-0000-0000-000000000003',
    (select id from public.plans where space_id = v_space and name = 'Impulso'));

  -- Premium (499 €): Menú Diario a 229 €.
  v_sub := public.create_service_subscription('ffd40000-0000-0000-0000-000000000001', v_service);
  select base_cents, premium_applied into v_base, v_premium from public.service_monthly_price(v_sub);
  if v_base <> 22900 or v_premium then
    raise exception 'RN-COM-08 FALLIDO: con Premium (499 €) Menú Diario debía costar 22900 sin descuento y es % (descuento: %)', v_base, v_premium using errcode = 'assert_failure';
  end if;

  -- Impulso (299 €): también 229 €.
  v_sub := public.create_service_subscription('ffd40000-0000-0000-0000-000000000003', v_service);
  select base_cents, premium_applied into v_base, v_premium from public.service_monthly_price(v_sub);
  if v_base <> 22900 or v_premium then
    raise exception 'RN-COM-08 FALLIDO: con Impulso Menú Diario debía costar 22900 sin descuento y es %', v_base using errcode = 'assert_failure';
  end if;

  -- El plan que concede la prioridad: 199 €, y el apunte lo dice.
  v_sub := public.create_service_subscription('ffd40000-0000-0000-0000-000000000002', v_service);
  select base_cents, premium_applied into v_base, v_premium from public.service_monthly_price(v_sub);
  if v_base <> 19900 or not v_premium then
    raise exception 'RN-COM-08 FALLIDO: con un plan que concede la prioridad Menú Diario debía costar 19900 y es %', v_base using errcode = 'assert_failure';
  end if;

  -- RN-OPP-08 · Premium ve las básicas; el plan con prioridad, también las
  -- avanzadas.
  if public.client_opportunity_access('ffd40000-0000-0000-0000-000000000001') <> 'basic' then
    raise exception 'RN-OPP-08 FALLIDO: Premium (499 €) debía ver solo las básicas' using errcode = 'assert_failure';
  end if;
  if public.client_opportunity_access('ffd40000-0000-0000-0000-000000000002') <> 'advanced' then
    raise exception 'RN-OPP-08 FALLIDO: el plan que concede la prioridad debía ver también las avanzadas' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- La migración de datos: del catálogo del Hito 2 al de las cuatro fichas
--
-- Un espacio de prueba con los tres planes viejos y una suscripción al
-- Impulso viejo. Después de la función, esa suscripción apunta a la misma
-- fila, ahora llamada Impulso+, y el espacio tiene cinco planes.
-- ============================================================
insert into public.spaces (id, name, slug, timezone, created_by) values
  ('ffd10000-0000-0000-0000-000000000009', 'Espacio Hito 2', 'planes-hito2', 'Europe/Madrid',
   'ffd00000-0000-0000-0000-000000000002');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours, grants_priority) values
  ('ffd20000-0000-0000-0000-000000000001', 'ffd10000-0000-0000-0000-000000000009', 'Básico', 9900, 0, 0, 0, 0, 48, false),
  ('ffd20000-0000-0000-0000-000000000002', 'ffd10000-0000-0000-0000-000000000009', 'Impulso', 39900, 16, 12, 3, 0, 24, false),
  ('ffd20000-0000-0000-0000-000000000003', 'ffd10000-0000-0000-0000-000000000009', 'Premium', 59900, 25, 24, 5, 1, 24, true),
  -- Un plan propio del espacio, con otro nombre: no se toca.
  ('ffd20000-0000-0000-0000-000000000004', 'ffd10000-0000-0000-0000-000000000009', 'Total', 79900, 40, 40, 8, 2, 24, false);

do $$
declare
  v_space uuid := 'ffd10000-0000-0000-0000-000000000009';
  v_n integer;
begin
  perform public.upgrade_restavor_plan_catalogue(v_space);

  -- Las filas viejas son las nuevas: mismo id, otro nombre.
  if (select name from public.plans where id = 'ffd20000-0000-0000-0000-000000000002') <> 'Impulso+' then
    raise exception 'MIGRACIÓN 96 FALLIDA: el Impulso del Hito 2 no pasó a llamarse Impulso+' using errcode = 'assert_failure';
  end if;
  if (select name from public.plans where id = 'ffd20000-0000-0000-0000-000000000003') <> 'Premium+' then
    raise exception 'MIGRACIÓN 96 FALLIDA: el Premium del Hito 2 no pasó a llamarse Premium+' using errcode = 'assert_failure';
  end if;
  -- Y con las mismas condiciones.
  if not exists (select 1 from public.plans where id = 'ffd20000-0000-0000-0000-000000000003'
                 and price_cents = 59900 and included_large = 1 and grants_priority) then
    raise exception 'MIGRACIÓN 96 FALLIDA: renombrar cambió las condiciones de Premium+' using errcode = 'assert_failure';
  end if;

  -- Los nuevos existen, con su ficha.
  if not exists (select 1 from public.plans where space_id = v_space and name = 'Impulso'
                 and price_cents = 29900 and included_small = 6 and included_photo = 6
                 and included_medium = 1 and included_large = 0 and start_sla_hours = 48 and not grants_priority) then
    raise exception 'MIGRACIÓN 96 FALLIDA: falta el Impulso nuevo (299 €)' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.plans where space_id = v_space and name = 'Premium'
                 and price_cents = 49900 and included_small = 10 and included_photo = 12
                 and included_medium = 2 and included_large = 0 and start_sla_hours = 24 and not grants_priority) then
    raise exception 'MIGRACIÓN 96 FALLIDA: falta el Premium nuevo (499 €)' using errcode = 'assert_failure';
  end if;

  -- Básico y el plan propio, intactos.
  if (select name || '/' || price_cents from public.plans where id = 'ffd20000-0000-0000-0000-000000000001') <> 'Básico/9900'
     or (select name || '/' || price_cents from public.plans where id = 'ffd20000-0000-0000-0000-000000000004') <> 'Total/79900' then
    raise exception 'MIGRACIÓN 96 FALLIDA: tocó un plan que no era suyo' using errcode = 'assert_failure';
  end if;

  -- Seis planes: los cuatro de antes más los dos nuevos.
  select count(*) into v_n from public.plans where space_id = v_space;
  if v_n <> 6 then
    raise exception 'MIGRACIÓN 96 FALLIDA: esperaba 6 planes y hay %', v_n using errcode = 'assert_failure';
  end if;

  -- Idempotente (CA-17): repetirla no crea nada.
  perform public.upgrade_restavor_plan_catalogue(v_space);
  if (select count(*) from public.plans where space_id = v_space) <> 6 then
    raise exception 'MIGRACIÓN 96 FALLIDA: aplicarla dos veces duplica planes' using errcode = 'assert_failure';
  end if;

  -- Y sobre un espacio sembrado con el catálogo de hoy (Restavor),
  -- tampoco: ni resucita Impulso+ ni Premium+.
  select count(*) into v_n from public.plans where space_id = (select v from pr_ids where k = 'restavor');
  perform public.upgrade_restavor_plan_catalogue((select v from pr_ids where k = 'restavor'));
  if (select count(*) from public.plans where space_id = (select v from pr_ids where k = 'restavor')) <> v_n then
    raise exception 'MIGRACIÓN 96 FALLIDA: sobre Restavor recién sembrado añadió planes' using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md · es interna: cerrada por RPC a anon y a authenticated, no
  -- solo a public.
  if has_function_privilege('anon', 'public.upgrade_restavor_plan_catalogue(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.upgrade_restavor_plan_catalogue(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: upgrade_restavor_plan_catalogue está abierta por RPC' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Migración 146 · la ficha del Básico sobre un espacio con el catálogo
-- anterior (decisión 83)
--
-- El espacio de prueba de arriba acaba con Básico a 99 € y todos los
-- planes en el turno 0, que es como estaba Restavor el 26/09/2026.
-- ============================================================
insert into public.groups (id, space_id, name) values
  ('ffd30000-0000-0000-0000-000000000009', 'ffd10000-0000-0000-0000-000000000009', 'Grupo Hito 2');
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ffd40000-0000-0000-0000-000000000009', 'ffd10000-0000-0000-0000-000000000009',
   'ffd30000-0000-0000-0000-000000000009', 'PLN-0009', 'Casa Total', 'active');

do $$
declare
  v_space uuid := 'ffd10000-0000-0000-0000-000000000009';
  v_basico uuid := 'ffd20000-0000-0000-0000-000000000001';
begin
  -- RN-COM-20 · si alguien tiene un plan cuyo turno cambia, se para y no
  -- toca nada. El bloque con excepción deshace también la suscripción.
  begin
    insert into public.subscriptions (space_id, establishment_id, kind, plan_id)
    values (v_space, 'ffd40000-0000-0000-0000-000000000009', 'plan', 'ffd20000-0000-0000-0000-000000000004');
    perform public.apply_basic_plan_sheet_internal(v_space);
    raise exception 'RN-COM-20 FALLIDO: reescribió en el sitio un plan que alguien tiene' using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then
      if sqlerrm not like '%versión nueva%' then raise; end if;
  end;
  if (select price_cents from public.plans where id = v_basico) <> 9900 then
    raise exception 'RN-COM-20 FALLIDO: al pararse dejó el Básico cambiado' using errcode = 'assert_failure';
  end if;

  create temp table pr_turnos on commit drop as
    select id, queue_rank from public.plans where space_id = v_space;

  perform public.apply_basic_plan_sheet_internal(v_space);

  -- El Básico de la ficha: 20 € y trimestral, con su apunte.
  if not exists (select 1 from public.plans where id = v_basico
                 and price_cents = 2000 and report_period = 'quarter') then
    raise exception 'MIGRACIÓN 146 FALLIDA: el Básico no quedó en 20 € y trimestral' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where entity_id = v_basico and action = 'plan.edited'
                 and (old_value->>'price_cents')::int = 9900 and (new_value->>'price_cents')::int = 2000) then
    raise exception 'RN-COM-21 FALLIDO: el cambio del Básico no quedó en la auditoría' using errcode = 'assert_failure';
  end if;

  -- Los demás, un escalón por delante cada uno, sin perder su orden entre
  -- ellos (Premium sigue delante de Impulso); y lo que no es del Básico,
  -- igual.
  if exists (select 1 from public.plans p join pr_turnos t on t.id = p.id
             where p.space_id = v_space and p.id <> v_basico and p.queue_rank <> t.queue_rank + 1)
     or (select queue_rank from public.plans where id = v_basico) <> 0 then
    raise exception 'MIGRACIÓN 146 FALLIDA: los turnos no quedaron con el Básico por detrás' using errcode = 'assert_failure';
  end if;
  if (select price_cents from public.plans where id = 'ffd20000-0000-0000-0000-000000000004') <> 79900
     or exists (select 1 from public.plans where space_id = v_space and id <> v_basico and report_period <> 'month') then
    raise exception 'MIGRACIÓN 146 FALLIDA: tocó algo de un plan que no es el Básico' using errcode = 'assert_failure';
  end if;

  -- Idempotente: otra vez no sube otro escalón ni escribe otro apunte.
  perform public.apply_basic_plan_sheet_internal(v_space);
  if exists (select 1 from public.plans p join pr_turnos t on t.id = p.id
             where p.space_id = v_space and p.id <> v_basico and p.queue_rank <> t.queue_rank + 1) then
    raise exception 'MIGRACIÓN 146 FALLIDA: aplicarla dos veces subió dos escalones' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where entity_id = v_basico and action = 'plan.edited') <> 1 then
    raise exception 'MIGRACIÓN 146 FALLIDA: aplicarla dos veces escribió dos apuntes' using errcode = 'assert_failure';
  end if;

  -- Sobre Restavor recién sembrado no hay nada que hacer, aunque tenga
  -- restaurantes con plan: no se para por lo que no va a tocar.
  perform public.apply_basic_plan_sheet_internal((select v from pr_ids where k = 'restavor'));

  -- CLAUDE.md · interna: cerrada a anon y a authenticated, no solo a public.
  if has_function_privilege('anon', 'public.apply_basic_plan_sheet_internal(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.apply_basic_plan_sheet_internal(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: apply_basic_plan_sheet_internal está abierta por RPC' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Migración 148 · Impulso+ y Premium+ archivados (decisión 84, RN-COM-27)
--
-- El espacio de prueba de arriba acaba con los cinco planes de Restavor y
-- el suyo propio (Total), que es como estaba Restavor el 26/09/2026. Casa
-- Total tiene Premium+: archivarlo no se lo quita.
-- ============================================================
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ffd40000-0000-0000-0000-00000000000a', 'ffd10000-0000-0000-0000-000000000009',
   'ffd30000-0000-0000-0000-000000000009', 'PLN-0010', 'Casa Nueva', 'active');
insert into public.subscriptions (space_id, establishment_id, kind, plan_id)
values ('ffd10000-0000-0000-0000-000000000009', 'ffd40000-0000-0000-0000-000000000009', 'plan',
        'ffd20000-0000-0000-0000-000000000003');

do $$
declare
  v_space uuid := 'ffd10000-0000-0000-0000-000000000009';
  v_impulso_plus uuid := 'ffd20000-0000-0000-0000-000000000002';
  v_premium_plus uuid := 'ffd20000-0000-0000-0000-000000000003';
  v_n integer;
begin
  select count(*) into v_n from public.plans where space_id = v_space;

  perform public.retire_plus_plans_internal(v_space);

  -- RN-COM-27 · los dos, archivados; ninguno más.
  if exists (select 1 from public.plans
             where id in (v_impulso_plus, v_premium_plus) and archived_at is null) then
    raise exception 'MIGRACIÓN 148 FALLIDA: Impulso+ o Premium+ sigue sin archivar' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.plans
             where space_id = v_space and id not in (v_impulso_plus, v_premium_plus)
               and archived_at is not null) then
    raise exception 'MIGRACIÓN 148 FALLIDA: archivó un plan que no era Impulso+ ni Premium+' using errcode = 'assert_failure';
  end if;

  -- RN-COM-27 · nunca se borra.
  if (select count(*) from public.plans where space_id = v_space) <> v_n then
    raise exception 'RN-COM-27 FALLIDO: archivar borró planes' using errcode = 'assert_failure';
  end if;

  -- RN-COM-27 · quien lo tiene lo conserva hasta que pase a otro.
  if not exists (select 1 from public.subscriptions
                 where establishment_id = 'ffd40000-0000-0000-0000-000000000009'
                   and plan_id = v_premium_plus and status = 'active') then
    raise exception 'RN-COM-27 FALLIDO: archivar Premium+ le quitó el plan a quien lo tenía' using errcode = 'assert_failure';
  end if;

  -- El mismo apunte que archive_plan(), uno por plan, y el de Premium+
  -- dice que alguien lo tiene.
  if (select count(*) from public.audit_log where space_id = v_space and action = 'plan.archived') <> 2 then
    raise exception 'MIGRACIÓN 148 FALLIDA: esperaba dos apuntes plan.archived' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where space_id = v_space and action = 'plan.archived'
      and entity_id = (select lineage_id from public.plans where id = v_premium_plus)
      and (new_value ->> 'in_use')::boolean
  ) then
    raise exception 'MIGRACIÓN 148 FALLIDA: el apunte de Premium+ no dice que alguien lo tiene' using errcode = 'assert_failure';
  end if;

  -- RN-COM-27 · ya no lo contrata nadie.
  begin
    insert into public.subscriptions (space_id, establishment_id, kind, plan_id)
    values (v_space, 'ffd40000-0000-0000-0000-00000000000a', 'plan', v_impulso_plus);
    raise exception 'RN-COM-27 FALLIDO: se pudo contratar Impulso+ archivado' using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then
      if sqlerrm not like '%ya no se ofrece%' then raise; end if;
  end;

  -- Idempotente: otra vez no escribe otro apunte.
  perform public.retire_plus_plans_internal(v_space);
  if (select count(*) from public.audit_log where space_id = v_space and action = 'plan.archived') <> 2 then
    raise exception 'MIGRACIÓN 148 FALLIDA: aplicarla dos veces escribió más apuntes' using errcode = 'assert_failure';
  end if;

  -- Sobre Restavor recién sembrado no hay nada que archivar.
  perform public.retire_plus_plans_internal((select v from pr_ids where k = 'restavor'));
  if exists (select 1 from public.plans
             where space_id = (select v from pr_ids where k = 'restavor') and archived_at is not null) then
    raise exception 'MIGRACIÓN 148 FALLIDA: archivó un plan del catálogo de hoy' using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md · interna: cerrada a anon y a authenticated, no solo a public.
  if has_function_privilege('anon', 'public.retire_plus_plans_internal(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.retire_plus_plans_internal(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: retire_plus_plans_internal está abierta por RPC' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-SOP-10 · la guía del centro de ayuda nombra Básico, Impulso y
-- Premium, y ni Impulso+ ni Premium+ (decisión 84)
-- ============================================================
do $$
declare v_body text;
begin
  select body into v_body from public.help_articles where slug = 'cobros-a-tus-restaurantes-y-tu-suscripcion';
  if v_body not like '%Básico%' or v_body not like '%Impulso%' or v_body not like '%Premium%'
     or v_body like '%Impulso+%' or v_body like '%Premium+%' then
    raise exception 'RN-SOP-10 FALLIDO: la guía de cobros no nombra exactamente Básico, Impulso y Premium' using errcode = 'assert_failure';
  end if;
  if (select version from public.help_articles where slug = 'cobros-a-tus-restaurantes-y-tu-suscripcion') < 3 then
    raise exception 'RN-SOP-10 FALLIDO: cambiar la guía no subió su versión' using errcode = 'assert_failure';
  end if;
end $$;

select 'planes_de_restavor.sql: §6.1, RN-COM-01/02/03/08/27, RN-SLA-02, RN-OPP-08, RN-REP-32 y las migraciones 96, 146 y 148 cumplidos' as resultado;
