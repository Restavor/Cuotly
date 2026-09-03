-- HU-07 · "asignar un plan **y servicios** a un establecimiento y ver su
-- ciclo de consumo vigente" (migración 20260903000048), contra la base de
-- datos real.
--
-- Qué comprueba, y por qué cada cosa:
--   · RN-COM-11 y RN-COM-13: un establecimiento puede tener plan, servicio
--     o ambos, y varios servicios distintos — pero no el mismo dos veces,
--     que sería facturarle dos mensualidades iguales;
--   · RN-COM-09: contratar un servicio abre su permanencia de 3 meses,
--     igual que un plan;
--   · CA-01: quien no tiene `manage_clients` —un trabajador del espacio, el
--     propio restaurante— no contrata nada por llamada directa, ni ve el
--     prorrateo de un cambio de plan;
--   · CA-17: contratar dos veces el mismo servicio no duplica nada, y
--     anular dos veces el mismo cambio programado tampoco es un error;
--   · RN-COM-06: el ciclo de consumo existe desde el alta del plan, que es
--     lo que HU-07 pide poder enseñar. Antes no había ninguno hasta la
--     primera aceptación;
--   · RN-COM-18: `plan_change_preview()` devuelve el prorrateo **sin
--     ejecutar nada** — ni cobro, ni apuntes, ni cambio de plan;
--   · que un cambio de plan programado se pueda deshacer, que es lo que
--     libera el índice único parcial para poder programar otro.
--
-- Mismo patrón que hu21_reparto_tareas.sql: bloques `do $$ ... end $$` que
-- lanzan una excepción real si algo no es lo esperado, cambio de identidad
-- con `set role authenticated`, y limpieza propia al final.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hu07_planes_y_servicios.sql

-- ============================================================
-- Fixture: un espacio con propietario, un administrador, un trabajador y
-- un restaurante con su cliente. Dos planes (para poder mejorar de uno a
-- otro) y dos servicios. Y un SEGUNDO espacio con su propio servicio, que
-- es lo que pone a prueba el cruce entre espacios.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('d0000000-0000-0000-0000-000000000001', 'hu07-owner@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000002', 'hu07-admin@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000003', 'hu07-worker@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-000000000004', 'hu07-client@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('d1000000-0000-0000-0000-000000000001', 'Espacio HU07', 'espacio-hu07-test', 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'Espacio HU07 ajeno', 'espacio-hu07-ajeno', 'd0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'worker', 'active');

-- Los números son los del PRD §6.1 (Impulso y Premium), porque el
-- prorrateo de RN-COM-18 se comprueba con ellos.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Impulso HU07', 39900, 16, 12, 3, 0, 24),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Premium HU07', 59900, 25, 24, 5, 1, 24);

insert into public.services (id, space_id, name, price_cents, price_premium_cents) values
  ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Menu Diario HU07', 22900, 19900),
  ('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Otro servicio HU07', 10000, null),
  ('d5000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002', 'Servicio de otro espacio', 10000, null);

insert into public.groups (id, space_id, name) values
  ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Grupo HU07');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'EST-HU07-A', 'Restaurante HU07');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('d4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'local_owner');

create temporary table hu07_ctx (key text primary key, value text);
grant select, insert, update on hu07_ctx to authenticated, service_role;

-- ============================================================
-- CA-01 · quien no tiene `manage_clients` no contrata un servicio, ni
-- siendo del equipo del espacio. Se prueba ANTES del camino feliz: si el
-- servicio ya estuviera contratado, la función devolvería el id existente
-- por idempotencia y este bloque pasaría sin comprobar nada (la
-- comprobación vacua que la quinta revisión encontró dos veces).
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.create_service_subscription(
      'd4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001');
    raise exception 'CA-01 FALLIDO: un trabajador ha contratado un servicio'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null; -- La negativa esperada.
  end;
end $$;

reset role;

-- El propio restaurante tampoco: es miembro del establecimiento, no del
-- espacio, y contratar servicios no es suyo.
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
begin
  begin
    perform public.create_service_subscription(
      'd4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001');
    raise exception 'CA-01 FALLIDO: el restaurante ha contratado un servicio por su cuenta'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- HU-07 · el administrador contrata el servicio, con su permanencia y su
-- auditoría (RN-COM-09, RN-COM-11, CLAUDE.md MUST).
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_subscription_id uuid;
  -- Columnas enumeradas, no `select *`: el privilegio de columna de
  -- CLAUDE.md hace que el asterisco sobre esta tabla devuelva 403.
  v_commitment_id uuid;
  v_commitment_service uuid;
  v_commitment_plan uuid;
  v_commitment_started timestamptz;
  v_commitment_ends timestamptz;
  v_commitment_cause text;
