-- Verificación de CA-06, CA-07, CA-08, CA-09 y CA-17 del Hito 5 (Consumos y
-- aceptación). CA-05 (la concurrencia real de dos aceptaciones peleando por
-- el último crédito) NO está aquí: un script `psql -f` ejecuta cada
-- sentencia de nivel superior como su propia transacción secuencial en una
-- única conexión, así que nunca hay dos transacciones abiertas a la vez —
-- eso vive aparte, en apps/web/scripts/hito5-concurrency-test.mjs, con dos
-- conexiones reales de node-postgres disparadas con Promise.allSettled.
--
-- Mismo patrón que supabase/tests/hito2_permisos.sql y hito4_solicitudes.sql:
-- bloques `do $$ ... end $$` que lanzan una excepción real si algo no es lo
-- esperado, `set role authenticated`/`reset role` (sin LOCAL, ver la nota
-- de hito4_solicitudes.sql) para cambiar de identidad con RLS activo de
-- verdad, y limpieza propia al final.
--
-- Cómo ejecutarlo: igual que los anteriores — automáticamente en CI
-- (.github/workflows/ci.yml, job "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hito5_consumos.sql

-- ============================================================
-- Preparación: un espacio con propietario, un grupo con un establecimiento,
-- un plan con un único crédito "pequeño" incluido (para poder agotarlo con
-- una sola aceptación en las pruebas de abajo) y su suscripción.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('90000000-0000-0000-0000-000000000001', 'h5-owner@example.com', 'authenticated', 'authenticated'),
  ('90000000-0000-0000-0000-000000000002', 'h5-client@example.com', 'authenticated', 'authenticated'),
  ('90000000-0000-0000-0000-000000000003', 'h5-worker@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('91000000-0000-0000-0000-000000000001', 'Espacio H5', 'espacio-h5-test', '90000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours) values
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Impulso H5', 39900, 1, 0, 0, 0, 24);

insert into public.groups (id, space_id, name) values
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Grupo H5');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('94000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'EST-H5-A', 'Restaurante H5');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('95000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'local_owner');

-- Un trabajador NO puede asignar un plan (RN-COM-11, has_capability
-- 'manage_clients' exige owner/admin) — control negativo antes de que el
-- propietario lo haga de verdad.
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
begin
  begin
    perform public.create_plan_subscription('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001');
    raise exception 'CA-01 FALLIDO: un Trabajador pudo asignar un plan a un establecimiento (RN-COM-11)';
  exception
    when raise_exception then null; -- esperado
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_subscription_id uuid;
begin
  v_subscription_id := public.create_plan_subscription('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001');

  create temporary table h5_ctx (key text primary key, value text);
  grant select, insert on h5_ctx to authenticated, service_role;
  insert into h5_ctx values ('subscription', v_subscription_id::text);

  -- RN-COM-13: como máximo un plan activo a la vez — un segundo intento
  -- sobre el mismo establecimiento debe fallar por el índice único parcial.
  begin
    perform public.create_plan_subscription('94000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001');
    raise exception 'RN-COM-13 FALLIDO: se asignaron dos planes activos al mismo establecimiento';
  exception
    when unique_violation then null; -- esperado
  end;
end $$;

reset role;

-- Función auxiliar para el resto del archivo: lleva una solicitud desde el
-- borrador hasta "pendiente de aceptación" con categoría "small", en el
-- mismo estilo que hito4_solicitudes.sql. No es un bloque `do` porque
-- necesita cambiar de rol/identidad varias veces en el camino (submit y
-- validate son de identidades distintas), así que se repite inline en cada
-- escenario de abajo con un pequeño bloque por paso.

-- ============================================================
-- CA-17 (parte 1) · pulsar aceptar dos veces produce un único efecto:
-- un único trabajo, un único apunte de consumo, una única notificación
-- potencial (aquí verificado como "una única fila" en cada tabla).
-- ============================================================
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid;
begin
  v_request_id := public.create_request_draft('94000000-0000-0000-0000-000000000001', 'CA-17: cambiar el titulo de la home', null);
  insert into h5_ctx values ('request_ca17', v_request_id::text);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);
end $$;

reset role;
set role service_role;

do $$
begin
  perform public.record_classification(
    (select value::uuid from h5_ctx where key = 'request_ca17'),
    '90000000-0000-0000-0000-000000000002'::uuid, 'rules', 'small', 'CA-17', null, null, null, null, null, null
  );
