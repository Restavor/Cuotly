-- Fase 2 · Hito 12 · la mensualidad del servicio con los dos precios, el
-- calendario operativo completo y los presupuestos adicionales (migración
-- 80; RN-COM-08, decisión 20; §75, §76; §84; RN-CON-03; RN-JOB-06;
-- RN-MEN-11; RN-FIN-07; §18; P7).
--
--   · RN-COM-08: contratar Menú Diario emite su primera mensualidad: 199 €
--     si el plan activo tiene `grants_priority`, 229 € si es otro plan o
--     no hay plan. El barrido recorre también los servicios y no repite.
--     El ingreso recurrente y las próximas renovaciones los cuentan.
--   · §84: el equipo crea y envía; el restaurante no ve un borrador ni
--     puede aceptar la solicitud por fuera; el Editor no acepta; el
--     propietario acepta y nace el cobro, el trabajo presupuestado sin
--     consumir bolsa (RN-CON-03) y los avisos a quien toca (§18). Con pago
--     previo exigido, Comenzar espera al pago o a la autorización
--     registrada (RN-JOB-06). Rechazar deja la solicitud donde estaba. Un
--     presupuesto sin solicitud crea solicitud y trabajo. La plantilla
--     `quoted` cuelga de un presupuesto de ESE restaurante.
--   · §75/§76: el calendario deriva renovaciones y publicaciones, filtra
--     por restaurante, trabajador y tipo, y el cliente no ve ausencias.
--   · Las internas están cerradas por RPC y las columnas con identidad,
--     tapadas al restaurante.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/presupuestos_y_calendario.sql

insert into auth.users (id, email, role, aud) values
  ('cc000000-0000-0000-0000-000000000001', 'pq-owner@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000002', 'pq-admin@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000003', 'pq-ana@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000005', 'pq-local@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000006', 'pq-editor@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000007', 'pq-consulta@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000008', 'pq-otro@example.com', 'authenticated', 'authenticated'),
  ('cc000000-0000-0000-0000-000000000010', 'pq-global@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('cc100000-0000-0000-0000-000000000001', 'Espacio Presupuestos', 'espacio-presupuestos-test', 'Europe/Madrid',
   'cc000000-0000-0000-0000-000000000001'),
  ('cc100000-0000-0000-0000-000000000002', 'Espacio Ajeno P', 'espacio-ajeno-presupuestos-test', 'Europe/Madrid',
   'cc000000-0000-0000-0000-000000000008');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('cc100000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000008', 'owner', 'active');

