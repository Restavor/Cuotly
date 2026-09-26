-- ============================================================
-- Suite 83 · El motor de créditos (migración 149; decisión 85; PRD §41,
--            RN-CRE-04 a RN-CRE-19)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-CRE-04/05 · medios créditos enteros; 0,5 de procesamiento más las
--     partidas; el desglose tiene que cuadrar.
--   · RN-CRE-09 · la IA fija los créditos y la solicitud pasa directamente a
--     que el restaurante acepte, parando T1. Una incidencia va al equipo.
--   · RN-CRE-10 · el equipo fija o corrige antes de aceptar; el restaurante
--     no; después de aceptar, nadie.
--   · RN-CRE-11/12 · al aceptar se gasta exactamente lo valorado, con su
--     apunte en el libro; la barra dice el porcentaje; los créditos quedan
--     fijos (no se reabre la aceptación).
--   · RN-CRE-13 · cancelar antes de comenzar devuelve lo gastado.
--   · RN-CRE-14 · si no llega, error `CRE14` y no se gasta nada; esperar al
--     ciclo siguiente y el barrido que acepta en nombre del restaurante.
--   · RN-CRE-07 · sin créditos en el plan, se presupuesta: no hay débito.
--   · RN-CRE-15 · el cambio de plan da créditos proporcionales.
--   · RN-CRE-16/17 · la barra y los avisos del 80 % y el 100 %.
--   · RN-CRE-18/19 · el plazo sale de los créditos; por encima de 20, lo fija
--     el equipo antes de comenzar.
--   · RN-CRE-01 · crear y editar los créditos de un plan; bajarlos
--     perjudica.
--   · CLAUDE.md · privilegios de todo lo nuevo.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_motor_de_creditos.sql
--
-- Prefijo de esta suite: f1490000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('f1490000-0000-0000-0000-000000000001', 'duena-cre@cuotly.test', 'authenticated', 'authenticated'),
  ('f1490000-0000-0000-0000-000000000002', 'cliente-cre@cuotly.test', 'authenticated', 'authenticated'),
  ('f1490000-0000-0000-0000-000000000003', 'trabajador-cre@cuotly.test', 'authenticated', 'authenticated'),
  ('f1490000-0000-0000-0000-000000000004', 'cliente2-cre@cuotly.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('f1490000-0000-0000-0000-000000000001', 'duena-cre@cuotly.test', 'Dueña Créditos'),
  ('f1490000-0000-0000-0000-000000000002', 'cliente-cre@cuotly.test', 'Cliente Créditos'),
  ('f1490000-0000-0000-0000-000000000003', 'trabajador-cre@cuotly.test', 'Trabajador Créditos'),
  ('f1490000-0000-0000-0000-000000000004', 'cliente2-cre@cuotly.test', 'Cliente Premium')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('f1491000-0000-0000-0000-000000000001', 'Espacio Créditos', 'espacio-creditos', 'Europe/Madrid',
   'f1490000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1491000-0000-0000-0000-000000000001', 'f1490000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f1491000-0000-0000-0000-000000000001', 'f1490000-0000-0000-0000-000000000003', 'worker', 'active');

-- Tres planes: uno con 20 créditos (40 medios), uno con 40 (80 medios) y
-- uno sin créditos. Sin ninguna categoría: todo va por créditos.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium,
                          included_large, start_sla_hours, included_credits_half) values
  ('f1492000-0000-0000-0000-000000000001', 'f1491000-0000-0000-0000-000000000001', 'Veinte', 9900,
   0, 0, 0, 0, 24, 40),
  ('f1492000-0000-0000-0000-000000000002', 'f1491000-0000-0000-0000-000000000001', 'Cuarenta', 19900,
   0, 0, 0, 0, 24, 80),
  ('f1492000-0000-0000-0000-000000000003', 'f1491000-0000-0000-0000-000000000001', 'Sin créditos', 2000,
   0, 0, 0, 0, 48, 0);