end $$;

reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.validate_classification((select value::uuid from h5_ctx where key = 'request_ca17'), 'small', 'CA-17');
end $$;

reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h5_ctx where key = 'request_ca17');
  v_state text;
  v_job_count int;
  v_entry_count int;
  v_acceptance_count int;
begin
  perform public.accept_request(v_request_id);
  -- Pulsar aceptar dos veces no duplica el efecto (CA-17).
  perform public.accept_request(v_request_id);
  perform public.accept_request(v_request_id);

  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'accepted' then
    raise exception 'CA-17 FALLIDO: tras aceptar, el estado debería ser accepted, es %', v_state;
  end if;

  select count(*) into v_job_count from public.jobs where request_id = v_request_id;
  if v_job_count <> 1 then
    raise exception 'CA-17/RN-REQ-02 FALLIDO: aceptar tres veces creó % trabajos (esperado 1)', v_job_count;
  end if;

  select count(*) into v_entry_count from public.consumption_entries where request_id = v_request_id;
  if v_entry_count <> 1 then
    raise exception 'CA-17/RN-CON-06 FALLIDO: aceptar tres veces generó % apuntes de consumo (esperado 1)', v_entry_count;
  end if;

  select count(*) into v_acceptance_count from public.acceptances where request_id = v_request_id;
  if v_acceptance_count <> 1 then
    raise exception 'CA-17 FALLIDO: aceptar tres veces generó % filas en acceptances (esperado 1)', v_acceptance_count;
  end if;

  insert into h5_ctx values ('job_ca17', (select id::text from public.jobs where request_id = v_request_id));
end $$;

reset role;

-- ============================================================
-- CA-06 (parte 1) · cancelar ANTES de Comenzar devuelve el consumo.
-- El plan de este espacio solo incluye 1 "pequeño": tras devolver el de
-- CA-17, debe quedar disponible de nuevo para una solicitud nueva.
-- ============================================================
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h5_ctx where key = 'request_ca17');
  v_job_id uuid := (select value::uuid from h5_ctx where key = 'job_ca17');
  v_job_state text;
  v_request_state text;
  v_entries jsonb;
begin
  -- jobs.started_at sigue null (RN-JOB-03/"Comenzar" es del Hito 6, no se
  -- ha escrito todavía) — esto es justo el caso "antes de Comenzar".
  perform public.cancel_accepted_request(v_request_id, 'CA-06: el cliente cambia de idea antes de que empiece');
  -- Pulsarlo dos veces no duplica la devolución.
  perform public.cancel_accepted_request(v_request_id, 'segundo intento');

  select state into v_job_state from public.jobs where id = v_job_id;
  if v_job_state <> 'cancelled_before_start' then
    raise exception 'CA-06 FALLIDO: el trabajo debería quedar cancelled_before_start, está %', v_job_state;
  end if;

  select state into v_request_state from public.requests where id = v_request_id;
  if v_request_state <> 'cancelled_before_start' then
    raise exception 'RN-REQ-01 FALLIDO: la solicitud debería reflejar el mismo nombre de estado, está %', v_request_state;
  end if;

  select jsonb_agg(jsonb_build_object('type', entry_type, 'amount', amount) order by created_at) into v_entries
  from public.consumption_entries where job_id = v_job_id;

  if v_entries <> '[{"type": "debit", "amount": -1}, {"type": "return", "amount": 1}]'::jsonb then
    raise exception 'CA-06 FALLIDO: se esperaba un débito y una única devolución (sin duplicar), se obtuvo %', v_entries;
  end if;
end $$;

reset role;

-- ============================================================
-- CA-08 · el saldo es siempre la suma de los apuntes del libro, y no hay
-- ninguna ruta de escritura directa (INSERT/UPDATE) sobre consumption_entries
-- para el cliente: la tabla no tiene ninguna política que lo permita.
-- ============================================================
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_cycle_id uuid;
  v_included_small int;
  v_sum int;
  v_balance int;
  v_updated int;
  v_deleted int;
  v_inserted int := 0;