-- Premium concede prioridad (migración 62/63); Básico no incluye nada.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours, grants_priority) values
  ('cc200000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'Premium P', 59900, 25, 24, 5, 1, 24, true),
  ('cc200000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001', 'Básico P', 9900, 0, 0, 0, 0, 48, false);

insert into public.services (id, space_id, name, price_cents, price_premium_cents, kind, included_updates) values
  ('cc250000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'Menú Diario', 22900, 19900, 'daily_menu', 30);

insert into public.groups (id, space_id, name) values
  ('cc300000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'Grupo P');

insert into public.group_memberships (group_id, user_id) values
  ('cc300000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000010');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('cc400000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
   'cc300000-0000-0000-0000-000000000001', 'PRE-0001', 'Casa Premium', 'active'),
  ('cc400000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001',
   'cc300000-0000-0000-0000-000000000001', 'PRE-0002', 'Casa Básico', 'active'),
  ('cc400000-0000-0000-0000-000000000003', 'cc100000-0000-0000-0000-000000000001',
   'cc300000-0000-0000-0000-000000000001', 'PRE-0003', 'Casa Sin Plan', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('cc400000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000005', 'local_owner'),
  ('cc400000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000006', 'editor'),
  ('cc400000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000007', 'consulta'),
  ('cc400000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000005', 'local_owner'),
  ('cc400000-0000-0000-0000-000000000003', 'cc000000-0000-0000-0000-000000000005', 'local_owner');

-- Ana: web, autorizada en Casa Premium y en Casa Básico.
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', 'web', 'cc000000-0000-0000-0000-000000000001');
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', 'cc400000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001'),
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', 'cc400000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000001');

create temp table pq_ids (k text primary key, v uuid);
grant select, insert, update on pq_ids to authenticated, service_role;

-- ============================================================
-- RN-COM-08 · la mensualidad del servicio, con los dos precios.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_sub uuid; v_base integer; v_total integer; v_n integer; v_premium boolean;
begin
  -- Los dos planes primero (emiten su propia mensualidad, migración 52).
  perform public.create_plan_subscription('cc400000-0000-0000-0000-000000000001', 'cc200000-0000-0000-0000-000000000001');
  perform public.create_plan_subscription('cc400000-0000-0000-0000-000000000002', 'cc200000-0000-0000-0000-000000000002');

  -- Premium → 199 €.
  v_sub := public.create_service_subscription('cc400000-0000-0000-0000-000000000001', 'cc250000-0000-0000-0000-000000000001');
  insert into pq_ids values ('svc_premium', v_sub);
  select base_cents, total_cents into v_base, v_total from public.charges where subscription_id = v_sub;
  if v_base is null then
    raise exception 'RN-FIN-01 FALLIDO: contratar el servicio no emitió su primera mensualidad' using errcode = 'assert_failure';
  end if;
  if v_base <> 19900 or v_total <> 24079 then
    raise exception 'RN-COM-08 FALLIDO: con plan Premium activo el servicio debía costar 19900 + IVA = 24079, y es % / %', v_base, v_total using errcode = 'assert_failure';
  end if;
  select premium_applied into v_premium from public.service_monthly_price(v_sub);
  if not v_premium then
    raise exception 'RN-COM-08 FALLIDO: service_monthly_price no dice que aplica el precio Premium' using errcode = 'assert_failure';
  end if;

  -- Básico → 229 €.
  v_sub := public.create_service_subscription('cc400000-0000-0000-0000-000000000002', 'cc250000-0000-0000-0000-000000000001');
  insert into pq_ids values ('svc_basico', v_sub);
  select base_cents into v_base from public.charges where subscription_id = v_sub;
  if v_base <> 22900 then
    raise exception 'RN-COM-08 FALLIDO: con plan Básico el servicio debía costar 22900 y es %', v_base using errcode = 'assert_failure';
  end if;

  -- Sin plan (RN-COM-11) → 229 €.
  v_sub := public.create_service_subscription('cc400000-0000-0000-0000-000000000003', 'cc250000-0000-0000-0000-000000000001');
  insert into pq_ids values ('svc_sinplan', v_sub);
  select base_cents into v_base from public.charges where subscription_id = v_sub;
  if v_base <> 22900 then
    raise exception 'RN-COM-08 FALLIDO: sin plan el servicio debía costar 22900 y es %', v_base using errcode = 'assert_failure';
  end if;

  -- CA-17 / RN-DAT-09: contratar dos veces ni duplica ni cobra dos veces.
  perform public.create_service_subscription('cc400000-0000-0000-0000-000000000003', 'cc250000-0000-0000-0000-000000000001');
  select count(*) into v_n from public.charges where subscription_id = v_sub;
  if v_n <> 1 then
    raise exception 'RN-DAT-09 FALLIDO: la segunda contratación dejó % cobros', v_n using errcode = 'assert_failure';
  end if;

  -- El apunte de auditoría dice qué precio se aplicó.
  if (select count(*) from public.audit_log a join public.charges c on c.id = a.entity_id
      where a.action = 'charge.issued' and c.subscription_id = (select v from pq_ids where k = 'svc_premium')
        and (a.new_value ->> 'premium_price')::boolean) <> 1 then
    raise exception 'CA-15 FALLIDO: el cobro del servicio Premium no deja escrito que aplicó el precio Premium' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El restaurante puede saber qué se le cobra; otro espacio, no.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_base integer;
begin
  select base_cents into v_base from public.service_monthly_price((select v from pq_ids where k = 'svc_premium'));
  if v_base <> 19900 then
    raise exception 'RN-COM-08 FALLIDO: el restaurante ve un precio distinto del que se le cobra (%)', v_base using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  begin
    perform public.service_monthly_price((select v from pq_ids where k = 'svc_premium'));
    raise exception 'CA-02 FALLIDO: otro espacio leyó el precio de un servicio ajeno' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes acceso%' then raise; end if;
  end;
end $$;
reset role;

-- El barrido: nada que emitir ahora (todo cobrado), y un servicio con un
-- periodo nuevo sin cobrar se emite una vez. Se simula moviendo el alta 40
-- días atrás: el periodo en curso es el segundo mes y no tiene cobro.
do $$
declare v_n integer; v_first timestamptz;
begin
  v_n := public.run_monthly_charges('cc100000-0000-0000-0000-000000000001');
  if v_n <> 0 then
    raise exception 'RN-DAT-09 FALLIDO: el barrido emitió % cobros con todo ya cobrado', v_n using errcode = 'assert_failure';
  end if;

  update public.subscriptions set started_at = now() - interval '40 days'
  where id = (select v from pq_ids where k = 'svc_basico');
  update public.charges set period_start = period_start - interval '40 days', period_end = period_end - interval '40 days'
  where subscription_id = (select v from pq_ids where k = 'svc_basico');

  v_n := public.run_monthly_charges('cc100000-0000-0000-0000-000000000001');
  if v_n <> 1 then
    raise exception 'RN-FIN-01 FALLIDO: el barrido debía emitir la mensualidad del segundo mes del servicio y emitió %', v_n using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.charges where subscription_id = (select v from pq_ids where k = 'svc_basico')) <> 2 then
    raise exception 'RN-FIN-01 FALLIDO: el servicio debía tener 2 mensualidades' using errcode = 'assert_failure';
  end if;
  v_n := public.run_monthly_charges('cc100000-0000-0000-0000-000000000001');
  if v_n <> 0 then
    raise exception 'RN-DAT-09 FALLIDO: la segunda pasada del barrido emitió % cobros', v_n using errcode = 'assert_failure';
  end if;
end $$;

-- El ingreso recurrente cuenta planes y servicios, con el precio real.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_base bigint; v_n integer;
begin
  select recurring_monthly_base_cents into v_base
  from public.financial_dashboard('cc100000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day');
  -- 59900 + 9900 + 19900 + 22900 + 22900
  if v_base <> 135500 then
    raise exception '§17.2 FALLIDO: el ingreso recurrente debía ser 135500 (planes y servicios) y es %', v_base using errcode = 'assert_failure';
  end if;

  select count(*) into v_n from public.upcoming_renewals('cc100000-0000-0000-0000-000000000001', 40) where kind = 'service';
  if v_n <> 3 then
    raise exception '§17.2 FALLIDO: las próximas renovaciones debían incluir 3 servicios y hay %', v_n using errcode = 'assert_failure';
  end if;
  if (select monthly_total_cents from public.upcoming_renewals('cc100000-0000-0000-0000-000000000001', 40)
      where kind = 'service' and establishment_id = 'cc400000-0000-0000-0000-000000000001') <> 24079 then
    raise exception 'RN-COM-08 FALLIDO: la renovación del servicio Premium no lleva el precio Premium con IVA' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- §84 · Un presupuesto sobre una solicitud (Casa Premium, que SÍ incluye
-- cambios pequeños: así se ve que no consume, RN-CON-03).
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_r uuid;
begin
  v_r := public.create_request_draft('cc400000-0000-0000-0000-000000000001', 'Rehacer la carta entera con fotos nuevas', null);
  insert into pq_ids values ('req', v_r);
  perform public.submit_request(v_r);
  perform public.begin_request_analysis(v_r);
end $$;
reset role;

set role service_role;
do $$
begin
  perform public.record_classification((select v from pq_ids where k = 'req'),
    'cc000000-0000-0000-0000-000000000005'::uuid, 'rules', 'small', 'Carta nueva', null, null, null, null, null, null);
end $$;
reset role;

-- Antes de validar: el presupuesto se puede preparar en validación interna.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_q uuid; v_total integer; v_tax integer;
begin
  -- Permiso: un trabajador no presupuesta (se comprueba más abajo con Ana).
  v_q := public.create_quote('cc400000-0000-0000-0000-000000000001', 'Carta completa con fotos', 30000, 'job',
                             'medium', 'Sesión de fotos y carta nueva', (select v from pq_ids where k = 'req'), true);
  insert into pq_ids values ('q1', v_q);

  select total_cents, tax_cents into v_total, v_tax from public.quotes where id = v_q;
  if v_tax <> 6300 or v_total <> 36300 then
    raise exception 'RN-FIN-08 FALLIDO: 30000 al 21 %% debía dar 6300 de IVA y 36300 de total, y da % / %', v_tax, v_total using errcode = 'assert_failure';
  end if;
  if (select code from public.quotes where id = v_q) <> 'PRE-0001' then
    raise exception '§84 FALLIDO: el primer presupuesto del espacio debía ser PRE-0001' using errcode = 'assert_failure';
  end if;

  -- Un segundo abierto sobre la misma solicitud: no.
  begin
    perform public.create_quote('cc400000-0000-0000-0000-000000000001', 'Otro', 100, 'job', 'small', null, (select v from pq_ids where k = 'req'));
    raise exception '§84 FALLIDO: dos presupuestos abiertos sobre la misma solicitud' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%ya tiene un presupuesto abierto%' then raise; end if;
  end;

  -- Corregir el borrador recalcula con el IVA congelado.
  perform public.update_quote_draft(v_q, 'Carta completa con fotos', 25000, 'Sesión de fotos y carta nueva', 'medium', true);
  select total_cents into v_total from public.quotes where id = v_q;
  if v_total <> 30250 then
    raise exception 'RN-FIN-08 FALLIDO: al corregir la base a 25000 el total debía ser 30250 y es %', v_total using errcode = 'assert_failure';
  end if;

  perform public.validate_classification((select v from pq_ids where k = 'req'), 'medium', 'Carta nueva con fotos');
end $$;
reset role;

-- Ana (trabajadora) no presupuesta; el Editor tampoco.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.create_quote('cc400000-0000-0000-0000-000000000001', 'De Ana', 100, 'job', 'small');
    raise exception 'CA-01 FALLIDO: una trabajadora creó un presupuesto' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
  if (select count(*) from public.quotes) <> 0 then
    raise exception 'CA-03 FALLIDO: una trabajadora lee presupuestos' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El restaurante, con el borrador: no lo ve, sabe que se prepara, y no
-- puede aceptar la solicitud por fuera.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_preparing boolean; v_id uuid;
begin
  if (select count(*) from public.quotes) <> 0 then
    raise exception '§84 FALLIDO: el restaurante ve un presupuesto en borrador' using errcode = 'assert_failure';
  end if;
  select preparing, quote_id into v_preparing, v_id from public.client_request_quote((select v from pq_ids where k = 'req'));
  if not v_preparing or v_id is not null then
    raise exception 'CA-20 FALLIDO: al restaurante hay que decirle que el presupuesto se está preparando, sin enseñárselo' using errcode = 'assert_failure';
  end if;
  begin
    perform public.accept_request((select v from pq_ids where k = 'req'));
    raise exception '§84 FALLIDO: la solicitud se aceptó por fuera del presupuesto' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%se presupuesta aparte%' then raise; end if;
  end;
  begin
    perform public.create_quote('cc400000-0000-0000-0000-000000000001', 'Del cliente', 100, 'job', 'small');
    raise exception 'CA-01 FALLIDO: el restaurante creó un presupuesto' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;

-- Enviar: avisa al propietario local y al global, no al Editor ni a Consulta.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_n integer;
begin
  perform public.send_quote((select v from pq_ids where k = 'q1'));
  perform public.send_quote((select v from pq_ids where k = 'q1')); -- CA-17
  begin
    perform public.update_quote_draft((select v from pq_ids where k = 'q1'), 'Cambiado', 1, null, 'medium', true);
    raise exception 'P4 FALLIDO: se corrigió un presupuesto ya enviado' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo se corrige%' then raise; end if;
  end;
end $$;
reset role;

-- Los avisos se cuentan sin RLS: cada uno solo ve los suyos.
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.notifications where event_type = 'quote_sent';
  if v_n <> 2 then
    raise exception '§18 FALLIDO: enviar el presupuesto debía avisar a 2 (propietario local y global) y avisó a %', v_n using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'quote_sent'
             and recipient_id in ('cc000000-0000-0000-0000-000000000006', 'cc000000-0000-0000-0000-000000000007')) then
    raise exception 'RN-NOT-01 FALLIDO: el Editor o Consulta recibieron el aviso del presupuesto' using errcode = 'assert_failure';
  end if;
  if (select audience from public.notifications where event_type = 'quote_sent' limit 1) <> 'client' then
    raise exception '§18 FALLIDO: el aviso del presupuesto al restaurante no es de audiencia cliente' using errcode = 'assert_failure';
  end if;
end $$;

-- El Editor lo ve (view_billing lo decide RN-FIN-07) pero no lo acepta;
-- Consulta no lo ve.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  begin
    perform public.accept_quote((select v from pq_ids where k = 'q1'));
    raise exception '§84 FALLIDO: el Editor aceptó un presupuesto' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el propietario%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.quotes) <> 0 then
    raise exception 'RN-FIN-07 FALLIDO: Consulta ve presupuestos' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El propietario local: lo ve sin identidades, y lo acepta.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare
  v_q uuid := (select v from pq_ids where k = 'q1');
  v_status text; v_n integer; v_job uuid; v_state text; v_charge uuid; v_total integer;
begin
  if (select count(*) from public.quotes where id = v_q and state = 'sent') <> 1 then
    raise exception '§84 FALLIDO: el restaurante no ve el presupuesto enviado' using errcode = 'assert_failure';
  end if;
  begin
    perform (select sent_by from public.quotes where id = v_q);
    raise exception 'P7 FALLIDO: el restaurante leyó sent_by del presupuesto' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  if (select status from public.client_request_quote((select v from pq_ids where k = 'req'))) <> 'sent' then
    raise exception '§84 FALLIDO: client_request_quote no dice "sent"' using errcode = 'assert_failure';
  end if;

  perform public.accept_quote(v_q);
  perform public.accept_quote(v_q); -- CA-17

  v_status := public.quote_status(v_q);
  if v_status <> 'pending_payment' then
    raise exception '§84 FALLIDO: aceptado y sin cobrar debía estar "pending_payment", está "%"', v_status using errcode = 'assert_failure';
  end if;

  select count(*) into v_n from public.charges where quote_id = v_q;
  select id, total_cents into v_charge, v_total from public.charges where quote_id = v_q limit 1;
  if v_n <> 1 or v_total <> 30250 then
    raise exception 'RN-FIN FALLIDO: la aceptación debía emitir 1 cobro de 30250 y hay % de %', v_n, v_total using errcode = 'assert_failure';
  end if;
  insert into pq_ids values ('charge_q1', v_charge);
  if (select count(*) from public.financial_entries where charge_id = v_charge and entry_type = 'charge') <> 1 then
    raise exception 'CLAUDE.md MUST FALLIDO: el cobro del presupuesto no dejó su apunte en el libro' using errcode = 'assert_failure';
  end if;

  select state into v_state from public.requests where id = (select v from pq_ids where k = 'req');
  if v_state <> 'accepted' then
    raise exception '§84 FALLIDO: aceptar el presupuesto debía aceptar la solicitud, está "%"', v_state using errcode = 'assert_failure';
  end if;

  select job_id into v_job from public.client_request_job((select v from pq_ids where k = 'req'));
  if v_job is null then
    raise exception 'RN-REQ-02 FALLIDO: no nació el trabajo' using errcode = 'assert_failure';
  end if;
  insert into pq_ids values ('job_q1', v_job);

  -- RN-CON-03: Premium incluye 5 medianos y no se ha tocado ninguno.
  if (select count(*) from public.consumption_entries where establishment_id = 'cc400000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'RN-CON-03 FALLIDO: un trabajo presupuestado consumió bolsa' using errcode = 'assert_failure';
  end if;
  if not (select budgeted from public.acceptances where job_id = v_job) then
    raise exception 'RN-CON-03 FALLIDO: la aceptación no quedó marcada como presupuestada' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Avisos de la aceptación: propietario y administrador, no la trabajadora.
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.notifications where event_type = 'quote_accepted';
  if v_n <> 2 then
    raise exception '§18 FALLIDO: la aceptación debía avisar a 2 (propietario y administrador) y avisó a %', v_n using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'quote_accepted' and recipient_id = 'cc000000-0000-0000-0000-000000000003') then
    raise exception 'RN-NOT-01 FALLIDO: la trabajadora recibió el aviso de aceptación' using errcode = 'assert_failure';
  end if;
  if (select quote_id from public.jobs where id = (select v from pq_ids where k = 'job_q1')) <> (select v from pq_ids where k = 'q1') then
    raise exception 'RN-JOB-06 FALLIDO: el trabajo no apunta a su presupuesto' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-JOB-06 / §84 · Comenzar espera al pago o a la autorización.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  perform public.assign_job((select v from pq_ids where k = 'job_q1'), 'cc000000-0000-0000-0000-000000000003');
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare v_gate record;
begin
  select * into v_gate from public.job_quote_gate((select v from pq_ids where k = 'job_q1'));
  if v_gate.can_start or v_gate.paid or v_gate.start_authorized or not v_gate.requires_payment_before_start then
    raise exception 'RN-JOB-06 FALLIDO: la puerta dice que se puede comenzar sin pago ni autorización' using errcode = 'assert_failure';
  end if;
  begin
    perform public.start_job((select v from pq_ids where k = 'job_q1'));
    raise exception 'RN-JOB-06 FALLIDO: se comenzó un trabajo presupuestado con pago pendiente' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%pago pendiente%' then raise; end if;
  end;
  -- Y la trabajadora no autoriza.
  begin
    perform public.authorize_quote_start((select v from pq_ids where k = 'q1'), 'Yo misma');
    raise exception 'CA-01 FALLIDO: una trabajadora autorizó el inicio sin pago' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  perform public.authorize_quote_start((select v from pq_ids where k = 'q1'), 'Cliente de confianza');
  perform public.authorize_quote_start((select v from pq_ids where k = 'q1'), 'Cliente de confianza'); -- CA-17
  if (select count(*) from public.audit_log where action = 'quote.start_authorized' and entity_id = (select v from pq_ids where k = 'q1')) <> 1 then
    raise exception '§84 FALLIDO: la autorización debía quedar registrada exactamente una vez' using errcode = 'assert_failure';
  end if;
  if (select reason from public.audit_log where action = 'quote.start_authorized' and entity_id = (select v from pq_ids where k = 'q1')) <> 'Cliente de confianza' then
    raise exception 'CA-15 FALLIDO: la autorización no conserva su motivo' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if not (select can_start from public.job_quote_gate((select v from pq_ids where k = 'job_q1'))) then
    raise exception 'RN-JOB-06 FALLIDO: autorizado el inicio, la puerta sigue cerrada' using errcode = 'assert_failure';
  end if;
  perform public.start_job((select v from pq_ids where k = 'job_q1'));
  if (select state from public.jobs where id = (select v from pq_ids where k = 'job_q1')) <> 'in_progress' then
    raise exception 'RN-JOB-06 FALLIDO: con la autorización registrada, Comenzar no comenzó' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Pagar el cobro deja el presupuesto en "pagado" (derivado del libro).
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_status text;
begin
  perform public.register_payment((select v from pq_ids where k = 'charge_q1'), 30250, 'transfer', now(), null, null);
  v_status := public.quote_status((select v from pq_ids where k = 'q1'));
  if v_status <> 'paid' then
    raise exception '§84 FALLIDO: cobrado el presupuesto debía estar "paid", está "%"', v_status using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- §84 · Rechazar, y un presupuesto sin solicitud (Casa Básico).
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_q uuid;
begin
  v_q := public.create_quote('cc400000-0000-0000-0000-000000000002', 'Banner de Navidad', 8000, 'job', 'small', 'Un banner', null, false);
  perform public.send_quote(v_q);
  insert into pq_ids values ('q2', v_q);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_q uuid := (select v from pq_ids where k = 'q2');
begin
  perform public.reject_quote(v_q, 'Demasiado caro');
  perform public.reject_quote(v_q, 'Demasiado caro'); -- CA-17
  if public.quote_status(v_q) <> 'rejected' then
    raise exception '§84 FALLIDO: rechazado debía estar "rejected"' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.charges where quote_id = v_q) <> 0 then
    raise exception '§84 FALLIDO: un presupuesto rechazado emitió cobro' using errcode = 'assert_failure';
  end if;
  begin
    perform public.accept_quote(v_q);
    raise exception '§84 FALLIDO: se aceptó un presupuesto rechazado' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no está pendiente de respuesta%' then raise; end if;
  end;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.notifications where event_type = 'quote_rejected') <> 2 then
    raise exception '§18 FALLIDO: el rechazo debía avisar a propietario y administrador' using errcode = 'assert_failure';
  end if;
  if (select reason from public.audit_log where action = 'quote.rejected' and entity_id = (select v from pq_ids where k = 'q2')) <> 'Demasiado caro' then
    raise exception 'CA-15 FALLIDO: el rechazo no conserva su motivo' using errcode = 'assert_failure';
  end if;
