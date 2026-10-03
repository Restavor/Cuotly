-- Suite 94 · Restavor agents · Fase E2 · el saldo, las recargas y la puerta de los datos de pago.
--
-- Cubre (PRD de agents §5.2 y §10.5, migración 176):
--   · RN-AGT-01 · el libro del saldo no se edita ni se borra (ni con la clave de servicio) y el cambio de
--     `space_id` de una transferencia solo vale declarado y sin tocar nada más.
--   · RN-AGT-05 y RN-AGT-06 · el aviso de saldo bajo y el de saldo a 0 salen UNA vez por cruce, y se
--     vuelven a armar al recuperarse.
--   · RN-AGT-04 · recarga a mano de Restavor, recarga con tarjeta (solo el Propietario; IVA del espacio;
--     el apunte es por el importe SIN IVA; el mismo webhook dos veces es un solo apunte; lo pagado que no
--     coincide no se apunta y deja un incidente; la recarga caducada que después se paga, se apunta).
--   · RN-AGT-02 y RN-AGT-08 · ajuste (con motivo y `aal2`) y devolución del saldo al darse de baja.
--   · RN-AGT-09 · «unos N minutos de llamadas» y el gasto del mes por tipo, en la zona del restaurante.
--   · Tarifas de mensajería: solo Bosco con `aal2`, historial que no se reescribe.
--   · Decisión 144 · aprobar y reactivar Reservas exigen datos de pago cargados.
--
-- Prefijo de esta suite: de000000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name)
values ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'Bosco')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('de000000-0000-0000-0000-000000000001', 'duena@suite94.test', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000002', 'admin@suite94.test', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000003', 'propietario-a@suite94.test', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000004', 'encargado-a@suite94.test', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000005', 'extrano@suite94.test', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000006', 'propietario-b@suite94.test', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000007', 'trabajador@suite94.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('de000000-0000-0000-0000-000000000001', 'duena@suite94.test', 'Dueña 94'),
  ('de000000-0000-0000-0000-000000000002', 'admin@suite94.test', 'Admin 94'),
  ('de000000-0000-0000-0000-000000000003', 'propietario-a@suite94.test', 'Propietario A 94'),
  ('de000000-0000-0000-0000-000000000004', 'encargado-a@suite94.test', 'Encargado A 94'),
  ('de000000-0000-0000-0000-000000000005', 'extrano@suite94.test', 'Extraño 94'),
  ('de000000-0000-0000-0000-000000000006', 'propietario-b@suite94.test', 'Propietario B 94'),
  ('de000000-0000-0000-0000-000000000007', 'trabajador@suite94.test', 'Trabajador 94')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled) values
  ('de000000-0000-0000-0000-000000000010', 'Espacio 94', 'espacio-94', 'Europe/Madrid',
   'de000000-0000-0000-0000-000000000001', true),
  ('de000000-0000-0000-0000-000000000011', 'Otro espacio 94', 'otro-espacio-94', 'Europe/Madrid',
   'de000000-0000-0000-0000-000000000001', false);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000007', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('de000000-0000-0000-0000-000000000015', 'de000000-0000-0000-0000-000000000010', 'Grupo 94');