begin
  select cc.id, cc.included_small into v_cycle_id, v_included_small
  from public.consumption_cycles cc
  where cc.subscription_id = (select value::uuid from h5_ctx where key = 'subscription');

  select coalesce(sum(amount), 0) into v_sum from public.consumption_entries where consumption_cycle_id = v_cycle_id and category = 'small';
  v_balance := v_included_small + v_sum;

  -- Tras CA-17 (débito) y CA-06 (devolución), el saldo real debe volver a
  -- ser el íntegro del ciclo (RN-CON-08: "antes de Comenzar... se
  -- devuelve el consumo" — vuelve a estar disponible de verdad, no solo
  -- de nombre).
  if v_balance <> v_included_small then
    raise exception 'CA-08 FALLIDO: el saldo calculado (%) no coincide con la suma de apuntes esperada (%)', v_balance, v_included_small;
  end if;

  -- Ninguna ruta de cliente puede tocar el libro directamente.
  begin
    insert into public.consumption_entries (space_id, establishment_id, consumption_cycle_id, category, amount, entry_type, created_by)
    values ('91000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', v_cycle_id, 'small', -1, 'debit', auth.uid());
    v_inserted := 1;
  exception
    when insufficient_privilege then null; -- esperado: sin política de INSERT
  end;
  if v_inserted <> 0 then
    raise exception 'CA-08 FALLIDO: el cliente pudo insertar un apunte directamente en consumption_entries';
  end if;

  with intento_editar as (
    update public.consumption_entries set amount = -99 where consumption_cycle_id = v_cycle_id
    returning id
  )
  select count(*) into v_updated from intento_editar;

  with intento_borrar as (
    delete from public.consumption_entries where consumption_cycle_id = v_cycle_id
    returning id
  )
  select count(*) into v_deleted from intento_borrar;

  if v_updated <> 0 or v_deleted <> 0 then
    raise exception 'CA-08 FALLIDO: editados=% (esperado 0), borrados=% (esperado 0) — el libro no es inmutable', v_updated, v_deleted;
  end if;
end $$;

reset role;

-- ============================================================
-- CA-06 (parte 2) · cancelar DESPUÉS de Comenzar mantiene el consumo.
-- jobs.started_at lo escribirá "Comenzar" (RN-JOB-03) en el Hito 6; aquí
-- se fija directamente como precondición del escenario (con la identidad
-- de servicio, sin RLS), tal como documenta la cabecera de la migración.
-- ============================================================
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid;
begin
  v_request_id := public.create_request_draft('94000000-0000-0000-0000-000000000001', 'CA-06 (después de Comenzar): sustituir el logo', null);
  insert into h5_ctx values ('request_ca06b', v_request_id::text);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);
end $$;

reset role;
set role service_role;

do $$
begin
  perform public.record_classification(
    (select value::uuid from h5_ctx where key = 'request_ca06b'),
    '90000000-0000-0000-0000-000000000002'::uuid, 'rules', 'small', 'CA-06b', null, null, null, null, null, null
  );
end $$;

reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.validate_classification((select value::uuid from h5_ctx where key = 'request_ca06b'), 'small', 'CA-06b');
end $$;

reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h5_ctx where key = 'request_ca06b');
  v_job_id uuid;
begin
  perform public.accept_request(v_request_id);
  v_job_id := (select id from public.jobs where request_id = v_request_id);
  insert into h5_ctx values ('job_ca06b', v_job_id::text);
end $$;

reset role;

-- Fijar started_at exige bypassear RLS (jobs no tiene política de UPDATE
-- para el cliente): se hace como propietario de la base de datos, nunca
-- disponible por API — ver la nota del bloque de arriba.
reset role;
update public.jobs set started_at = now() where id = (select value::uuid from h5_ctx where key = 'job_ca06b');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h5_ctx where key = 'request_ca06b');
  v_job_id uuid := (select value::uuid from h5_ctx where key = 'job_ca06b');
  v_job_state text;
  v_entry_count int;
begin
  perform public.cancel_accepted_request(v_request_id, 'CA-06: el cliente cancela después de que el trabajo ya empezó');

  select state into v_job_state from public.jobs where id = v_job_id;
  if v_job_state <> 'cancelled_after_start' then
    raise exception 'CA-06 FALLIDO: el trabajo debería quedar cancelled_after_start, está %', v_job_state;
  end if;

  select count(*) into v_entry_count from public.consumption_entries where job_id = v_job_id;
  if v_entry_count <> 1 then
    raise exception 'RN-JOB-04/CA-06 FALLIDO: cancelar después de Comenzar debería mantener el consumo (1 apunte, el débito), hay %', v_entry_count;
  end if;

  if exists (select 1 from public.consumption_entries where job_id = v_job_id and entry_type <> 'debit') then
    raise exception 'RN-JOB-04/CA-06 FALLIDO: se generó una devolución tras cancelar después de Comenzar';
  end if;