end $$;

-- El segundo intento, sin pago previo exigido: crea solicitud y trabajo, y
-- Comenzar no espera a nada.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_q uuid;
begin
  v_q := public.create_quote('cc400000-0000-0000-0000-000000000002', 'Banner de Navidad', 5000, 'job', 'small', 'Un banner más pequeño', null, false);
  perform public.send_quote(v_q);
  insert into pq_ids values ('q3', v_q);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_q uuid := (select v from pq_ids where k = 'q3'); v_r uuid; v_job uuid;
begin
  perform public.accept_quote(v_q);
  select request_id into v_r from public.quotes where id = v_q;
  if v_r is null then
    raise exception '§84 FALLIDO: aceptar un presupuesto sin solicitud no creó la solicitud' using errcode = 'assert_failure';
  end if;
  if (select state from public.requests where id = v_r) <> 'accepted' or (select code from public.requests where id = v_r) not like 'SOL-%' then
    raise exception '§84 FALLIDO: la solicitud creada por el presupuesto no nació aceptada con su código' using errcode = 'assert_failure';
  end if;
  select job_id into v_job from public.client_request_job(v_r);
  if v_job is null then
    raise exception 'RN-REQ-02 FALLIDO: el presupuesto aceptado no creó el trabajo' using errcode = 'assert_failure';
  end if;
  insert into pq_ids values ('job_q3', v_job);
  insert into pq_ids values ('req_q3', v_r);
