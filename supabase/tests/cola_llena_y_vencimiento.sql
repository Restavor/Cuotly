-- La cola que nadie llenaba, y el cobro que nacía vencido
-- (migración 20260908000052).
--
-- Tres averías que se tapaban entre sí, y por eso van en el mismo archivo:
--
--   1. Nadie llamaba a `enqueue_scheduled_job()` — ni SQL ni TypeScript —,
--      así que `scheduled_jobs` estaba vacía y el cron entraba cada mañana
--      a reclamar de una tabla vacía. RN-FIN-01 no se habría emitido nunca.
--   2. Aunque se hubiera llenado, `run_monthly_charges()` habría fallado
--      **en silencio**: `generate_monthly_charge_internal()` pasaba por
--      `get_or_create_consumption_cycle()`, la pública, que comprueba
--      `is_space_member()`. El proceso de la cola entra como `service_role`
--      y no es miembro de ningún espacio, así que la excepción caía en el
--      `exception when others then null` del barrido y nadie se enteraba.
--      Por eso el test más importante de este archivo es el que ejecuta el
--      barrido **sin identidad**, como el cron de verdad.
--   3. Y aunque hubiera cobrado, el cobro nacía vencido (`due_at =
--      cycle_start`) y RN-FIN-10 pausaba el restaurante 24 h después de
--      emitírselo.
--
-- Más el cobro duplicado que las tres escondían: `create_plan_subscription()`
-- no emitía la mensualidad del primer ciclo, así que una mejora de plan
-- cobraba la diferencia (RN-COM-15) contra una base inexistente y el
-- barrido emitía después la mensualidad entera del plan nuevo por el mismo
-- periodo.
--
-- Cómo ejecutarlo:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cola_llena_y_vencimiento.sql

insert into auth.users (id, email, role, aud) values
  ('f1000000-0000-0000-0000-000000000001', 'llena-owner@example.com', 'authenticated', 'authenticated'),
  ('f1000000-0000-0000-0000-000000000002', 'llena-cliente@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('f2000000-0000-0000-0000-000000000001', 'Espacio Cola Llena', 'espacio-cola-llena-test', 'f1000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'owner', 'active');