end $$;

reset role;

-- El plan de este espacio solo incluye 1 "pequeño" por ciclo, y CA-06
-- (parte 2) lo dejó consumido para siempre (cancelar después de empezar
-- mantiene el consumo). Para poder aceptar la solicitud de CA-07 hace
-- falta más margen en el ciclo vigente — se amplía aquí directamente
-- (fixture, sin pasar por ninguna pantalla de cambio de plan: eso es
-- RN-COM-15/18, fuera de alcance de este hito) para no atar el resto del
-- archivo a "solo puede haber un consumo con éxito en toda la prueba".
update public.consumption_cycles
set included_small = included_small + 2
where subscription_id = (select value::uuid from h5_ctx where key = 'subscription')
  and cycle_start <= now() and cycle_end > now();

-- ============================================================
-- CA-07 · una devolución cuyo ciclo original ya cerró genera un crédito
-- compensatorio en el ciclo ACTUAL, no una reapertura del ciclo cerrado —
-- y ese crédito caduca con el ciclo en el que se creó (RN-CON-11: el saldo
-- es sum(amount) dentro de ese ciclo, sin traspaso a ningún otro).
--
-- Emular "el ciclo original ya cerró" sin esperar un mes de verdad: se
-- crea un ciclo cerrado (cycle_end en el pasado) para la misma suscripción
-- y se reapunta a él el débito de una aceptación real ya hecha — mismo
-- principio que jobs.started_at más arriba, precondición fijada
-- directamente porque el disparador real (el paso del tiempo) no se puede
-- fingir con SQL.
-- ============================================================
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid;
begin
  v_request_id := public.create_request_draft('94000000-0000-0000-0000-000000000001', 'CA-07: cambiar el telefono de contacto', null);
  insert into h5_ctx values ('request_ca07', v_request_id::text);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);
end $$;

reset role;
set role service_role;

do $$
begin
  perform public.record_classification(
    (select value::uuid from h5_ctx where key = 'request_ca07'),
    '90000000-0000-0000-0000-000000000002'::uuid, 'rules', 'small', 'CA-07', null, null, null, null, null, null
  );
end $$;

reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.validate_classification((select value::uuid from h5_ctx where key = 'request_ca07'), 'small', 'CA-07');
end $$;

reset role;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h5_ctx where key = 'request_ca07');
  v_job_id uuid;
begin
  perform public.accept_request(v_request_id);
  v_job_id := (select id from public.jobs where request_id = v_request_id);
  insert into h5_ctx values ('job_ca07', v_job_id::text);
end $$;

reset role;

-- Precondición: un ciclo ya cerrado de la misma suscripción, y el débito
-- de la aceptación de arriba reapuntado a él (bypass de RLS, como
-- postgres — igual que jobs.started_at más arriba).
do $$
declare
  v_subscription_id uuid := (select value::uuid from h5_ctx where key = 'subscription');
  v_old_cycle_id uuid;
  v_job_id uuid := (select value::uuid from h5_ctx where key = 'job_ca07');
begin
  insert into public.consumption_cycles (space_id, establishment_id, subscription_id, cycle_start, cycle_end, included_small, included_photo, included_medium, included_large)
  values (
    '91000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', v_subscription_id,
    now() - interval '2 months', now() - interval '1 month', 1, 0, 0, 0
  )
  returning id into v_old_cycle_id;

  insert into h5_ctx values ('old_cycle_ca07', v_old_cycle_id::text);

  update public.consumption_entries
  set consumption_cycle_id = v_old_cycle_id
  where job_id = v_job_id and entry_type = 'debit';
end $$;

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h5_ctx where key = 'request_ca07');
  v_job_id uuid := (select value::uuid from h5_ctx where key = 'job_ca07');
  v_old_cycle_id uuid := (select value::uuid from h5_ctx where key = 'old_cycle_ca07');
  v_current_cycle_id uuid;
  v_new_entry_type text;
  v_new_entry_cycle uuid;
  v_new_entry_amount int;