end $$;
reset role;

do $$
begin
  if (select count(*) from public.audit_log where action = 'request.created_from_quote' and entity_id = (select v from pq_ids where k = 'req_q3')) <> 1 then
    raise exception 'CA-15 FALLIDO: la solicitud nacida del presupuesto no deja apunte' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
begin
  perform public.assign_job((select v from pq_ids where k = 'job_q3'), 'cc000000-0000-0000-0000-000000000003');
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if not (select can_start from public.job_quote_gate((select v from pq_ids where k = 'job_q3'))) then
    raise exception '§84 FALLIDO: sin pago previo exigido la puerta debía estar abierta' using errcode = 'assert_failure';
  end if;
  perform public.start_job((select v from pq_ids where k = 'job_q3'));
end $$;
reset role;

-- Un presupuesto rechazado sobre una solicitud la deja pendiente y no se
-- acepta por fuera.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_r uuid;
begin
  v_r := public.create_request_draft('cc400000-0000-0000-0000-000000000002', 'Cambiar el horario', null);
  insert into pq_ids values ('req2', v_r);
  perform public.submit_request(v_r);
  perform public.begin_request_analysis(v_r);
end $$;
reset role;
set role service_role;
do $$
begin
  perform public.record_classification((select v from pq_ids where k = 'req2'),
    'cc000000-0000-0000-0000-000000000005'::uuid, 'rules', 'small', 'Horario', null, null, null, null, null, null);
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_q uuid;
begin
  perform public.validate_classification((select v from pq_ids where k = 'req2'), 'small', 'Horario');
  v_q := public.create_quote('cc400000-0000-0000-0000-000000000002', 'Horario', 3000, 'job', null, null, (select v from pq_ids where k = 'req2'));
  if (select category from public.quotes where id = v_q) <> 'small' then
    raise exception '§84 FALLIDO: sin categoría explícita, el presupuesto debía tomar la validada de la solicitud' using errcode = 'assert_failure';
  end if;
  perform public.send_quote(v_q);
  insert into pq_ids values ('q4', v_q);
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  perform public.reject_quote((select v from pq_ids where k = 'q4'), null);
  if (select state from public.requests where id = (select v from pq_ids where k = 'req2')) <> 'pending_client_acceptance' then
    raise exception '§84 FALLIDO: rechazar el presupuesto cambió el estado de la solicitud' using errcode = 'assert_failure';
  end if;
  begin
    perform public.accept_request((select v from pq_ids where k = 'req2'));
    raise exception '§84 FALLIDO: con el presupuesto rechazado, la solicitud se aceptó por fuera' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%se rechazó%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-MEN-11 · la plantilla presupuestada cuelga de un presupuesto de ESE