insert into public.groups (id, space_id, name) values
  ('f1493000-0000-0000-0000-000000000001', 'f1491000-0000-0000-0000-000000000001', 'Grupo Créditos');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('f1494000-0000-0000-0000-000000000001', 'f1491000-0000-0000-0000-000000000001',
   'f1493000-0000-0000-0000-000000000001', 'EST-CRE-1', 'Casa Veinte', 'active'),
  ('f1494000-0000-0000-0000-000000000002', 'f1491000-0000-0000-0000-000000000001',
   'f1493000-0000-0000-0000-000000000001', 'EST-CRE-2', 'Casa Cuarenta', 'active'),
  ('f1494000-0000-0000-0000-000000000003', 'f1491000-0000-0000-0000-000000000001',
   'f1493000-0000-0000-0000-000000000001', 'EST-CRE-3', 'Casa Sin Créditos', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f1494000-0000-0000-0000-000000000001', 'f1490000-0000-0000-0000-000000000002', 'local_owner'),
  ('f1494000-0000-0000-0000-000000000003', 'f1490000-0000-0000-0000-000000000002', 'local_owner'),
  ('f1494000-0000-0000-0000-000000000002', 'f1490000-0000-0000-0000-000000000004', 'local_owner');

insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('f1491000-0000-0000-0000-000000000001', 'f1490000-0000-0000-0000-000000000003',
   'f1494000-0000-0000-0000-000000000002', 'f1490000-0000-0000-0000-000000000001');
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('f1491000-0000-0000-0000-000000000001', 'f1490000-0000-0000-0000-000000000003', 'web',
   'f1490000-0000-0000-0000-000000000001');

create temp table cre_ids (k text primary key, v uuid);
grant select, insert, update on cre_ids to authenticated, service_role;

-- Lleva un borrador del restaurante hasta `analyzing`.
create or replace function pg_temp.cre_request(p_establishment uuid, p_client uuid, p_title text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_client::text, true);
  set local role authenticated;
  v_id := public.create_request_draft(p_establishment, p_title, null, 'medium', 'Lo necesitamos');
  perform public.submit_request(v_id);
  perform public.begin_request_analysis(v_id);
  set local role postgres;
  return v_id;
end;
$$;

-- Un desglose de N partidas de medio crédito.
create or replace function pg_temp.cre_items(p_halves integer[])
returns jsonb
language sql
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
    'description', 'Partida ' || i, 'credits_half', h)), '[]'::jsonb))
  from unnest(p_halves) with ordinality as t(h, i);
$$;