-- Básico e Impulso con sus precios reales: la aritmética del cobro
-- duplicado solo se ve con los dos.
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Básico', 9900, 0, 0, 0, 0, 48),
  ('f3000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 'Impulso', 39900, 8, 4, 2, 0, 24);

insert into public.groups (id, space_id, name) values
  ('f4000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'Grupo Cola Llena');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('f5000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'EST-LLENA', 'Restaurante Cola Llena'),
  ('f5000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'EST-LLENA-2', 'Restaurante Cola Llena 2');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('f5000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 'local_owner');

create temporary table llena_ctx (key text primary key, value text);
grant select, insert on llena_ctx to authenticated;

-- ============================================================
-- RN-FIN-01 · dar de alta un plan emite la mensualidad de su primer ciclo.
--
-- HU-07 abría la bolsa (RN-COM-06) y la permanencia (RN-COM-04) desde el
-- primer día y dejaba el cobro sin emitir. El alta ES la primera fecha de
-- renovación: el `cycle_start` del primer ciclo.
-- ============================================================
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  insert into llena_ctx values ('sub', public.create_plan_subscription(
    'f5000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001')::text);
end $$;

reset role;

do $$
declare
  v_sub uuid := (select value::uuid from llena_ctx where key = 'sub');
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_charges integer;
  v_base integer;
begin
  select cycle_start, cycle_end into v_cycle_start, v_cycle_end
  from public.consumption_cycles where subscription_id = v_sub;

  select count(*), max(base_cents) into v_charges, v_base
  from public.charges where subscription_id = v_sub;

  if v_charges <> 1 then
    raise exception 'RN-FIN-01 FALLIDO: el alta de plan emitió % cobros, esperaba 1', v_charges
      using errcode = 'assert_failure';
  end if;

  if v_base <> 9900 then
    raise exception 'RN-FIN-01 FALLIDO: la mensualidad se emitió por % céntimos, esperaba 9900 (Básico)', v_base
      using errcode = 'assert_failure';
  end if;

  -- El periodo del cobro es EL del ciclo, no uno inventado: de eso depende
  -- que `run_monthly_charges()` reconozca el ciclo como ya cobrado.
  if not exists (
    select 1 from public.charges
    where subscription_id = v_sub
      and period_start = v_cycle_start and period_end = v_cycle_end
  ) then
    raise exception 'RN-FIN-01 FALLIDO: el periodo del cobro no coincide con el del ciclo de consumo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-FIN-01b · y no nace vencida.
--
-- Con `due_at = cycle_start` el cobro se emitía ya vencido y el barrido de
-- impago pausaba el restaurante veinticuatro horas después (RN-FIN-10).
-- El plazo sale de `spaces.payment_term_days`, que es un dato del espacio
-- porque el PRD no fija ninguno.
-- ============================================================
do $$
declare
  v_sub uuid := (select value::uuid from llena_ctx where key = 'sub');
  v_due timestamptz;
  v_issued timestamptz;
  v_term integer;
begin
  select due_at, issued_at into v_due, v_issued
  from public.charges where subscription_id = v_sub;

  select payment_term_days into v_term
  from public.spaces where id = 'f2000000-0000-0000-0000-000000000001';

  if v_term <> 7 then
    raise exception 'RN-FIN-01b FALLIDO: el plazo de pago por defecto es % días, esperaba 7', v_term
      using errcode = 'assert_failure';
  end if;

  if v_due <= now() then
    raise exception 'RN-FIN-01b FALLIDO: la mensualidad nació vencida (due_at = %)', v_due
      using errcode = 'assert_failure';
  end if;

  if v_due < v_issued + interval '6 days' or v_due > v_issued + interval '8 days' then
    raise exception 'RN-FIN-01b FALLIDO: vence el % y se emitió el %; esperaba 7 días de plazo', v_due, v_issued
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y el ciclo de impago no la toca todavía: emitir un cobro no puede pausar
-- al restaurante que lo recibe (RN-FIN-10).
do $$
declare
  v_stage text;
begin
  v_stage := public.evaluate_establishment_dunning_internal('f5000000-0000-0000-0000-000000000001');
  if v_stage <> 'current' then
    raise exception 'RN-FIN-10 FALLIDO: una mensualidad recién emitida dejó el restaurante en "%"', v_stage
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-FIN-01 + RN-COM-15 · después de una mejora de plan, el barrido NO
-- emite un segundo cobro por el mismo ciclo.
--
-- Es la avería que el restaurante de Restavor tenía viva el 08/09/2026:
-- 299,96 € de diferencia cobrados y 399 € a punto de emitirse encima.
-- ============================================================
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.change_plan_immediately(
    (select value::uuid from llena_ctx where key = 'sub'),
    'f3000000-0000-0000-0000-000000000002',
    'mejora-test-1');
end $$;

reset role;

do $$
declare
  v_sub uuid := (select value::uuid from llena_ctx where key = 'sub');
  v_antes integer;
  v_despues integer;
  v_total integer;
  v_emitidos integer;
begin
  select count(*) into v_antes from public.charges where subscription_id = v_sub;
  if v_antes <> 2 then
    raise exception 'FIXTURE: tras la mejora hay % cobros, esperaba 2 (mensualidad + diferencia)', v_antes
      using errcode = 'assert_failure';
  end if;

  v_emitidos := public.run_monthly_charges('f2000000-0000-0000-0000-000000000001');

  select count(*) into v_despues from public.charges where subscription_id = v_sub;
  if v_despues <> v_antes then
    raise exception 'RN-FIN-01 FALLIDO: el barrido emitió % cobro(s) de más sobre un ciclo ya cobrado', v_despues - v_antes
      using errcode = 'assert_failure';
  end if;

  -- Y lo cobrado por el ciclo es el plan nuevo, no el plan nuevo MÁS la
  -- diferencia: 99 € de base + la parte proporcional ≈ 399 €.
  select sum(base_cents) into v_total from public.charges where subscription_id = v_sub;
  if v_total < 39000 or v_total > 39900 then
    raise exception 'RN-COM-15 FALLIDO: el ciclo suma % céntimos de base; esperaba ~39900 (Impulso)', v_total
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-DAT-04 y RN-DAT-05 · el cobro de la mejora, en el libro
-- (migración 53).
--
-- `change_plan_immediately()` insertaba la fila en `charges` y ninguna en
-- `financial_entries`. Como `charges` no tiene columna de estado —el estado
-- lo deriva `charge_status()` sumando apuntes—, ese cobro salía **saldado
-- sin que nadie hubiera pagado**, el ciclo de impago no lo miraba nunca y
-- no contaba en el panel. Se vio en los datos de Restavor el 08/09/2026.
-- ============================================================
do $$
declare
  v_sub uuid := (select value::uuid from llena_ctx where key = 'sub');
  v_charge uuid;
  v_apuntes integer;
  v_deuda integer;
  v_estado text;
  v_total integer;
begin
  select id, total_cents into v_charge, v_total
  from public.charges
  where subscription_id = v_sub and concept like 'Mejora a %';

  if v_charge is null then
    raise exception 'FIXTURE: la mejora de plan no dejó su cobro proporcional'
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_apuntes
  from public.financial_entries where charge_id = v_charge and entry_type = 'charge';
  if v_apuntes <> 1 then
    raise exception 'RN-DAT-04 FALLIDO: el cobro de la mejora tiene % apuntes de cargo, esperaba 1', v_apuntes
      using errcode = 'assert_failure';
  end if;

  select coalesce(sum(amount_cents), 0) into v_deuda
  from public.financial_entries where charge_id = v_charge;
  if v_deuda <> v_total then
    raise exception 'RN-DAT-05 FALLIDO: el libro dice que se deben % céntimos de un cobro de %', v_deuda, v_total
      using errcode = 'assert_failure';
  end if;

  -- Y por tanto se ve como lo que es: deuda viva, no un cobro saldado.
  v_estado := public.charge_status(v_charge);
  if v_estado not in ('pending', 'overdue') then
    raise exception 'RN-FIN-02 FALLIDO: el cobro de la mejora está "%"; nadie lo ha pagado', v_estado
      using errcode = 'assert_failure';
  end if;

  -- Y deja su rastro de emisión, como cualquier otro cobro.
  if not exists (
    select 1 from public.audit_log
    where action = 'charge.issued' and entity_id = v_charge
  ) then
    raise exception 'P4 FALLIDO: emitir el cobro de la mejora no dejó rastro en la auditoría'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- La avería silenciosa: el barrido, ejecutado como lo ejecuta el cron.
--
-- `service_role` y sin identidad. Hasta la migración 52 esto no cobraba
-- nada y no se quejaba: la excepción de `is_space_member()` caía en el
-- `exception when others then null` del barrido.
-- ============================================================
do $$
begin
  insert into llena_ctx values ('sub2', public.create_plan_subscription(
    'f5000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000002')::text);
end $$;

-- Se le borra la mensualidad y su apunte para dejar el ciclo sin cobrar, que
-- es el estado en el que el barrido tiene que emitirla. Es fixture, no
-- operativa: la aplicación no borra cobros (CLAUDE.md).
delete from public.financial_entries
where charge_id in (select id from public.charges
                    where subscription_id = (select value::uuid from llena_ctx where key = 'sub2'));
delete from public.charges
where subscription_id = (select value::uuid from llena_ctx where key = 'sub2');

select set_config('request.jwt.claim.sub', '', false);

do $$
declare
  v_sub uuid := (select value::uuid from llena_ctx where key = 'sub2');
  v_emitidos integer;
begin
  if auth.uid() is not null then
    raise exception 'FIXTURE: el barrido tiene que correr sin identidad, como el cron'
      using errcode = 'assert_failure';
  end if;

  v_emitidos := public.run_monthly_charges('f2000000-0000-0000-0000-000000000001');

  if not exists (select 1 from public.charges where subscription_id = v_sub) then
    raise exception 'RN-FIN-01 FALLIDO: el barrido sin identidad (el del cron) no emitió la mensualidad. '
                    'Es el fallo silencioso de la migración 41: la excepción de is_space_member() se la '
                    'tragaba el "exception when others then null".'
      using errcode = 'assert_failure';
  end if;

  if v_emitidos < 1 then
    raise exception 'RN-FIN-01 FALLIDO: el barrido dice haber emitido % cobros y emitió al menos 1', v_emitidos
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y ejecutarlo otra vez no cobra otra vez, ni dice haberlo hecho
-- (RN-DAT-09).
do $$
declare
  v_sub uuid := (select value::uuid from llena_ctx where key = 'sub2');
  v_antes integer;
  v_despues integer;
  v_emitidos integer;
begin
  select count(*) into v_antes from public.charges where subscription_id = v_sub;
  v_emitidos := public.run_monthly_charges('f2000000-0000-0000-0000-000000000001');
  select count(*) into v_despues from public.charges where subscription_id = v_sub;

  if v_despues <> v_antes then
    raise exception 'RN-DAT-09 FALLIDO: el segundo barrido del mismo día emitió % cobros de más', v_despues - v_antes
      using errcode = 'assert_failure';
  end if;

  if v_emitidos <> 0 then
    raise exception 'FALLIDO: el barrido cuenta % emitidos sobre ciclos ya cobrados', v_emitidos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- Lo que faltaba de verdad: que alguien llene la cola.
-- ============================================================
do $$
declare
  v_momento timestamptz := timestamptz '2026-01-05 10:00:00+00';
  v_encolados integer;
  v_repetidos integer;
  v_mios integer;
  v_tipos text;
begin
  v_encolados := public.enqueue_due_scheduled_jobs(v_momento);
  if v_encolados < 4 then
    raise exception 'FALLIDO: llenar la cola encoló % trabajos; esperaba al menos 4 (uno por barrido)', v_encolados
      using errcode = 'assert_failure';
  end if;

  select count(*), string_agg(kind, ',' order by kind) into v_mios, v_tipos
  from public.scheduled_jobs
  where space_id = 'f2000000-0000-0000-0000-000000000001' and status = 'pending';

  if v_tipos is distinct from 'consumption_sweep,dunning_sweep,lifecycle_sweep,monthly_charges' then
    raise exception 'FALLIDO: la cola de este espacio tiene "%"; esperaba los cuatro barridos de SQL', v_tipos
      using errcode = 'assert_failure';
  end if;

  -- `sla_sweep` NO se encola: lo calcula el proceso de la cola con el reloj
  -- laboral, y `run_scheduled_job()` lo rechaza. Encolarlo sería llenar la
  -- tabla de trabajos condenados a fallar.
  if exists (
    select 1 from public.scheduled_jobs
    where space_id = 'f2000000-0000-0000-0000-000000000001' and kind = 'sla_sweep'
  ) then
    raise exception 'FALLIDO: se encoló sla_sweep, que en SQL siempre falla'
      using errcode = 'assert_failure';
  end if;

  -- CA-17: llamar dos veces dentro de la misma hora no encola dos veces.
  v_repetidos := public.enqueue_due_scheduled_jobs(v_momento);
  if v_repetidos <> 0 then
    raise exception 'CA-17 FALLIDO: llenar la cola dos veces en la misma hora encoló % trabajos más', v_repetidos
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_mios from public.scheduled_jobs
  where space_id = 'f2000000-0000-0000-0000-000000000001';
  if v_mios <> 4 then
    raise exception 'CA-17 FALLIDO: el espacio tiene % trabajos encolados, esperaba 4', v_mios
      using errcode = 'assert_failure';
  end if;

  -- La hora siguiente sí es otra tanda: el ritmo lo pone quien llama.
  v_repetidos := public.enqueue_due_scheduled_jobs(v_momento + interval '1 hour');
  if v_repetidos < 4 then
    raise exception 'FALLIDO: la hora siguiente encoló % trabajos; esperaba al menos 4', v_repetidos
      using errcode = 'assert_failure';
  end if;
end $$;

-- Y los cuatro, reclamados y ejecutados, terminan bien: la cola llena
-- también se vacía.
do $$
declare
  v_job record;
  v_ejecutados integer := 0;
  v_ids uuid[] := array[]::uuid[];
begin
  -- Se reclaman como los reclama el proceso, no con un select a pelo: es
  -- `claim_scheduled_jobs()` quien los pasa a `running` con `for update
  -- skip locked` para que dos procesos no cojan el mismo.
  for v_job in
    select c.id, c.kind from public.claim_scheduled_jobs(50) c
    where c.space_id = 'f2000000-0000-0000-0000-000000000001'
  loop
    perform public.run_scheduled_job(v_job.id);
    v_ids := v_ids || v_job.id;
    v_ejecutados := v_ejecutados + 1;
  end loop;

  if v_ejecutados < 4 then
    raise exception 'FALLIDO: se ejecutaron % barridos de este espacio, esperaba al menos 4', v_ejecutados
      using errcode = 'assert_failure';
  end if;

  if exists (
    select 1 from public.scheduled_jobs
    where id = any(v_ids) and status <> 'done'
  ) then
    raise exception 'FALLIDO: algún barrido ejecutado no quedó marcado como hecho'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-FIN-01b · el plazo de pago, quién lo cambia y qué deja escrito.
-- ============================================================
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_cambiado boolean;
begin
  v_cambiado := public.set_space_payment_term('f2000000-0000-0000-0000-000000000001', 15);
  if not v_cambiado then
    raise exception 'RN-FIN-01b FALLIDO: el propietario no pudo cambiar el plazo de pago'
      using errcode = 'assert_failure';
  end if;

  -- Guardar el mismo valor no escribe una fila de auditoría que diría
  -- "de 15 a 15".
  if public.set_space_payment_term('f2000000-0000-0000-0000-000000000001', 15) then
    raise exception 'FALLIDO: guardar el mismo plazo se contó como un cambio'
      using errcode = 'assert_failure';
  end if;

  -- El rango lo comprueba el servidor, no el `min`/`max` del formulario.
  begin
    perform public.set_space_payment_term('f2000000-0000-0000-0000-000000000001', 400);
    raise exception 'FALLIDO: se aceptó un plazo de pago de 400 días'
      using errcode = 'assert_failure';
  exception when raise_exception then
    if sqlerrm not like '%entre 0 y 90%' then
      raise exception 'FALLIDO: el rango falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
    end if;
  end;
end $$;

reset role;

do $$
begin
  if (select payment_term_days from public.spaces where id = 'f2000000-0000-0000-0000-000000000001') <> 15 then
    raise exception 'RN-FIN-01b FALLIDO: el plazo de pago no se guardó'
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.audit_log
    where action = 'space.payment_term_changed'
      and entity_id = 'f2000000-0000-0000-0000-000000000001'
      and old_value ->> 'payment_term_days' = '7'
      and new_value ->> 'payment_term_days' = '15'
  ) then
    raise exception 'P4 FALLIDO: cambiar el plazo de pago no dejó rastro con el valor anterior'
      using errcode = 'assert_failure';
  end if;