begin
  v_subscription_id := public.create_service_subscription(
    'd4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001');

  if v_subscription_id is null then
    raise exception 'HU-07 FALLIDO: contratar el servicio no devolvio suscripcion'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.subscriptions
    where id = v_subscription_id and kind = 'service'
      and service_id = 'd5000000-0000-0000-0000-000000000001'
      and plan_id is null and status = 'active'
  ) then
    raise exception 'HU-07 FALLIDO: la suscripcion de servicio no quedo bien formada'
      using errcode = 'assert_failure';
  end if;

  -- RN-COM-09: permanencia mínima de 3 meses, igual que un plan.
  select id, service_id, plan_id, started_at, ends_at, cause
  into v_commitment_id, v_commitment_service, v_commitment_plan,
       v_commitment_started, v_commitment_ends, v_commitment_cause
  from public.plan_commitments
  where subscription_id = v_subscription_id;

  if v_commitment_id is null then
    raise exception 'RN-COM-09 FALLIDO: contratar un servicio no abrio permanencia'
      using errcode = 'assert_failure';
  end if;

  if v_commitment_service is distinct from 'd5000000-0000-0000-0000-000000000001'
     or v_commitment_plan is not null then
    raise exception 'RN-COM-09 FALLIDO: la permanencia del servicio no apunta al servicio'
      using errcode = 'assert_failure';
  end if;

  if v_commitment_ends < v_commitment_started + interval '89 days'
     or v_commitment_ends > v_commitment_started + interval '93 days' then
    raise exception 'RN-COM-09 FALLIDO: la permanencia no dura tres meses (% a %)',
      v_commitment_started, v_commitment_ends using errcode = 'assert_failure';
  end if;

  if v_commitment_cause <> 'initial' then
    raise exception 'RN-COM-09 FALLIDO: la permanencia inicial no se llama initial'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'subscription' and entity_id = v_subscription_id
      and action = 'subscription.service_created'
      and actor_id = 'd0000000-0000-0000-0000-000000000002'
      and new_value ->> 'service_id' = 'd5000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'CLAUDE.md MUST FALLIDO: contratar un servicio no dejo registro de auditoria'
      using errcode = 'assert_failure';
  end if;

  insert into hu07_ctx values ('service_subscription', v_subscription_id::text);
end $$;

-- ============================================================
-- CA-17 · contratar dos veces el mismo servicio devuelve el que ya hay y
-- no crea una segunda mensualidad ni una segunda permanencia.
-- ============================================================
do $$
declare
  v_primera uuid := (select value::uuid from hu07_ctx where key = 'service_subscription');
  v_segunda uuid;
begin
  v_segunda := public.create_service_subscription(
    'd4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001');

  if v_segunda is distinct from v_primera then
    raise exception 'CA-17 FALLIDO: contratar dos veces el mismo servicio creo dos suscripciones'
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.subscriptions
      where establishment_id = 'd4000000-0000-0000-0000-000000000001'
        and kind = 'service' and status = 'active') <> 1 then
    raise exception 'RN-COM-13 FALLIDO: hay mas de una suscripcion activa del mismo servicio'
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.plan_commitments where subscription_id = v_primera) <> 1 then
    raise exception 'CA-17 FALLIDO: la segunda llamada abrio otra permanencia'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-COM-13 · "los servicios adicionales pueden ser varios": otro servicio
-- distinto sí entra.
-- ============================================================
do $$
begin
  perform public.create_service_subscription(
    'd4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000002');

  if (select count(*) from public.subscriptions
      where establishment_id = 'd4000000-0000-0000-0000-000000000001'
        and kind = 'service' and status = 'active') <> 2 then
    raise exception 'RN-COM-13 FALLIDO: un segundo servicio distinto no se pudo contratar'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- CA-01 / RN-DAT-03 · un servicio de otro espacio no se contrata aquí,
-- aunque quien lo pida sea administrador del suyo.
-- ============================================================
do $$
begin
  begin
    perform public.create_service_subscription(
      'd4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000003');
    raise exception 'CA-01 FALLIDO: se ha contratado un servicio de otro espacio'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

-- ============================================================
-- RN-COM-11 · plan y servicio conviven, y RN-COM-06 · el ciclo de consumo
-- existe desde el alta del plan.
--
-- Esta última es la mitad de HU-07 que decía "ver su ciclo de consumo
-- vigente": antes del alta no hay nada que ver, y hasta la migración 48 no
-- lo había tampoco DESPUÉS, hasta que alguien aceptaba la primera
-- solicitud.
-- ============================================================
do $$
declare
  v_plan_subscription uuid;
  v_bolsa record;