-- ============================================================
-- CLAUDE.md · privilegios
-- ============================================================
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.set_request_credits(uuid, integer, jsonb, text, text)',
    'public.defer_request_to_next_cycle(uuid)',
    'public.establishment_credit_balance(uuid)',
    'public.set_job_execution_days(uuid, integer)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: anon puede ejecutar %', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '% debería poder llamarla authenticated', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  foreach v_fn in array array[
    'public.record_credit_valuation(uuid, uuid, integer, jsonb, text, text, integer, integer, integer, text)',
    'public.run_deferred_credit_requests(uuid)',
    'public.plan_change_proration(uuid, uuid)',
    'public.request_new_client_acceptance_categories(uuid, text, text, text)',
    'public.credit_breakdown_total_internal(jsonb)',
    'public.assert_credit_breakdown_internal(integer, jsonb)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: % está abierta por RPC', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  if not has_column_privilege('authenticated', 'public.requests', 'validated_credits_half', 'select')
     or not has_column_privilege('authenticated', 'public.requests', 'credit_breakdown', 'select')
     or not has_column_privilege('authenticated', 'public.requests', 'credits_deferred_until', 'select') then
    raise exception 'RN-CRE-11 FALLIDO: el restaurante no puede leer lo que le cuesta su solicitud' using errcode = 'assert_failure';
  end if;
  if has_column_privilege('authenticated', 'public.requests', 'credits_deferred_by', 'select') then
    raise exception 'CLAUDE.md FALLIDO: requests.credits_deferred_by se lee por columna' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-18 · los tramos del plazo
-- ============================================================
do $$
declare
  r record;
begin
  for r in select * from (values
    (1, 48), (8, 48), (9, 72), (20, 72), (21, 96), (30, 96), (31, 120), (40, 120)
  ) as t(h, horas) loop
    if public.credit_execution_sla_hours(r.h) is distinct from r.horas then
      raise exception 'RN-CRE-18 FALLIDO: % medios créditos deberían dar % h y dan %',
        r.h, r.horas, public.credit_execution_sla_hours(r.h) using errcode = 'assert_failure';
    end if;
  end loop;
  -- RN-CRE-19 · más de 20 créditos: sin plazo automático.
  if public.credit_execution_sla_hours(41) is not null then
    raise exception 'RN-CRE-19 FALLIDO: más de 20 créditos tiene plazo automático' using errcode = 'assert_failure';
  end if;
end $$;

-- Los planes, asignados por la propietaria.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.create_plan_subscription('f1494000-0000-0000-0000-000000000001', 'f1492000-0000-0000-0000-000000000001');
  perform public.create_plan_subscription('f1494000-0000-0000-0000-000000000002', 'f1492000-0000-0000-0000-000000000002');
  perform public.create_plan_subscription('f1494000-0000-0000-0000-000000000003', 'f1492000-0000-0000-0000-000000000003');
end $$;
set local role postgres;

-- ============================================================
-- RN-CRE-05 y RN-CRE-09 · la IA valora y pasa directo al restaurante
-- ============================================================
do $$
declare
  v_id uuid;
  v_class uuid;
  v_again uuid;
begin
  v_id := pg_temp.cre_request('f1494000-0000-0000-0000-000000000001',
    'f1490000-0000-0000-0000-000000000002', 'Cambiar teléfono, horario, una foto y una sección');
  insert into cre_ids values ('a', v_id);

  -- RN-CRE-05 · el desglose tiene que sumar 0,5 de procesamiento más las
  -- partidas: 0,5 + 0,5 + 0,5 + 2 + 0,5 = 4 créditos = 8 medios.
  begin
    perform public.record_credit_valuation(v_id, 'f1490000-0000-0000-0000-000000000002', 9,
      pg_temp.cre_items(array[1, 1, 1, 4]), 'Resumen', 'claude-haiku-4-5');
    raise exception 'RN-CRE-05 FALLIDO: aceptó un desglose que no suma el total' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  begin
    perform public.record_credit_valuation(v_id, 'f1490000-0000-0000-0000-000000000002', 0, null, 'Resumen', 'claude-haiku-4-5');
    raise exception 'RN-CRE-05 FALLIDO: una solicitud valorada en 0 créditos' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  v_class := public.record_credit_valuation(v_id, 'f1490000-0000-0000-0000-000000000002', 8,
    pg_temp.cre_items(array[1, 1, 1, 4]), 'Teléfono, horario, foto y parte de una sección',
    'claude-haiku-4-5', 1200, 300, 180, 'creditos-v1');

  -- RN-CRE-09 · sin validación del equipo: directo a aceptar.
  if not exists (select 1 from public.requests where id = v_id
                 and state = 'pending_client_acceptance' and validated_category = 'credits'
                 and validated_credits_half = 8 and validated_by is null) then
    raise exception 'RN-CRE-09 FALLIDO: la valoración de la IA no pasó directamente al restaurante' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.classifications where id = v_class
                 and proposed_credits_half = 8 and prompt_version = 'creditos-v1') then
    raise exception 'RN-CLS-04 FALLIDO: no se guardó lo que valoró la IA' using errcode = 'assert_failure';
  end if;
  -- RN-SLA-03 · T1 se para.
  if not exists (select 1 from public.timer_events where entity_id = v_id and counter_kind = 't1'
                 and event_type = 'stopped') then
    raise exception 'RN-SLA-03 FALLIDO: T1 no se paró al valorar' using errcode = 'assert_failure';
  end if;
  -- RN-CLS-05 · su coste.
  if not exists (select 1 from public.ai_usage where classification_id = v_class and estimated_cost_millicents = 180) then
    raise exception 'RN-CLS-05 FALLIDO: la valoración no dejó su coste' using errcode = 'assert_failure';
  end if;

  -- CA-17 · repetirla no crea otra.
  v_again := public.record_credit_valuation(v_id, 'f1490000-0000-0000-0000-000000000002', 8,
    pg_temp.cre_items(array[1, 1, 1, 4]), 'Otra vez', 'claude-haiku-4-5');
  if v_again <> v_class or (select count(*) from public.classifications where request_id = v_id) <> 1 then
    raise exception 'CA-17 FALLIDO: valorar dos veces creó dos valoraciones' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-10 · el equipo corrige antes de aceptar; el restaurante no
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.set_request_credits((select v from cre_ids where k = 'a'), 2, null, 'Más barato');
    raise exception 'RN-CRE-10 FALLIDO: el restaurante se fijó sus propios créditos' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.set_request_credits((select v from cre_ids where k = 'a'), 7,
    pg_temp.cre_items(array[1, 1, 4]), 'Teléfono, horario y parte de una sección', 'La foto ya estaba');