-- A: activa, con Propietario y Encargado · B: activa, otro Propietario · C: cerrada · D: de baja pedida
-- E: sin Reservas todavía (puerta de los datos de pago) · F: cifras del gasto y minutos
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('de000000-0000-0000-0000-000000000020', 'de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000015', 'R94A', 'Casa Ana 94', 'active'),
  ('de000000-0000-0000-0000-000000000021', 'de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000015', 'R94B', 'Bar Blas 94', 'active'),
  ('de000000-0000-0000-0000-000000000022', 'de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000015', 'R94C', 'Café Cuca 94', 'active'),
  ('de000000-0000-0000-0000-000000000023', 'de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000015', 'R94D', 'Mesón Dani 94', 'active'),
  ('de000000-0000-0000-0000-000000000024', 'de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000015', 'R94E', 'Taberna Eva 94', 'active'),
  ('de000000-0000-0000-0000-000000000025', 'de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000015', 'R94F', 'Freiduría Fran 94', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('de000000-0000-0000-0000-000000000040', 'de000000-0000-0000-0000-000000000020', 'de000000-0000-0000-0000-000000000003', 'local_owner'),
  ('de000000-0000-0000-0000-000000000041', 'de000000-0000-0000-0000-000000000020', 'de000000-0000-0000-0000-000000000004', 'editor'),
  ('de000000-0000-0000-0000-000000000042', 'de000000-0000-0000-0000-000000000021', 'de000000-0000-0000-0000-000000000006', 'local_owner'),
  ('de000000-0000-0000-0000-000000000043', 'de000000-0000-0000-0000-000000000022', 'de000000-0000-0000-0000-000000000006', 'local_owner'),
  ('de000000-0000-0000-0000-000000000044', 'de000000-0000-0000-0000-000000000023', 'de000000-0000-0000-0000-000000000003', 'local_owner'),
  ('de000000-0000-0000-0000-000000000045', 'de000000-0000-0000-0000-000000000024', 'de000000-0000-0000-0000-000000000003', 'local_owner'),
  ('de000000-0000-0000-0000-000000000046', 'de000000-0000-0000-0000-000000000025', 'de000000-0000-0000-0000-000000000003', 'local_owner');

insert into public.establishment_permissions (establishment_membership_id, manage_reservations, view_billing) values
  ('de000000-0000-0000-0000-000000000041', true, false);

insert into public.reservation_settings (space_id, establishment_id, service_status, public_slug, closed_at, ending_at) values
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000020', 'active', 'suite94-a', null, null),
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000021', 'active', 'suite94-b', null, null),
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000022', 'closed', 'suite94-c', now() - interval '1 day', null),
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000023', 'ending', 'suite94-d', null, now() + interval '10 days'),
  ('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000025', 'active', 'suite94-f', null, null);

-- ------------------------------------------------------------
-- Ayudantes del test
-- ------------------------------------------------------------
create function public.s94_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function public.s94_server() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
end $$;

create function public.s94_boss() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'set local role postgres';
end $$;

create function public.s94_expect_error(p_sql text, p_pattern text, p_what text) returns void
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

create function public.s94_eq(p_actual text, p_expected text, p_what text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '% FALLIDO: %  (esperado %)', p_what, coalesce(p_actual, 'nulo'), coalesce(p_expected, 'nulo');
  end if;
end $$;

-- El saldo de un restaurante en millonésimas, leído como el sistema (sin permisos de por medio).
create function public.s94_balance(p_est uuid) returns text
language sql stable as $$
  select coalesce(sum(amount_micros), 0)::text from public.agent_balance_entries where establishment_id = p_est
$$;

create function public.s94_notes(p_est uuid, p_type text) returns text
language sql stable as $$
  select count(*)::text from public.notifications where establishment_id = p_est and event_type = p_type
$$;

create function public.s94_ledger(p_est uuid, p_kind text, p_micros bigint) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, note)
  values ('de000000-0000-0000-0000-000000000010', p_est, p_kind, p_micros, 'suite94',
          case when p_kind = 'adjustment' then 'suite 94' else null end)
  returning id into v_id;
  return v_id;
end $$;

grant execute on function
  public.s94_as(uuid, text), public.s94_server(), public.s94_boss(),
  public.s94_expect_error(text, text, text), public.s94_eq(text, text, text),
  public.s94_balance(uuid), public.s94_notes(uuid, text), public.s94_ledger(uuid, text, bigint)
to authenticated, service_role;

-- ------------------------------------------------------------
-- RN-AGT-01 · el libro no se edita ni se borra
-- ------------------------------------------------------------
do $$
declare
  v_b uuid := 'de000000-0000-0000-0000-000000000021';
  v_id uuid;
begin
  perform public.s94_boss();
  v_id := public.s94_ledger(v_b, 'topup', 10000000);

  perform public.s94_expect_error(format($q$ update public.agent_balance_entries set amount_micros = 1 where id = %L $q$, v_id),
    'no se edita', 'RN-AGT-01: un apunte del libro no se edita (ni con la clave más alta)');
  perform public.s94_expect_error(format($q$ delete from public.agent_balance_entries where id = %L $q$, v_id),
    'no se borra', 'RN-AGT-01: un apunte del libro no se borra');

  -- Con la clave de servicio ni siquiera hay privilegio de tabla: se queda sin permiso.
  perform public.s94_server();
  perform public.s94_expect_error(format($q$ update public.agent_balance_entries set amount_micros = 1 where id = %L $q$, v_id),
    'permission denied|no se edita', 'RN-AGT-01: la clave de servicio tampoco edita el libro');
  perform public.s94_boss();

  -- El cambio de `space_id` de una transferencia: solo declarado y sin tocar nada más.
  perform public.s94_expect_error(format(
    $q$ update public.agent_balance_entries set space_id = 'de000000-0000-0000-0000-000000000011' where id = %L $q$, v_id),
    'no se edita', 'RN-AGT-01: mover un apunte de espacio sin declararlo no vale');
  perform set_config('restavor.ledger_move', 'on', true);
  perform public.s94_expect_error(format(
    $q$ update public.agent_balance_entries set space_id = 'de000000-0000-0000-0000-000000000011', amount_micros = 5 where id = %L $q$, v_id),
    'no se edita', 'RN-AGT-01: declarado el movimiento, cambiar además el importe sigue sin valer');
  update public.agent_balance_entries set space_id = 'de000000-0000-0000-0000-000000000011' where id = v_id;
  perform public.s94_eq((select space_id::text from public.agent_balance_entries where id = v_id),
    'de000000-0000-0000-0000-000000000011', 'RN-AGT-01: declarado y solo `space_id`, el movimiento vale');
  update public.agent_balance_entries set space_id = 'de000000-0000-0000-0000-000000000010' where id = v_id;
  perform set_config('restavor.ledger_move', 'off', true);
  perform public.s94_eq((select amount_micros::text from public.agent_balance_entries where id = v_id), '10000000',
    'RN-AGT-01: el importe sigue como se apuntó');
end $$;
select 'RN-AGT-01 libro inmutable: OK';

-- El borrado en cascada de un espacio entero (algo que la aplicación nunca hace) no se bloquea.
do $$
begin
  perform public.s94_boss();
  insert into public.spaces (id, name, slug, created_by) values
    ('de000000-0000-0000-0000-000000000012', 'Espacio efímero 94', 'efimero-94', 'de000000-0000-0000-0000-000000000001');
  insert into public.groups (id, space_id, name) values
    ('de000000-0000-0000-0000-000000000016', 'de000000-0000-0000-0000-000000000012', 'Grupo efímero');
  insert into public.establishments (id, space_id, group_id, code, name) values
    ('de000000-0000-0000-0000-000000000026', 'de000000-0000-0000-0000-000000000012', 'de000000-0000-0000-0000-000000000016', 'R94X', 'Efímero');
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros)
  values ('de000000-0000-0000-0000-000000000012', 'de000000-0000-0000-0000-000000000026', 'topup', 1000000);
  delete from public.spaces where id = 'de000000-0000-0000-0000-000000000012';
  perform public.s94_eq((select count(*)::text from public.agent_balance_entries
                         where establishment_id = 'de000000-0000-0000-0000-000000000026'), '0',
    'RN-AGT-01: el borrado en cascada de un espacio entero sí pasa');
end $$;
select 'RN-AGT-01 cascada: OK';

-- ------------------------------------------------------------
-- RN-AGT-05 y RN-AGT-06 · un aviso por cruce
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'de000000-0000-0000-0000-000000000020';
  v_b uuid := 'de000000-0000-0000-0000-000000000021';
  v_c uuid := 'de000000-0000-0000-0000-000000000022';
  v_d uuid := 'de000000-0000-0000-0000-000000000023';
