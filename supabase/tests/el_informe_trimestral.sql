-- ============================================================
-- Suite 81 · El informe trimestral y el tráfico de la web
--            (migración 145; decisión 83; PRD RN-REP-32 y RN-REP-33)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-REP-32 · el periodo del informe es un término del plan: se crea,
--     se edita en el sitio si nadie lo tiene, crea versión si alguien lo
--     tiene, y pasar de mensual a trimestral PERJUDICA (pide aceptación).
--     Editar sin mandarlo no se lo cambia a nadie.
--   · RN-REP-32 · `establishment_report_period()` dice el del plan vigente,
--     `month` sin plan, y `month` también a quien no es de ese restaurante:
--     qué plan paga un restaurante no es de nadie más.
--   · RN-REP-33 · "Tráfico de la web" está en el catálogo, en los cinco
--     niveles, entra marcada en las tres familias, no pide criterio y un
--     borrador nuevo la trae.
--   · CLAUDE.md · anon no ejecuta nada nuevo; la función de lectura queda
--     para authenticated y comprueba el acceso por dentro.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_informe_trimestral.sql
--
-- Prefijo de esta suite: f1450000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1450000-0000-0000-0000-000000000001', 'duena83@cuotly.test', 'authenticated', 'authenticated'),
  ('f1450000-0000-0000-0000-000000000002', 'cliente83@cuotly.test', 'authenticated', 'authenticated'),
  ('f1450000-0000-0000-0000-000000000003', 'ajeno83@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1450000-0000-0000-0000-000000000001', 'duena83@cuotly.test', 'Dueña 83'),
  ('f1450000-0000-0000-0000-000000000002', 'cliente83@cuotly.test', 'Cliente 83'),
  ('f1450000-0000-0000-0000-000000000003', 'ajeno83@cuotly.test', 'Ajeno 83')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1451000-0000-0000-0000-000000000001', 'Espacio 83', 'espacio-83', 'Europe/Madrid',
   'f1450000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1451000-0000-0000-0000-000000000001', 'f1450000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('f1453000-0000-0000-0000-000000000001', 'f1451000-0000-0000-0000-000000000001', 'Grupo 83');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1454000-0000-0000-0000-000000000001', 'f1451000-0000-0000-0000-000000000001',
   'f1453000-0000-0000-0000-000000000001', 'EST-83-1', 'Casa Trimestre', 'active'),
  ('f1454000-0000-0000-0000-000000000002', 'f1451000-0000-0000-0000-000000000001',
   'f1453000-0000-0000-0000-000000000001', 'EST-83-2', 'Casa Sin Plan', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1454000-0000-0000-0000-000000000001', 'f1450000-0000-0000-0000-000000000002', 'local_owner');

-- ============================================================
-- CLAUDE.md · los privilegios de lo nuevo
-- ============================================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.create_plan(uuid, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text, text)',
    'public.revise_plan(uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, boolean, integer, text, boolean, text, text)',
    'public.establishment_report_period(uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar %', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '% debería poder llamarla authenticated', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  -- Las firmas viejas no pueden quedar vivas a la vez: una llamada sin el
  -- parámetro nuevo sería ambigua.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('create_plan', 'revise_plan') and p.pronargs <> 19 - (p.proname = 'revise_plan')::int
  ) then
    raise exception 'RN-REP-32 FALLIDO: sigue viva una firma vieja de create_plan o revise_plan' using errcode = 'assert_failure';
  end if;

  if has_function_privilege('authenticated', 'public.plan_terms_diff_internal(uuid, uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: plan_terms_diff_internal está abierta a authenticated' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-REP-33 · "Tráfico de la web", en el catálogo y en los cinco niveles
-- ============================================================
do $$
declare
  v_nivel text;
begin
  if not ('web_traffic' = any (public.report_sections_catalogue())) then
    raise exception 'RN-REP-33 FALLIDO: la sección no está en el catálogo' using errcode = 'assert_failure';
  end if;
  if array_position(public.report_sections_catalogue(), 'web_traffic')
     <> array_position(public.report_sections_catalogue(), 'month_activity') + 1 then
    raise exception 'RN-REP-33 FALLIDO: el tráfico no va justo detrás del relato' using errcode = 'assert_failure';
  end if;

  foreach v_nivel in array array['basic', 'standard', 'standard_plus', 'advanced', 'complete'] loop
    if not public.report_level_allows(v_nivel, 'web_traffic') then
      raise exception 'RN-REP-33 FALLIDO: el nivel % no admite el tráfico de la web', v_nivel using errcode = 'assert_failure';
    end if;
  end loop;
  if public.report_level_allows('platino', 'web_traffic') then
    raise exception 'RN-REP-15 FALLIDO: un nivel inventado admite el tráfico' using errcode = 'assert_failure';
  end if;

  -- Y lo demás no se ha movido: un Básico sigue sin Operación ni
  -- Rendimiento digital (decisión 58).
  if public.report_level_allows('basic', 'operation') or public.report_level_allows('basic', 'digital') then
    raise exception 'RN-REP-15 FALLIDO: el Básico ganó una sección que no paga' using errcode = 'assert_failure';
  end if;

  if not (public.report_section_default_included('operation', 'web_traffic')
          and public.report_section_default_included('finance', 'web_traffic')
          and public.report_section_default_included('digital', 'web_traffic')) then
    raise exception 'RN-REP-33 FALLIDO: el tráfico no entra marcado en las tres familias' using errcode = 'assert_failure';
  end if;
  if public.report_section_requires_judgement('web_traffic') then
    raise exception 'RN-REP-09 FALLIDO: el tráfico son cifras y pide criterio' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-REP-32 · el periodo, en el plan
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1450000-0000-0000-0000-000000000001';

do $$
declare
  v_mensual uuid;
  v_trimestral uuid;
begin
  -- Sin decirlo, mensual: lo que tenían todos los planes hasta hoy.
  v_mensual := public.create_plan('f1451000-0000-0000-0000-000000000001', 'Mensual 83', 5000,
    0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'crear-83-m');
  if (select report_period from public.plans where id = v_mensual) <> 'month' then
    raise exception 'RN-REP-32 FALLIDO: un plan creado sin periodo no es mensual' using errcode = 'assert_failure';
  end if;

  v_trimestral := public.create_plan('f1451000-0000-0000-0000-000000000001', 'Trimestral 83', 2000,
    0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'crear-83-t', 'quarter');
  if (select report_period from public.plans where id = v_trimestral) <> 'quarter' then
    raise exception 'RN-REP-32 FALLIDO: el plan trimestral no se guardó trimestral' using errcode = 'assert_failure';
  end if;

  begin
    perform public.create_plan('f1451000-0000-0000-0000-000000000001', 'Semanal 83', 2000,
      0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, null, 'week');
    raise exception 'RN-REP-32 FALLIDO: aceptó un periodo que no existe' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  perform set_config('suite83.mensual', v_mensual::text, true);
  perform set_config('suite83.trimestral', v_trimestral::text, true);
end $$;

-- RN-COM-21 · sin nadie, se edita en el sitio; y editar sin mandar el
-- periodo no lo cambia.
do $$
declare
  v_plan uuid := current_setting('suite83.trimestral')::uuid;
  v_res uuid;
begin
  v_res := public.revise_plan(v_plan, 2500, 0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false, 'editar-83-1');
  if v_res <> v_plan then
    raise exception 'RN-COM-21 FALLIDO: un plan sin restaurantes creó versión nueva' using errcode = 'assert_failure';
  end if;
  if (select report_period from public.plans where id = v_plan) <> 'quarter' then
    raise exception 'RN-REP-32 FALLIDO: editar sin mandar el periodo se lo cambió' using errcode = 'assert_failure';
  end if;

  perform public.revise_plan(v_plan, 2500, 0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false,
    'editar-83-2', 'month');
  if (select report_period from public.plans where id = v_plan) <> 'month' then
    raise exception 'RN-REP-32 FALLIDO: el periodo no se editó en el sitio' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where entity_id = v_plan and action = 'plan.edited'
                 and old_value->>'report_period' = 'quarter' and new_value->>'report_period' = 'month') then
    raise exception 'RN-COM-21 FALLIDO: el cambio de periodo no quedó en la auditoría' using errcode = 'assert_failure';
  end if;

  -- Se deja trimestral otra vez para lo que sigue.
  perform public.revise_plan(v_plan, 2500, 0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false,
    'editar-83-3', 'quarter');