-- restaurante y de plantilla.
-- ============================================================
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_q uuid;
begin
  begin
    perform public.create_quote('cc400000-0000-0000-0000-000000000002', 'Plantilla', 100, 'menu_template', null, null,
                                (select v from pq_ids where k = 'req2'));
    raise exception '§84 FALLIDO: un presupuesto de plantilla colgó de una solicitud' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%crea un trabajo, no una plantilla%' then raise; end if;
  end;
  v_q := public.create_quote('cc400000-0000-0000-0000-000000000003', 'Plantilla Navidad', 15000, 'menu_template');
  perform public.send_quote(v_q);
  insert into pq_ids values ('q5', v_q);
  -- Antes de aceptarlo, la plantilla no se crea.
  begin
    perform public.create_menu_template('cc400000-0000-0000-0000-000000000003', 'Navidad', 'quoted', v_q);
    raise exception 'RN-MEN-11 FALLIDO: plantilla sobre un presupuesto sin aceptar' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no está aceptado%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  perform public.accept_quote((select v from pq_ids where k = 'q5'));
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_t uuid;
begin
  -- De otro restaurante: no.
  begin
    perform public.create_menu_template('cc400000-0000-0000-0000-000000000001', 'Navidad', 'quoted', (select v from pq_ids where k = 'q5'));
    raise exception 'RN-MEN-11 FALLIDO: una plantilla colgó del presupuesto de otro restaurante' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no es de este restaurante%' then raise; end if;
  end;
  -- Incluida con presupuesto: tampoco tiene sentido.
  begin
    perform public.create_menu_template('cc400000-0000-0000-0000-000000000003', 'Navidad', 'included', (select v from pq_ids where k = 'q5'));
    raise exception 'RN-MEN-11 FALLIDO: una plantilla incluida llevó presupuesto' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%no lleva presupuesto%' then raise; end if;
  end;
  v_t := public.create_menu_template('cc400000-0000-0000-0000-000000000003', 'Navidad', 'quoted', (select v from pq_ids where k = 'q5'));
  if (select quote_id from public.menu_templates where id = v_t) <> (select v from pq_ids where k = 'q5') then
    raise exception 'RN-MEN-11 FALLIDO: la plantilla no cuelga del presupuesto' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- §75 / §76 · El calendario: renovaciones, publicaciones, filtros y P7.
