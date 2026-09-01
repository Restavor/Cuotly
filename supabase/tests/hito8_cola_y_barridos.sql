-- La cola periódica y los barridos (migración 20260830000041).
--
-- Es lo que el ROADMAP llevaba tres hitos diciendo como salvedad:
-- `generate_monthly_charge()` y `evaluate_establishment_dunning()`
-- existían y funcionaban pero **no se disparaban solas**, RN-EST-09 y
-- RN-EST-10 no las movía nadie, el cambio de plan programado esperaba a
-- que alguien lo aplicara a mano y los avisos de consumo del §18 no se
-- emitían.
--
-- Lo que NO está aquí, y por qué: los umbrales de T2 y T3 necesitan el
-- reloj laboral, que vive en `src/core/business-clock.ts`, así que se
-- prueban con Vitest en `src/core/sla-sweep.test.ts` y
-- `src/services/queue-runner.test.ts`. Duplicar ese cálculo en SQL sería
-- justo lo que CLAUDE.md prohíbe.
--
-- Cómo ejecutarlo:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hito8_cola_y_barridos.sql

insert into auth.users (id, email, role, aud) values
  ('c1000000-0000-0000-0000-000000000001', 'cola-owner@example.com', 'authenticated', 'authenticated'),
  ('c1000000-0000-0000-0000-000000000002', 'cola-cliente@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('c2000000-0000-0000-0000-000000000001', 'Espacio Cola', 'espacio-cola-test', 'c1000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Plan Cola', 39900, 4, 0, 0, 0, 24),
  ('c3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'Plan Cola Premium', 59900, 20, 10, 3, 1, 24);

insert into public.groups (id, space_id, name) values
  ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Grupo Cola');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('c5000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'EST-COLA', 'Restaurante Cola');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('c5000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'local_owner');

create temporary table cola_ctx (key text primary key, value text);
grant select, insert on cola_ctx to authenticated;

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  insert into cola_ctx values ('sub', public.create_plan_subscription(
    'c5000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001')::text);
end $$;

reset role;

-- ============================================================
-- CLAUDE.md MUST · nada de esto lo puede llamar una persona por RPC. Es
-- del proceso de la cola, que entra como `service_role`. Un barrido
-- abierto a `authenticated` sería un cliente cobrándose a sí mismo o
-- suspendiendo a otro.
-- ============================================================
do $$
declare
  v_fn text;
  v_abiertas text := '';
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Sin rol authenticated: se omite la comprobación';
    return;
  end if;

  foreach v_fn in array array[
    'run_monthly_charges(uuid)',
    'run_dunning_sweep(uuid)',
    'run_lifecycle_sweep(uuid)',
    'run_consumption_thresholds(uuid)',
    'enqueue_scheduled_job(uuid, text, timestamptz, text)',
    'claim_scheduled_jobs(integer)',
    'finish_scheduled_job(uuid, boolean, text)',
    'run_scheduled_job(uuid)',
    'claim_notification_deliveries(integer)',
    'mark_delivery_sent(uuid, text)',
    'mark_delivery_failed(uuid, text, timestamptz, boolean)',
    'sla_sweep_counters(uuid)',
    'emit_sla_notification(uuid, text, integer)',
    'generate_monthly_charge_internal(uuid, timestamptz)',
    'evaluate_establishment_dunning_internal(uuid)',
    'get_or_create_consumption_cycle_internal(uuid)',
    'apply_scheduled_plan_change_internal(uuid)']
  loop
    if has_function_privilege('authenticated', 'public.' || v_fn, 'execute')
       or has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      v_abiertas := v_abiertas || ' ' || v_fn;
    end if;
  end loop;

  if v_abiertas <> '' then
    raise exception 'FUNCIONES DE LA COLA ABIERTAS por RPC a anon/authenticated:%', v_abiertas
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Y las públicas siguen comprobando permiso después de partirlas en dos.
-- Sin esto, "extraer la interna" habría abierto las dos de par en par.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  begin
    perform public.generate_monthly_charge((select value::uuid from cola_ctx where key = 'sub'), null);
    raise exception 'CA-01 FALLIDO: un cliente emitió su propia mensualidad' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%No tienes permiso%' then
        raise exception 'CA-01 FALLIDO: falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;

  begin
    perform public.evaluate_establishment_dunning('c5000000-0000-0000-0000-000000000001');
    raise exception 'CA-01 FALLIDO: un cliente movió su propio ciclo de impago' using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%No tienes permiso%' then
        raise exception 'CA-01 FALLIDO: falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

reset role;

-- ============================================================
-- RN-FIN-01 · la mensualidad se emite sola, y una sola vez.
-- ============================================================
do $$
declare
  v_emitidos integer;
begin
  if (select count(*) from public.charges where establishment_id = 'c5000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'FIXTURE: no debería haber cobros todavía' using errcode = 'assert_failure';
  end if;

  v_emitidos := public.run_monthly_charges('c2000000-0000-0000-0000-000000000001');
  if v_emitidos <> 1 then
    raise exception 'RN-FIN-01 FALLIDO: el barrido no emitió la mensualidad (emitidos = %)', v_emitidos
      using errcode = 'assert_failure';
  end if;

  -- RN-DAT-09: pasar dos veces por el mismo ciclo no cobra dos veces.
  perform public.run_monthly_charges('c2000000-0000-0000-0000-000000000001');
  if (select count(*) from public.charges where establishment_id = 'c5000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'RN-DAT-09 FALLIDO: el barrido repetido duplicó la mensualidad'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-FIN-10 y RN-FIN-11 · el ciclo de impago corre solo.
-- ============================================================
do $$
begin
  -- Se envejece el cobro para que esté vencido hace más de 24 h.
  update public.charges set due_at = now() - interval '30 hours'
  where establishment_id = 'c5000000-0000-0000-0000-000000000001';

  if (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001') <> 'configuring'
     and (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001') <> 'active' then
    raise exception 'FIXTURE: el establecimiento debería estar vivo antes del barrido'
      using errcode = 'assert_failure';
  end if;

  perform public.run_dunning_sweep('c2000000-0000-0000-0000-000000000001');

  if (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001') <> 'paused' then
    raise exception 'RN-FIN-10 FALLIDO: a las +24 h el barrido no pausó el restaurante (está en %)',
      (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001')
      using errcode = 'assert_failure';
  end if;

  -- RN-FIN-11: a las +72 h, suspendido.
  update public.charges set due_at = now() - interval '80 hours'
  where establishment_id = 'c5000000-0000-0000-0000-000000000001';

  perform public.run_dunning_sweep('c2000000-0000-0000-0000-000000000001');

  if (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001') <> 'suspended' then
    raise exception 'RN-FIN-11 FALLIDO: a las +72 h el barrido no suspendió el restaurante'
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y cobrando, el mismo barrido lo devuelve a la vida (RN-FIN-13).
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_charge uuid;
begin
  select id into v_charge from public.charges
  where establishment_id = 'c5000000-0000-0000-0000-000000000001' limit 1;
  perform public.register_payment(v_charge, public.charge_outstanding_cents(v_charge), 'transfer', now(), null, null, 'cola-pago');
end $$;

reset role;

do $$
begin
  perform public.run_dunning_sweep('c2000000-0000-0000-0000-000000000001');
  if (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001')
     in ('paused', 'suspended') then
    raise exception 'RN-FIN-13 FALLIDO: pagado el cobro, el barrido no levantó la parada'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-EST-09 y RN-EST-10 · el final del servicio por baja, que hasta ahora
-- no lo movía nadie: `ending` -> `read_only` 24 h -> `suspended`.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.set_establishment_status('c5000000-0000-0000-0000-000000000001', 'ending', 'Nos deja');
end $$;

reset role;

do $$
begin
  -- Control positivo: mientras no llegue el final del periodo pagado, el
  -- barrido no lo mueve. RN-EST-09: el servicio sigue activo hasta esa fecha.
  perform public.run_lifecycle_sweep('c2000000-0000-0000-0000-000000000001');
  if (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001') <> 'ending' then
    raise exception 'RN-EST-09 FALLIDO: el barrido cortó el servicio antes del final del periodo pagado'
      using errcode = 'assert_failure';
  end if;

  -- Llegado el final del periodo pagado, pasa a solo lectura.
  update public.charges
  set period_start = now() - interval '31 days', period_end = now() - interval '1 minute'
  where establishment_id = 'c5000000-0000-0000-0000-000000000001';

  perform public.run_lifecycle_sweep('c2000000-0000-0000-0000-000000000001');
  if (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001') <> 'read_only' then
    raise exception 'RN-EST-09 FALLIDO: al terminar el periodo pagado no pasó a solo lectura (está en %)',
      (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001')
      using errcode = 'assert_failure';
  end if;

  -- RN-EST-10: 24 h de solo lectura, ni una menos.
  perform public.run_lifecycle_sweep('c2000000-0000-0000-0000-000000000001');
  if (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001') <> 'read_only' then
    raise exception 'RN-EST-10 FALLIDO: el barrido suspendió antes de las 24 h de solo lectura'
      using errcode = 'assert_failure';
  end if;

  update public.state_events set occurred_at = now() - interval '25 hours'
  where entity_type = 'establishment'
    and entity_id = 'c5000000-0000-0000-0000-000000000001'
    and to_state = 'read_only';

  perform public.run_lifecycle_sweep('c2000000-0000-0000-0000-000000000001');
  if (select status from public.establishments where id = 'c5000000-0000-0000-0000-000000000001') <> 'suspended' then
    raise exception 'RN-EST-10 FALLIDO: pasadas las 24 h de solo lectura no quedó suspendido'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- §18 · los avisos de consumo al 80 % y al 100 %, la otra fila que seguía
-- sin emitir.
-- ============================================================
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.set_establishment_status('c5000000-0000-0000-0000-000000000001', 'active', 'Vuelve');
end $$;

reset role;

do $$
declare
  v_cycle uuid;
begin
  v_cycle := public.get_or_create_consumption_cycle_internal((select value::uuid from cola_ctx where key = 'sub'));
  insert into cola_ctx values ('cycle', v_cycle::text);

  -- Control positivo: con la bolsa intacta no se avisa de nada.
  if public.run_consumption_thresholds('c2000000-0000-0000-0000-000000000001') <> 0 then
    raise exception '§18 FALLIDO: se avisó del consumo con la bolsa entera' using errcode = 'assert_failure';
  end if;

  -- El plan incluye 4 pequeños: tres consumidos son el 75 %, todavía no.
  insert into public.consumption_entries
    (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason)
  values
    ('c2000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', v_cycle,
     'small', -3, 'debit', 'Tres cambios');

  if public.run_consumption_thresholds('c2000000-0000-0000-0000-000000000001') <> 0 then
    raise exception '§18 FALLIDO: se avisó al 75 %%, y el umbral es el 80 %%' using errcode = 'assert_failure';
  end if;

  -- El cuarto lo lleva al 100 %.
  insert into public.consumption_entries
    (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, reason)
  values
    ('c2000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', v_cycle,
     'small', -1, 'debit', 'El cuarto');

  if public.run_consumption_thresholds('c2000000-0000-0000-0000-000000000001') = 0 then
    raise exception '§18 FALLIDO: agotada la bolsa no se avisó a nadie' using errcode = 'assert_failure';
  end if;

  -- Al cliente, que es de quien es la bolsa.
  if not exists (
    select 1 from public.notifications
    where event_type = 'consumption_threshold_100'
      and recipient_id = 'c1000000-0000-0000-0000-000000000002'
      and audience = 'client'
      and threshold_percent = 100
  ) then
    raise exception '§18 FALLIDO: el cliente no recibió el aviso de bolsa agotada'
      using errcode = 'assert_failure';
  end if;

  -- Y al propietario, por RN-NOT-02.
  if not exists (
    select 1 from public.notifications
    where event_type = 'consumption_threshold_100'
      and recipient_id = 'c1000000-0000-0000-0000-000000000001'
      and audience = 'staff'
  ) then
    raise exception 'RN-NOT-02 FALLIDO: el propietario no recibió el aviso de bolsa agotada'
      using errcode = 'assert_failure';
  end if;

  -- RN-NOT-05 / CA-17: repetir el barrido no repite el aviso.
  perform public.run_consumption_thresholds('c2000000-0000-0000-0000-000000000001');
  if (select count(*) from public.notifications
      where event_type = 'consumption_threshold_100'
        and recipient_id = 'c1000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'CA-17 FALLIDO: el barrido repetido duplicó el aviso de consumo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- RN-COM-01: en un plan sin consumos incluidos no hay bolsa que agotar y
-- no se avisa de nada. Sin este control, avisar siempre pasaría el test.
do $$
declare
  v_antes integer;
begin
  select count(*) into v_antes from public.notifications where event_type like 'consumption_threshold_%';

  update public.consumption_cycles
  set included_small = 0
  where id = (select value::uuid from cola_ctx where key = 'cycle');

  perform public.run_consumption_thresholds('c2000000-0000-0000-0000-000000000001');

  if (select count(*) from public.notifications where event_type like 'consumption_threshold_%') <> v_antes then
    raise exception 'RN-COM-01 FALLIDO: se avisó del consumo de un plan que no incluye ninguno'
      using errcode = 'assert_failure';
  end if;

  update public.consumption_cycles
  set included_small = 4
  where id = (select value::uuid from cola_ctx where key = 'cycle');
end $$;

-- ============================================================
-- La cola: reclamar, ejecutar y no ejecutar dos veces.
-- ============================================================
do $$
declare
  v_job uuid;
  v_repetido uuid;
  v_tomados integer;
begin
  v_job := public.enqueue_scheduled_job(
    'c2000000-0000-0000-0000-000000000001', 'dunning_sweep', now(), 'barrido-1');
  if v_job is null then
    raise exception 'FALLIDO: no se pudo encolar un barrido' using errcode = 'assert_failure';
  end if;

  -- CA-17: la misma clave no encola dos veces.
  v_repetido := public.enqueue_scheduled_job(
    'c2000000-0000-0000-0000-000000000001', 'dunning_sweep', now(), 'barrido-1');
  if v_repetido is not null then
    raise exception 'CA-17 FALLIDO: la misma clave encoló el barrido dos veces'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_tomados from public.claim_scheduled_jobs(10);
  if v_tomados <> 1 then
    raise exception 'FALLIDO: reclamar la cola devolvió % trabajos, esperaba 1', v_tomados
      using errcode = 'assert_failure';
  end if;

  -- Reclamado queda en `running`: un segundo proceso no lo vuelve a coger.
  select count(*) into v_tomados from public.claim_scheduled_jobs(10);
  if v_tomados <> 0 then
    raise exception 'FALLIDO: un trabajo ya reclamado se volvió a repartir'
      using errcode = 'assert_failure';
  end if;

  perform public.run_scheduled_job(v_job);
  if (select status from public.scheduled_jobs where id = v_job) <> 'done' then
    raise exception 'FALLIDO: el trabajo ejecutado no quedó marcado como hecho'
      using errcode = 'assert_failure';
  end if;
end $$;

-- El barrido de plazos no se ejecuta en SQL a propósito: para eso, y para
-- que nadie lo dé por hecho, la función lo dice y falla.
do $$
declare
  v_job uuid;
begin
  v_job := public.enqueue_scheduled_job(
    'c2000000-0000-0000-0000-000000000001', 'sla_sweep', now(), 'plazos-1');
  begin
    perform public.run_scheduled_job(v_job);
    raise exception 'FALLIDO: el barrido de plazos no debería ejecutarse en SQL'
      using errcode = 'assert_failure';
  exception
    when raise_exception then
      if sqlerrm not like '%queue-runner%' then
        raise exception 'FALLIDO: falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
      end if;
  end;
end $$;

-- ============================================================
-- La cola de correo: reclamar un envío lo saca de la lista de pendientes.
-- ============================================================
do $$
declare
  v_tomados integer;
  v_delivery uuid;
begin
  select count(*) into v_tomados from public.claim_notification_deliveries(50);
  if v_tomados = 0 then
    raise exception 'FIXTURE: no hay envíos encolados; el test no probaría nada'
      using errcode = 'assert_failure';
  end if;

  -- Reclamado incrementa intentos; un segundo reclamo no lo devuelve otra
  -- vez sin haberlo marcado, porque sigue pendiente pero con su intento
  -- contado. Lo que sí comprueba esto es que marcar funciona.
  select id into v_delivery from public.notification_deliveries limit 1;
  perform public.mark_delivery_sent(v_delivery, 'prov-1');
  if (select status from public.notification_deliveries where id = v_delivery) <> 'sent' then
    raise exception 'RN-NOT-05 FALLIDO: marcar un envío como enviado no lo cambió'
      using errcode = 'assert_failure';
  end if;

  perform public.mark_delivery_failed(v_delivery, 'Resend caído', now() + interval '4 minutes', false);
  if (select status from public.notification_deliveries where id = v_delivery) <> 'pending' then
    raise exception 'RN-NOT-05 FALLIDO: un fallo no dejó la fila lista para reintentar'
      using errcode = 'assert_failure';
  end if;

  perform public.mark_delivery_failed(v_delivery, 'Se acabaron los intentos', now(), true);
  if (select status from public.notification_deliveries where id = v_delivery) <> 'dead' then
    raise exception 'RN-NOT-05 FALLIDO: agotados los intentos la fila no quedó muerta'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Limpieza.
-- ============================================================
delete from public.audit_log where space_id = 'c2000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'c2000000-0000-0000-0000-000000000001';
delete from auth.users where email like 'cola-%@example.com';
drop table if exists cola_ctx;

do $$
begin
  raise notice 'hito8_cola_y_barridos.sql: RN-FIN-01, RN-FIN-10/11/13, RN-EST-09/10 y los avisos de consumo del §18 se disparan solos, base de datos limpia';
end $$;
