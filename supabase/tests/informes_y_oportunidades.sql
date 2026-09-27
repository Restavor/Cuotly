-- ============================================================
-- Suite 87 · Informes y oportunidades (migración 153; decisión 85;
--            PRD §41.7, RN-CRE-26 y RN-CRE-27)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-CRE-26 · un plan puede recibir el informe mensual y además el
--     trimestral (`report_period = 'both'`): se crea así, se edita así, el
--     restaurante lo lee así y un valor inventado se rechaza. En la
--     comparativa de versiones, trimestral < mensual < los dos.
--   · RN-CRE-27 · el restaurante ve las oportunidades que el equipo le sube
--     al informe, básicas y avanzadas por igual, si su plan incluye algo
--     —también un plan que solo trae créditos—; el de entrada, ninguna; y
--     nunca las que el equipo no ha subido.
--   · CLAUDE.md · la función nueva es interna; las de las políticas
--     conservan el `execute` de authenticated.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/informes_y_oportunidades.sql
--
-- Prefijo de esta suite: f1530000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1530000-0000-0000-0000-000000000001', 'duena153@cuotly.test', 'authenticated', 'authenticated'),
  ('f1530000-0000-0000-0000-000000000002', 'cliente153@cuotly.test', 'authenticated', 'authenticated'),
  ('f1530000-0000-0000-0000-000000000003', 'basico153@cuotly.test', 'authenticated', 'authenticated'),
  ('f1530000-0000-0000-0000-000000000004', 'ajeno153@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1530000-0000-0000-0000-000000000001', 'duena153@cuotly.test', 'Dueña 153'),
  ('f1530000-0000-0000-0000-000000000002', 'cliente153@cuotly.test', 'Cliente 153'),
  ('f1530000-0000-0000-0000-000000000003', 'basico153@cuotly.test', 'Básico 153'),
  ('f1530000-0000-0000-0000-000000000004', 'ajeno153@cuotly.test', 'Ajeno 153')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1531000-0000-0000-0000-000000000001', 'Espacio 153', 'espacio-153', 'Europe/Madrid',
   'f1530000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1531000-0000-0000-0000-000000000001', 'f1530000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('f1533000-0000-0000-0000-000000000001', 'f1531000-0000-0000-0000-000000000001', 'Grupo 153');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1534000-0000-0000-0000-000000000001', 'f1531000-0000-0000-0000-000000000001',
   'f1533000-0000-0000-0000-000000000001', 'EST-153-1', 'Casa Créditos', 'active'),
  ('f1534000-0000-0000-0000-000000000002', 'f1531000-0000-0000-0000-000000000001',
   'f1533000-0000-0000-0000-000000000001', 'EST-153-2', 'Casa Básica', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1534000-0000-0000-0000-000000000001', 'f1530000-0000-0000-0000-000000000002', 'local_owner'),
  ('f1534000-0000-0000-0000-000000000002', 'f1530000-0000-0000-0000-000000000003', 'local_owner');

create temporary table s153 (k text primary key, v uuid) on commit drop;
grant all on s153 to authenticated, service_role;

-- ============================================================
-- CLAUDE.md · los privilegios de lo nuevo y de lo que está en políticas
-- ============================================================
do $$
begin
  if has_function_privilege('authenticated', 'public.report_period_rank(text)', 'execute')
     or has_function_privilege('anon', 'public.report_period_rank(text)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: report_period_rank está abierta por RPC' using errcode = 'assert_failure';
  end if;
  -- Están en la política de `opportunities`: sin `execute`, la tabla daría
  -- "permission denied for function" (CLAUDE.md).
  if not has_function_privilege('authenticated', 'public.client_sees_opportunity(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.opportunity_is_visible_to_client(text)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: una función de la política de oportunidades perdió el execute de authenticated'
      using errcode = 'assert_failure';
  end if;
  if has_function_privilege('anon', 'public.client_opportunity_access(uuid)', 'execute')
     or has_function_privilege('anon', 'public.establishment_report_period(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: anon ejecuta una lectura del plan del restaurante' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-26 · el mensual y además el trimestral, en el plan
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1530000-0000-0000-0000-000000000001';

do $$
declare
  v_los_dos uuid;
  v_basico uuid;
begin
  -- Un plan de créditos (20 créditos = 40 medios), sin cambios por
  -- categoría, con los dos informes: el Impulso de la decisión 85.
  v_los_dos := public.create_plan('f1531000-0000-0000-0000-000000000001', 'Con los dos 153', 9900,
    0, 0, 0, 0, 24, 72, 72, 72, 120, false, false, 0, 'standard', false, 'crear-153-dos', 'both', 40);
  if (select report_period from public.plans where id = v_los_dos) <> 'both' then
    raise exception 'RN-CRE-26 FALLIDO: el plan con los dos informes no se guardó así' using errcode = 'assert_failure';
  end if;
  insert into s153 values ('los_dos', v_los_dos);

  -- El de entrada: nada incluido, solo el trimestral.
  v_basico := public.create_plan('f1531000-0000-0000-0000-000000000001', 'Entrada 153', 2000,
    0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'crear-153-basico', 'quarter', 0);
  insert into s153 values ('basico', v_basico);

  -- Un valor que no existe no entra.
  begin
    perform public.create_plan('f1531000-0000-0000-0000-000000000001', 'Anual 153', 2000,
      0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'crear-153-anual', 'year', 0);
    raise exception 'RN-CRE-26 FALLIDO: se aceptó un periodo de informe inventado' using errcode = 'assert_failure';
  exception when assert_failure then raise;
  when others then null;
  end;

  -- Sin nadie dentro, editar a `both` se hace en el sitio.
  perform public.revise_plan(v_basico, 2000, 0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false,
    'editar-153-basico', 'both', 0);
  if (select report_period from public.plans where id = v_basico) <> 'both' then
    raise exception 'RN-CRE-26 FALLIDO: editar el plan a los dos informes no se guardó' using errcode = 'assert_failure';
  end if;
  -- Y se vuelve a dejar trimestral para lo que sigue.
  perform public.revise_plan(v_basico, 2000, 0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false,
    'editar-153-basico-2', 'quarter', 0);
end $$;

-- La comparativa de versiones: más informes es mejor (RN-COM-23).
set local role postgres;
do $$
declare
  v_mensual uuid;
  v_trimestral uuid;
  v_dos uuid;
begin
  insert into public.plans (space_id, name, price_cents, included_small, included_photo, included_medium,
                            included_large, start_sla_hours, report_period)
  values ('f1531000-0000-0000-0000-000000000001', 'Cmp mensual 153', 100, 0, 0, 0, 0, 48, 'month')
  returning id into v_mensual;
  insert into public.plans (space_id, name, price_cents, included_small, included_photo, included_medium,
                            included_large, start_sla_hours, report_period)
  values ('f1531000-0000-0000-0000-000000000001', 'Cmp trimestral 153', 100, 0, 0, 0, 0, 48, 'quarter')
  returning id into v_trimestral;
  insert into public.plans (space_id, name, price_cents, included_small, included_photo, included_medium,
                            included_large, start_sla_hours, report_period)
  values ('f1531000-0000-0000-0000-000000000001', 'Cmp dos 153', 100, 0, 0, 0, 0, 48, 'both')
  returning id into v_dos;

  if not (select better from public.plan_terms_diff_internal(v_mensual, v_dos) where field = 'report_period') then
    raise exception 'RN-CRE-26 FALLIDO: pasar de mensual a los dos no favorece' using errcode = 'assert_failure';
  end if;
  if not (select better from public.plan_terms_diff_internal(v_trimestral, v_dos) where field = 'report_period') then
    raise exception 'RN-CRE-26 FALLIDO: pasar de trimestral a los dos no favorece' using errcode = 'assert_failure';
  end if;
  if (select better from public.plan_terms_diff_internal(v_dos, v_mensual) where field = 'report_period') then
    raise exception 'RN-CRE-26 FALLIDO: quitar el trimestral no perjudica' using errcode = 'assert_failure';
  end if;
  if not (select better from public.plan_terms_diff_internal(v_trimestral, v_mensual) where field = 'report_period') then
    raise exception 'RN-REP-32 FALLIDO: pasar de trimestral a mensual dejó de favorecer' using errcode = 'assert_failure';
  end if;
end $$;

insert into public.subscriptions (space_id, establishment_id, kind, plan_id)
select 'f1531000-0000-0000-0000-000000000001', 'f1534000-0000-0000-0000-000000000001', 'plan', v
from s153 where k = 'los_dos';
insert into public.subscriptions (space_id, establishment_id, kind, plan_id)
select 'f1531000-0000-0000-0000-000000000001', 'f1534000-0000-0000-0000-000000000002', 'plan', v
from s153 where k = 'basico';

set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub', 'f1530000-0000-0000-0000-000000000001', true);
  if public.establishment_report_period('f1534000-0000-0000-0000-000000000001') <> 'both' then
    raise exception 'RN-CRE-26 FALLIDO: el equipo no ve que el restaurante recibe los dos informes' using errcode = 'assert_failure';
  end if;
  perform set_config('request.jwt.claim.sub', 'f1530000-0000-0000-0000-000000000002', true);
  if public.establishment_report_period('f1534000-0000-0000-0000-000000000001') <> 'both' then
    raise exception 'RN-CRE-26 FALLIDO: el restaurante no ve que recibe los dos informes' using errcode = 'assert_failure';
  end if;
  -- Alguien de fuera recibe lo mismo que sin plan.
  perform set_config('request.jwt.claim.sub', 'f1530000-0000-0000-0000-000000000004', true);
  if public.establishment_report_period('f1534000-0000-0000-0000-000000000001') <> 'month' then
    raise exception 'RN-CRE-26 FALLIDO: alguien de fuera averigua el periodo del restaurante' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-27 · lo que ve el restaurante de las oportunidades
-- ============================================================
do $$
begin
  perform set_config('request.jwt.claim.sub', 'f1530000-0000-0000-0000-000000000001', true);
  -- Un plan solo de créditos también incluye algo: ve las del informe.
  if public.client_opportunity_access('f1534000-0000-0000-0000-000000000001') <> 'report' then
    raise exception 'RN-CRE-27 FALLIDO: un plan de créditos sin categorías no ve las oportunidades del informe'
      using errcode = 'assert_failure';
  end if;
  if public.client_opportunity_access('f1534000-0000-0000-0000-000000000002') <> 'none' then
    raise exception 'RN-CRE-27 FALLIDO: el plan de entrada (nada incluido) ve oportunidades' using errcode = 'assert_failure';
  end if;
  perform set_config('request.jwt.claim.sub', 'f1530000-0000-0000-0000-000000000004', true);
  if public.client_opportunity_access('f1534000-0000-0000-0000-000000000001') <> 'none' then
    raise exception 'P7 FALLIDO: alguien de fuera averigua el plan por client_opportunity_access()' using errcode = 'assert_failure';
  end if;
end $$;

-- Tres oportunidades en el restaurante de créditos —una básica, una
-- avanzada y otra básica que el equipo no sube— y una en el de entrada.
set local role service_role;
do $$
begin
  insert into s153 values ('basica', public.upsert_detected_opportunity(
    'f1534000-0000-0000-0000-000000000001', 'traffic_drop', '', 'high', 40,
    '2026-08-01', '2026-08-31',
    '[{"provider":"ga4","metric":"sessions","dimension":"","value":600,"previous":1000,"unit":"count"}]'::jsonb));
  insert into s153 values ('avanzada', public.upsert_detected_opportunity(
    'f1534000-0000-0000-0000-000000000001', 'low_button_use', 'profile', 'high', 1.2,
    '2026-08-01', '2026-08-31',
    '[{"provider":"business_profile","metric":"profile_impressions","dimension":"","value":900,"previous":null,"unit":"count"}]'::jsonb));
  insert into s153 values ('sin_subir', public.upsert_detected_opportunity(
    'f1534000-0000-0000-0000-000000000001', 'slowness', '', 'medium', 4.2,
    '2026-08-01', '2026-08-31',
    '[{"provider":"pagespeed","metric":"lcp","dimension":"","value":4.2,"previous":null,"unit":"seconds"}]'::jsonb));
  insert into s153 values ('del_basico', public.upsert_detected_opportunity(
    'f1534000-0000-0000-0000-000000000002', 'traffic_drop', '', 'high', 40,
    '2026-08-01', '2026-08-31',
    '[{"provider":"ga4","metric":"sessions","dimension":"","value":600,"previous":1000,"unit":"count"}]'::jsonb));
end $$;

do $$
begin
  if (select scope from public.opportunities where id = (select v from s153 where k = 'avanzada')) <> 'advanced'
     or (select scope from public.opportunities where id = (select v from s153 where k = 'basica')) <> 'basic' then
    raise exception 'RN-OPP-01 FALLIDO: el alcance de las reglas de prueba no es el esperado' using errcode = 'assert_failure';
  end if;
end $$;

-- El equipo sube tres al informe; la lenta se queda sin subir.
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub', 'f1530000-0000-0000-0000-000000000001', true);
  perform public.set_opportunity_status((select v from s153 where k = 'basica'), 'approved_for_report');
  perform public.set_opportunity_status((select v from s153 where k = 'avanzada'), 'approved_for_report');
  perform public.set_opportunity_status((select v from s153 where k = 'del_basico'), 'approved_for_report');
end $$;

do $$
begin
  perform set_config('request.jwt.claim.sub', 'f1530000-0000-0000-0000-000000000002', true);
  if (select count(*) from public.opportunities where id = (select v from s153 where k = 'basica')) <> 1 then
    raise exception 'RN-CRE-27 FALLIDO: el restaurante no ve la básica que se le subió al informe' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.opportunities where id = (select v from s153 where k = 'avanzada')) <> 1 then
    raise exception 'RN-CRE-27 FALLIDO: el restaurante no ve la avanzada que se le subió al informe' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.opportunities where id = (select v from s153 where k = 'sin_subir')) <> 0 then
    raise exception 'RN-CRE-27 FALLIDO: el restaurante ve una oportunidad que el equipo no le subió' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.opportunities where establishment_id <> 'f1534000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve oportunidades de otro restaurante' using errcode = 'assert_failure';
  end if;

  -- El de entrada: ninguna, aunque el equipo la haya subido.
  perform set_config('request.jwt.claim.sub', 'f1530000-0000-0000-0000-000000000003', true);
  if (select count(*) from public.opportunities) <> 0 then
    raise exception 'RN-CRE-27 FALLIDO: el plan de entrada ve oportunidades' using errcode = 'assert_failure';
  end if;
end $$;

rollback;