begin
  perform public.s94_boss();
  -- Umbral de 5 € (el de siempre). A parte de 0.
  perform public.s94_ledger(v_a, 'topup', 10000000);
  perform public.s94_eq(public.s94_notes(v_a, 'agent_balance_low'), '0', 'RN-AGT-05: con 10 € no hay aviso');

  perform public.s94_ledger(v_a, 'call', -6000000);
  perform public.s94_eq(public.s94_notes(v_a, 'agent_balance_low'), '2',
    'RN-AGT-05: al bajar de 5 €, un aviso al Propietario y otro al Encargado');
  perform public.s94_eq((select amount_cents::text from public.notifications
                         where establishment_id = v_a and event_type = 'agent_balance_low' limit 1), '400',
    'RN-AGT-05: el aviso lleva el saldo al céntimo (4,00 €)');
  perform public.s94_eq((select (low_balance_notified_at is not null)::text from public.reservation_settings where establishment_id = v_a),
    'true', 'RN-AGT-05: queda anotado que ya se avisó');

  perform public.s94_ledger(v_a, 'call', -500000);
  perform public.s94_eq(public.s94_notes(v_a, 'agent_balance_low'), '2', 'RN-AGT-05: seguir bajando no repite el aviso (una vez por cruce)');

  perform public.s94_ledger(v_a, 'topup', 10000000);
  perform public.s94_eq((select (low_balance_notified_at is null)::text from public.reservation_settings where establishment_id = v_a),
    'true', 'RN-AGT-05: recargar por encima del umbral vuelve a armar el aviso');

  perform public.s94_ledger(v_a, 'call', -12000000);
  perform public.s94_eq(public.s94_notes(v_a, 'agent_balance_low'), '4', 'RN-AGT-05: un segundo cruce avisa otra vez');

  -- A cero o menos: el aviso fuerte, una vez.
  perform public.s94_ledger(v_a, 'call', -2000000);
  perform public.s94_eq(public.s94_notes(v_a, 'agent_balance_empty'), '2', 'RN-AGT-06: al llegar a 0, aviso de saldo agotado');
  perform public.s94_eq(public.s94_notes(v_a, 'agent_balance_low'), '4', 'RN-AGT-06: y el de saldo bajo no se repite');
  perform public.s94_ledger(v_a, 'call', -1000000);
  perform public.s94_eq(public.s94_notes(v_a, 'agent_balance_empty'), '2', 'RN-AGT-06: con el saldo en negativo no se repite');

  perform public.s94_ledger(v_a, 'topup', 5000000);
  perform public.s94_eq((select (balance_empty_notified_at is null)::text from public.reservation_settings where establishment_id = v_a),
    'true', 'RN-AGT-06: volver a tener saldo vuelve a armar el aviso de agotado');
  perform public.s94_eq(public.s94_balance(v_a), '3500000', 'RN-AGT-01: el saldo es la suma del libro (3,50 €)');
  perform public.s94_ledger(v_a, 'call', -4000000);
  perform public.s94_eq(public.s94_notes(v_a, 'agent_balance_empty'), '4', 'RN-AGT-06: agotarse otra vez avisa otra vez');

  -- Un solo cruce de golpe a cero cuenta como agotado, sin el aviso de saldo bajo además.
  -- B ya tenía 10 € de la prueba del libro: con 10 € más son 20 €, y de 20 € a 0 de golpe.
  perform public.s94_ledger(v_b, 'topup', 10000000);
  perform public.s94_ledger(v_b, 'call', -20000000);
  perform public.s94_eq(public.s94_notes(v_b, 'agent_balance_empty'), '1', 'RN-AGT-06: de 20 € a 0 de golpe, aviso de agotado');
  perform public.s94_eq(public.s94_notes(v_b, 'agent_balance_low'), '0', 'RN-AGT-06: …y no uno de saldo bajo además');

  -- Umbral a 0: no hay aviso de saldo bajo (RN-AGT-05 «configurable por Restavor»).
  update public.reservation_settings set low_balance_threshold_cents = 0, low_balance_notified_at = null,
         balance_empty_notified_at = null where establishment_id = v_b;
  perform public.s94_ledger(v_b, 'topup', 10000000);
  perform public.s94_ledger(v_b, 'call', -9500000);
  perform public.s94_eq(public.s94_notes(v_b, 'agent_balance_low'), '0', 'RN-AGT-05: con el umbral en 0 no hay aviso de saldo bajo');

  -- Una Reservas cerrada no avisa; una de baja pedida, sí.
  perform public.s94_ledger(v_c, 'topup', 10000000);
  perform public.s94_ledger(v_c, 'call', -9000000);
  perform public.s94_eq(public.s94_notes(v_c, 'agent_balance_low'), '0', 'RN-AGT-05: con Reservas cerrada no se avisa');
end $$;
select 'RN-AGT-05/06 avisos de saldo: OK';

-- ------------------------------------------------------------
-- RN-AGT-04 · recarga a mano (Restavor)
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'de000000-0000-0000-0000-000000000020';
  v_before text;
  v_id uuid;
  v_id2 uuid;
begin
  perform public.s94_boss();
  v_before := public.s94_balance(v_a);

  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  perform public.s94_expect_error(format($q$ select public.record_manual_topup(%L, 2000, 'transfer', null, 'k-man-1') $q$, v_a),
    'Solo Restavor', 'RN-AGT-04: el Propietario no registra una recarga a mano');
  perform public.s94_as('de000000-0000-0000-0000-000000000004');
  perform public.s94_expect_error(format($q$ select public.record_manual_topup(%L, 2000, 'transfer', null, 'k-man-1') $q$, v_a),
    'Solo Restavor', 'RN-AGT-04: el Encargado tampoco');
  perform public.s94_as('de000000-0000-0000-0000-000000000007');
  perform public.s94_expect_error(format($q$ select public.record_manual_topup(%L, 2000, 'transfer', null, 'k-man-1') $q$, v_a),
    'Solo Restavor', 'RN-AGT-04: un trabajador no');
  perform public.s94_as('de000000-0000-0000-0000-000000000005');
  perform public.s94_expect_error(format($q$ select public.record_manual_topup(%L, 2000, 'transfer', null, 'k-man-1') $q$, v_a),
    'Solo Restavor', 'RN-AGT-04: un extraño no');

  perform public.s94_as('de000000-0000-0000-0000-000000000002');
  perform public.s94_expect_error(format($q$ select public.record_manual_topup(%L, 0, 'transfer', null, 'k-man-1') $q$, v_a),
    'mayor que cero', 'RN-AGT-04: sin importe no hay recarga');
  perform public.s94_expect_error(format($q$ select public.record_manual_topup(%L, 2000, 'cheque', null, 'k-man-1') $q$, v_a),
    'método', 'RN-AGT-04: el método tiene que ser uno conocido');
  perform public.s94_expect_error(format($q$ select public.record_manual_topup(%L, 2000, 'bizum', null, '') $q$, v_a),
    'idempotencia', 'RN-AGT-04: sin clave no hay recarga (pulsar dos veces no duplica)');
  v_id := public.record_manual_topup(v_a, 2000, 'bizum', 'Bizum del 4 de octubre', 'k-man-1');
  v_id2 := public.record_manual_topup(v_a, 2000, 'bizum', 'Bizum del 4 de octubre', 'k-man-1');
  perform public.s94_eq(v_id2::text, v_id::text, 'RN-AGT-04: la misma clave devuelve el mismo apunte');

  perform public.s94_boss();
  perform public.s94_eq(((public.s94_balance(v_a)::bigint) - v_before::bigint)::text, '20000000',
    'RN-AGT-04: la recarga a mano de 20 € sube el saldo 20 € (en millonésimas), una sola vez');
  perform public.s94_eq((select count(*)::text from public.agent_balance_entries where idempotency_key = 'k-man-1'), '1',
    'RN-AGT-04: un solo apunte con esa clave');
  perform public.s94_eq((select kind from public.agent_balance_entries where id = v_id), 'topup', 'RN-AGT-04: es un apunte `topup`');
  perform public.s94_eq((select count(*)::text from public.audit_log where action = 'reservations.balance_topup_manual' and entity_id = v_a), '1',
    'RN-AGT-04: la recarga a mano deja su huella');
  perform public.s94_eq(public.s94_notes(v_a, 'agent_topup_receipt'), '2', 'RN-AGT-04: avisa de la recarga al Propietario y al Encargado');