end $$;
set local role postgres;

do $$
begin
  if (select validated_credits_half from public.requests where id = (select v from cre_ids where k = 'a')) <> 7 then
    raise exception 'RN-CRE-10 FALLIDO: la corrección del equipo no quedó' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where entity_id = (select v from cre_ids where k = 'a')
                 and action = 'request.credits_set'
                 and (old_value ->> 'credits_half')::int = 8 and (new_value ->> 'credits_half')::int = 7) then
    raise exception 'RN-CRE-10 FALLIDO: la corrección no dejó el valor anterior y el nuevo' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-11 y RN-CRE-12 · aceptar gasta exactamente lo valorado
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000002', true);
do $$
begin
  perform public.accept_request((select v from cre_ids where k = 'a'));
  perform public.accept_request((select v from cre_ids where k = 'a')); -- CA-17
end $$;
set local role postgres;

do $$
declare
  v_id uuid := (select v from cre_ids where k = 'a');
  v_b record;
begin
  if (select count(*) from public.consumption_entries where request_id = v_id) <> 1
     or (select amount from public.consumption_entries where request_id = v_id) <> -7
     or (select category from public.consumption_entries where request_id = v_id) <> 'credits' then
    raise exception 'RN-CRE-12 FALLIDO: aceptar no gastó exactamente 3,5 créditos una sola vez' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.jobs where request_id = v_id and category = 'credits'
                 and credits_half = 7 and execution_sla_hours = 48) then
    raise exception 'RN-CRE-18 FALLIDO: el trabajo no lleva sus créditos ni el plazo de 1–2 días' using errcode = 'assert_failure';
  end if;

  -- RN-CRE-16 · la barra: 3,5 de 20 = 17,5 % → 18 %.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000002', true);
  select * into v_b from public.establishment_credit_balance('f1494000-0000-0000-0000-000000000001');
  set local role postgres;
  if v_b.included_half <> 40 or v_b.used_half <> 7 or v_b.remaining_half <> 33 or v_b.percent_used <> 18 then
    raise exception 'RN-CRE-16 FALLIDO: la barra dice % de % (% %%)', v_b.used_half, v_b.included_half, v_b.percent_used
      using errcode = 'assert_failure';
  end if;

  -- RN-CRE-12 · fijos: no se reabre la aceptación, ni el equipo los toca.
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin
    perform public.request_new_client_acceptance((select id from public.jobs where request_id = v_id),
      'small', 'Otra cosa', 'Probar');
    raise exception 'RN-CRE-12 FALLIDO: se reabrió la aceptación de un trabajo en créditos' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  begin
    perform public.set_request_credits(v_id, 2, null, 'Después', null);
    raise exception 'RN-CRE-12 FALLIDO: se cambiaron los créditos después de aceptar' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  set local role postgres;
