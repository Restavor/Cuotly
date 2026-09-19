-- Los cuatro planes de mantenimiento de Restavor (migración 96; PRD §6.1,
-- RN-COM-01 a 03 y RN-COM-08; decisión 39 del 16/09/2026).
--
--   · §6.1: `create_restavor_space()` siembra los cinco planes con los
--     números de las fichas de Restavor y Menú Diario con sus dos precios.
--   · RN-COM-01: Básico no incluye ningún cambio.
--   · RN-COM-02: solo Premium+ incluye un cambio grande.
--   · RN-COM-03: solo Premium+ concede la prioridad.
--   · RN-SLA-02: Impulso arranca a 48 h; Impulso+, Premium y Premium+ a 24.
--   · RN-COM-08: el precio reducido de Menú Diario sale solo con Premium+,
--     porque es el único con `grants_priority`.
--   · La migración de datos: un espacio con el catálogo del Hito 2 queda
--     con Impulso+ y Premium+ (las mismas filas, mismas suscripciones) y
--     con Impulso y Premium nuevos; repetirla no duplica nada, y no toca
--     Básico ni un plan de otro nombre.
--   · La guía del centro de ayuda nombra los cinco planes.
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
  if v_n <> 5 then
    raise exception '§6.1 FALLIDO: Restavor debía nacer con 5 planes y tiene %', v_n using errcode = 'assert_failure';
  end if;

  -- Cada plan, con los números de su ficha (precio, pequeños,
  -- fotográficos, medianos, grandes, plazo de inicio, prioridad).
  for r in
    select * from (values
      ('Básico',    9900,  0,  0, 0, 0, 48, false),
      ('Impulso',  29900,  6,  6, 1, 0, 48, false),
      ('Impulso+', 39900, 16, 12, 3, 0, 24, false),
      ('Premium',  49900, 10, 12, 2, 0, 24, false),
      ('Premium+', 59900, 25, 24, 5, 1, 24, true)
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

  -- RN-COM-02 · solo Premium+ incluye un cambio grande.
  if (select string_agg(name, ',' order by name) from public.plans
      where space_id = v_space and included_large > 0) <> 'Premium+' then
    raise exception 'RN-COM-02 FALLIDO: un plan distinto de Premium+ incluye cambios grandes' using errcode = 'assert_failure';
  end if;

  -- RN-COM-03 · las TRES cosas que el plan decide, desde la decisión 55
  -- (19/09/2026). Hasta entonces salían de un solo booleano y por eso se
  -- comprueban juntas: separarlas mal es lo que le daría a Premium el
  -- precio rebajado de Menú Diario sin que nadie lo decidiera.

  -- 1 · El plan alto sigue siendo solo Premium+. De aquí cuelgan el precio
  --     de Menú Diario (RN-COM-08) y las oportunidades avanzadas (RN-OPP),
  --     que Bosco fijó en la decisión 39 y que CLAUDE.md enumera.
  if (select string_agg(name, ',' order by name) from public.plans
      where space_id = v_space and grants_priority) <> 'Premium+' then
    raise exception 'RN-COM-03 FALLIDO: la prioridad la concede un plan que no es Premium+' using errcode = 'assert_failure';
  end if;

  -- 2 · Ordenar los cambios propios: Premium y Premium+ (19/09/2026).
  if (select string_agg(name, ',' order by name) from public.plans
      where space_id = v_space and can_order_requests) <> 'Premium,Premium+' then
    raise exception 'RN-COM-03 FALLIDO: ordenar los cambios propios no es exactamente de Premium y Premium+'
      using errcode = 'assert_failure';
  end if;

  -- 3 · El turno: Premium+ por delante de Premium, y Premium del resto.
  --     Bosco, 19/09/2026: "si hay una solicitud de Premium+ y otra de
  --     Premium, se contestaría primero la de Premium+".
  if (select queue_rank from public.plans where space_id = v_space and name = 'Premium+')
     <= (select queue_rank from public.plans where space_id = v_space and name = 'Premium') then
    raise exception 'RN-COM-03 FALLIDO: Premium+ no se atiende antes que Premium' using errcode = 'assert_failure';
  end if;

  if (select queue_rank from public.plans where space_id = v_space and name = 'Premium')
     <= (select max(queue_rank) from public.plans
         where space_id = v_space and name in ('Básico', 'Impulso', 'Impulso+')) then
    raise exception 'RN-COM-03 FALLIDO: Premium no se atiende antes que los planes de abajo' using errcode = 'assert_failure';
  end if;

  -- Y el turno NO es un plazo más corto: Impulso+, Premium y Premium+
  -- arrancan los tres a 24 h. Bosco: "todos tienen de máximo 24 h".
  if (select count(distinct start_sla_hours) from public.plans
      where space_id = v_space and name in ('Impulso+', 'Premium', 'Premium+')) <> 1 then
    raise exception 'RN-SLA-02 FALLIDO: el turno del plan se ha colado como un plazo distinto'
      using errcode = 'assert_failure';
  end if;

  -- RN-SLA-02 · Impulso a 48 h; los otros tres con cambios a 24.
  if (select string_agg(name, ',' order by name) from public.plans
      where space_id = v_space and start_sla_hours = 24) <> 'Impulso+,Premium,Premium+' then
    raise exception 'RN-SLA-02 FALLIDO: las 24 h no son de Impulso+, Premium y Premium+' using errcode = 'assert_failure';
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
-- RN-COM-08 · el precio reducido de Menú Diario sale solo con Premium+
--
-- Un restaurante con Premium (499 €) paga 229 €; con Premium+, 199 €. Es
-- lo que Bosco subrayó como MUY IMPORTANTE: Impulso, Impulso+ y Premium
-- no tienen descuento en Menú Diario.
-- ============================================================
insert into public.space_memberships (space_id, user_id, role, status) values
  ((select v from pr_ids where k = 'restavor'), 'ffd00000-0000-0000-0000-000000000002', 'admin', 'active');

insert into public.groups (id, space_id, name) values
  ('ffd30000-0000-0000-0000-000000000001', (select v from pr_ids where k = 'restavor'), 'Grupo Planes');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ffd40000-0000-0000-0000-000000000001', (select v from pr_ids where k = 'restavor'),
   'ffd30000-0000-0000-0000-000000000001', 'PLN-0001', 'Casa Premium', 'active'),
  ('ffd40000-0000-0000-0000-000000000002', (select v from pr_ids where k = 'restavor'),
   'ffd30000-0000-0000-0000-000000000001', 'PLN-0002', 'Casa Premium Plus', 'active'),
  ('ffd40000-0000-0000-0000-000000000003', (select v from pr_ids where k = 'restavor'),
   'ffd30000-0000-0000-0000-000000000001', 'PLN-0003', 'Casa Impulso Plus', 'active');

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
    (select id from public.plans where space_id = v_space and name = 'Premium+'));
  perform public.create_plan_subscription('ffd40000-0000-0000-0000-000000000003',
    (select id from public.plans where space_id = v_space and name = 'Impulso+'));

  -- Premium (499 €): Menú Diario a 229 €.
  v_sub := public.create_service_subscription('ffd40000-0000-0000-0000-000000000001', v_service);
  select base_cents, premium_applied into v_base, v_premium from public.service_monthly_price(v_sub);
  if v_base <> 22900 or v_premium then
    raise exception 'RN-COM-08 FALLIDO: con Premium (499 €) Menú Diario debía costar 22900 sin descuento y es % (descuento: %)', v_base, v_premium using errcode = 'assert_failure';
  end if;

  -- Impulso+ (399 €): también 229 €.
  v_sub := public.create_service_subscription('ffd40000-0000-0000-0000-000000000003', v_service);
  select base_cents, premium_applied into v_base, v_premium from public.service_monthly_price(v_sub);
  if v_base <> 22900 or v_premium then
    raise exception 'RN-COM-08 FALLIDO: con Impulso+ Menú Diario debía costar 22900 sin descuento y es %', v_base using errcode = 'assert_failure';
  end if;

  -- Premium+ (599 €): 199 €, y el apunte lo dice.
  v_sub := public.create_service_subscription('ffd40000-0000-0000-0000-000000000002', v_service);
  select base_cents, premium_applied into v_base, v_premium from public.service_monthly_price(v_sub);
  if v_base <> 19900 or not v_premium then
    raise exception 'RN-COM-08 FALLIDO: con Premium+ Menú Diario debía costar 19900 y es %', v_base using errcode = 'assert_failure';
  end if;

  -- RN-OPP-08 · Premium ve las básicas; Premium+ también las avanzadas.
  if public.client_opportunity_access('ffd40000-0000-0000-0000-000000000001') <> 'basic' then
    raise exception 'RN-OPP-08 FALLIDO: Premium (499 €) debía ver solo las básicas' using errcode = 'assert_failure';
  end if;
  if public.client_opportunity_access('ffd40000-0000-0000-0000-000000000002') <> 'advanced' then
    raise exception 'RN-OPP-08 FALLIDO: Premium+ debía ver también las avanzadas' using errcode = 'assert_failure';
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

  -- Y sobre un espacio ya sembrado con los cinco (Restavor), tampoco.
  perform public.upgrade_restavor_plan_catalogue((select v from pr_ids where k = 'restavor'));
  if (select count(*) from public.plans where space_id = (select v from pr_ids where k = 'restavor')) <> 5 then
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
-- RN-SOP-10 · la guía del centro de ayuda nombra los cinco planes
-- ============================================================
do $$
declare v_body text;
begin
  select body into v_body from public.help_articles where slug = 'cobros-a-tus-restaurantes-y-tu-suscripcion';
  if v_body not like '%Impulso+%' or v_body not like '%Premium+%' or v_body not like '%Básico%' then
    raise exception 'RN-SOP-10 FALLIDO: la guía de cobros no nombra los cinco planes' using errcode = 'assert_failure';
  end if;
  if (select version from public.help_articles where slug = 'cobros-a-tus-restaurantes-y-tu-suscripcion') < 2 then
    raise exception 'RN-SOP-10 FALLIDO: cambiar la guía no subió su versión' using errcode = 'assert_failure';
  end if;
end $$;

select 'planes_de_restavor.sql: §6.1, RN-COM-01/02/03/08, RN-SLA-02, RN-OPP-08 y la migración 96 cumplidos' as resultado;