end $$;
select 'RN-AGT-04 recarga a mano: OK';

-- ------------------------------------------------------------
-- RN-AGT-02 · ajuste (motivo y aal2) y RN-AGT-08 · devolución del saldo
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'de000000-0000-0000-0000-000000000020';
  v_d uuid := 'de000000-0000-0000-0000-000000000023';
  v_before text;
  v_id uuid;
  v_id2 uuid;
begin
  perform public.s94_boss();
  v_before := public.s94_balance(v_a);

  perform public.s94_as('de000000-0000-0000-0000-000000000002', 'aal1');
  perform public.s94_expect_error(format($q$ select public.adjust_agent_balance(%L, -150, 'error de apunte', 'k-adj-1') $q$, v_a),
    'dos pasos', 'RN-AGT-02: ajustar sin el segundo paso no vale');
  perform public.s94_as('de000000-0000-0000-0000-000000000003', 'aal2');
  perform public.s94_expect_error(format($q$ select public.adjust_agent_balance(%L, -150, 'error de apunte', 'k-adj-1') $q$, v_a),
    'Solo Restavor', 'RN-AGT-02: el Propietario no ajusta su saldo');
  perform public.s94_as('de000000-0000-0000-0000-000000000002', 'aal2');
  perform public.s94_expect_error(format($q$ select public.adjust_agent_balance(%L, -150, '   ', 'k-adj-1') $q$, v_a),
    'por qué', 'RN-AGT-02: un ajuste siempre dice por qué');
  perform public.s94_expect_error(format($q$ select public.adjust_agent_balance(%L, 0, 'nada', 'k-adj-1') $q$, v_a),
    'cero', 'RN-AGT-02: un ajuste de cero no existe');
  v_id := public.adjust_agent_balance(v_a, -150, 'Llamada de prueba contada dos veces', 'k-adj-1');
  v_id2 := public.adjust_agent_balance(v_a, -150, 'Llamada de prueba contada dos veces', 'k-adj-1');
  perform public.s94_eq(v_id2::text, v_id::text, 'RN-AGT-02: pulsar dos veces no ajusta dos veces');
  perform public.adjust_agent_balance(v_a, 400, 'Compensación', 'k-adj-2');

  perform public.s94_boss();
  perform public.s94_eq(((public.s94_balance(v_a)::bigint) - v_before::bigint)::text, '2500000',
    'RN-AGT-02: −1,50 € y +4,00 € suman 2,50 €');
  perform public.s94_eq((select note from public.agent_balance_entries where id = v_id), 'Llamada de prueba contada dos veces',
    'RN-AGT-02: el ajuste guarda su motivo');
  perform public.s94_eq((select count(*)::text from public.audit_log where action = 'reservations.balance_adjusted' and entity_id = v_a), '2',
    'RN-AGT-02: dos ajustes, dos huellas');

  -- RN-AGT-08 · devolver el saldo: solo con la baja pedida o cerrada.
  perform public.s94_as('de000000-0000-0000-0000-000000000002', 'aal2');
  perform public.s94_expect_error(format($q$ select public.record_balance_payout(%L, 100, 'devolución', 'k-pay-0') $q$, v_a),
    'dado de baja', 'RN-AGT-08: con Reservas activa no se devuelve el saldo');

  perform public.s94_boss();
  perform public.s94_ledger(v_d, 'topup', 10000000);
  perform public.s94_as('de000000-0000-0000-0000-000000000002', 'aal1');
  perform public.s94_expect_error(format($q$ select public.record_balance_payout(%L, 300, 'devolución', 'k-pay-1') $q$, v_d),
    'dos pasos', 'RN-AGT-08: devolver el saldo pide el segundo paso');
  perform public.s94_as('de000000-0000-0000-0000-000000000002', 'aal2');
  perform public.s94_expect_error(format($q$ select public.record_balance_payout(%L, 1100, 'devolución', 'k-pay-1') $q$, v_d),
    'más de lo que hay', 'RN-AGT-08: no se devuelve más de lo que hay');
  v_id := public.record_balance_payout(v_d, 300, 'Transferencia de 3 € a su cuenta', 'k-pay-1');
  v_id2 := public.record_balance_payout(v_d, 300, 'Transferencia de 3 € a su cuenta', 'k-pay-1');
  perform public.s94_eq(v_id2::text, v_id::text, 'RN-AGT-08: pulsar dos veces no devuelve dos veces');
  perform public.s94_boss();
  perform public.s94_eq(public.s94_balance(v_d), '7000000', 'RN-AGT-08: tras devolver 3 € quedan 7,00 €');
  perform public.s94_eq((select kind from public.agent_balance_entries where id = v_id), 'payout', 'RN-AGT-08: es un apunte `payout`');
  perform public.s94_eq((select amount_micros::text from public.agent_balance_entries where id = v_id), '-3000000', 'RN-AGT-08: con signo negativo');
end $$;
select 'RN-AGT-02/08 ajuste y devolución: OK';

-- ------------------------------------------------------------
-- RN-AGT-04 · recarga con tarjeta (D-C)
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'de000000-0000-0000-0000-000000000020';
  v_c uuid := 'de000000-0000-0000-0000-000000000022';
  v_t record;
  v_t2 record;