begin
  v_plan_subscription := public.create_plan_subscription(
    'd4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001');

  insert into hu07_ctx values ('plan_subscription', v_plan_subscription::text);

  if (select count(*) from public.subscriptions
      where establishment_id = 'd4000000-0000-0000-0000-000000000001' and status = 'active') <> 3 then
    raise exception 'RN-COM-11 FALLIDO: plan y servicios no conviven en el mismo restaurante'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.consumption_cycles
    where subscription_id = v_plan_subscription
      and now() >= cycle_start and now() < cycle_end
  ) then
    raise exception 'RN-COM-06 FALLIDO: dar de alta el plan no abrio el ciclo de consumo'
      using errcode = 'assert_failure';
  end if;

  -- Y se ve por donde lo lee la pantalla, no solo en la tabla.
  select * into v_bolsa from public.establishment_cycle_allowance(
    'd4000000-0000-0000-0000-000000000001') where category = 'small';

  if v_bolsa.included is distinct from 16 or v_bolsa.remaining is distinct from 16 then
    raise exception 'HU-07 FALLIDO: la bolsa del ciclo recien abierto no es la del plan (incluidas %, restantes %)',
      v_bolsa.included, v_bolsa.remaining using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-01 · el prorrateo tampoco es de dominio público: quien no puede
-- cambiar el plan no necesita su cifra.
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_plan_subscription uuid := (select value::uuid from hu07_ctx where key = 'plan_subscription');
begin
  begin
    perform * from public.plan_change_preview(v_plan_subscription, 'd2000000-0000-0000-0000-000000000002');
    raise exception 'CA-01 FALLIDO: un trabajador ha visto el prorrateo de un cambio de plan'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;
end $$;

reset role;

-- ============================================================
-- RN-COM-18 · el prorrateo se puede ENSEÑAR sin ejecutarlo. La mitad que
-- importa es la segunda: mirar no cobra.
-- ============================================================
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_plan_subscription uuid := (select value::uuid from hu07_ctx where key = 'plan_subscription');
  v_preview record;
  v_cobros_antes integer;
  v_apuntes_antes integer;
begin
  select count(*) into v_cobros_antes from public.charges
  where establishment_id = 'd4000000-0000-0000-0000-000000000001';
  select count(*) into v_apuntes_antes from public.consumption_entries
  where establishment_id = 'd4000000-0000-0000-0000-000000000001';

  select * into v_preview from public.plan_change_preview(
    v_plan_subscription, 'd2000000-0000-0000-0000-000000000002');

  if v_preview.fraction is null or v_preview.fraction <= 0 or v_preview.fraction > 1 then
    raise exception 'RN-COM-18 FALLIDO: fraccion restante fuera de rango (%)', v_preview.fraction
      using errcode = 'assert_failure';
  end if;

  -- Impulso (399 €) → Premium (599 €), recién abierto el ciclo: la
  -- diferencia prorrateada tiene que ser positiva y como mucho la entera.
  if v_preview.difference_cents <= 0 or v_preview.difference_cents > 20000 then
    raise exception 'RN-COM-18 FALLIDO: diferencia prorrateada inesperada (%)', v_preview.difference_cents
      using errcode = 'assert_failure';
  end if;

  -- "Si unidades_extra sale negativo se trata como 0": Premium incluye
  -- más de todo, así que aquí ninguna puede ser negativa.
  if v_preview.extra_small < 0 or v_preview.extra_photo < 0
     or v_preview.extra_medium < 0 or v_preview.extra_large < 0 then
    raise exception 'RN-COM-18 FALLIDO: el prorrateo devolvio consumos negativos'
      using errcode = 'assert_failure';
  end if;

  if (select plan_id from public.subscriptions where id = v_plan_subscription)
     is distinct from 'd2000000-0000-0000-0000-000000000001' then
    raise exception 'RN-COM-18 FALLIDO: mirar el prorrateo cambio el plan'
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.charges
      where establishment_id = 'd4000000-0000-0000-0000-000000000001') <> v_cobros_antes then
    raise exception 'RN-COM-18 FALLIDO: mirar el prorrateo emitio un cobro'
      using errcode = 'assert_failure';
  end if;

  if (select count(*) from public.consumption_entries
      where establishment_id = 'd4000000-0000-0000-0000-000000000001') <> v_apuntes_antes then
    raise exception 'RN-COM-18 FALLIDO: mirar el prorrateo escribio apuntes de consumo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-COM-16 · programar la mejora para la renovación, y poder deshacerla.
-- Sin lo segundo, el índice único parcial deja la suscripción bloqueada
-- hasta la renovación con el plan equivocado en cola.
-- ============================================================
do $$
declare
  v_plan_subscription uuid := (select value::uuid from hu07_ctx where key = 'plan_subscription');
  v_change_id uuid;
begin
  v_change_id := public.schedule_plan_change(v_plan_subscription, 'd2000000-0000-0000-0000-000000000002');

  if v_change_id is null then
    raise exception 'RN-COM-16 FALLIDO: no se pudo programar la mejora a renovacion'
      using errcode = 'assert_failure';
  end if;

  insert into hu07_ctx values ('scheduled_change', v_change_id::text);