end $$;

-- CA-01 · el cliente no lo toca. Ocultar el formulario no es un control de
-- acceso: la RPC a pelo tiene que fallar igual (CLAUDE.md).
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
begin
  perform public.set_space_payment_term('f2000000-0000-0000-0000-000000000001', 30);
  raise exception 'CA-01 FALLIDO: un cliente cambió el plazo de pago del espacio'
    using errcode = 'assert_failure';
exception when raise_exception then
  if sqlerrm not like '%propietario%' then
    raise exception 'CA-01 FALLIDO: falló por otro motivo: %', sqlerrm using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- CLAUDE.md MUST · llenar la cola es del proceso, no de una persona. Un
-- `enqueue_due_scheduled_jobs()` abierto por RPC es cualquiera obligando a
-- que se emitan cobros y se suspendan restaurantes cuando le apetezca.
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
    'enqueue_due_scheduled_jobs(timestamptz)',
    'generate_monthly_charge_internal(uuid, timestamptz)',
    'run_monthly_charges(uuid)']
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

  -- La de Ajustes sí es de una persona, y comprueba el permiso por su
  -- cuenta. `anon` no pinta nada: sin sesión no hay propietario.
  if not has_function_privilege('authenticated', 'public.set_space_payment_term(uuid, integer)', 'execute') then
    raise exception 'FALLIDO: el propietario no puede llamar a set_space_payment_term() desde la pantalla'
      using errcode = 'assert_failure';
  end if;

  if has_function_privilege('anon', 'public.set_space_payment_term(uuid, integer)', 'execute') then
    raise exception 'FALLIDO: set_space_payment_term() está abierta a anon'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-DAT-04 en falso-cerrado · NINGÚN cobro puede estar fuera del libro.