begin
  perform public.s94_as('de000000-0000-0000-0000-000000000004');
  perform public.s94_expect_error(format($q$ select * from public.create_agent_topup(%L, 2000, 'k-top-1') $q$, v_a),
    'propietario', 'RN-AGT-04: el Encargado no recarga');
  perform public.s94_as('de000000-0000-0000-0000-000000000002');
  perform public.s94_expect_error(format($q$ select * from public.create_agent_topup(%L, 2000, 'k-top-1') $q$, v_a),
    'propietario', 'RN-AGT-04: Restavor no recarga con la tarjeta del restaurante');
  perform public.s94_as('de000000-0000-0000-0000-000000000005');
  perform public.s94_expect_error(format($q$ select * from public.create_agent_topup(%L, 2000, 'k-top-1') $q$, v_a),
    'propietario', 'RN-AGT-04: un extraño no recarga');

  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  perform public.s94_expect_error(format($q$ select * from public.create_agent_topup(%L, 999, 'k-top-1') $q$, v_a),
    'mínima', 'RN-AGT-04: el mínimo es de 10 €');
  perform public.s94_expect_error(format($q$ select * from public.create_agent_topup(%L, 2000, '') $q$, v_a),
    'idempotencia', 'RN-AGT-04: la recarga lleva clave de idempotencia');

  select * into v_t from public.create_agent_topup(v_a, 2000, 'k-top-1');
  perform public.s94_eq(v_t.vat_cents::text, '420', 'RN-AGT-04: 20 € + 21 % de IVA = 4,20 € de IVA');
  perform public.s94_eq(v_t.total_cents::text, '2420', 'RN-AGT-04: se pagan 24,20 €');
  select * into v_t2 from public.create_agent_topup(v_a, 2000, 'k-top-1');
  perform public.s94_eq(v_t2.topup_id::text, v_t.topup_id::text, 'RN-AGT-04: la misma clave devuelve la misma recarga');

  select * into v_t from public.create_agent_topup(v_a, 2050, 'k-top-2');
  perform public.s94_eq(v_t.vat_cents::text, '431', 'RN-AGT-04: el IVA redondea el medio céntimo hacia arriba (430,5 → 431)');
  perform public.s94_eq(v_t.total_cents::text, '2481', 'RN-AGT-04: 20,50 € + 4,31 €');

  perform public.s94_boss();
  update public.spaces set tax_rate_percent = 10 where id = 'de000000-0000-0000-0000-000000000010';
  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  select * into v_t from public.create_agent_topup(v_a, 2000, 'k-top-3');
  perform public.s94_eq(v_t.vat_cents::text, '200', 'RN-AGT-04: el IVA es el del espacio (10 % → 2,00 €)');
  perform public.s94_eq(v_t.vat_rate_percent::text, '10.00', 'RN-AGT-04: la recarga guarda el tipo de IVA con el que se calculó');
  perform public.s94_boss();
  update public.spaces set tax_rate_percent = 21 where id = 'de000000-0000-0000-0000-000000000010';

  -- Con Reservas cerrada no se recarga.
  perform public.s94_as('de000000-0000-0000-0000-000000000006');
  perform public.s94_expect_error(format($q$ select * from public.create_agent_topup(%L, 2000, 'k-top-c') $q$, v_c),
    'cerrada', 'RN-AGT-04: con Reservas cerrada no se recarga');

  -- La pantalla pide el IVA del espacio para enseñar «Pagarás…» antes de pagar.
  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  perform public.s94_eq(public.agent_topup_vat_rate(v_a)::text, '21.00', 'RN-AGT-04: el Propietario ve el IVA que se le va a aplicar');
  perform public.s94_as('de000000-0000-0000-0000-000000000005');
  perform public.s94_expect_error(format($q$ select public.agent_topup_vat_rate(%L) $q$, v_a),
    'acceso', 'RN-AGT-04: un extraño no consulta el IVA de un restaurante ajeno');

  -- El Propietario lee su recarga; el Encargado y el extraño no leen las del otro restaurante.
  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  perform public.s94_eq((select count(*)::text from public.agent_topups where establishment_id = v_a), '3', 'RN-AGT-04: el Propietario lee sus recargas');
  perform public.s94_as('de000000-0000-0000-0000-000000000006');
  perform public.s94_eq((select count(*)::text from public.agent_topups where establishment_id = v_a), '0', 'RN-AGT-04: otro restaurante no lee las recargas de A');
  perform public.s94_boss();
end $$;
select 'RN-AGT-04 crear recarga: OK';

-- El webhook de Stripe, con la clave de servicio.
do $$
declare
  v_a uuid := 'de000000-0000-0000-0000-000000000020';
  v_top1 uuid;
  v_top2 uuid;
  v_top4 uuid;
  v_before text;
  v_res jsonb;
  v_ok boolean;