end $$;

reset role;

-- CA-01 · anularlo tampoco lo puede hacer cualquiera.
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_plan_subscription uuid := (select value::uuid from hu07_ctx where key = 'plan_subscription');
begin
  begin
    perform public.cancel_scheduled_plan_change(v_plan_subscription, 'probando');
    raise exception 'CA-01 FALLIDO: un trabajador ha anulado un cambio de plan programado'
      using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when others then null;
  end;

  if (select state from public.scheduled_plan_changes
      where id = (select value::uuid from hu07_ctx where key = 'scheduled_change')) <> 'pending' then
    raise exception 'CA-01 FALLIDO: el cambio programado dejo de estar pendiente'
      using errcode = 'assert_failure';
  end if;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_plan_subscription uuid := (select value::uuid from hu07_ctx where key = 'plan_subscription');
  v_change_id uuid := (select value::uuid from hu07_ctx where key = 'scheduled_change');
  v_otro uuid;
begin
  if not public.cancel_scheduled_plan_change(v_plan_subscription, 'plan equivocado') then
    raise exception 'HU-07 FALLIDO: no se pudo anular el cambio programado'
      using errcode = 'assert_failure';
  end if;

  -- CLAUDE.md MUST NOT: no se borra, se marca.
  if (select state from public.scheduled_plan_changes where id = v_change_id) <> 'cancelled' then
    raise exception 'HU-07 FALLIDO: el cambio anulado no quedo en cancelled'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where entity_type = 'subscription' and entity_id = v_plan_subscription
      and action = 'subscription.plan_change_cancelled'
      and actor_id = 'd0000000-0000-0000-0000-000000000001'
      and new_value ->> 'reason' = 'plan equivocado'
  ) then
    raise exception 'CLAUDE.md MUST FALLIDO: anular un cambio programado no dejo auditoria'
      using errcode = 'assert_failure';
  end if;

  -- CA-17: anularlo otra vez no revienta, simplemente ya no hay nada.
  if public.cancel_scheduled_plan_change(v_plan_subscription, null) then
    raise exception 'CA-17 FALLIDO: anular dos veces dijo que habia anulado dos'
      using errcode = 'assert_failure';
  end if;

  -- Y lo que da sentido a todo esto: con el anterior anulado se puede
  -- programar otro. Mientras seguía `pending`, el índice único lo impedía.
  v_otro := public.schedule_plan_change(v_plan_subscription, 'd2000000-0000-0000-0000-000000000002');

  if v_otro is null or v_otro = v_change_id then
    raise exception 'HU-07 FALLIDO: tras anular no se pudo programar otro cambio'
      using errcode = 'assert_failure';
  end if;

  perform public.cancel_scheduled_plan_change(v_plan_subscription, 'limpieza');
end $$;

reset role;

-- ============================================================
-- CLAUDE.md · las tres funciones nuevas son de la pantalla del equipo:
-- `authenticated` tiene que poder ejecutarlas (si no, HU-07 deja de
-- funcionar en silencio) y `anon` no, con sesión o sin ella. Y la interna
-- que envuelve el prorrateo sigue cerrada.
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.create_service_subscription(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.cancel_scheduled_plan_change(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.plan_change_preview(uuid, uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: las funciones de HU-07 estan abiertas a anon'
      using errcode = 'assert_failure';
  end if;

  if not has_function_privilege('authenticated', 'public.create_service_subscription(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.cancel_scheduled_plan_change(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.plan_change_preview(uuid, uuid)', 'execute') then
    raise exception 'HU-07 FALLIDO: el equipo no puede ejecutar las funciones de la pantalla'
      using errcode = 'assert_failure';
  end if;

  if has_function_privilege('authenticated', 'public.plan_change_proration(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.plan_change_proration(uuid, uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: la funcion interna del prorrateo esta abierta por RPC'
      using errcode = 'assert_failure';
  end if;

  -- El privilegio de columna de `plan_commitments` se enumeró entero en la
  -- migración 40: una columna nueva no se concede sola, y sin ella la
  -- pantalla no puede distinguir la permanencia de un plan de la de un
  -- servicio — recibiría un 403.
  if not has_column_privilege('authenticated', 'public.plan_commitments', 'service_id', 'select') then
    raise exception 'HU-07 FALLIDO: authenticated no puede leer plan_commitments.service_id'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id in (
  'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002');
delete from public.spaces where id in (
  'd1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002');
delete from auth.users where id in (
  'd0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000002',
  'd0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000004'
);

select 'hu07_planes_y_servicios.sql: HU-07, RN-COM-06, RN-COM-09, RN-COM-11, RN-COM-13, RN-COM-18, CA-01 y CA-17 cumplidos, base de datos limpia' as resultado;
