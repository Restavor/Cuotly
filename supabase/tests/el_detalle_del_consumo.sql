-- ============================================================
-- Suite 85 · El detalle del consumo de créditos
--            (migración 151; decisión 85; PRD RN-CRE-16)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-CRE-16 · debajo de la barra, una fila por solicitud con lo que
--     gastó en el ciclo y su porcentaje del plan, calculado en el servidor.
--     Una solicitud cancelada antes de empezar suma cero y no sale. Los
--     créditos extra sin solicitud (RN-CRE-15) van en una fila de ajuste,
--     en negativo. El detalle y la barra cuentan lo mismo.
--   · Solo lo ve quien puede leer el restaurante: otro restaurante del
--     mismo espacio no ve nada. Sin plan con créditos, sin filas.
--   · CLAUDE.md · privilegios.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_detalle_del_consumo.sql
--
-- Prefijo de esta suite: f1510000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1510000-0000-0000-0000-000000000001', 'duena-det@cuotly.test', 'authenticated', 'authenticated'),
  ('f1510000-0000-0000-0000-000000000002', 'cliente-det@cuotly.test', 'authenticated', 'authenticated'),
  ('f1510000-0000-0000-0000-000000000003', 'otro-det@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1510000-0000-0000-0000-000000000001', 'duena-det@cuotly.test', 'Dueña Detalle'),
  ('f1510000-0000-0000-0000-000000000002', 'cliente-det@cuotly.test', 'Cliente Detalle'),
  ('f1510000-0000-0000-0000-000000000003', 'otro-det@cuotly.test', 'Otro Detalle')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1511000-0000-0000-0000-000000000001', 'Espacio Detalle', 'espacio-detalle', 'Europe/Madrid',
   'f1510000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1511000-0000-0000-0000-000000000001', 'f1510000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium,
                          included_large, start_sla_hours, included_credits_half) values
  ('f1512000-0000-0000-0000-000000000001', 'f1511000-0000-0000-0000-000000000001', 'Veinte', 9900,
   0, 0, 0, 0, 24, 40),
  ('f1512000-0000-0000-0000-000000000002', 'f1511000-0000-0000-0000-000000000001', 'Sin créditos', 2000,
   0, 0, 0, 0, 48, 0);