begin
  perform public.s94_boss();
  select id into v_top1 from public.agent_topups where idempotency_key = 'k-top-1';
  select id into v_top2 from public.agent_topups where idempotency_key = 'k-top-2';
  v_before := public.s94_balance(v_a);

  -- Una persona no llama a lo del servidor.
  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  perform public.s94_expect_error($q$ select public.complete_agent_topup('cs_test_a', 2420, 'eur') $q$,
    'permission denied', 'RN-AGT-04: una persona no completa una recarga');
  perform public.s94_expect_error(format($q$ select public.attach_topup_session(%L, 'cs_test_a') $q$, v_top1),
    'permission denied', 'RN-AGT-04: una persona no apunta la sesión de Stripe');
  perform public.s94_expect_error($q$ select public.expire_agent_topup('cs_test_a') $q$,
    'permission denied', 'RN-AGT-04: una persona no caduca una recarga');

  perform public.s94_server();
  perform public.s94_eq(public.attach_topup_session(v_top1, 'cs_test_a')::text, 'true', 'RN-AGT-04: se apunta la sesión de Stripe');
  perform public.s94_eq(public.attach_topup_session(v_top1, 'cs_test_a')::text, 'true', 'RN-AGT-04: apuntarla otra vez es lo mismo');
  perform public.s94_eq(public.attach_topup_session(v_top1, 'cs_test_otra')::text, 'false', 'RN-AGT-04: otra sesión distinta para la misma recarga, no');
  perform public.s94_eq(public.attach_topup_session(v_top2, 'cs_test_b')::text, 'true', 'RN-AGT-04: la segunda recarga, su propia sesión');

  v_res := public.complete_agent_topup('cs_nunca_vista', 2420, 'eur');
  perform public.s94_eq(v_res ->> 'outcome', 'unknown', 'RN-AGT-04: una sesión que no es nuestra se ignora');

  -- Lo pagado no coincide: no se apunta, y queda un incidente para Restavor.
  v_res := public.complete_agent_topup('cs_test_b', 2420, 'eur');
  perform public.s94_eq(v_res ->> 'outcome', 'mismatch', 'RN-AGT-04: un importe distinto del pedido no se apunta');
  v_res := public.complete_agent_topup('cs_test_b', 2481, 'usd');
  perform public.s94_eq(v_res ->> 'outcome', 'mismatch', 'RN-AGT-04: otra moneda tampoco');
  perform public.s94_boss();
  perform public.s94_eq(public.s94_balance(v_a), v_before, 'RN-AGT-04: el saldo no se ha movido');
  perform public.s94_eq((select count(*)::text from public.reservation_incidents where establishment_id = v_a and kind = 'payment' and severity = 'error'), '2',
    'RN-AGT-04: cada pago que no cuadra deja un incidente');
  perform public.s94_eq((select status from public.agent_topups where id = v_top2), 'created', 'RN-AGT-04: la recarga sigue creada');

  -- El pago bueno: apunte por el importe SIN IVA.
  perform public.s94_server();
  v_res := public.complete_agent_topup('cs_test_a', 2420, 'eur');
  perform public.s94_eq(v_res ->> 'outcome', 'credited', 'RN-AGT-04: el pago que cuadra se apunta');
  perform public.s94_boss();
  perform public.s94_eq(((public.s94_balance(v_a)::bigint) - v_before::bigint)::text, '20000000',
    'RN-AGT-04: la recarga de 24,20 € sube el saldo 20,00 € (sin IVA: el IVA no es saldo)');
  perform public.s94_eq((select amount_micros::text from public.agent_balance_entries where stripe_checkout_session_id = 'cs_test_a'), '20000000',
    'RN-AGT-04: el apunte lleva la sesión de Stripe y el importe sin IVA');
  perform public.s94_eq((select status from public.agent_topups where id = v_top1), 'paid', 'RN-AGT-04: la recarga queda pagada');
  perform public.s94_eq((select source_id::text from public.agent_balance_entries where stripe_checkout_session_id = 'cs_test_a'), v_top1::text,
    'RN-AGT-04: el apunte apunta a su recarga');
  perform public.s94_eq((select count(*)::text from public.audit_log where action = 'reservations.topup_paid' and entity_id = v_a), '1',
    'RN-AGT-04: el pago deja su huella');
  perform public.s94_eq((select count(*)::text from public.notifications
                         where establishment_id = v_a and event_type = 'agent_topup_receipt' and dedupe_key = 'agent_topup_receipt:' || v_top1::text), '2',
    'RN-AGT-04: el recibo llega al Propietario y al Encargado');

  -- El mismo webhook otra vez: ni un apunte más.
  perform public.s94_server();
  v_res := public.complete_agent_topup('cs_test_a', 2420, 'eur');
  perform public.s94_eq(v_res ->> 'outcome', 'already', 'RN-AGT-04: el mismo webhook dos veces no apunta dos veces');
  v_res := public.complete_agent_topup('cs_test_a', 2420, 'eur');
  perform public.s94_boss();
  perform public.s94_eq((select count(*)::text from public.agent_balance_entries where stripe_checkout_session_id = 'cs_test_a'), '1',
    'RN-AGT-04: un solo apunte por sesión de Stripe');
  perform public.s94_eq(((public.s94_balance(v_a)::bigint) - v_before::bigint)::text, '20000000', 'RN-AGT-04: el saldo sube una sola vez');

  -- Caduca; si luego llegara el pago, el dinero llegó y se apunta.
  perform public.s94_server();
  perform public.s94_eq(public.expire_agent_topup('cs_test_a')::text, 'false', 'RN-AGT-04: una recarga pagada no caduca');
  perform public.s94_eq(public.expire_agent_topup('cs_test_b')::text, 'true', 'RN-AGT-04: una recarga creada sí caduca');
  perform public.s94_eq(public.expire_agent_topup('cs_test_b')::text, 'false', 'RN-AGT-04: caducar dos veces no hace nada');
  perform public.s94_boss();
  perform public.s94_eq((select status from public.agent_topups where id = v_top2), 'expired', 'RN-AGT-04: la recarga queda `expired`, sin apunte');
  perform public.s94_server();
  v_res := public.complete_agent_topup('cs_test_b', 2481, 'eur');
  perform public.s94_eq(v_res ->> 'outcome', 'credited', 'RN-AGT-04: el pago que llega tras caducar se apunta (el dinero llegó)');
  perform public.s94_boss();
  perform public.s94_eq((select status from public.agent_topups where id = v_top2), 'paid', 'RN-AGT-04: y la recarga queda pagada');
  perform public.s94_eq(((public.s94_balance(v_a)::bigint) - v_before::bigint)::text, '40500000', 'RN-AGT-04: 20,00 € + 20,50 € sin IVA');
end $$;
select 'RN-AGT-04 webhook de Stripe: OK';

-- ------------------------------------------------------------
-- RN-AGT-09 · gasto del mes y minutos de llamadas
-- ------------------------------------------------------------
do $$
declare
  v_b uuid := 'de000000-0000-0000-0000-000000000021';
  v_f uuid := 'de000000-0000-0000-0000-000000000025';
  v_s jsonb;
  v_kinds jsonb;