end $$;

-- ============================================================
-- RN-CRE-14 · si no llega: error propio, nada gastado, y las salidas
-- ============================================================
do $$
declare
  v_big uuid;
  v_huge uuid;
  v_state text;
  v_until timestamptz;
begin
  -- Quedan 33 medios. Una de 17 créditos (34 medios) no cabe.
  v_big := pg_temp.cre_request('f1494000-0000-0000-0000-000000000001',
    'f1490000-0000-0000-0000-000000000002', 'Reestructurar tres secciones');
  insert into cre_ids values ('big', v_big);
  perform public.record_credit_valuation(v_big, 'f1490000-0000-0000-0000-000000000002', 34, null, 'Grande', 'claude-haiku-4-5');

  -- Y una de 20,5 créditos, que no cabe en un plan de 20 ni esperando.
  v_huge := pg_temp.cre_request('f1494000-0000-0000-0000-000000000001',
    'f1490000-0000-0000-0000-000000000002', 'Sección personalizada');
  insert into cre_ids values ('huge', v_huge);
  perform public.record_credit_valuation(v_huge, 'f1490000-0000-0000-0000-000000000002', 41, null, 'Personalizada', 'claude-haiku-4-5');

  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  begin
    perform public.accept_request(v_big);
    raise exception 'RN-CRE-14 FALLIDO: aceptó una solicitud que no cabe' using errcode = 'assert_failure';
  exception
    when assert_failure then raise;
    when sqlstate 'CRE14' then v_state := 'cre14';
  end;
  if v_state is distinct from 'cre14' then
    raise exception 'RN-CRE-14 FALLIDO: no llegó el error CRE14' using errcode = 'assert_failure';
  end if;

  -- No se puede esperar lo que nunca cabe.
  begin
    perform public.defer_request_to_next_cycle(v_huge);
    raise exception 'RN-CRE-14 FALLIDO: dejó esperar una solicitud que no cabe en ningún ciclo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  -- Esperar al ciclo siguiente.
  v_until := public.defer_request_to_next_cycle(v_big);
  if public.defer_request_to_next_cycle(v_big) <> v_until then -- CA-17
    raise exception 'CA-17 FALLIDO: esperar dos veces cambió la fecha' using errcode = 'assert_failure';
  end if;
  set local role postgres;

  if (select state from public.requests where id = v_big) <> 'pending_client_acceptance'
     or (select credits_deferred_until from public.requests where id = v_big) is distinct from v_until
     or exists (select 1 from public.consumption_entries where request_id = v_big) then
    raise exception 'RN-CRE-14 FALLIDO: la espera no quedó en espera o gastó algo' using errcode = 'assert_failure';
  end if;
  if v_until <= now() then
    raise exception 'RN-CRE-14 FALLIDO: la espera no es hasta el final del ciclo' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-13 · cancelar antes de comenzar devuelve lo gastado
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000002', true);
do $$
begin
  perform public.cancel_accepted_request((select v from cre_ids where k = 'a'), 'Ya no hace falta');
end $$;
set local role postgres;

do $$
declare
  v_id uuid := (select v from cre_ids where k = 'a');
begin
  if (select sum(amount) from public.consumption_entries where request_id = v_id) <> 0
     or not exists (select 1 from public.consumption_entries where request_id = v_id
                    and entry_type = 'return' and amount = 7) then
    raise exception 'RN-CRE-13 FALLIDO: cancelar no devolvió los 3,5 créditos' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-14 · el barrido acepta la espera cuando llega el día
-- ============================================================
do $$
declare
  v_big uuid := (select v from cre_ids where k = 'big');
  v_done integer;