-- ============================================================
insert into public.absences (space_id, user_id, starts_on, ends_on, reason, state) values
  ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', current_date + 5, current_date + 6, 'Médico', 'approved');

-- Un menú con publicación pedida, en Casa Sin Plan (tiene el servicio).
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  insert into pq_ids values ('tpl', public.create_menu_template('cc400000-0000-0000-0000-000000000003', 'Clásica'));
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_m uuid; v_d uuid;
begin
  v_m := public.create_menu('cc400000-0000-0000-0000-000000000003', 'Menú del día', 'daily', current_date + 3, (select v from pq_ids where k = 'tpl'));
  perform public.save_menu_version(v_m, array['Sopa'], array['Pollo'], array['Fruta'], null, 1200, null);
  perform public.prepare_menu(v_m);
  perform public.request_menu_publication(v_m, 'pq-clave-1');
  insert into pq_ids values ('menu', v_m);
  -- Un borrador NO es una publicación (§76).
  v_d := public.create_menu('cc400000-0000-0000-0000-000000000003', 'Borrador', 'daily', current_date + 4, (select v from pq_ids where k = 'tpl'));
  insert into pq_ids values ('menu_draft', v_d);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_n integer; v_renovaciones integer;
begin
  -- Publicaciones: el pedido sí, el borrador no.
  select count(*) into v_n from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 10)
  where kind = 'menu_publication';
  if v_n <> 1 then
    raise exception '§76 FALLIDO: el calendario debía tener 1 publicación de Menú Diario y tiene %', v_n using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 10)
             where entity_id = (select v from pq_ids where k = 'menu_draft')) then
    raise exception '§76 FALLIDO: un borrador aparece como publicación' using errcode = 'assert_failure';
  end if;

  -- Renovaciones: 5 suscripciones vivas, cada una renueva una vez en los
  -- próximos 40 días (la del servicio Básico, movida 40 días atrás, ya
  -- renovó una vez y vuelve a renovar dentro del rango).
  select count(*) into v_renovaciones from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 40)
  where kind = 'renewal';
  if v_renovaciones <> 5 then
    raise exception '§76 FALLIDO: se esperaban 5 renovaciones en 40 días y hay %', v_renovaciones using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 40)
      where kind = 'renewal' and state = 'service') <> 3 then
    raise exception '§76 FALLIDO: 3 de las renovaciones debían ser de servicios' using errcode = 'assert_failure';
  end if;

  -- El vencimiento del cobro del presupuesto también está (RN-FIN-01b: 7 días).
  if (select count(*) from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 10)
      where kind = 'charge_due' and entity_id = (select v from pq_ids where k = 'charge_q1')) <> 1 then
    raise exception '§76 FALLIDO: el vencimiento del cobro del presupuesto no está en el calendario' using errcode = 'assert_failure';
  end if;

  -- Filtros de §75.
  if (select count(*) from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 40, null, null, 'absence')) <> 2 then
    raise exception '§75 FALLIDO: el filtro por tipo no deja solo los 2 días de ausencia' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 40, null, null, 'absence') where kind <> 'absence') then
    raise exception '§75 FALLIDO: el filtro por tipo deja pasar otros tipos' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 40, 'cc400000-0000-0000-0000-000000000003', null, null)
             where establishment_id is distinct from 'cc400000-0000-0000-0000-000000000003') then
    raise exception '§75 FALLIDO: el filtro por restaurante deja pasar otros restaurantes' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 40, null, 'cc000000-0000-0000-0000-000000000003', null)
      where kind = 'absence') <> 2
     or exists (select 1 from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 40, null, 'cc000000-0000-0000-0000-000000000001', null)) then
    raise exception '§75 FALLIDO: el filtro por trabajador no deja solo lo de Ana' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- P7 · el restaurante no ve ausencias ni renovaciones ajenas; sí su menú.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
