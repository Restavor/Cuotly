-- Suite 95 · Restavor agents · Fase E2 · «Transferir también Reservas» (decisión 100; decisión 149, migración 177).
--
-- Cubre:
--   · RN-TRA-13 y decisión 149 · la lista de tablas de Reservas que viajan es completa (una tabla nueva de Reservas
--     sin clasificar pone el test en rojo) y todas existen con `space_id` y `establishment_id`.
--   · Desactivada por defecto: con la propuesta de siempre Reservas se queda en el origen (decisión 111).
--   · Activada: solo con Reservas activa, sin ningún cobro pendiente, y a un espacio que ofrezca Reservas y tenga
--     datos de pago (se comprueba al proponer y otra vez al aceptar).
--   · Al aceptar: todo cambia de espacio sin tocar el libro (el saldo es el mismo al céntimo), la suscripción del
--     origen se cancela (su dinero y su deuda se quedan allí, RN-TRA-04), el destino crea la suya con su primer cobro,
--     el restaurante pasa por «Aprobado: datos para pagar», y el origen deja de leer lo que ya no es suyo.
--
-- Prefijo de esta suite: d9500000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('d9500000-0000-0000-0000-000000000001', 'duena-origen@suite95.test', 'authenticated', 'authenticated'),
  ('d9500000-0000-0000-0000-000000000002', 'admin-origen@suite95.test', 'authenticated', 'authenticated'),
  ('d9500000-0000-0000-0000-000000000003', 'duena-destino@suite95.test', 'authenticated', 'authenticated'),
  ('d9500000-0000-0000-0000-000000000004', 'admin-destino@suite95.test', 'authenticated', 'authenticated'),
  ('d9500000-0000-0000-0000-000000000005', 'propietario@suite95.test', 'authenticated', 'authenticated'),
  ('d9500000-0000-0000-0000-000000000007', 'extrano@suite95.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d9500000-0000-0000-0000-000000000001', 'duena-origen@suite95.test', 'Dueña origen 95'),
  ('d9500000-0000-0000-0000-000000000002', 'admin-origen@suite95.test', 'Admin origen 95'),
  ('d9500000-0000-0000-0000-000000000003', 'duena-destino@suite95.test', 'Dueña destino 95'),
  ('d9500000-0000-0000-0000-000000000004', 'admin-destino@suite95.test', 'Admin destino 95'),
  ('d9500000-0000-0000-0000-000000000005', 'propietario@suite95.test', 'Propietario 95'),
  ('d9500000-0000-0000-0000-000000000007', 'extrano@suite95.test', 'Extraño 95')
on conflict (id) do update set full_name = excluded.full_name;

-- Origen (10) y destino (11): los dos ofrecen Reservas al final; el destino empieza sin ofrecerla y sin datos de pago.
insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled, payment_iban) values
  ('d9500000-0000-0000-0000-000000000010', 'Origen 95', 'origen-95', 'Europe/Madrid', 'd9500000-0000-0000-0000-000000000001', true, 'ES9121000418450200051332'),
  ('d9500000-0000-0000-0000-000000000011', 'Destino 95', 'destino-95', 'Europe/Madrid', 'd9500000-0000-0000-0000-000000000003', false, null);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d9500000-0000-0000-0000-000000000010', 'd9500000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d9500000-0000-0000-0000-000000000010', 'd9500000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('d9500000-0000-0000-0000-000000000011', 'd9500000-0000-0000-0000-000000000003', 'owner', 'active'),
  ('d9500000-0000-0000-0000-000000000011', 'd9500000-0000-0000-0000-000000000004', 'admin', 'active');

insert into public.groups (id, space_id, name) values
  ('d9500000-0000-0000-0000-000000000015', 'd9500000-0000-0000-0000-000000000010', 'Grupo 95');