end $$;

-- ============================================================
-- RN-REP-32 · el periodo de un restaurante
-- ============================================================
set local role postgres;

insert into public.subscriptions (space_id, establishment_id, kind, plan_id)
values ('f1451000-0000-0000-0000-000000000001', 'f1454000-0000-0000-0000-000000000001', 'plan',
        current_setting('suite83.trimestral')::uuid);

set local role authenticated;

do $$
begin
  -- El equipo del espacio.
  perform set_config('request.jwt.claim.sub', 'f1450000-0000-0000-0000-000000000001', true);
  if public.establishment_report_period('f1454000-0000-0000-0000-000000000001') <> 'quarter' then
    raise exception 'RN-REP-32 FALLIDO: el equipo no ve el periodo trimestral del plan' using errcode = 'assert_failure';
  end if;
  -- Sin plan (solo Menú Diario, o nada), mensual: como hasta hoy.
  if public.establishment_report_period('f1454000-0000-0000-0000-000000000002') <> 'month' then
    raise exception 'RN-REP-32 FALLIDO: un restaurante sin plan no es mensual' using errcode = 'assert_failure';
  end if;

  -- El restaurante, el suyo.
  perform set_config('request.jwt.claim.sub', 'f1450000-0000-0000-0000-000000000002', true);
  if public.establishment_report_period('f1454000-0000-0000-0000-000000000001') <> 'quarter' then
    raise exception 'RN-REP-32 FALLIDO: el restaurante no ve el periodo de su plan' using errcode = 'assert_failure';
  end if;

  -- Alguien de fuera recibe lo mismo que sin plan: no se deduce nada.
  perform set_config('request.jwt.claim.sub', 'f1450000-0000-0000-0000-000000000003', true);
  if public.establishment_report_period('f1454000-0000-0000-0000-000000000001') <> 'month' then
    raise exception 'RN-REP-32 FALLIDO: alguien de fuera averigua el plan del restaurante' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-COM-20 y RN-COM-23 · con alguien dentro, versión nueva; y pasar de