begin
  -- Ya han vuelto los 3,5 créditos: caben los 17. Se simula que ha llegado
  -- el día de la renovación.
  update public.requests set credits_deferred_until = now() - interval '1 minute' where id = v_big;

  v_done := public.run_deferred_credit_requests('f1491000-0000-0000-0000-000000000001');

  if v_done <> 1 or (select state from public.requests where id = v_big) <> 'accepted'
     or (select accepted_by from public.requests where id = v_big) is distinct from 'f1490000-0000-0000-0000-000000000002'
     or (select credits_deferred_until from public.requests where id = v_big) is not null
     or (select amount from public.consumption_entries where request_id = v_big and entry_type = 'debit') <> -34 then
    raise exception 'RN-CRE-14 FALLIDO: el barrido no aceptó la espera en nombre de quien la pidió' using errcode = 'assert_failure';
  end if;

  -- Y el barrido deja la identidad como estaba.
  if current_setting('request.jwt.claim.sub', true) is distinct from 'f1490000-0000-0000-0000-000000000002' then
    raise exception 'El barrido no devolvió la identidad: %', current_setting('request.jwt.claim.sub', true)
      using errcode = 'assert_failure';
  end if;
end $$;

-- Una espera que al llegar el día ya no cabe: se cae y queda escrita.
do $$
declare
  v_id uuid;
begin
  -- Quedan 40 − 34 = 6 medios. Una de 5 créditos (10 medios) no cabe.
  v_id := pg_temp.cre_request('f1494000-0000-0000-0000-000000000001',
    'f1490000-0000-0000-0000-000000000002', 'Un bloque');
  perform public.record_credit_valuation(v_id, 'f1490000-0000-0000-0000-000000000002', 10, null, 'Bloque', 'claude-haiku-4-5');
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  perform public.defer_request_to_next_cycle(v_id);
  set local role postgres;

  update public.requests set credits_deferred_until = now() - interval '1 minute' where id = v_id;
  perform public.run_deferred_credit_requests('f1491000-0000-0000-0000-000000000001');

  if (select state from public.requests where id = v_id) <> 'pending_client_acceptance'
     or (select credits_deferred_until from public.requests where id = v_id) is not null
     or not exists (select 1 from public.audit_log where entity_id = v_id and action = 'request.deferral_expired') then
    raise exception 'RN-CRE-14 FALLIDO: una espera que no cabe no se cayó con su apunte' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-17 y el aviso del 80 % en créditos
-- ============================================================
do $$
begin
  -- 34 de 40 medios gastados: el 85 %.
  perform public.run_consumption_thresholds('f1491000-0000-0000-0000-000000000001');
  if not exists (select 1 from public.notifications
                 where recipient_id = 'f1490000-0000-0000-0000-000000000002'
                   and event_type = 'consumption_threshold_80' and dedupe_key like '%:credits') then
    raise exception 'RN-CRE-17 FALLIDO: no se avisó del 80 %% de los créditos' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-07 · sin créditos en el plan: presupuesto, sin débito; e
--             incidencias, al equipo
-- ============================================================
do $$
declare
  v_id uuid;
  v_inc uuid;