insert into public.groups (id, space_id, name) values
  ('f1513000-0000-0000-0000-000000000001', 'f1511000-0000-0000-0000-000000000001', 'Grupo Detalle');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1514000-0000-0000-0000-000000000001', 'f1511000-0000-0000-0000-000000000001',
   'f1513000-0000-0000-0000-000000000001', 'EST-DET-1', 'Casa Detalle', 'active'),
  ('f1514000-0000-0000-0000-000000000002', 'f1511000-0000-0000-0000-000000000001',
   'f1513000-0000-0000-0000-000000000001', 'EST-DET-2', 'Otra Casa', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1514000-0000-0000-0000-000000000001', 'f1510000-0000-0000-0000-000000000002', 'local_owner'),
  ('f1514000-0000-0000-0000-000000000002', 'f1510000-0000-0000-0000-000000000003', 'local_owner');

create temp table det_ids (k text primary key, v uuid);
grant select, insert, update on det_ids to authenticated, service_role;

-- Una solicitud valorada por la IA y aceptada por el restaurante.
create or replace function pg_temp.det_accepted(p_title text, p_half integer)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', 'f1510000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  v_id := public.create_request_draft('f1514000-0000-0000-0000-000000000001', p_title, null, 'medium', 'Lo necesitamos');
  perform public.submit_request(v_id);
  perform public.begin_request_analysis(v_id);
  set local role postgres;
  perform public.record_credit_valuation(v_id, 'f1510000-0000-0000-0000-000000000002', p_half, null,
    'Resumen de ' || p_title, 'claude-opus-5');
  set local role authenticated;
  perform public.accept_request(v_id);
  set local role postgres;
  return v_id;
end;
$$;

-- ============================================================
-- CLAUDE.md · privilegios
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.establishment_credit_detail(uuid)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: anon puede leer el detalle del consumo' using errcode = 'assert_failure';
  end if;
  if not has_function_privilege('authenticated', 'public.establishment_credit_detail(uuid)', 'execute') then
    raise exception 'RN-CRE-16 FALLIDO: el restaurante no puede leer su detalle' using errcode = 'assert_failure';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1510000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.create_plan_subscription('f1514000-0000-0000-0000-000000000001', 'f1512000-0000-0000-0000-000000000001');
  perform public.create_plan_subscription('f1514000-0000-0000-0000-000000000002', 'f1512000-0000-0000-0000-000000000002');
end $$;
set local role postgres;

-- ============================================================
-- RN-CRE-16 · una fila por solicitud, neta, con su porcentaje
-- ============================================================
do $$
declare
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_cycle uuid;
  v_filas integer;
  v_fila record;
  v_suma integer;
  v_barra record;
begin
  v_a := pg_temp.det_accepted('Cambiar el teléfono y el horario', 8);   -- 4 créditos: 20 %
  v_b := pg_temp.det_accepted('Nueva sección de eventos', 13);          -- 6,5 créditos: 33 %
  v_c := pg_temp.det_accepted('Cambiar la foto de portada', 3);         -- se cancela antes de empezar

  perform set_config('request.jwt.claim.sub', 'f1510000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  perform public.cancel_accepted_request(v_c, 'Ya no la necesitamos');
  set local role postgres;

  -- RN-CRE-15 · créditos extra sin solicitud (una mejora de plan): un
  -- apunte compensatorio de +2 medios créditos en el ciclo vigente.
  select id into v_cycle from public.consumption_cycles
  where establishment_id = 'f1514000-0000-0000-0000-000000000001'
    and now() >= cycle_start and now() < cycle_end;
  insert into public.consumption_entries
    (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason)
  values ('f1511000-0000-0000-0000-000000000001', 'f1514000-0000-0000-0000-000000000001', v_cycle,
          'credits', 2, 'compensatory_credit', 'Mejora de plan (RN-CRE-15)');

  perform set_config('request.jwt.claim.sub', 'f1510000-0000-0000-0000-000000000002', true);
  set local role authenticated;

  select count(*) into v_filas from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000001');
  if v_filas <> 3 then
    raise exception 'RN-CRE-16 FALLIDO: el detalle tiene % filas y debían ser 3 (dos solicitudes y un ajuste)', v_filas
      using errcode = 'assert_failure';
  end if;

  select * into v_fila from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000001')
  where request_id = v_a;
  if v_fila.kind <> 'request' or v_fila.used_half <> 8 or v_fila.percent_of_plan <> 20
     or v_fila.request_description <> 'Cambiar el teléfono y el horario' or v_fila.request_code is null then
    raise exception 'RN-CRE-16 FALLIDO: la primera solicitud sale como % / % / % %%', v_fila.kind, v_fila.used_half,
      v_fila.percent_of_plan using errcode = 'assert_failure';
  end if;

  select * into v_fila from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000001')
  where request_id = v_b;
  if v_fila.used_half <> 13 or v_fila.percent_of_plan <> 33 then
    raise exception 'RN-CRE-16 FALLIDO: 6,5 créditos de 20 deberían ser el 33 %% y salen % / %', v_fila.used_half,
      v_fila.percent_of_plan using errcode = 'assert_failure';
  end if;

  -- La cancelada antes de empezar se devolvió entera: no gasta, no sale.
  if exists (select 1 from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000001')
             where request_id = v_c) then
    raise exception 'RN-CRE-16 FALLIDO: una solicitud cancelada antes de empezar sale como gasto' using errcode = 'assert_failure';
  end if;

  select * into v_fila from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000001')
  where kind = 'adjustment';
  if v_fila.request_id is not null or v_fila.used_half <> -2 or v_fila.percent_of_plan <> -5 then
    raise exception 'RN-CRE-15 FALLIDO: el ajuste sale como % / %', v_fila.used_half, v_fila.percent_of_plan
      using errcode = 'assert_failure';
  end if;

  -- El detalle y la barra cuentan lo mismo.
  select sum(used_half) into v_suma from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000001');
  select * into v_barra from public.establishment_credit_balance('f1514000-0000-0000-0000-000000000001');
  if v_suma <> v_barra.used_half or v_barra.used_half <> 19 then
    raise exception 'RN-CRE-16 FALLIDO: el detalle suma % y la barra dice %', v_suma, v_barra.used_half
      using errcode = 'assert_failure';
  end if;

  -- Otro restaurante del mismo espacio no ve nada de este.
  perform set_config('request.jwt.claim.sub', 'f1510000-0000-0000-0000-000000000003', true);
  if exists (select 1 from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000001')) then
    raise exception 'RN-CRE-16 FALLIDO: otro restaurante lee el detalle de este' using errcode = 'assert_failure';
  end if;
  -- Y el suyo, sin créditos en el plan, no tiene filas (sin datos de relleno).
  if exists (select 1 from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000002')) then
    raise exception 'RN-CRE-16 FALLIDO: un plan sin créditos devuelve detalle' using errcode = 'assert_failure';
  end if;

  -- El equipo ve lo mismo.
  perform set_config('request.jwt.claim.sub', 'f1510000-0000-0000-0000-000000000001', true);
  select count(*) into v_filas from public.establishment_credit_detail('f1514000-0000-0000-0000-000000000001');
  if v_filas <> 3 then
    raise exception 'RN-CRE-16 FALLIDO: el equipo ve % filas', v_filas using errcode = 'assert_failure';
  end if;
  set local role postgres;
end $$;

select 'el_detalle_del_consumo.sql: RN-CRE-16 y RN-CRE-15 cumplidos' as resultado;

rollback;