begin
  select id into v_current_cycle_id from public.consumption_cycles
  where subscription_id = (select value::uuid from h5_ctx where key = 'subscription')
    and id <> v_old_cycle_id
  order by cycle_start desc limit 1;

  perform public.cancel_accepted_request(v_request_id, 'CA-07: el ciclo original ya había cerrado');

  select entry_type, consumption_cycle_id, amount
  into v_new_entry_type, v_new_entry_cycle, v_new_entry_amount
  from public.consumption_entries
  where job_id = v_job_id and entry_type <> 'debit';

  if v_new_entry_type is null then
    raise exception 'CA-07 FALLIDO: no se generó ningún apunte de devolución/crédito compensatorio';
  end if;
  if v_new_entry_type <> 'compensatory_credit' then
    raise exception 'CA-07 FALLIDO: se esperaba un crédito compensatorio, se generó un %', v_new_entry_type;
  end if;
  if v_new_entry_amount <> 1 then
    raise exception 'CA-07 FALLIDO: el crédito compensatorio debería sumar 1, suma %', v_new_entry_amount;
  end if;
  if v_new_entry_cycle = v_old_cycle_id then
    raise exception 'RN-CON-10 FALLIDO: la devolución reabrió el ciclo original ya cerrado, en vez de generar un crédito en el ciclo actual';
  end if;
  if v_new_entry_cycle <> v_current_cycle_id then
    raise exception 'CA-07 FALLIDO: el crédito compensatorio no se creó en el ciclo actual (%), se creó en %', v_current_cycle_id, v_new_entry_cycle;
  end if;

  -- RN-CON-11: el crédito compensatorio caduca con el ciclo en el que se
  -- creó, como cualquier otro consumo — se comprueba que el saldo del
  -- ciclo VIEJO no cambió (sigue agotado: 1 incluido - 1 débito = 0), el
  -- traspaso no "revive" ningún consumo en él.
  if (select included_small + coalesce(sum(amount), 0) from public.consumption_cycles cc
      left join public.consumption_entries ce on ce.consumption_cycle_id = cc.id and ce.category = 'small'
      where cc.id = v_old_cycle_id group by included_small) <> 0 then
    raise exception 'RN-CON-11 FALLIDO: el ciclo original quedó con saldo distinto de 0 tras la devolución compensatoria';
  end if;
end $$;

reset role;

-- ============================================================
-- CA-09 · una renovación no altera el ciclo al que pertenece un consumo ya
-- aceptado: crear un ciclo nuevo (simulando la renovación mensual) no debe
-- tocar ni el ciclo viejo ni sus apuntes ya registrados.
-- ============================================================
do $$
declare
  v_subscription_id uuid := (select value::uuid from h5_ctx where key = 'subscription');
  v_old_cycle_id uuid := (select value::uuid from h5_ctx where key = 'old_cycle_ca07');
  v_old_included_before int;
  v_old_entry_count_before int;
  v_new_cycle_id uuid;
  v_old_included_after int;
  v_old_entry_count_after int;
begin
  select included_small into v_old_included_before from public.consumption_cycles where id = v_old_cycle_id;
  select count(*) into v_old_entry_count_before from public.consumption_entries where consumption_cycle_id = v_old_cycle_id;

  -- "Renovación": otro ciclo posterior para la misma suscripción, con una
  -- bolsa incluida distinta (como si el plan hubiera cambiado desde
  -- entonces) — get_or_create_consumption_cycle() es SECURITY DEFINER sin
  -- grant público (revoke all ... from public en la migración), así que
  -- para este test se inserta directamente el ciclo "de renovación",
  -- igual que el ciclo cerrado de CA-07.
  insert into public.consumption_cycles (space_id, establishment_id, subscription_id, cycle_start, cycle_end, included_small, included_photo, included_medium, included_large)
  values (
    '91000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', v_subscription_id,
    now() + interval '1 month', now() + interval '2 months', 7, 0, 0, 0
  )
  returning id into v_new_cycle_id;

  select included_small into v_old_included_after from public.consumption_cycles where id = v_old_cycle_id;
  select count(*) into v_old_entry_count_after from public.consumption_entries where consumption_cycle_id = v_old_cycle_id;

  if v_old_included_before <> v_old_included_after then
    raise exception 'CA-09 FALLIDO: la bolsa incluida del ciclo viejo cambió tras crear el ciclo de renovación (% -> %)', v_old_included_before, v_old_included_after;
  end if;
  if v_old_entry_count_before <> v_old_entry_count_after then
    raise exception 'CA-09 FALLIDO: el número de apuntes del ciclo viejo cambió tras la renovación (% -> %)', v_old_entry_count_before, v_old_entry_count_after;
  end if;

  -- Y el propio apunte de débito de CA-07 sigue apuntando al ciclo viejo,
  -- no al nuevo — RN-CON-05 en su forma más literal.
  if exists (
    select 1 from public.consumption_entries
    where job_id = (select value::uuid from h5_ctx where key = 'job_ca07')
      and entry_type = 'debit'
      and consumption_cycle_id <> v_old_cycle_id
  ) then
    raise exception 'CA-09 FALLIDO: el apunte de débito ya aceptado cambió de ciclo tras la renovación';
  end if;