begin
  v_id := pg_temp.cre_request('f1494000-0000-0000-0000-000000000003',
    'f1490000-0000-0000-0000-000000000002', 'Cambiar un precio');
  perform public.record_credit_valuation(v_id, 'f1490000-0000-0000-0000-000000000002', 2, null, 'Precio', 'claude-haiku-4-5');
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  perform public.accept_request(v_id);
  set local role postgres;
  if exists (select 1 from public.consumption_entries where request_id = v_id)
     or not (select budgeted from public.acceptances where request_id = v_id) then
    raise exception 'RN-CRE-07 FALLIDO: un plan sin créditos gastó créditos' using errcode = 'assert_failure';
  end if;

  -- Una incidencia valorada por la IA no se cobra: va al equipo.
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  v_inc := public.create_request_draft('f1494000-0000-0000-0000-000000000001', 'La web no carga', null, 'high', 'Urge');
  perform public.set_request_kind(v_inc, 'incident');
  perform public.submit_request(v_inc);
  perform public.begin_request_analysis(v_inc);
  set local role postgres;
  perform public.record_credit_valuation(v_inc, 'f1490000-0000-0000-0000-000000000002', 2, null, 'Incidencia', 'claude-haiku-4-5');
  if (select state from public.requests where id = v_inc) <> 'pending_internal_validation'
     or (select validated_credits_half from public.requests where id = v_inc) is not null then
    raise exception 'RN-CRE-07 FALLIDO: una incidencia se valoró en créditos para el restaurante' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-19 · más de 20 créditos: el plazo lo fija el equipo
-- ============================================================
do $$
declare
  v_id uuid;
  v_job uuid;
  v_small uuid;
begin
  v_id := pg_temp.cre_request('f1494000-0000-0000-0000-000000000002',
    'f1490000-0000-0000-0000-000000000004', 'Sección personalizada y más');
  perform public.record_credit_valuation(v_id, 'f1490000-0000-0000-0000-000000000004', 42, null, 'Grande', 'claude-haiku-4-5');
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000004', true);
  set local role authenticated;
  perform public.accept_request(v_id);
  set local role postgres;

  select id into v_job from public.jobs where request_id = v_id;
  if (select execution_sla_hours from public.jobs where id = v_job) is not null then
    raise exception 'RN-CRE-19 FALLIDO: más de 20 créditos con plazo automático' using errcode = 'assert_failure';
  end if;

  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  perform public.assign_job(v_job, 'f1490000-0000-0000-0000-000000000003', null);
  set local role postgres;

  -- Sin plazo no se comienza.
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  begin
    perform public.start_job(v_job);
    raise exception 'RN-CRE-19 FALLIDO: comenzó sin plazo fijado' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  -- El trabajador no lo fija: lo fija el equipo con manage_requests.
  begin
    perform public.set_job_execution_days(v_job, 6);
    raise exception 'RN-CRE-19 FALLIDO: un trabajador fijó el plazo' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;

  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
  perform public.set_job_execution_days(v_job, 6);
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000003', true);
  perform public.start_job(v_job);
  set local role postgres;

  if (select execution_sla_hours from public.jobs where id = v_job) <> 144
     or (select state from public.jobs where id = v_job) <> 'in_progress' then
    raise exception 'RN-CRE-19 FALLIDO: el plazo fijado no quedó o no se pudo comenzar' using errcode = 'assert_failure';
  end if;

  -- Después de comenzar ya no se cambia.
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin
    perform public.set_job_execution_days(v_job, 9);
    raise exception 'RN-CRE-19 FALLIDO: se cambió el plazo después de comenzar' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  set local role postgres;

  -- Y en un trabajo de 20 o menos no se fija a mano.
  v_small := pg_temp.cre_request('f1494000-0000-0000-0000-000000000002',
    'f1490000-0000-0000-0000-000000000004', 'Un precio');
  perform public.record_credit_valuation(v_small, 'f1490000-0000-0000-0000-000000000004', 2, null, 'Precio', 'claude-haiku-4-5');
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000004', true);
  set local role authenticated;
  perform public.accept_request(v_small);
  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
  begin
    perform public.set_job_execution_days((select id from public.jobs where request_id = v_small), 3);
    raise exception 'RN-CRE-18 FALLIDO: se fijó a mano el plazo de un trabajo de 1 crédito' using errcode = 'assert_failure';
  exception when assert_failure then raise; when others then null;
  end;
  set local role postgres;
end $$;

-- ============================================================
-- RN-CRE-15 · el cambio de plan da créditos proporcionales
-- ============================================================
do $$
declare
  v_sub uuid;
  v_pro record;
  v_extra integer;