begin
  perform public.s94_boss();
  -- F: recarga de 7,40 € y tres llamadas de 1 minuto a 0,10 € (dos el 10 y 15 de septiembre y una el 30 a las 23:30
  -- de Madrid), más una el 1 de octubre a las 00:30 de Madrid (ya es octubre allí, aunque en UTC sea 30 de septiembre).
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, created_at) values
    ('de000000-0000-0000-0000-000000000010', v_f, 'topup', 7400000, 'suite94', timestamptz '2026-09-02 10:00+02'),
    ('de000000-0000-0000-0000-000000000010', v_f, 'call', -100000, 'call', timestamptz '2026-09-10 12:00+02'),
    ('de000000-0000-0000-0000-000000000010', v_f, 'call', -100000, 'call', timestamptz '2026-09-15 12:00+02'),
    ('de000000-0000-0000-0000-000000000010', v_f, 'call', -100000, 'call', timestamptz '2026-09-30 23:30+02'),
    ('de000000-0000-0000-0000-000000000010', v_f, 'call', -100000, 'call', timestamptz '2026-10-01 00:30+02'),
    ('de000000-0000-0000-0000-000000000010', v_f, 'whatsapp', -16000, 'notification', timestamptz '2026-09-12 12:00+02'),
    ('de000000-0000-0000-0000-000000000010', v_f, 'whatsapp', -16000, 'notification', timestamptz '2026-09-13 12:00+02');
  insert into public.agent_calls (space_id, establishment_id, external_call_id, started_at, ended_at, duration_seconds, outcome, cost_eur_micros) values
    ('de000000-0000-0000-0000-000000000010', v_f, 'suite94-1', timestamptz '2026-09-10 12:00+02', timestamptz '2026-09-10 12:01+02', 60, 'booked', 100000),
    ('de000000-0000-0000-0000-000000000010', v_f, 'suite94-2', timestamptz '2026-09-15 12:00+02', timestamptz '2026-09-15 12:01+02', 60, 'booked', 100000),
    ('de000000-0000-0000-0000-000000000010', v_f, 'suite94-3', timestamptz '2026-09-30 23:30+02', timestamptz '2026-09-30 23:31+02', 60, 'question', 100000),
    ('de000000-0000-0000-0000-000000000010', v_f, 'suite94-4', timestamptz '2026-10-01 00:30+02', timestamptz '2026-10-01 00:31+02', 60, 'booked', 100000);

  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  v_s := public.agent_spend_summary(v_f, date '2026-09-15');
  v_kinds := v_s -> 'by_kind';
  perform public.s94_eq((select (k ->> 'entries') from jsonb_array_elements(v_kinds) k where k ->> 'kind' = 'call'), '3',
    'RN-AGT-09: septiembre cuenta tres llamadas (la del 1 de octubre a las 00:30 de Madrid es de octubre)');
  perform public.s94_eq((select (k ->> 'micros') from jsonb_array_elements(v_kinds) k where k ->> 'kind' = 'call'), '-300000',
    'RN-AGT-09: y su importe');
  perform public.s94_eq((select (k ->> 'entries') from jsonb_array_elements(v_kinds) k where k ->> 'kind' = 'whatsapp'), '2', 'RN-AGT-09: dos WhatsApp');
  perform public.s94_eq((v_s -> 'calls' ->> 'count'), '3', 'RN-AGT-09: tres llamadas en septiembre');
  perform public.s94_eq((v_s -> 'calls' ->> 'seconds'), '180', 'RN-AGT-09: tres minutos');

  v_s := public.agent_spend_summary(v_f, date '2026-10-01');
  perform public.s94_eq((select (k ->> 'entries') from jsonb_array_elements(v_s -> 'by_kind') k where k ->> 'kind' = 'call'), '1', 'RN-AGT-09: octubre cuenta una');
  perform public.s94_eq((v_s -> 'calls' ->> 'count'), '1', 'RN-AGT-09: y su llamada');
  v_s := public.agent_spend_summary(v_f, date '2026-08-10');
  perform public.s94_eq(jsonb_array_length(v_s -> 'by_kind')::text, '0', 'RN-AGT-09: un mes sin gasto no inventa filas');
  perform public.s94_eq((v_s -> 'calls' ->> 'count'), '0', 'RN-AGT-09: ni llamadas');

  -- Quién mira.
  perform public.s94_as('de000000-0000-0000-0000-000000000002');
  perform public.s94_eq((public.agent_spend_summary(v_f, date '2026-09-01') -> 'calls' ->> 'count'), '3', 'RN-AGT-09: el equipo del espacio lo ve');
  perform public.s94_as('de000000-0000-0000-0000-000000000005');
  perform public.s94_expect_error(format($q$ select public.agent_spend_summary(%L, date '2026-09-01') $q$, v_f),
    'acceso', 'RN-AGT-09: un extraño no ve el gasto');
  perform public.s94_as('de000000-0000-0000-0000-000000000004');
  perform public.s94_expect_error(format($q$ select public.agent_spend_summary(%L, date '2026-09-01') $q$, v_f),
    'acceso', 'RN-AGT-09: el Encargado de otro restaurante tampoco');
  perform public.s94_expect_error(format($q$ select public.agent_minutes_estimate(%L) $q$, v_f),
    'acceso', 'RN-AGT-09: ni los minutos');

  -- «Unos N minutos»: saldo ÷ coste medio del minuto de los últimos 30 días. Las cuatro llamadas cuestan 0,10 € el
  -- minuto; el saldo de F es 7,40 € − 4 × 0,10 € − 2 × 0,016 € = 6,968 €.
  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  perform public.s94_eq(public.agent_minutes_estimate(v_f, timestamptz '2026-10-02 12:00+02')::text, '69',
    'RN-AGT-09: 6,968 € de saldo a 0,10 € el minuto son 69 minutos');
  perform public.s94_boss();
  perform public.s94_eq(public.agent_minutes_estimate(v_b, timestamptz '2026-10-02 12:00+02')::text, null,
    'RN-AGT-09: sin llamadas con coste no se enseña (nulo), no se inventa');
  perform public.s94_eq(coalesce(public.agent_minutes_estimate(v_f, timestamptz '2026-12-31 12:00+01')::text, 'nulo'), 'nulo',
    'RN-AGT-09: tampoco con llamadas de hace más de 30 días');
end $$;
select 'RN-AGT-09 gasto y minutos: OK';

-- Tarifas de mensajería, solo Bosco con el segundo paso.
do $$
declare
  v_id uuid;
begin
  perform public.s94_as('ffb00000-0000-0000-0000-000000000001', 'aal1');
  perform public.s94_expect_error($q$ select public.set_messaging_rate('sms', 'ES', 80000, current_date + 1) $q$,
    'Solo Restavor web', 'RN-AGT-03: Bosco sin segundo paso es un usuario más');
  perform public.s94_as('de000000-0000-0000-0000-000000000001', 'aal2');
  perform public.s94_expect_error($q$ select public.set_messaging_rate('sms', 'ES', 80000, current_date + 1) $q$,
    'Solo Restavor web', 'RN-AGT-03: la dueña del espacio no cambia las tarifas de la plataforma');

  perform public.s94_as('ffb00000-0000-0000-0000-000000000001', 'aal2');
  perform public.s94_expect_error($q$ select public.set_messaging_rate('telegram', 'ES', 80000, current_date + 1) $q$,
    'canal', 'RN-AGT-03: el canal tiene que existir');
  perform public.s94_expect_error($q$ select public.set_messaging_rate('sms', 'Espana', 80000, current_date + 1) $q$,
    'país', 'RN-AGT-03: el país es un código de dos letras');
  perform public.s94_expect_error($q$ select public.set_messaging_rate('sms', 'ES', -1, current_date + 1) $q$,
    'negativo', 'RN-AGT-03: el precio no es negativo');
  perform public.s94_expect_error($q$ select public.set_messaging_rate('sms', 'ES', 80000, current_date - 1) $q$,
    'desde hoy', 'RN-AGT-03: una tarifa no se escribe con fecha pasada (el historial no se reescribe)');
  v_id := public.set_messaging_rate('sms', 'es', 80000, current_date + 1);
  perform public.s94_expect_error($q$ select public.set_messaging_rate('sms', 'ES', 90000, current_date + 1) $q$,
    'Ya hay una tarifa', 'RN-AGT-03: no se pisa una tarifa con la misma fecha');
  perform public.s94_boss();
  perform public.s94_eq((select country from public.messaging_rates where id = v_id), 'ES', 'RN-AGT-03: el país se guarda en mayúsculas');
  perform public.s94_eq((select count(*)::text from public.audit_log
                         where action = 'platform.messaging_rate_set' and entity_id = v_id and space_id is null), '1',
    'RN-AGT-03: cambiar una tarifa deja su huella (sin espacio: es de la plataforma)');