begin
  if exists (select 1 from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 40) where kind = 'absence') then
    raise exception 'P7 FALLIDO: el restaurante ve las ausencias del equipo en el calendario' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.space_calendar('cc100000-0000-0000-0000-000000000001', current_date, current_date + 10) where kind = 'menu_publication') <> 1 then
    raise exception '§75 FALLIDO: el restaurante no ve su propia publicación' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- Privilegios: internas cerradas, públicas para authenticated y no anon.
-- ============================================================
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'service_monthly_price_internal(uuid)', 'subscription_current_period(uuid)',
    'notify_quote_event(uuid, text)', 'run_monthly_charges(uuid)', 'generate_monthly_charge_internal(uuid, timestamptz)']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute')
       or has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta por RPC', v_fn using errcode = 'assert_failure';
    end if;
  end loop;
  foreach v_fn in array array[
    'service_monthly_price(uuid)', 'create_quote(uuid, text, integer, text, text, text, uuid, boolean)',
    'update_quote_draft(uuid, text, integer, text, text, boolean)', 'send_quote(uuid)', 'accept_quote(uuid)',
    'reject_quote(uuid, text)', 'authorize_quote_start(uuid, text)', 'quote_status(uuid)', 'job_quote_gate(uuid)',
    'client_request_quote(uuid)', 'space_calendar(uuid, date, date, uuid, uuid, text)',
    'create_menu_template(uuid, text, text, uuid)', 'upcoming_renewals(uuid, integer)']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta a anon', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'FALLIDO: % no la puede llamar authenticated', v_fn using errcode = 'assert_failure';
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'space_calendar' and p.pronargs = 3) then
    raise exception 'FALLIDO: la firma antigua de space_calendar sigue viva y sería ambigua por RPC' using errcode = 'assert_failure';
  end if;
end $$;

-- Sin política de escritura: ni el propietario escribe quotes a mano.
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_ok boolean := false;
begin
  begin
    insert into public.quotes (space_id, establishment_id, code, concept, outcome, category, base_cents, tax_rate_percent, tax_cents, total_cents, created_by)
    values ('cc100000-0000-0000-0000-000000000001', 'cc400000-0000-0000-0000-000000000001', 'PRE-9999', 'A mano', 'job', 'small', 1, 21, 0, 1, auth.uid());
    v_ok := true;
  exception when insufficient_privilege then null;
  end;
  if v_ok then
    raise exception 'CLAUDE.md MUST FALLIDO: quotes admite escritura directa' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$ begin raise notice 'presupuestos_y_calendario: OK'; end $$;