begin
  select id into v_sub from public.subscriptions
  where establishment_id = 'f1494000-0000-0000-0000-000000000001' and kind = 'plan' and status = 'active';

  -- Toda la suite corre en una transacción y `now()` no avanza: la
  -- mensualidad del alta y el cobro del cambio tendrían el mismo inicio de
  -- periodo. Se aparta la del alta un día para que no choquen.
  update public.charges set period_start = period_start - interval '1 day' where subscription_id = v_sub;

  select * into v_pro from public.plan_change_proration(v_sub, 'f1492000-0000-0000-0000-000000000002');
  -- (80 − 40) × fracción, redondeando hacia arriba al medio crédito.
  if v_pro.extra_credits_half <> ceil(40 * v_pro.fraction)::integer or v_pro.extra_credits_half < 1 then
    raise exception 'RN-CRE-15 FALLIDO: % medios créditos extra con fracción %', v_pro.extra_credits_half, v_pro.fraction
      using errcode = 'assert_failure';
  end if;

  perform set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  perform public.change_plan_immediately(v_sub, 'f1492000-0000-0000-0000-000000000002');
  set local role postgres;

  select amount into v_extra from public.consumption_entries
  where establishment_id = 'f1494000-0000-0000-0000-000000000001'
    and category = 'credits' and entry_type = 'compensatory_credit' and reason like '%RN-CRE-15%';
  if v_extra is null or v_extra < 1 or v_extra > 40 then
    raise exception 'RN-CRE-15 FALLIDO: el cambio de plan no dio los créditos proporcionales (%)', v_extra
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-CRE-01 · crear y editar los créditos de un plan
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1490000-0000-0000-0000-000000000001', true);
do $$
declare
  v_plan uuid;
begin
  v_plan := public.create_plan('f1491000-0000-0000-0000-000000000001', 'Nuevo con créditos', 9900,
    0, 0, 0, 0, 24, 72, 72, 72, 120, false, false, 1, 'standard', false, null, 'month', 40);
  if (select included_credits_half from public.plans where id = v_plan) <> 40 then
    raise exception 'RN-CRE-01 FALLIDO: el plan nuevo no lleva sus créditos' using errcode = 'assert_failure';
  end if;

  -- Sin decir los créditos, se quedan como estaban.
  perform public.revise_plan(v_plan, 10900, 0, 0, 0, 0, 24, 72, 72, 72, 120, false, false, 1, 'standard', false, null);
  if (select included_credits_half from public.plans where id = v_plan) <> 40 then
    raise exception 'RN-CRE-01 FALLIDO: revisar el precio cambió los créditos' using errcode = 'assert_failure';
  end if;

  perform public.revise_plan(v_plan, 10900, 0, 0, 0, 0, 24, 72, 72, 72, 120, false, false, 1, 'standard', false, null,
    null, 30);
  if (select included_credits_half from public.plans where id = v_plan) <> 30 then
    raise exception 'RN-CRE-01 FALLIDO: no se pudieron editar los créditos' using errcode = 'assert_failure';
  end if;
end $$;
set local role postgres;

-- RN-COM-23 · bajar los créditos perjudica.
do $$
begin
  if exists (
    select 1 from public.plan_terms_diff_internal('f1492000-0000-0000-0000-000000000002', 'f1492000-0000-0000-0000-000000000001')
    where field = 'included_credits_half' and better
  ) or not exists (
    select 1 from public.plan_terms_diff_internal('f1492000-0000-0000-0000-000000000002', 'f1492000-0000-0000-0000-000000000001')
    where field = 'included_credits_half' and not better and client_visible
  ) then
    raise exception 'RN-CRE-01 FALLIDO: bajar los créditos no cuenta como perjudicar' using errcode = 'assert_failure';
  end if;
end $$;

select 'el_motor_de_creditos.sql: RN-CRE-01, 05, 07, 09 a 19 cumplidos' as resultado;

rollback;