--
-- El barrido recorre todos los cobros que existan en la base cuando esto
-- se ejecuta —los de este archivo y los que hayan dejado los demás— y
-- falla si alguno no tiene su apunte de cargo. La avería de la migración
-- 53 se encontró mirando los datos de producción, no leyendo el código: un
-- emisor nuevo que se olvide del apunte tiene que romper el test, no
-- esperar a que alguien vuelva a mirar los datos.
-- ============================================================
do $$
declare
  v_huerfanos integer;
  v_lista text;
begin
  select count(*), string_agg(distinct c.concept, ', ')
  into v_huerfanos, v_lista
  from public.charges c
  where not exists (
    select 1 from public.financial_entries fe
    where fe.charge_id = c.id and fe.entry_type = 'charge'
  );

  if v_huerfanos > 0 then
    raise exception 'RN-DAT-04 FALLIDO: % cobro(s) sin apunte de cargo en el libro (%). '
                    'Un cobro que el libro no conoce sale saldado sin que nadie haya pagado, '
                    'y el ciclo de impago no lo mira nunca.', v_huerfanos, v_lista
      using errcode = 'assert_failure';
  end if;
end $$;

-- Limpieza. Faltaba: la suite pasaba y dejaba sus dos usuarios en
-- `auth.users`, así que la segunda ejecución sobre la misma base chocaba
-- con `users_pkey` en el fixture — un fallo que no es de la regla, y que
-- en CI no se veía porque allí cada ejecución nace de cero.
delete from public.audit_log where space_id = 'f2000000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'f2000000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'f1000000-%';

select 'cola_llena_y_vencimiento: OK' as resultado;