-- A: viaja con Reservas · C: se transfiere con la propuesta de siempre · N: sin Reservas
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d9500000-0000-0000-0000-000000000020', 'd9500000-0000-0000-0000-000000000010', 'd9500000-0000-0000-0000-000000000015', 'R95A', 'Casa Alba 95', 'active'),
  ('d9500000-0000-0000-0000-000000000021', 'd9500000-0000-0000-0000-000000000010', 'd9500000-0000-0000-0000-000000000015', 'R95C', 'Bar Cano 95', 'active'),
  ('d9500000-0000-0000-0000-000000000022', 'd9500000-0000-0000-0000-000000000010', 'd9500000-0000-0000-0000-000000000015', 'R95N', 'Café Nuevo 95', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('d9500000-0000-0000-0000-000000000040', 'd9500000-0000-0000-0000-000000000020', 'd9500000-0000-0000-0000-000000000005', 'local_owner'),
  ('d9500000-0000-0000-0000-000000000041', 'd9500000-0000-0000-0000-000000000021', 'd9500000-0000-0000-0000-000000000005', 'local_owner');

select public.ensure_reservations_service_internal('d9500000-0000-0000-0000-000000000010', 'd9500000-0000-0000-0000-000000000001');

-- ------------------------------------------------------------
-- Ayudantes
-- ------------------------------------------------------------
create function public.s95_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function public.s95_boss() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'set local role postgres';
end $$;

create function public.s95_expect_error(p_sql text, p_pattern text, p_what text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      return;
    end if;
    raise exception '% FALLIDO: falló, pero con otro mensaje: %', p_what, sqlerrm;
  end;
  raise exception '% FALLIDO: tenía que fallar y no falló', p_what;
end $$;

create function public.s95_eq(p_actual text, p_expected text, p_what text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '% FALLIDO: %  (esperado %)', p_what, coalesce(p_actual, 'nulo'), coalesce(p_expected, 'nulo');
  end if;
end $$;

create function public.s95_balance(p_est uuid) returns text
language sql stable as $$
  select coalesce(sum(amount_micros), 0)::text from public.agent_balance_entries where establishment_id = p_est
$$;

-- Un restaurante con Reservas activa: pide el Propietario con las condiciones aceptadas, aprueba Restavor y paga.
create function public.s95_activate(p_est uuid, p_key text) returns uuid
language plpgsql as $$
declare
  v_ver uuid;
  v_req uuid;
  v_sub uuid;
  v_charge uuid;
  v_total integer;
begin
  perform public.s95_as('d9500000-0000-0000-0000-000000000005');
  select service_version_id into v_ver from public.reservation_service_terms(p_est);
  v_req := public.request_reservations(p_est, v_ver, p_key);
  perform public.s95_as('d9500000-0000-0000-0000-000000000002');
  v_sub := public.approve_reservation_request(v_req);
  select id, total_cents into v_charge, v_total from public.charges where subscription_id = v_sub;
  perform public.register_payment(v_charge, v_total, 'transfer', now(), null, 'primer pago', p_key || '-pay');
  perform public.s95_boss();
  return v_sub;
end $$;

grant execute on function
  public.s95_as(uuid, text), public.s95_boss(), public.s95_expect_error(text, text, text),
  public.s95_eq(text, text, text), public.s95_balance(uuid), public.s95_activate(uuid, text)
to authenticated, service_role;

-- ------------------------------------------------------------
-- Decisión 149 · la lista de tablas de Reservas que viajan está completa
-- ------------------------------------------------------------
do $$
declare
  v_missing text;
  v_broken text;
begin
  perform public.s95_boss();
  -- Toda tabla de Reservas con `space_id` y `establishment_id` está en la lista de las que viajan.
  select string_agg(c.table_name, ', ') into v_missing
  from information_schema.columns c
  where c.table_schema = 'public' and c.column_name = 'establishment_id'
    and (c.table_name like 'reservation%' or c.table_name like 'agent\_%')
    and exists (select 1 from information_schema.columns s where s.table_schema = 'public' and s.table_name = c.table_name and s.column_name = 'space_id')
    and c.table_name not in (select table_name from public.reservations_transfer_tables());
  if v_missing is not null then
    raise exception 'decisión 149 FALLIDO: tablas de Reservas sin clasificar para «Transferir también Reservas»: %', v_missing;
  end if;

  -- Y toda la de la lista existe y tiene las dos columnas.
  select string_agg(t.table_name, ', ') into v_broken
  from public.reservations_transfer_tables() t
  where (select count(*) from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name in ('space_id', 'establishment_id')) <> 2;
  if v_broken is not null then
    raise exception 'decisión 149 FALLIDO: tablas de la lista sin space_id o sin establishment_id: %', v_broken;
  end if;

  -- Y siguen como «se queda» en la lista de siempre (lo que pasa con la opción desactivada).
  if exists (select 1 from public.reservations_transfer_tables() t
             join public.establishment_transfer_tables() e on e.table_name = t.table_name where e.travels) then
    raise exception 'decisión 149 FALLIDO: una tabla de Reservas viaja siempre, sin la opción';
  end if;
end $$;
select 'decisión 149 lista de tablas: OK';

-- ------------------------------------------------------------
-- Desactivada por defecto: Reservas se queda en el origen
-- ------------------------------------------------------------
do $$
declare
  v_c uuid := 'd9500000-0000-0000-0000-000000000021';
  v_t uuid;
begin
  perform public.s95_boss();
  perform public.s95_activate(v_c, 'suite95-c');
  perform public.s95_eq(public.s95_balance(v_c), '0', 'decisión 111: C parte sin saldo');
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type)
  values ('d9500000-0000-0000-0000-000000000010', v_c, 'topup', 5000000, 'suite95');

  -- Sin la opción (la propuesta de siempre, con tres argumentos), Reservas no viaja.
  perform public.s95_as('d9500000-0000-0000-0000-000000000001');
  v_t := public.propose_establishment_transfer(v_c, 'd9500000-0000-0000-0000-000000000011', 'sin Reservas');
  perform public.s95_boss();
  perform public.s95_eq((select with_reservations::text from public.establishment_transfers where id = v_t), 'false',
    'decisión 100: «Transferir también Reservas» está desactivada por defecto');
  perform public.s95_as('d9500000-0000-0000-0000-000000000003');
  perform public.accept_establishment_transfer(v_t);
  perform public.s95_boss();
  perform public.s95_eq((select space_id::text from public.establishments where id = v_c), 'd9500000-0000-0000-0000-000000000011',
    'decisión 100: el restaurante sí cambia de espacio');
  perform public.s95_eq((select space_id::text from public.reservation_settings where establishment_id = v_c), 'd9500000-0000-0000-0000-000000000010',
    'decisión 111: con la opción desactivada, Reservas se queda en el origen');
  perform public.s95_eq((select space_id::text from public.agent_balance_entries where establishment_id = v_c limit 1), 'd9500000-0000-0000-0000-000000000010',
    'decisión 111: y su saldo también');
  perform public.s95_eq((select count(*)::text from public.subscriptions where establishment_id = v_c and kind = 'service' and status = 'active'), '1',
    'decisión 111: y su suscripción sigue activa en el origen');
end $$;
select 'decisión 100 desactivada por defecto: OK';

-- ------------------------------------------------------------
-- Activada: solo si se puede
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'd9500000-0000-0000-0000-000000000020';
  v_n uuid := 'd9500000-0000-0000-0000-000000000022';
  v_old_sub uuid;
  v_charge uuid;
  v_next uuid;
begin
  perform public.s95_boss();
  v_old_sub := public.s95_activate(v_a, 'suite95-a');
  perform public.s95_eq((select service_status from public.reservation_settings where establishment_id = v_a), 'active', 'decisión 149: A tiene Reservas activa');

  -- Sin Reservas, no hay nada que llevar.
  perform public.s95_as('d9500000-0000-0000-0000-000000000001');
  perform public.s95_expect_error(format($q$ select public.propose_establishment_transfer(%L, 'd9500000-0000-0000-0000-000000000011', 'x', true) $q$, v_n),
    'no tiene Reservas', 'decisión 149: sin Reservas no se transfiere «también Reservas»');

  -- El destino todavía no ofrece Reservas.
  perform public.s95_expect_error(format($q$ select public.propose_establishment_transfer(%L, 'd9500000-0000-0000-0000-000000000011', 'x', true) $q$, v_a),
    'no ofrece Reservas', 'decisión 149: el destino tiene que ofrecer Reservas');

  -- Lo ofrece, pero sin datos de pago (decisión 144).
  perform public.s95_boss();
  update public.spaces set reservations_enabled = true where id = 'd9500000-0000-0000-0000-000000000011';
  perform public.ensure_reservations_service_internal('d9500000-0000-0000-0000-000000000011', 'd9500000-0000-0000-0000-000000000003');
  perform public.s95_as('d9500000-0000-0000-0000-000000000001');
  perform public.s95_expect_error(format($q$ select public.propose_establishment_transfer(%L, 'd9500000-0000-0000-0000-000000000011', 'x', true) $q$, v_a),
    'datos de pago', 'decisión 149 y 144: el destino necesita datos de pago de Reservas');
  perform public.s95_boss();
  update public.spaces set payment_bizum_phone = '600123456' where id = 'd9500000-0000-0000-0000-000000000011';

  -- Un cobro pendiente (aunque no haya vencido) lo impide.
  select c.id into v_charge from public.charges c where c.subscription_id = v_old_sub limit 1;
  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at)
  values
    ('d9500000-0000-0000-0000-000000000010', v_a, v_old_sub, 'Mensualidad Reservas (suite 95)', now() + interval '1 month', now() + interval '2 months',
     4800, 21, 1008, 5808, now() + interval '10 days')
  returning id into v_next;
  insert into public.financial_entries (space_id, establishment_id, charge_id, entry_type, amount_cents, reason)
  values ('d9500000-0000-0000-0000-000000000010', v_a, v_next, 'charge', 5808, 'suite 95');
  perform public.s95_as('d9500000-0000-0000-0000-000000000001');
  perform public.s95_expect_error(format($q$ select public.propose_establishment_transfer(%L, 'd9500000-0000-0000-0000-000000000011', 'x', true) $q$, v_a),
    'cobro pendiente', 'decisión 149: con un cobro de Reservas pendiente no se transfiere con Reservas');
  perform public.s95_as('d9500000-0000-0000-0000-000000000002');
  perform public.register_payment(v_next, 5808, 'transfer', now(), null, 'segundo mes', 'suite95-a-pay2');

  -- Con Reservas en pausa tampoco.
  perform public.s95_boss();
  update public.reservation_settings set service_status = 'paused' where establishment_id = v_a;
  perform public.s95_as('d9500000-0000-0000-0000-000000000001');
  perform public.s95_expect_error(format($q$ select public.propose_establishment_transfer(%L, 'd9500000-0000-0000-0000-000000000011', 'x', true) $q$, v_a),
    'activo', 'decisión 149: con Reservas en pausa no se transfiere con Reservas');
  perform public.s95_boss();
  update public.reservation_settings set service_status = 'active' where establishment_id = v_a;

  -- Y solo el propietario del origen propone.
  perform public.s95_as('d9500000-0000-0000-0000-000000000002');
  perform public.s95_expect_error(format($q$ select public.propose_establishment_transfer(%L, 'd9500000-0000-0000-0000-000000000011', 'x', true) $q$, v_a),
    'propietario', 'RN-TRA-02: un administrador del origen no propone');
  perform public.s95_boss();
end $$;
select 'decisión 149 solo si se puede: OK';

-- ------------------------------------------------------------
-- Activada: el traspaso
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'd9500000-0000-0000-0000-000000000020';
  v_origin uuid := 'd9500000-0000-0000-0000-000000000010';
  v_dest uuid := 'd9500000-0000-0000-0000-000000000011';
  v_old_sub uuid;
  v_new_sub uuid;
  v_t uuid;
  v_balance text;
  v_old_charges integer;
  v_old_payments integer;
  v_left text;
  v_in_dest integer;
  v_charge uuid;
  v_total integer;
begin
  perform public.s95_boss();
  select subscription_id into v_old_sub from public.reservation_settings where establishment_id = v_a;

  -- Datos de Reservas en las tablas que tocan dinero, diners y equipo.
  insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
  values ('d9500000-0000-0000-0000-0000000000d1', v_origin, v_a, 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 30);
  insert into public.reservations
    (id, space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, email, source, status)
  values ('d9500000-0000-0000-0000-0000000000e1', v_origin, v_a, 'd9500000-0000-0000-0000-0000000000d1',
          (now() at time zone 'Europe/Madrid')::date, '21:00', now(), 2, 'Marta Gil', '+34600333444', 'marta@example.com', 'manual', 'confirmed');
  insert into public.reservation_staff (space_id, establishment_id, kind, name, pin_hmac)
  values (v_origin, v_a, 'staff', 'Ana Ruiz', 'hmac-suite-95');
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type) values
    (v_origin, v_a, 'topup', 10000000, 'suite95'),
    (v_origin, v_a, 'call', -2000000, 'call'),
    (v_origin, v_a, 'whatsapp', -16000, 'notification');
  insert into public.agent_topups (space_id, establishment_id, net_cents, vat_cents, total_cents, vat_rate_percent, status)
  values (v_origin, v_a, 1000, 210, 1210, 21, 'paid');
  insert into public.reservation_incidents (space_id, establishment_id, kind, severity, title)
  values (v_origin, v_a, 'payment', 'info', 'Un aviso de prueba');

  v_balance := public.s95_balance(v_a);
  perform public.s95_eq(v_balance, '7984000', 'decisión 149: el saldo de A antes de viajar (7,984 €)');
  select count(*) into v_old_charges from public.charges where subscription_id = v_old_sub;
  select count(*) into v_old_payments from public.payments p join public.charges c on c.id = p.charge_id where c.subscription_id = v_old_sub;

  perform public.s95_as('d9500000-0000-0000-0000-000000000001');
  v_t := public.propose_establishment_transfer(v_a, v_dest, 'Cambia de proveedor', true);
  perform public.s95_boss();
  perform public.s95_eq((select with_reservations::text from public.establishment_transfers where id = v_t), 'true',
    'decisión 149: la propuesta lleva la opción');

  -- Mientras está propuesta no se mueve nada (RN-TRA-03).
  perform public.s95_eq((select space_id::text from public.reservation_settings where establishment_id = v_a), v_origin::text,
    'RN-TRA-03: propuesta, Reservas sigue en el origen');

  -- Solo el destino acepta.
  perform public.s95_as('d9500000-0000-0000-0000-000000000004');
  perform public.s95_expect_error(format($q$ select public.accept_establishment_transfer(%L) $q$, v_t),
    'propietario del espacio de destino', 'RN-TRA-02: un administrador del destino no acepta');
  perform public.s95_as('d9500000-0000-0000-0000-000000000003');
  perform public.accept_establishment_transfer(v_t);
  -- Aceptarla otra vez no mueve nada (CA-17).
  perform public.accept_establishment_transfer(v_t);
  perform public.s95_boss();

  -- 1 · Todo lo de Reservas cambió de espacio: nada queda en el origen, y hay filas en el destino.
  select string_agg(t.table_name, ', ') into v_left
  from public.reservations_transfer_tables() t
  where (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where establishment_id = %L and space_id = %L',
                                                    t.table_name, v_a, v_origin), false, true, '')))[1]::text <> '0';
  perform public.s95_eq(v_left, null, 'decisión 149: ninguna tabla de Reservas deja filas de A en el origen');
  select count(*) into v_in_dest from public.reservations where establishment_id = v_a and space_id = v_dest;
  perform public.s95_eq(v_in_dest::text, '1', 'decisión 149: la reserva viaja');
  perform public.s95_eq((select count(*)::text from public.reservation_staff where establishment_id = v_a and space_id = v_dest), '1', 'decisión 149: el equipo viaja');
  perform public.s95_eq((select count(*)::text from public.reservation_shifts where establishment_id = v_a and space_id = v_dest), '1', 'decisión 149: los turnos viajan');
  perform public.s95_eq((select count(*)::text from public.agent_topups where establishment_id = v_a and space_id = v_dest), '1', 'decisión 149: las recargas viajan');
  perform public.s95_eq((select count(*)::text from public.reservation_incidents where establishment_id = v_a and space_id = v_dest), '1', 'decisión 149: los incidentes viajan');

  -- 2 · El saldo es el mismo, al céntimo y al apunte (RN-AGT-01): solo cambió de espacio.
  perform public.s95_eq(public.s95_balance(v_a), v_balance, 'RN-AGT-01: el saldo no se ha movido ni una millonésima');
  perform public.s95_eq((select count(*)::text from public.agent_balance_entries where establishment_id = v_a), '3', 'RN-AGT-01: los apuntes siguen siendo tres');
  perform public.s95_eq((select count(*)::text from public.agent_balance_entries where establishment_id = v_a and space_id = v_dest), '3',
    'decisión 149: y los tres están en el espacio de destino');
  perform public.s95_expect_error(format($q$ update public.agent_balance_entries set space_id = %L where establishment_id = %L $q$, v_origin, v_a),
    'no se edita', 'RN-AGT-01: sin la marca de una transferencia, el libro sigue sin editarse');
  perform public.s95_eq(current_setting('restavor.ledger_move', true), 'off', 'RN-AGT-01: la marca de la transferencia se retira al terminar');

  -- 3 · Lo del origen se queda en el origen (RN-TRA-04): la suscripción, cancelada; sus cobros y pagos, donde estaban.
  perform public.s95_eq((select status from public.subscriptions where id = v_old_sub), 'cancelled', 'decisión 149: la suscripción del origen se cancela');
  perform public.s95_eq((select space_id::text from public.subscriptions where id = v_old_sub), v_origin::text, 'RN-TRA-04: y se queda en el origen');
  perform public.s95_eq((select count(*)::text from public.charges where subscription_id = v_old_sub and space_id = v_origin), v_old_charges::text,
    'RN-TRA-04: sus cobros se quedan en el origen');
  perform public.s95_eq((select count(*)::text from public.payments p join public.charges c on c.id = p.charge_id where c.subscription_id = v_old_sub), v_old_payments::text,
    'RN-TRA-04: y sus pagos');

  -- 4 · La suscripción nueva, en el destino, con su primer cobro, y el restaurante pasa por «datos para pagar».
  select subscription_id into v_new_sub from public.reservation_settings where establishment_id = v_a;
  perform public.s95_eq((v_new_sub <> v_old_sub)::text, 'true', 'decisión 149: los ajustes apuntan a una suscripción nueva');
  perform public.s95_eq((select space_id::text from public.subscriptions where id = v_new_sub), v_dest::text, 'decisión 149: la nueva es del destino');
  perform public.s95_eq((select status from public.subscriptions where id = v_new_sub), 'active', 'decisión 149: y está activa');
  perform public.s95_eq((select (s.id = (select service_id from public.subscriptions where id = v_new_sub))::text
                         from public.services s where s.space_id = v_dest and s.kind = 'reservations' and s.superseded_at is null), 'true',
    'decisión 149: con el servicio Reservas del catálogo del destino');
  perform public.s95_eq((select count(*)::text from public.charges where subscription_id = v_new_sub and space_id = v_dest), '1', 'decisión 149: con un primer cobro en el destino');
  perform public.s95_eq((select count(*)::text from public.plan_commitments where subscription_id = v_new_sub), '0', 'D-H: sin permanencia');
  perform public.s95_eq((select service_status from public.reservation_settings where establishment_id = v_a), 'approved_pending_payment',
    'decisión 149: el restaurante pasa por «Aprobado: datos para pagar»');
  perform public.s95_eq((select count(*)::text from public.terms_acceptances where subscription_id = v_new_sub), '0',
    'decisión 149: las condiciones del destino las acepta el restaurante: no se copian las del origen');
  perform public.s95_eq((select count(*)::text from public.notifications where establishment_id = v_a and event_type = 'reservation_service_approved'
                         and dedupe_key = 'reservation_service_approved:' || v_new_sub::text), '1',
    'decisión 149: el Propietario recibe el aviso «Aprobado: datos para pagar»');

  -- 5 · Rastro en los dos libros (RN-TRA-09).
  perform public.s95_eq((select count(*)::text from public.audit_log where action = 'reservations.transferred' and entity_id = v_a and space_id = v_origin), '1',
    'RN-TRA-09: el origen deja constancia');
  perform public.s95_eq((select count(*)::text from public.audit_log where action = 'reservations.transferred' and entity_id = v_a and space_id = v_dest), '1',
    'RN-TRA-09: el destino también');
  perform public.s95_eq((select count(*)::text from public.reservation_service_events where establishment_id = v_a and type = 'approved' and data ->> 'cause' = 'transfer'), '1',
    'decisión 149: el historial del servicio dice que vino por una transferencia');

  -- 6 · Quién lee qué: el origen ya no ve el saldo ni los datos; el destino ve el saldo y no a los comensales; el restaurante, lo suyo.
  perform public.s95_as('d9500000-0000-0000-0000-000000000002');
  perform public.s95_eq((select count(*)::text from public.agent_balance_entries where establishment_id = v_a), '0',
    'decisión 149: el equipo del origen ya no lee el saldo de un restaurante que no es suyo');
  perform public.s95_eq((select count(*)::text from public.reservation_settings where establishment_id = v_a), '0',
    'decisión 149: ni sus ajustes de Reservas');
  perform public.s95_as('d9500000-0000-0000-0000-000000000004');
  perform public.s95_eq((select count(*)::text from public.agent_balance_entries where establishment_id = v_a), '3', 'decisión 149: el equipo del destino lee el saldo');
  perform public.s95_eq((select count(*)::text from public.reservations where establishment_id = v_a), '0',
    'RN-RES-12: pero sin sesión de soporte no ve a los comensales');
  perform public.s95_as('d9500000-0000-0000-0000-000000000005');
  perform public.s95_eq((select count(*)::text from public.reservations where establishment_id = v_a), '1', 'RN-RES-12: el Propietario sigue viendo sus reservas');
  perform public.s95_eq(public.agent_balance_cents(v_a)::text, '798', 'RN-AGT-01: y su saldo (7,98 €), el mismo de antes');
  perform public.s95_as('d9500000-0000-0000-0000-000000000007');
  perform public.s95_eq((select count(*)::text from public.agent_balance_entries where establishment_id = v_a), '0', 'un extraño no lee nada de A');

  -- 7 · Y el restaurante sigue el camino de una contratación: acepta las condiciones del destino y paga allí.
  perform public.s95_as('d9500000-0000-0000-0000-000000000005');
  perform public.accept_reservation_terms(v_a);
  perform public.s95_boss();
  perform public.s95_eq((select count(*)::text from public.terms_acceptances where subscription_id = v_new_sub), '1', 'decisión 149: acepta las condiciones del destino');
  perform public.s95_eq((select service_status from public.reservation_settings where establishment_id = v_a), 'approved_pending_payment',
    'decisión 149: aceptar no activa: falta pagar');
  select id, total_cents into v_charge, v_total from public.charges where subscription_id = v_new_sub;
  perform public.s95_as('d9500000-0000-0000-0000-000000000004');
  perform public.register_payment(v_charge, v_total, 'transfer', now(), null, 'primer pago en el destino', 'suite95-dest-pay');
  perform public.s95_boss();
  perform public.s95_eq((select service_status from public.reservation_settings where establishment_id = v_a), 'active',
    'decisión 149: con las condiciones aceptadas y el primer mes pagado en el destino, Reservas vuelve a estar activa');
  perform public.s95_eq((select count(*)::text from public.charges where subscription_id = v_new_sub and space_id = v_dest), '1', 'RN-TRA-04: ese cobro es del destino');
end $$;
select 'decisión 149 el traspaso: OK';

-- ------------------------------------------------------------
-- Privilegios
-- ------------------------------------------------------------
do $$
declare
  f text;
begin
  perform public.s95_boss();
  foreach f in array array[
    'public.reservations_transfer_blocker(uuid, uuid)',
    'public.reservations_transfer_internal(uuid, uuid, uuid, uuid, uuid)']
  loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'función interna abierta por RPC: %', f;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.propose_establishment_transfer(uuid, uuid, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.propose_establishment_transfer(uuid, uuid, text, boolean)', 'execute') then
    raise exception 'propose_establishment_transfer tiene los privilegios mal';
  end if;
  -- La firma antigua ya no existe: una llamada con tres argumentos va a la nueva, con la opción desactivada.
  if exists (select 1 from pg_proc where proname = 'propose_establishment_transfer' and pronargs = 3) then
    raise exception 'sigue existiendo la firma antigua de propose_establishment_transfer';
  end if;
end $$;
select 'privilegios de la transferencia: OK';

rollback;