end $$;
select 'RN-AGT-03 tarifas: OK';

-- Qué espacios ofrecen Reservas: solo la plataforma lo ve.
do $$
begin
  perform public.s94_as('ffb00000-0000-0000-0000-000000000001', 'aal2');
  perform public.s94_eq((select reservations_enabled::text from public.platform_reservations_spaces()
                         where space_id = 'de000000-0000-0000-0000-000000000010'), 'true',
    'RVR-01: la plataforma ve qué espacios ofrecen Reservas');
  perform public.s94_eq((select reservations_enabled::text from public.platform_reservations_spaces()
                         where space_id = 'de000000-0000-0000-0000-000000000011'), 'false',
    'RVR-01: y cuáles no');
  perform public.s94_as('de000000-0000-0000-0000-000000000001', 'aal2');
  perform public.s94_expect_error($q$ select * from public.platform_reservations_spaces() $q$,
    'Solo Restavor web', 'RVR-01: la dueña de un espacio no ve los demás espacios');
  perform public.s94_boss();
end $$;
select 'RVR-01 espacios con Reservas: OK';

-- ------------------------------------------------------------
-- Decisión 144 · la puerta de los datos de pago
-- ------------------------------------------------------------
do $$
declare
  v_e uuid := 'de000000-0000-0000-0000-000000000024';
  v_c uuid := 'de000000-0000-0000-0000-000000000022';
  v_ver uuid;
  v_req uuid;
begin
  perform public.s94_boss();
  perform public.ensure_reservations_service_internal('de000000-0000-0000-0000-000000000010', 'de000000-0000-0000-0000-000000000001');
  perform public.s94_eq(public.space_has_payment_details('de000000-0000-0000-0000-000000000010')::text, 'false',
    'decisión 144: el espacio todavía no tiene datos de pago');

  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  select service_version_id into v_ver from public.reservation_service_terms(v_e);
  v_req := public.request_reservations(v_e, v_ver, 'suite94-e');

  perform public.s94_as('de000000-0000-0000-0000-000000000002');
  perform public.s94_expect_error(format($q$ select public.approve_reservation_request(%L) $q$, v_req),
    'datos de pago', 'decisión 144: sin datos de pago no se aprueba');
  perform public.s94_boss();
  perform public.s94_eq((select status from public.reservation_service_requests where id = v_req), 'requested',
    'decisión 144: la solicitud sigue pendiente');
  perform public.s94_eq((select count(*)::text from public.subscriptions where establishment_id = v_e and kind = 'service'), '0',
    'decisión 144: y no se creó ninguna suscripción ni cobro');

  -- Reactivar una cerrada exige lo mismo.
  perform public.s94_as('de000000-0000-0000-0000-000000000002');
  perform public.s94_expect_error(format($q$ select public.reactivate_closed_reservations(%L) $q$, v_c),
    'datos de pago', 'decisión 144: sin datos de pago no se reactiva una cerrada');

  -- Cargados (solo un Bizum vale), se aprueba.
  perform public.s94_boss();
  update public.spaces set payment_bizum_phone = '600123456' where id = 'de000000-0000-0000-0000-000000000010';
  perform public.s94_eq(public.space_has_payment_details('de000000-0000-0000-0000-000000000010')::text, 'true',
    'decisión 144: con un Bizum, el espacio ya tiene dónde cobrar');
  perform public.s94_as('de000000-0000-0000-0000-000000000002');
  perform public.approve_reservation_request(v_req);
  perform public.s94_boss();
  perform public.s94_eq((select status from public.reservation_service_requests where id = v_req), 'approved',
    'decisión 144: con datos de pago, se aprueba');
  perform public.s94_as('de000000-0000-0000-0000-000000000002');
  perform public.reactivate_closed_reservations(v_c);
  perform public.s94_boss();
  perform public.s94_eq((select service_status from public.reservation_settings where establishment_id = v_c), 'approved_pending_payment',
    'decisión 144: y se reactiva');
end $$;
select 'decisión 144 datos de pago: OK';

-- ------------------------------------------------------------
-- Privilegios
-- ------------------------------------------------------------
do $$
declare
  f text;
begin
  perform public.s94_as('de000000-0000-0000-0000-000000000003');
  perform public.s94_expect_error($q$ select idempotency_key from public.agent_balance_entries limit 1 $q$,
    'permission denied', 'las claves de idempotencia del libro son internas: el restaurante no las lee');
  perform public.s94_expect_error($q$ select idempotency_key from public.agent_topups limit 1 $q$,
    'permission denied', 'ni las de las recargas');
  perform public.s94_expect_error($q$ select created_by from public.agent_balance_entries limit 1 $q$,
    'permission denied', 'ni quién hizo un apunte (P7)');
  perform public.s94_eq(((select count(*) from (select id, kind, amount_micros, note, created_at from public.agent_balance_entries
                          where establishment_id = 'de000000-0000-0000-0000-000000000020') x) > 0)::text, 'true',
    'el Propietario lee su libro enumerando columnas');
  perform public.s94_boss();

  foreach f in array array[
    'public.space_has_payment_details(uuid)',
    'public.reservations_notify_balance(uuid, text, text, bigint)',
    'public.attach_topup_session(uuid, text)',
    'public.complete_agent_topup(text, integer, text)',
    'public.expire_agent_topup(text)',
    'public.agent_balance_can_read(uuid)',
    'public.agent_balance_entries_immutable()',
    'public.agent_balance_entries_alerts()']
  loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'función interna abierta por RPC: %', f;
    end if;
  end loop;

  foreach f in array array[
    'public.record_manual_topup(uuid, integer, text, text, text)',
    'public.adjust_agent_balance(uuid, integer, text, text)',
    'public.record_balance_payout(uuid, integer, text, text)',
    'public.create_agent_topup(uuid, integer, text)',
    'public.agent_topup_vat_rate(uuid)',
    'public.agent_spend_summary(uuid, date)',
    'public.agent_minutes_estimate(uuid, timestamptz)',
    'public.set_messaging_rate(text, text, bigint, date)',
    'public.platform_reservations_spaces()']
  loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'authenticated no puede ejecutar %', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'anon puede ejecutar %', f;
    end if;
  end loop;
end $$;
select 'privilegios del saldo: OK';

rollback;