-- trimestral a mensual favorece, al revés perjudica
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1450000-0000-0000-0000-000000000001';

do $$
declare
  v_plan uuid := current_setting('suite83.trimestral')::uuid;
  v_v2 uuid;
  v_v3 uuid;
begin
  v_v2 := public.revise_plan(v_plan, 2500, 0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false,
    'version-83-2', 'month');
  if v_v2 = v_plan then
    raise exception 'RN-COM-20 FALLIDO: cambiar el periodo de un plan con restaurantes no creó versión' using errcode = 'assert_failure';
  end if;
  if (select report_period from public.plans where id = v_plan) <> 'quarter' then
    raise exception 'RN-COM-28 FALLIDO: la versión nueva reescribió la anterior' using errcode = 'assert_failure';
  end if;

  set local role postgres;
  if public.revision_harms_internal('plan', v_plan, v_v2) then
    raise exception 'RN-COM-23 FALLIDO: pasar de trimestral a mensual cuenta como perjuicio' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.plan_terms_diff_internal(v_plan, v_v2) d
                 where d.field = 'report_period' and d.better and d.client_visible) then
    raise exception 'RN-COM-30 FALLIDO: la comparativa no enseña el periodo como mejora' using errcode = 'assert_failure';
  end if;
  set local role authenticated;

  v_v3 := public.revise_plan(v_v2, 2500, 0, 0, 0, 0, 48, 72, 72, 72, 120, false, false, 0, 'basic', false,
    'version-83-3', 'quarter');

  set local role postgres;
  if not public.revision_harms_internal('plan', v_v2, v_v3) then
    raise exception 'RN-COM-23 FALLIDO: pasar de mensual a trimestral no pide aceptación' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-REP-33 · un borrador nuevo trae la sección, marcada
-- ============================================================
set local role authenticated;
set local request.jwt.claim.sub = 'f1450000-0000-0000-0000-000000000001';

do $$
declare
  v_id uuid;
begin
  v_id := public.create_report_draft(
    'f1451000-0000-0000-0000-000000000001', 'operation', 'Informe del trimestre de julio a septiembre de 2026',
    '2026-07-01', '2026-09-30', 'f1454000-0000-0000-0000-000000000001');

  set local role postgres;
  if not coalesce((select included from public.report_sections
                   where report_id = v_id and section_key = 'web_traffic'), false) then
    raise exception 'RN-REP-33 FALLIDO: el borrador de un Básico no trae el tráfico marcado' using errcode = 'assert_failure';
  end if;
  -- RN-REP-15 · y la barrera de siempre: sin Operación ni Rendimiento digital.
  if coalesce((select included from public.report_sections
               where report_id = v_id and section_key = 'digital'), false) then
    raise exception 'RN-REP-15 FALLIDO: el borrador de un Básico trae Rendimiento digital' using errcode = 'assert_failure';
  end if;
end $$;

rollback;