end $$;

-- ============================================================
-- CA-02 · aislamiento entre espacios también para las tablas nuevas del
-- Hito 5 (un usuario sin relación con Espacio H5 no ve nada de él).
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('90000000-0000-0000-0000-000000000099', 'h5-ajeno@example.com', 'authenticated', 'authenticated');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000099', false);
set role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.subscriptions where space_id = '91000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de subscriptions de un espacio ajeno visibles (esperado 0)', v_count;
  end if;

  select count(*) into v_count from public.consumption_cycles where space_id = '91000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de consumption_cycles de un espacio ajeno visibles (esperado 0)', v_count;
  end if;

  select count(*) into v_count from public.consumption_entries where space_id = '91000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de consumption_entries de un espacio ajeno visibles (esperado 0)', v_count;
  end if;

  select count(*) into v_count from public.jobs where space_id = '91000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de jobs de un espacio ajeno visibles (esperado 0)', v_count;
  end if;

  select count(*) into v_count from public.acceptances where space_id = '91000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de acceptances de un espacio ajeno visibles (esperado 0)', v_count;
  end if;
end $$;

reset role;

-- ============================================================
-- CA-16 · la auditoría de las nuevas acciones no se puede editar ni borrar.
-- ============================================================
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_updated int;
  v_deleted int;
begin
  with intento_editar as (
    update public.audit_log set reason = 'manipulado' where space_id = '91000000-0000-0000-0000-000000000001' and action = 'request.cancelled'
    returning id
  )
  select count(*) into v_updated from intento_editar;

  with intento_borrar as (
    delete from public.audit_log where space_id = '91000000-0000-0000-0000-000000000001' and action = 'request.cancelled'
    returning id
  )
  select count(*) into v_deleted from intento_borrar;

  if v_updated <> 0 or v_deleted <> 0 then
    raise exception 'CA-16 FALLIDO: editadas=% (esperado 0), borradas=% (esperado 0)', v_updated, v_deleted;
  end if;
  -- Tres cancelaciones a lo largo del archivo: CA-06 (antes de empezar),
  -- CA-06 (después de empezar) y CA-07.
  if (select count(*) from public.audit_log where space_id = '91000000-0000-0000-0000-000000000001' and action = 'request.cancelled') <> 3 then
    raise exception 'CA-16 FALLIDO: no se encuentran los tres registros de auditoría de cancelación esperados (CA-06 x2 y CA-07)';
  end if;
end $$;

reset role;

-- ============================================================
-- Limpieza: no deja nada de esto en la base de datos real.
-- ============================================================
delete from public.audit_log where space_id in ('91000000-0000-0000-0000-000000000001');
delete from public.spaces where id = '91000000-0000-0000-0000-000000000001';
delete from auth.users where email like 'h5-%@example.com';

do $$
declare
  v_spaces int;
  v_profiles int;
  v_users int;
begin
  select count(*) into v_spaces from public.spaces where slug = 'espacio-h5-test';
  select count(*) into v_profiles from public.profiles where email like 'h5-%@example.com';
  select count(*) into v_users from auth.users where email like 'h5-%@example.com';

  if v_spaces <> 0 or v_profiles <> 0 or v_users <> 0 then
    raise exception 'LIMPIEZA FALLIDA: spaces=%, profiles=%, auth.users=% (todo debía ser 0)', v_spaces, v_profiles, v_users;
  end if;
end $$;

select 'hito5_consumos.sql: CA-06, CA-07, CA-08, CA-09, CA-17 cumplidos, base de datos limpia' as resultado;
