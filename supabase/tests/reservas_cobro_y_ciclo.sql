-- ============================================================
-- Suite 93 · Contratación, cobro y ciclo de vida de Reservas
--            (Fase E1 de agents; migraciones 172 a 174; RN-APP-03, RN-RES-11)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-APP-03 · aprobar crea la suscripción al servicio Reservas SIN `plan_commitments`
--     ni `consumption_cycles`, su `reservation_settings` en `approved_pending_payment`,
--     el primer cobro (48 € + IVA = 58,08 €), la aceptación de condiciones y el aviso;
--     pulsar dos veces no duplica nada; ninguna otra vía crea esa suscripción; rechazar
--     pide motivo; solo el equipo aprueba; las condiciones de una solicitud creada en
--     nombre del restaurante las acepta el Propietario después.
--   · RN-RES-11 · el ciclo: el primer pago completo activa; vence → `past_due` → a los 7
--     días `paused` → un pago parcial sigue en pausa → el pago completo reactiva; baja
--     (sigue hasta el final del periodo pagado, se puede anular) → cerrada → a los 30 días
--     anonimizada sin borrar nada; reactivar durante los 30 días conserva los datos.
--   · D-D en los DOS sentidos · un cobro de Reservas vencido no pausa al restaurante en
--     Restavor web (ni lo avisa, ni lo cuenta como deuda), y un impago de Restavor web no
--     pausa Reservas.
--   · Datos de pago (decisión 132) y cierre · funciones internas cerradas por RPC.
--
-- Las fechas se simulan de dos maneras: envejeciendo `charges.due_at` (el gancho de pago
-- lee `now()`) y pasando `p_now` al barrido (la baja y el cierre).
--
-- Prefijo de esta suite: dc000000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('dc000000-0000-0000-0000-000000000001', 'duena@suite93.test', 'authenticated', 'authenticated'),
  ('dc000000-0000-0000-0000-000000000002', 'admin@suite93.test', 'authenticated', 'authenticated'),
  ('dc000000-0000-0000-0000-000000000004', 'propietario-a@suite93.test', 'authenticated', 'authenticated'),
  ('dc000000-0000-0000-0000-000000000005', 'encargado-a@suite93.test', 'authenticated', 'authenticated'),
  ('dc000000-0000-0000-0000-000000000007', 'propietario-b@suite93.test', 'authenticated', 'authenticated'),
  ('dc000000-0000-0000-0000-000000000008', 'extrano@suite93.test', 'authenticated', 'authenticated'),
  ('dc000000-0000-0000-0000-000000000009', 'trabajador@suite93.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('dc000000-0000-0000-0000-000000000001', 'duena@suite93.test', 'Dueña 93'),
  ('dc000000-0000-0000-0000-000000000002', 'admin@suite93.test', 'Admin 93'),
  ('dc000000-0000-0000-0000-000000000004', 'propietario-a@suite93.test', 'Propietario A 93'),
  ('dc000000-0000-0000-0000-000000000005', 'encargado-a@suite93.test', 'Encargado A 93'),
  ('dc000000-0000-0000-0000-000000000007', 'propietario-b@suite93.test', 'Propietario B 93'),
  ('dc000000-0000-0000-0000-000000000008', 'extrano@suite93.test', 'Extraño 93'),
  ('dc000000-0000-0000-0000-000000000009', 'trabajador@suite93.test', 'Trabajador 93')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled) values
  ('dc000000-0000-0000-0000-000000000010', 'Espacio 93', 'espacio-93', 'Europe/Madrid',
   'dc000000-0000-0000-0000-000000000001', true);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000009', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('dc000000-0000-0000-0000-000000000015', 'dc000000-0000-0000-0000-000000000010', 'Grupo A 93'),
  ('dc000000-0000-0000-0000-000000000016', 'dc000000-0000-0000-0000-000000000010', 'Grupo B 93');

-- A: ciclo completo y exclusiones · B: en nombre del restaurante, baja y anonimizado
-- C: pausa, cierre a mano y reactivación · W: Restavor web moroso · E: rechazada
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('dc000000-0000-0000-0000-000000000020', 'dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000015', 'R93A', 'Casa Pepe 93', 'active'),
  ('dc000000-0000-0000-0000-000000000021', 'dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000016', 'R93B', 'Bar La Plaza 93', 'active'),
  ('dc000000-0000-0000-0000-000000000022', 'dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000015', 'R93C', 'Mesón 93', 'active'),
  ('dc000000-0000-0000-0000-000000000023', 'dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000015', 'R93W', 'Asador Web 93', 'active'),
  ('dc000000-0000-0000-0000-000000000024', 'dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000015', 'R93E', 'Tapas 93', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('dc000000-0000-0000-0000-000000000040', 'dc000000-0000-0000-0000-000000000020', 'dc000000-0000-0000-0000-000000000004', 'local_owner'),
  ('dc000000-0000-0000-0000-000000000041', 'dc000000-0000-0000-0000-000000000020', 'dc000000-0000-0000-0000-000000000005', 'editor'),
  ('dc000000-0000-0000-0000-000000000043', 'dc000000-0000-0000-0000-000000000021', 'dc000000-0000-0000-0000-000000000007', 'local_owner'),
  ('dc000000-0000-0000-0000-000000000044', 'dc000000-0000-0000-0000-000000000022', 'dc000000-0000-0000-0000-000000000004', 'local_owner'),
  ('dc000000-0000-0000-0000-000000000045', 'dc000000-0000-0000-0000-000000000023', 'dc000000-0000-0000-0000-000000000004', 'local_owner'),
  ('dc000000-0000-0000-0000-000000000046', 'dc000000-0000-0000-0000-000000000024', 'dc000000-0000-0000-0000-000000000004', 'local_owner');

insert into public.establishment_permissions (establishment_membership_id, manage_reservations, view_billing) values
  ('dc000000-0000-0000-0000-000000000041', true, false);

update public.spaces set legal_name = 'Restavor Pruebas S.L.' where id = 'dc000000-0000-0000-0000-000000000010';

-- El servicio Reservas en el catálogo del espacio (48 € al mes) y los datos de pago.
select public.ensure_reservations_service_internal(
  'dc000000-0000-0000-0000-000000000010', 'dc000000-0000-0000-0000-000000000001');

-- ------------------------------------------------------------
-- Ayudantes del test
-- ------------------------------------------------------------
create function public.s93_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function public.s93_server() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
end $$;

create function public.s93_boss() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'set local role postgres';
end $$;

create function public.s93_expect_error(p_sql text, p_pattern text, p_what text) returns void
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

create function public.s93_eq(p_actual text, p_expected text, p_what text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '% FALLIDO: %  (esperado %)', p_what, coalesce(p_actual, 'nulo'), coalesce(p_expected, 'nulo');
  end if;
end $$;

-- Un cobro mensual de Reservas «a mano», para tener el segundo mes sin esperar un mes.
create function public.s93_charge(p_sub uuid, p_est uuid, p_start timestamptz, p_due timestamptz) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at)
  values
    ('dc000000-0000-0000-0000-000000000010', p_est, p_sub, 'Mensualidad Reservas (suite 93)', p_start,
     p_start + interval '1 month', 4800, 21, 1008, 5808, p_due)
  returning id into v_id;
  insert into public.financial_entries (space_id, establishment_id, charge_id, entry_type, amount_cents, reason)
  values ('dc000000-0000-0000-0000-000000000010', p_est, v_id, 'charge', 5808, 'suite 93');
  return v_id;
end $$;

-- Lo que hace la cola: ejecuta una consulta como el servidor y devuelve su resultado en texto.
create function public.s93_srv(p_sql text) returns text
language plpgsql as $$
declare
  r text;
begin
  perform public.s93_server();
  execute p_sql into r;
  perform public.s93_boss();
  return r;
end $$;

create function public.s93_status(p_est uuid) returns text
language sql stable as $$
  select service_status from public.reservation_settings where establishment_id = p_est
$$;

create function public.s93_sweep(p_now timestamptz default now()) returns jsonb
language plpgsql as $$
declare
  v jsonb;
begin
  perform public.s93_server();
  v := public.reservations_lifecycle_sweep(p_now);
  perform public.s93_boss();
  if jsonb_array_length(v -> 'errors') > 0 then
    raise exception 'El barrido devolvió errores: %', v -> 'errors';
  end if;
  return v;
end $$;

grant execute on function
  public.s93_srv(text), public.s93_as(uuid, text), public.s93_server(), public.s93_boss(),
  public.s93_expect_error(text, text, text), public.s93_eq(text, text, text),
  public.s93_charge(uuid, uuid, timestamptz, timestamptz), public.s93_status(uuid),
  public.s93_sweep(timestamptz)
to authenticated, service_role;

-- ------------------------------------------------------------
-- Datos de pago (decisión 132)
-- ------------------------------------------------------------
do $$
declare
  v_iban text;
begin
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error(
    $q$ select public.set_space_payment_details('dc000000-0000-0000-0000-000000000010', 'ES9121000418450200051332', '600123456', null) $q$,
    'propietario del espacio', 'un administrador no cambia los datos de pago');

  perform public.s93_as('dc000000-0000-0000-0000-000000000001');
  perform public.s93_expect_error(
    $q$ select public.set_space_payment_details('dc000000-0000-0000-0000-000000000010', 'esto no es un iban', null, null) $q$,
    'IBAN', 'un IBAN mal formado se rechaza');
  perform public.set_space_payment_details(
    'dc000000-0000-0000-0000-000000000010', 'es91 2100 0418 4502 0005 1332', '+34 600 123 456', 'Indica el concepto');

  perform public.s93_boss();
  select payment_iban into v_iban from public.spaces where id = 'dc000000-0000-0000-0000-000000000010';
  perform public.s93_eq(v_iban, 'ES9121000418450200051332', 'el IBAN se guarda sin espacios y en mayúsculas');
  -- El IBAN no entra en la auditoría: solo qué cambió.
  if exists (select 1 from public.audit_log where action = 'space.payment_details_changed'
             and (new_value::text like '%ES91%' or old_value::text like '%ES91%')) then
    raise exception 'datos de pago FALLIDO: el IBAN se copió a audit_log';
  end if;
  if not exists (select 1 from public.audit_log where action = 'space.payment_details_changed') then
    raise exception 'datos de pago FALLIDO: no hay auditoría';
  end if;
  -- El restaurante no lee la fila del espacio (solo el equipo): el IBAN le llega por la función.
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  if exists (select 1 from public.spaces where id = 'dc000000-0000-0000-0000-000000000010') then
    raise exception 'datos de pago FALLIDO: el restaurante lee la fila del espacio';
  end if;
  perform public.s93_boss();
end $$;
select 'datos de pago: OK';

-- ------------------------------------------------------------
-- RN-APP-03 · aprobar y rechazar
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'dc000000-0000-0000-0000-000000000020';
  v_b uuid := 'dc000000-0000-0000-0000-000000000021';
  v_ver uuid;
  v_req_a uuid;
  v_req_b uuid;
  v_sub uuid;
  v_sub2 uuid;
  v_charge record;
begin
  -- A pide Reservas con su Propietario (acepta las condiciones en el momento).
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  select service_version_id into v_ver from public.reservation_service_terms(v_a);
  v_req_a := public.request_reservations(v_a, v_ver, 'suite93-a');

  -- B: la crea el equipo en su nombre, sin aceptación todavía.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  v_req_b := public.create_reservation_request_on_behalf(v_b, 'suite93-b');

  -- Solo el equipo aprueba.
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  perform public.s93_expect_error(format($q$ select public.approve_reservation_request(%L) $q$, v_req_a),
    'permiso para aprobar', 'RN-APP-03: el Propietario del restaurante no aprueba su propia solicitud');
  perform public.s93_as('dc000000-0000-0000-0000-000000000008');
  perform public.s93_expect_error(format($q$ select public.approve_reservation_request(%L) $q$, v_req_a),
    'permiso para aprobar', 'RN-APP-03: un extraño no aprueba');
  perform public.s93_as('dc000000-0000-0000-0000-000000000009');
  perform public.s93_expect_error(format($q$ select public.approve_reservation_request(%L) $q$, v_req_a),
    'permiso para aprobar', 'RN-APP-03: un trabajador no aprueba');
  perform public.s93_as('dc000000-0000-0000-0000-000000000005');
  perform public.s93_expect_error(format($q$ select public.approve_reservation_request(%L) $q$, v_req_a),
    'permiso para aprobar', 'RN-APP-03: el Encargado no aprueba');

  -- Ninguna otra vía crea la suscripción a Reservas (la guarda de la migración 156).
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error(format(
    $q$ insert into public.subscriptions (space_id, establishment_id, kind, service_id, created_by)
        select space_id, %L, 'service', id, auth.uid() from public.services where kind = 'reservations' and space_id = 'dc000000-0000-0000-0000-000000000010' $q$, v_a),
    'solo se contrata aprobando', 'RN-APP-03: no se suscribe a Reservas por la puerta de atrás');
  perform public.s93_expect_error(format(
    $q$ select public.create_service_subscription(%L, (select id from public.services where kind = 'reservations' and space_id = 'dc000000-0000-0000-0000-000000000010')) $q$, v_a),
    'solo se contrata aprobando', 'RN-APP-03: `create_service_subscription` tampoco contrata Reservas');

  -- Aprobar A.
  v_sub := public.approve_reservation_request(v_req_a);
  v_sub2 := public.approve_reservation_request(v_req_a);
  perform public.s93_eq(v_sub2::text, v_sub::text, 'RN-APP-03: aprobar dos veces devuelve la misma suscripción');

  perform public.s93_boss();
  perform public.s93_eq((select count(*)::text from public.subscriptions where establishment_id = v_a and kind = 'service'), '1',
    'RN-APP-03: una sola suscripción tras aprobar dos veces');
  perform public.s93_eq((select count(*)::text from public.plan_commitments where subscription_id = v_sub), '0',
    'RN-APP-03: Reservas no crea plan_commitments (D-H)');
  perform public.s93_eq((select count(*)::text from public.consumption_cycles where subscription_id = v_sub), '0',
    'RN-APP-03: Reservas no crea consumption_cycles (D-H)');
  perform public.s93_eq(public.s93_status(v_a), 'approved_pending_payment', 'RN-APP-03: nace en approved_pending_payment');
  perform public.s93_eq((select subscription_id::text from public.reservation_settings where establishment_id = v_a), v_sub::text,
    'RN-APP-03: los ajustes apuntan a la suscripción');
  perform public.s93_eq((select status from public.reservation_service_requests where id = v_req_a), 'approved', 'RN-APP-03: la solicitud queda aprobada');
  perform public.s93_eq((select count(*)::text from public.charges where subscription_id = v_sub), '1', 'RN-APP-03: un primer cobro');
  select base_cents, tax_cents, total_cents into v_charge from public.charges where subscription_id = v_sub;
  perform public.s93_eq(v_charge.base_cents::text || '/' || v_charge.tax_cents::text || '/' || v_charge.total_cents::text, '4800/1008/5808',
    'RN-APP-03: 48 € + IVA = 58,08 €');
  perform public.s93_eq((select count(*)::text from public.terms_acceptances where subscription_id = v_sub and channel = 'in_app'
                         and accepted_by = 'dc000000-0000-0000-0000-000000000004'), '1',
    'RN-APP-03: la aceptación que dio el restaurante pasa a terms_acceptances');
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where request_id = v_req_a and type = 'approved'), '1',
    'RN-APP-03: apunte approved');
  perform public.s93_eq((select count(*)::text from public.audit_log where action = 'reservations.approved' and entity_id = v_a), '1',
    'RN-APP-03: auditoría de la aprobación');
  perform public.s93_eq((select amount_cents::text from public.notifications
                         where event_type = 'reservation_service_approved' and recipient_id = 'dc000000-0000-0000-0000-000000000004'),
    '5808', 'RN-APP-03: el aviso de «Aprobado» lleva el importe con IVA');

  -- Una solicitud ya aprobada no se rechaza.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error(format($q$ select public.reject_reservation_request(%L, 'tarde') $q$, v_req_a),
    'ya está resuelta', 'RN-APP-03: no se rechaza una aprobada');
end $$;
select 'RN-APP-03 aprobar: OK';

do $$
declare
  v_e uuid := 'dc000000-0000-0000-0000-000000000024';
  v_ver uuid;
  v_req uuid;
begin
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  select service_version_id into v_ver from public.reservation_service_terms(v_e);
  v_req := public.request_reservations(v_e, v_ver, 'suite93-e');

  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error(format($q$ select public.reject_reservation_request(%L, '   ') $q$, v_req),
    'pide un motivo', 'RN-APP-03: rechazar pide motivo');
  perform public.reject_reservation_request(v_req, 'Datos de contacto incompletos');
  perform public.reject_reservation_request(v_req, 'Datos de contacto incompletos');   -- repetir no falla

  perform public.s93_boss();
  perform public.s93_eq((select status from public.reservation_service_requests where id = v_req), 'rejected', 'RN-APP-03: rechazada');
  perform public.s93_eq((select rejection_reason from public.reservation_service_requests where id = v_req),
    'Datos de contacto incompletos', 'RN-APP-03: el motivo queda guardado');
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where request_id = v_req and type = 'rejected'), '1',
    'RN-APP-03: rechazar dos veces es un solo apunte');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservation_service_rejected'
                         and recipient_id = 'dc000000-0000-0000-0000-000000000004' and entity_id = v_e), '1',
    'RN-APP-03: el restaurante recibe el aviso de rechazo');
  perform public.s93_eq((select count(*)::text from public.reservation_settings where establishment_id = v_e), '0',
    'RN-APP-03: rechazar no crea ajustes de Reservas');
  perform public.s93_eq((select count(*)::text from public.subscriptions where establishment_id = v_e), '0',
    'RN-APP-03: rechazar no crea suscripción');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error(format($q$ select public.approve_reservation_request(%L) $q$, v_req),
    'ya está resuelta', 'RN-APP-03: no se aprueba una rechazada');
  perform public.s93_boss();
end $$;
select 'RN-APP-03 rechazar: OK';

-- La solicitud de B la creó el equipo: se aprueba sin aceptación y la acepta su Propietario.
do $$
declare
  v_b uuid := 'dc000000-0000-0000-0000-000000000021';
  v_req uuid;
  v_sub uuid;
  v_n integer;
begin
  perform public.s93_boss();
  select id into v_req from public.reservation_service_requests where establishment_id = v_b;
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  v_sub := public.approve_reservation_request(v_req);

  perform public.s93_boss();
  perform public.s93_eq((select count(*)::text from public.terms_acceptances where subscription_id = v_sub), '0',
    'RN-APP-03: en nombre del restaurante, sin aceptación todavía');
  perform public.s93_eq((select status from public.subscription_terms(v_sub)) , null, 'subscription_terms exige sesión (control)');

  perform public.s93_as('dc000000-0000-0000-0000-000000000007');
  perform public.s93_eq((select status from public.subscription_terms(v_sub)), 'pending',
    'RN-APP-03: las condiciones están pendientes de aceptar');
  perform public.accept_reservation_terms(v_b);
  perform public.accept_reservation_terms(v_b);   -- repetir no duplica
  perform public.s93_eq((select status from public.subscription_terms(v_sub)), 'accepted', 'RN-APP-03: aceptadas');

  perform public.s93_boss();
  perform public.s93_eq((select count(*)::text from public.terms_acceptances where subscription_id = v_sub), '1',
    'RN-APP-03: una sola aceptación');
  perform public.s93_eq((select terms_accepted_by::text from public.reservation_service_requests where id = v_req),
    'dc000000-0000-0000-0000-000000000007', 'RN-APP-03: la solicitud guarda quién aceptó');

  -- Solo el Propietario acepta.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error(format($q$ select public.accept_reservation_terms(%L) $q$, v_b),
    'solo el propietario', 'RN-APP-03: el equipo no acepta por el restaurante');
  perform public.s93_boss();
end $$;
select 'RN-APP-03 condiciones en nombre del restaurante: OK';

-- «Aprobado: datos para pagar»
do $$
declare
  v_a uuid := 'dc000000-0000-0000-0000-000000000020';
  r record;
begin
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  select * into r from public.reservation_payment_info(v_a);
  perform public.s93_eq(r.total_cents::text, '5808', 'datos de pago: importe con IVA');
  perform public.s93_eq(r.outstanding_cents::text, '5808', 'datos de pago: deuda viva');
  perform public.s93_eq(r.iban, 'ES9121000418450200051332', 'datos de pago: IBAN');
  perform public.s93_eq(r.bizum_phone, '+34 600 123 456', 'datos de pago: Bizum');
  perform public.s93_eq(r.payee_name, 'Restavor Pruebas S.L.', 'datos de pago: a nombre de la razón social del espacio');
  perform public.s93_eq(r.reference, 'Reservas Casa Pepe 93 ' || to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM'),
    'datos de pago: el concepto lo genera la base');

  perform public.s93_eq((select status || '/' || outstanding_cents::text from public.reservation_plan_charges(v_a)), 'pending/5808',
    'Plan y pagos: el cobro pendiente con su deuda viva');

  perform public.s93_as('dc000000-0000-0000-0000-000000000005');   -- Encargado
  perform public.s93_eq((select count(*)::text from public.reservation_payment_info(v_a)), '0',
    'datos de pago: el Encargado no los ve (Plan y pagos es del Propietario)');
  perform public.s93_eq((select count(*)::text from public.reservation_plan_charges(v_a)), '0',
    'Plan y pagos: el Encargado tampoco ve los cobros');
  perform public.s93_as('dc000000-0000-0000-0000-000000000008');   -- extraño
  perform public.s93_eq((select count(*)::text from public.reservation_payment_info(v_a)), '0',
    'datos de pago: un extraño no los ve');
  perform public.s93_eq((select count(*)::text from public.reservation_plan_charges(v_a)), '0',
    'Plan y pagos: un extraño no ve los cobros');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');   -- equipo
  perform public.s93_eq((select count(*)::text from public.reservation_payment_info(v_a)), '1',
    'datos de pago: el equipo sí');
  perform public.s93_server();                                      -- el servidor, para componer el correo
  perform public.s93_eq((select count(*)::text from public.reservation_payment_info(v_a)), '1',
    'datos de pago: el servidor sí');
  perform public.s93_boss();                                        -- ni sesión ni clave de servicio: nada
  perform public.s93_eq((select count(*)::text from public.reservation_payment_info(v_a)), '0',
    'datos de pago: sin sesión ni clave de servicio no hay nada');
end $$;
select 'datos para pagar: OK';

-- ------------------------------------------------------------
-- RN-RES-11 · el ciclo de A: primer pago, vence, margen, pausa, pago parcial y completo
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'dc000000-0000-0000-0000-000000000020';
  v_sub uuid;
  v_first uuid;
  v_second uuid;
  v_sweep jsonb;
  v_before integer;
begin
  perform public.s93_boss();
  select subscription_id into v_sub from public.reservation_settings where establishment_id = v_a;
  select id into v_first from public.charges where subscription_id = v_sub;

  -- Sin pagar, el barrido no toca a quien espera su primer pago.
  v_sweep := public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_a), 'approved_pending_payment', 'RN-RES-11: sin pagar sigue pendiente de pago');

  -- Pago parcial del primer cobro: sigue pendiente.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.register_payment(v_first, 1000, 'transfer', now(), null, 'parcial', 'suite93-p1');
  perform public.s93_eq(public.s93_status(v_a), 'approved_pending_payment', 'RN-RES-11: un pago parcial del primero no activa');
  -- Pago completo: activa.
  perform public.register_payment(v_first, 4808, 'transfer', now(), null, 'resto', 'suite93-p2');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_a), 'active', 'RN-RES-11: el pago completo del primero activa');
  perform public.s93_eq((select (activated_at is not null)::text from public.reservation_settings where establishment_id = v_a), 'true',
    'RN-RES-11: activated_at');
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where establishment_id = v_a and type = 'activated'), '1',
    'RN-RES-11: apunte activated');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_activated'
                         and recipient_id = 'dc000000-0000-0000-0000-000000000004'), '1',
    'RN-RES-11: aviso «Ya puedes usar Reservas»');

  -- El segundo mes: un cobro que vence dentro de 4 días.
  v_second := public.s93_charge(v_sub, v_a, now() + interval '1 month', now() + interval '4 days');
  v_sweep := public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_a), 'active', 'RN-RES-11: dentro de plazo sigue activa');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_payment_due'
                         and recipient_id = 'dc000000-0000-0000-0000-000000000004'), '1',
    'RN-RES-11: cinco días antes del vencimiento, un aviso a los Propietarios');
  if v_sweep -> 'keys' ? ('reservations_payment_due:' || v_second::text) is not true then
    raise exception 'RN-RES-11 FALLIDO: el barrido no devolvió la clave del aviso: %', v_sweep;
  end if;
  v_sweep := public.s93_sweep();
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_payment_due'), '1',
    'RN-RES-11: repetir el barrido no repite el aviso');
  perform public.s93_eq(jsonb_array_length(v_sweep -> 'keys')::text, '0', 'RN-RES-11: ni devuelve claves nuevas');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_payment_due'
                         and recipient_id = 'dc000000-0000-0000-0000-000000000005'), '0',
    'RN-RES-11: el Encargado no recibe los avisos de dinero (solo Propietarios)');

  -- Vence hace un día: past_due.
  update public.charges set due_at = now() - interval '1 day' where id = v_second;
  v_sweep := public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_a), 'past_due', 'RN-RES-11: vencido → past_due');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_past_due'), '1',
    'RN-RES-11: el día del vencimiento, un aviso');
  v_sweep := public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_a), 'past_due', 'RN-RES-11: dentro del margen sigue en past_due');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_past_due'), '1',
    'RN-RES-11: sin avisos repetidos dentro del margen');

  -- Quedan menos de dos días de margen: segundo aviso.
  update public.charges set due_at = now() - interval '5 days 2 hours' where id = v_second;
  v_sweep := public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_a), 'past_due', 'RN-RES-11: a los 5 días sigue en past_due');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_past_due'), '2',
    'RN-RES-11: dos días antes de acabar el margen, otro aviso');

  -- Pasan los 7 días: pausa.
  update public.charges set due_at = now() - interval '7 days 1 hour' where id = v_second;
  v_sweep := public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_a), 'paused', 'RN-RES-11: a los 7 días → paused');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_paused'
                         and recipient_id = 'dc000000-0000-0000-0000-000000000004'), '1', 'RN-RES-11: aviso de pausa');
  if jsonb_array_length(v_sweep -> 'email_now_keys') <> 1 then
    raise exception 'RN-RES-11 FALLIDO: la pausa sale por correo al momento: %', v_sweep;
  end if;
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where establishment_id = v_a and type = 'paused'), '1',
    'RN-RES-11: apunte paused');
  v_sweep := public.s93_sweep();
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where establishment_id = v_a and type = 'paused'), '1',
    'RN-RES-11: repetir el barrido no repite la pausa');

  -- Pago parcial: sigue en pausa. Pago completo: reactiva al momento.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.register_payment(v_second, 1000, 'bizum', now(), null, 'parcial', 'suite93-q1');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_a), 'paused', 'RN-RES-11: un pago parcial no reactiva');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.register_payment(v_second, 4808, 'bizum', now(), null, 'resto', 'suite93-q2');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_a), 'active', 'RN-RES-11: el pago completo reactiva al momento');
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where establishment_id = v_a and type = 'reactivated'), '1',
    'RN-RES-11: apunte reactivated');
end $$;
select 'RN-RES-11 ciclo de A: OK';

-- ------------------------------------------------------------
-- D-D en los dos sentidos
-- ------------------------------------------------------------
-- (1) Un cobro de Reservas vencido NO pausa al restaurante en Restavor web.
do $$
declare
  v_a uuid := 'dc000000-0000-0000-0000-000000000020';
  v_sub uuid;
  v_overdue uuid;
  v_web uuid;
  v_n integer;
begin
  perform public.s93_boss();
  select subscription_id into v_sub from public.reservation_settings where establishment_id = v_a;
  -- Un cobro de Reservas vencido hace 80 horas (en Restavor web serían ya 72: suspensión).
  v_overdue := public.s93_charge(v_sub, v_a, now() + interval '2 months', now() - interval '80 hours');

  perform public.s93_eq(public.s93_srv(format('select public.evaluate_establishment_dunning_internal(%L)', v_a)), 'current',
    'D-D: un cobro de Reservas vencido no mueve el impago de Restavor web');
  perform public.s93_srv('select public.run_dunning_sweep(''dc000000-0000-0000-0000-000000000010'')');
  perform public.s93_eq((select status from public.establishments where id = v_a), 'active',
    'D-D: el restaurante sigue activo en Restavor web');
  perform public.s93_eq((select count(*)::text from public.state_events where entity_type = 'establishment' and entity_id = v_a
                         and cause like 'nonpayment%'), '0', 'D-D: ningún evento de impago de Restavor web');
  perform public.s93_eq(public.s93_srv(format('select public.establishment_has_overdue_debt_internal(%L)', v_a)), 'false',
    'D-D: la deuda de Reservas no cuenta como deuda vencida de Restavor web (interna)');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_eq((select count(*)::text from public.establishments_with_nonpayment('dc000000-0000-0000-0000-000000000010')
                         where establishment_id = v_a), '0', 'D-D: el panel de impagos de Restavor web no la lista');
  perform public.s93_boss();

  -- Los recordatorios de «hoy vence» de Restavor web ignoran los cobros de Reservas.
  update public.charges set due_at = now() where id = v_overdue;
  perform public.s93_srv('select public.run_charge_reminders(''dc000000-0000-0000-0000-000000000010'')');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'charge_due_today'
                         and entity_id = v_overdue), '0', 'D-D: `run_charge_reminders` no avisa de un cobro de Reservas');

  -- La atención de Restavor web («Necesita tu atención») tampoco lleva Reservas.
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  perform public.s93_eq((select count(*)::text from public.my_client_attention() where entity_id = v_overdue), '0',
    'D-D: la mensualidad de Reservas no sale en la atención de Restavor web');
  perform public.s93_eq((select count(*)::text from public.my_client_attention() where kind = 'terms_to_accept' and entity_id in (
                           select id from public.subscriptions where establishment_id = v_a)), '0',
    'D-D: las condiciones de Reservas no salen en la atención de Restavor web');

  -- El control: un cobro de Restavor web (sin suscripción de Reservas) vencido SÍ cuenta.
  -- (El de Reservas vuelve a estar vencido hace 80 horas: sigue debiéndose mientras tanto.)
  perform public.s93_boss();
  update public.charges set due_at = now() - interval '80 hours' where id = v_overdue;
  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at)
  values ('dc000000-0000-0000-0000-000000000010', v_a, null, 'Cobro de Restavor web', now() - interval '2 months',
          now() - interval '1 month', 1000, 21, 210, 1210, now() - interval '30 hours')
  returning id into v_web;
  insert into public.financial_entries (space_id, establishment_id, charge_id, entry_type, amount_cents, reason)
  values ('dc000000-0000-0000-0000-000000000010', v_a, v_web, 'charge', 1210, 'suite 93');
  perform public.s93_eq(public.s93_srv(format('select public.evaluate_establishment_dunning_internal(%L)', v_a)), 'paused',
    'D-D control: un cobro de Restavor web vencido sí pausa en Restavor web');
  perform public.s93_eq(public.s93_srv(format('select public.establishment_has_overdue_debt_internal(%L)', v_a)), 'true',
    'D-D control: y sí cuenta como deuda');
  perform public.s93_eq(public.s93_status(v_a), 'active',
    'D-D: ...y esa pausa de Restavor web NO pausa Reservas');
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  perform public.s93_eq((select count(*)::text from public.my_client_attention() where entity_id = v_web), '1',
    'D-D control: el cobro de Restavor web sí sale en su atención');
  perform public.s93_boss();

  -- Pagar el cobro de Restavor web reactiva Restavor web, aunque Reservas deba.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.register_payment(v_web, 1210, 'transfer', now(), null, 'web', 'suite93-web');
  perform public.s93_boss();
  perform public.s93_eq((select status from public.establishments where id = v_a), 'active',
    'D-D: al pagar el cobro de Restavor web, Restavor web se reactiva sin esperar a Reservas');
end $$;
select 'D-D Reservas no pausa Restavor web: OK';

-- (2) Un impago de Restavor web NO pausa Reservas (restaurante W, con Reservas activa).
do $$
declare
  v_w uuid := 'dc000000-0000-0000-0000-000000000023';
  v_ver uuid;
  v_req uuid;
  v_sub uuid;
  v_charge uuid;
  v_web uuid;
begin
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  select service_version_id into v_ver from public.reservation_service_terms(v_w);
  v_req := public.request_reservations(v_w, v_ver, 'suite93-w');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  v_sub := public.approve_reservation_request(v_req);
  select id into v_charge from public.charges where subscription_id = v_sub;
  perform public.register_payment(v_charge, 5808, 'transfer', now(), null, 'primer cobro', 'suite93-w1');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_w), 'active', 'D-D (2): W tiene Reservas activa');

  insert into public.charges
    (space_id, establishment_id, subscription_id, concept, period_start, period_end,
     base_cents, tax_rate_percent, tax_cents, total_cents, due_at)
  values ('dc000000-0000-0000-0000-000000000010', v_w, null, 'Cobro de Restavor web', now() - interval '2 months',
          now() - interval '1 month', 1000, 21, 210, 1210, now() - interval '80 hours')
  returning id into v_web;
  insert into public.financial_entries (space_id, establishment_id, charge_id, entry_type, amount_cents, reason)
  values ('dc000000-0000-0000-0000-000000000010', v_w, v_web, 'charge', 1210, 'suite 93');

  perform public.s93_eq(public.s93_srv(format('select public.evaluate_establishment_dunning_internal(%L)', v_w)), 'suspended',
    'D-D (2): el impago de Restavor web suspende Restavor web (72 h)');
  perform public.s93_eq((select status from public.establishments where id = v_w), 'suspended',
    'D-D (2): el restaurante queda suspendido en Restavor web');
  perform public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_w), 'active', 'D-D (2): un impago de Restavor web NO pausa Reservas');
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where establishment_id = v_w
                         and type in ('past_due', 'paused')), '0', 'D-D (2): Reservas no registra ningún impago');
end $$;
select 'D-D Restavor web no pausa Reservas: OK';

-- ------------------------------------------------------------
-- RN-RES-11 · la baja de B, el cierre y la anonimización
-- ------------------------------------------------------------
do $$
declare
  v_b uuid := 'dc000000-0000-0000-0000-000000000021';
  v_sub uuid;
  v_charge uuid;
  v_ending timestamptz;
  v_period_end timestamptz;
  v_res uuid;
  v_closed timestamptz;
  v_before integer;
  v_events_before integer;
  v_balance_before bigint;
  v_sweep jsonb;
begin
  perform public.s93_boss();
  select subscription_id into v_sub from public.reservation_settings where establishment_id = v_b;
  select id, period_end into v_charge, v_period_end from public.charges where subscription_id = v_sub;

  -- Sin pagar el primer cobro no se puede dar de baja (aún no hay nada que acabar).
  perform public.s93_as('dc000000-0000-0000-0000-000000000007');
  perform public.s93_expect_error(format($q$ select public.request_reservations_cancellation(%L) $q$, v_b),
    'no se puede dar de baja', 'RN-RES-11: en approved_pending_payment no hay baja');

  -- Se paga y se activa.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.register_payment(v_charge, 5808, 'transfer', now(), null, 'B', 'suite93-b1');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_b), 'active', 'RN-RES-11: B activa');

  -- Datos de comensales de B para comprobar después la anonimización.
  insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
  values ('dc000000-0000-0000-0000-000000000072', 'dc000000-0000-0000-0000-000000000010', v_b, 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 30);
  insert into public.reservations
    (id, space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, email, notes, source, status)
  values ('dc000000-0000-0000-0000-0000000000a1', 'dc000000-0000-0000-0000-000000000010', v_b, 'dc000000-0000-0000-0000-000000000072',
          (now() at time zone 'Europe/Madrid')::date, '21:00', now(), 4, 'Lucía Fernández', '+34600111222', 'lucia@example.com', 'Alergia al marisco', 'manual', 'confirmed');
  insert into public.reservation_notifications
    (space_id, establishment_id, reservation_id, template, channel, recipient, status)
  values ('dc000000-0000-0000-0000-000000000010', v_b, 'dc000000-0000-0000-0000-0000000000a1', 'confirmed', 'email', 'lucia@example.com', 'sent');
  insert into public.agent_calls (space_id, establishment_id, external_call_id, started_at, caller_e164, outcome, summary)
  values ('dc000000-0000-0000-0000-000000000010', v_b, 'suite93-call-1', now(), '+34600111222', 'booked', 'Reserva de 4 personas a nombre de Lucía');
  insert into public.reservation_staff (space_id, establishment_id, kind, name, pin_hmac)
  values ('dc000000-0000-0000-0000-000000000010', v_b, 'staff', 'Ana Ruiz', 'hmac-suite-93');
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros)
  values ('dc000000-0000-0000-0000-000000000010', v_b, 'topup', 10000000);

  -- Darse de baja: el Encargado no (B no tiene), un extraño no, el Propietario sí.
  perform public.s93_as('dc000000-0000-0000-0000-000000000008');
  perform public.s93_expect_error(format($q$ select public.request_reservations_cancellation(%L) $q$, v_b),
    'propietario del restaurante o Restavor', 'RN-RES-11: un extraño no se da de baja');
  perform public.s93_as('dc000000-0000-0000-0000-000000000007');
  v_ending := public.request_reservations_cancellation(v_b);
  perform public.s93_eq((v_ending = v_period_end)::text, 'true',
    'RN-RES-11: sigue hasta el final del periodo pagado (decisión 134)');
  perform public.s93_eq(public.request_reservations_cancellation(v_b)::text, v_ending::text, 'RN-RES-11: pedir la baja dos veces no cambia nada');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_b), 'ending', 'RN-RES-11: ending');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_ending'
                         and recipient_id = 'dc000000-0000-0000-0000-000000000007'), '1', 'RN-RES-11: aviso de baja confirmada');

  -- Anular la baja.
  perform public.s93_as('dc000000-0000-0000-0000-000000000007');
  perform public.undo_reservations_cancellation(v_b);
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_b), 'active', 'RN-RES-11: anular la baja vuelve a active');
  perform public.s93_eq((select (ending_at is null)::text from public.reservation_settings where establishment_id = v_b), 'true',
    'RN-RES-11: ending_at vuelve a nulo');

  -- Otra vez de baja; mientras dure el periodo, el barrido la deja en ending y no emite mensualidad.
  perform public.s93_as('dc000000-0000-0000-0000-000000000007');
  v_ending := public.request_reservations_cancellation(v_b);
  perform public.s93_boss();
  update public.subscriptions set started_at = now() - interval '35 days' where id = v_sub;
  v_before := (select count(*) from public.charges where subscription_id = v_sub);
  perform public.s93_srv('select public.run_monthly_charges(''dc000000-0000-0000-0000-000000000010'')');
  perform public.s93_eq((select count(*)::text from public.charges where subscription_id = v_sub), v_before::text,
    'RN-RES-11: dada de baja, no se emite mensualidad nueva');
  v_sweep := public.s93_sweep(v_ending - interval '1 day');
  perform public.s93_eq(public.s93_status(v_b), 'ending', 'RN-RES-11: antes del final del periodo, sigue en ending');

  -- Acaba el periodo pagado: cerrada.
  v_sweep := public.s93_sweep(v_ending + interval '1 hour');
  perform public.s93_eq(public.s93_status(v_b), 'closed', 'RN-RES-11: acabado el periodo → closed');
  perform public.s93_eq((select status from public.subscriptions where id = v_sub), 'cancelled',
    'RN-RES-11: al cerrar, la suscripción pasa a cancelled');
  select closed_at into v_closed from public.reservation_settings where establishment_id = v_b;

  -- Antes de los 30 días, nada se anonimiza.
  perform public.s93_eq((select customer_name from public.reservations where id = 'dc000000-0000-0000-0000-0000000000a1'),
    'Lucía Fernández', 'RN-RES-11: cerrada, los datos siguen 30 días para descargar');

  -- A los 23 días: recordatorio de descarga, una sola vez.
  v_sweep := public.s93_sweep(v_closed + interval '23 days 1 hour');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_closed_purge_soon'
                         and recipient_id = 'dc000000-0000-0000-0000-000000000007'), '1',
    'RN-RES-11: siete días antes del borrado, un recordatorio');
  v_sweep := public.s93_sweep(v_closed + interval '24 days');
  perform public.s93_eq((select count(*)::text from public.notifications where event_type = 'reservations_closed_purge_soon'), '1',
    'RN-RES-11: el recordatorio no se repite');
  perform public.s93_eq((select customer_name from public.reservations where id = 'dc000000-0000-0000-0000-0000000000a1'),
    'Lucía Fernández', 'RN-RES-11: a los 24 días aún no se anonimiza');

  -- A los 30 días: anonimizado, sin borrar ni una fila.
  v_before := (select count(*) from public.reservations where establishment_id = v_b);
  v_events_before := (select count(*) from public.reservation_events where establishment_id = v_b);
  v_balance_before := public.agent_balance(v_b);
  v_sweep := public.s93_sweep(v_closed + interval '30 days 1 hour');
  perform public.s93_eq((select customer_name from public.reservations where id = 'dc000000-0000-0000-0000-0000000000a1'),
    'Anónimo', 'RN-RES-12: el nombre se anonimiza');
  perform public.s93_eq((select (phone_e164 is null and email is null and notes is null and anonymized_at is not null)::text
                         from public.reservations where id = 'dc000000-0000-0000-0000-0000000000a1'), 'true',
    'RN-RES-12: teléfono, email y nota a nulo, con anonymized_at');
  perform public.s93_eq((select party_size::text || '/' || source || '/' || status from public.reservations
                         where id = 'dc000000-0000-0000-0000-0000000000a1'), '4/manual/confirmed',
    'RN-RES-12: se conservan personas, origen y estado');
  perform public.s93_eq((select (recipient is null and anonymized_at is not null)::text from public.reservation_notifications
                         where establishment_id = v_b), 'true', 'RN-RES-12: el destinatario del aviso se anonimiza');
  perform public.s93_eq((select (caller_e164 is null and summary is null and anonymized_at is not null)::text from public.agent_calls
                         where establishment_id = v_b), 'true', 'RN-RES-12: la llamada se anonimiza');
  perform public.s93_eq((select (name = 'Anónimo' and pin_hmac is null and not active and anonymized_at is not null)::text
                         from public.reservation_staff where establishment_id = v_b and kind = 'staff'), 'true',
    'RN-RES-12: el Equipo sin cuenta se anonimiza y pierde su PIN');
  perform public.s93_eq((select count(*)::text from public.reservations where establishment_id = v_b), v_before::text,
    'RN-RES-12: no se borra ninguna reserva');
  perform public.s93_eq((select count(*)::text from public.reservation_events where establishment_id = v_b), v_events_before::text,
    'RN-RES-12: no se toca el historial de eventos');
  perform public.s93_eq(public.agent_balance(v_b)::text, v_balance_before::text, 'RN-RES-12: el libro del saldo se conserva');
  perform public.s93_eq((select (data_purged_at is not null)::text from public.reservation_settings where establishment_id = v_b), 'true',
    'RN-RES-11: data_purged_at');
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where establishment_id = v_b and type = 'purged'), '1',
    'RN-RES-11: apunte purged');
  v_sweep := public.s93_sweep(v_closed + interval '31 days');
  perform public.s93_eq((select count(*)::text from public.reservation_service_events where establishment_id = v_b and type = 'purged'), '1',
    'RN-RES-11: el barrido no vuelve a anonimizar');

  -- Los eventos y la auditoría nunca llevaron datos personales.
  if exists (select 1 from public.reservation_service_events where establishment_id = v_b and data::text ~* 'lucía|lucia|600111222') then
    raise exception 'RN-RES-12 FALLIDO: datos personales en reservation_service_events';
  end if;
  if exists (select 1 from public.audit_log where entity_id = v_b and (new_value::text ~* 'lucía|600111222' or old_value::text ~* 'lucía|600111222')) then
    raise exception 'RN-RES-12 FALLIDO: datos personales en audit_log';
  end if;

  -- Pasados los 30 días, volver exige una solicitud nueva.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error(format($q$ select public.reactivate_closed_reservations(%L) $q$, v_b),
    'solicitud nueva', 'RN-RES-11: tras el borrado no se reactiva');
  perform public.s93_boss();
end $$;
select 'RN-RES-11 baja, cierre y anonimizado: OK';

-- Volver tras el borrado: solicitud nueva, aprobación y primer pago (los ajustes se reutilizan).
do $$
declare
  v_b uuid := 'dc000000-0000-0000-0000-000000000021';
  v_ver uuid;
  v_req uuid;
  v_sub uuid;
  v_charge uuid;
begin
  perform public.s93_as('dc000000-0000-0000-0000-000000000007');
  select service_version_id into v_ver from public.reservation_service_terms(v_b);
  v_req := public.request_reservations(v_b, v_ver, 'suite93-b-otra-vez');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  v_sub := public.approve_reservation_request(v_req);
  select id into v_charge from public.charges where subscription_id = v_sub;
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_b), 'approved_pending_payment', 'RN-RES-11: tras una solicitud nueva, a pagar otra vez');
  perform public.s93_eq((select (data_purged_at is null and closed_at is null and ending_at is null)::text
                         from public.reservation_settings where establishment_id = v_b), 'true',
    'RN-RES-11: el ciclo empieza de cero');
  perform public.s93_eq((select count(*)::text from public.reservation_settings where establishment_id = v_b), '1',
    'RN-RES-11: una sola fila de ajustes por restaurante');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.register_payment(v_charge, 5808, 'transfer', now(), null, 'B otra vez', 'suite93-b2');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_b), 'active', 'RN-RES-11: y vuelve a active');
end $$;
select 'RN-RES-11 volver tras el borrado: OK';

-- ------------------------------------------------------------
-- RN-RES-11 · C: pausa, cierre a mano, deuda antigua y reactivación con todos sus datos
-- ------------------------------------------------------------
do $$
declare
  v_c uuid := 'dc000000-0000-0000-0000-000000000022';
  v_ver uuid;
  v_req uuid;
  v_sub uuid;
  v_first uuid;
  v_second uuid;
  v_new_sub uuid;
  v_new_charge uuid;
  v_sweep jsonb;
begin
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  select service_version_id into v_ver from public.reservation_service_terms(v_c);
  v_req := public.request_reservations(v_c, v_ver, 'suite93-c');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  v_sub := public.approve_reservation_request(v_req);
  select id into v_first from public.charges where subscription_id = v_sub;
  perform public.register_payment(v_first, 5808, 'transfer', now(), null, 'C', 'suite93-c1');
  perform public.s93_boss();
  insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
  values ('dc000000-0000-0000-0000-000000000073', 'dc000000-0000-0000-0000-000000000010', v_c, 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 30);
  insert into public.reservations
    (id, space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, source, status)
  values ('dc000000-0000-0000-0000-0000000000a2', 'dc000000-0000-0000-0000-000000000010', v_c, 'dc000000-0000-0000-0000-000000000073',
          (now() at time zone 'Europe/Madrid')::date, '21:00', now(), 2, 'Pablo Serrano', '+34600333444', 'manual', 'confirmed');

  -- Cerrar a mano solo desde la pausa y con motivo; solo Restavor.
  v_second := public.s93_charge(v_sub, v_c, now() + interval '1 month', now() - interval '8 days');
  v_sweep := public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_c), 'paused', 'RN-RES-11: C pasa a past_due y a paused en el mismo barrido si ya pasó el margen');
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  perform public.s93_expect_error(format($q$ select public.close_reservations_service(%L, 'quiero cerrar') $q$, v_c),
    'solo restavor', 'RN-RES-11: el Propietario no cierra a mano');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error(format($q$ select public.close_reservations_service(%L, '  ') $q$, v_c),
    'pide un motivo', 'RN-RES-11: cerrar pide motivo');
  perform public.close_reservations_service(v_c, 'Impago prolongado, el cliente no responde');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_c), 'closed', 'RN-RES-11: paused → closed por Restavor');
  perform public.s93_eq((select status from public.subscriptions where id = v_sub), 'cancelled', 'RN-RES-11: suscripción cancelada');

  -- Pagar deuda antigua en `closed` la salda pero no cambia el estado.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.register_payment(v_second, 5808, 'transfer', now(), null, 'deuda antigua', 'suite93-c2');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_c), 'closed', 'RN-RES-11: pagar deuda antigua en closed no cambia el estado');

  -- Reactivar: nueva suscripción, cobro nuevo, datos intactos.
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  perform public.s93_expect_error(format($q$ select public.reactivate_closed_reservations(%L) $q$, v_c),
    'solo restavor', 'RN-RES-11: el Propietario no reactiva');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  v_new_sub := public.reactivate_closed_reservations(v_c);
  perform public.s93_eq((v_new_sub <> v_sub)::text, 'true', 'RN-RES-11: reactivar crea una suscripción nueva');
  perform public.s93_eq(public.reactivate_closed_reservations(v_c)::text, v_new_sub::text, 'RN-RES-11: reactivar dos veces no duplica');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_c), 'approved_pending_payment', 'RN-RES-11: closed → approved_pending_payment');
  perform public.s93_eq((select count(*)::text from public.plan_commitments where subscription_id = v_new_sub), '0',
    'RN-RES-11: la reactivación tampoco crea plan_commitments');
  perform public.s93_eq((select count(*)::text from public.terms_acceptances where subscription_id = v_new_sub), '1',
    'RN-RES-11: lo aceptado antes pasa a la suscripción nueva');
  select id into v_new_charge from public.charges where subscription_id = v_new_sub;
  perform public.s93_eq((v_new_charge is not null)::text, 'true', 'RN-RES-11: la reactivación emite un cobro nuevo');
  perform public.s93_eq((select customer_name from public.reservations where id = 'dc000000-0000-0000-0000-0000000000a2'),
    'Pablo Serrano', 'RN-RES-11: reactivar conserva todos sus datos');

  -- Al pagar el cobro nuevo vuelve a active con todos sus datos.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.register_payment(v_new_charge, 5808, 'transfer', now(), null, 'C otra vez', 'suite93-c3');
  perform public.s93_boss();
  perform public.s93_eq(public.s93_status(v_c), 'active', 'RN-RES-11: pagado el cobro nuevo, vuelve a active');
  v_sweep := public.s93_sweep();
  perform public.s93_eq(public.s93_status(v_c), 'active', 'RN-RES-11: y el barrido la deja en active (sin deuda)');
  perform public.s93_eq((select customer_name from public.reservations where id = 'dc000000-0000-0000-0000-0000000000a2'),
    'Pablo Serrano', 'RN-RES-11: sus reservas siguen ahí, sin anonimizar');
end $$;
select 'RN-RES-11 cierre a mano y reactivación: OK';

-- Control del barrido de mensualidades: una Reservas activa a la que le toca cobro SÍ lo emite.
do $$
declare
  v_a uuid := 'dc000000-0000-0000-0000-000000000020';
  v_sub uuid;
  v_before integer;
begin
  perform public.s93_boss();
  select subscription_id into v_sub from public.reservation_settings where establishment_id = v_a;
  update public.subscriptions set started_at = now() - interval '35 days' where id = v_sub;
  v_before := (select count(*) from public.charges where subscription_id = v_sub);
  perform public.s93_srv('select public.run_monthly_charges(''dc000000-0000-0000-0000-000000000010'')');
  perform public.s93_eq((select count(*)::text from public.charges where subscription_id = v_sub), (v_before + 1)::text,
    'RN-RES-11 control: una Reservas activa sí recibe su mensualidad del motor de siempre');
end $$;
select 'mensualidades de Reservas: OK';

-- ------------------------------------------------------------
-- Descargar todas las reservas (PRD §6.13): solo el Propietario, y deja huella sin datos personales
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'dc000000-0000-0000-0000-000000000020';
begin
  perform public.s93_as('dc000000-0000-0000-0000-000000000004');
  perform public.audit_reservations_export(v_a, 12);
  perform public.s93_boss();
  perform public.s93_eq((select (new_value ->> 'rows') || '/' || (new_value ->> 'via') from public.audit_log
                         where action = 'reservations.exported' and entity_id = v_a), '12/owner',
    'Excel: la descarga del Propietario queda en la auditoría con su número de filas');

  perform public.s93_as('dc000000-0000-0000-0000-000000000005');   -- Encargado
  perform public.s93_expect_error(format($q$ select public.audit_reservations_export(%L, 1) $q$, v_a),
    'no tienes permiso', 'Excel: el Encargado no descarga todas las reservas');
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');   -- el equipo sin sesión de soporte
  perform public.s93_expect_error(format($q$ select public.audit_reservations_export(%L, 1) $q$, v_a),
    'no tienes permiso', 'Excel: el equipo del espacio sin sesión de soporte no descarga datos de comensales');
  perform public.s93_as('dc000000-0000-0000-0000-000000000008');   -- extraño
  perform public.s93_expect_error(format($q$ select public.audit_reservations_export(%L, 1) $q$, v_a),
    'no tienes permiso', 'Excel: un extraño no descarga');
  perform public.s93_boss();
end $$;
select 'Excel auditado: OK';

-- ------------------------------------------------------------
-- El correo al momento (decisión 137) y las puertas cerradas
-- ------------------------------------------------------------
do $$
declare
  v_a uuid := 'dc000000-0000-0000-0000-000000000020';
  v_req uuid;
  v_n integer;
  v_channel text;
begin
  perform public.s93_boss();
  select id into v_req from public.reservation_service_requests where establishment_id = v_a;

  perform public.s93_server();
  select count(*), min(channel) into v_n, v_channel
  from public.claim_email_deliveries_for_keys(array['reservation_service_approved:' || v_req::text]);
  perform public.s93_eq(v_n::text || '/' || v_channel, '1/email',
    'decisión 137: el reclamo de correo al momento devuelve solo la entrega de correo');
  perform public.s93_eq((select count(*)::text from public.claim_email_deliveries_for_keys(array['no-existe'])), '0',
    'decisión 137: una clave que no existe no reclama nada');
  perform public.s93_boss();
  perform public.s93_eq((select count(*)::text from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
                         where n.dedupe_key = 'reservation_service_approved:' || v_req::text and d.channel = 'email' and d.attempts = 1), '1',
    'decisión 137: reclamar gasta un intento, como la cola de siempre');
end $$;
select 'correo al momento: OK';

do $$
declare
  f text;
  v_open text := '';
begin
  perform public.s93_boss();
  -- Internas: ni `anon` ni `authenticated` las ejecutan por RPC.
  foreach f in array array[
    'public.reservations_lifecycle_sweep(timestamptz)',
    'public.reservations_purge(uuid, timestamptz)',
    'public.reservations_close_internal(uuid, uuid, text, text, timestamptz)',
    'public.reservations_after_payment(uuid)',
    'public.reservations_emit_to_owners(uuid, text, text, text, bigint)',
    'public.reservations_start_subscription(uuid, uuid, uuid, uuid, timestamptz)',
    'public.reservations_owner_ids(uuid)',
    'public.reservations_charge_outstanding(uuid)',
    'public.reservations_overdue_since(uuid, timestamptz)',
    'public.charge_is_reservations(uuid)',
    'public.subscription_is_reservations(uuid)',
    'public.financial_entries_reservations_hook()',
    'public.claim_email_deliveries_for_keys(text[])']
  loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      v_open := v_open || f || ' ';
    end if;
  end loop;
  if v_open <> '' then
    raise exception 'funciones internas abiertas por RPC: %', v_open;
  end if;

  -- Las del servidor las ejecuta `service_role`.
  foreach f in array array[
    'public.reservations_lifecycle_sweep(timestamptz)',
    'public.reservations_purge(uuid, timestamptz)',
    'public.claim_email_deliveries_for_keys(text[])']
  loop
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'service_role no puede ejecutar %', f;
    end if;
  end loop;

  -- Las de personas: `authenticated` sí; `anon`, no.
  foreach f in array array[
    'public.approve_reservation_request(uuid)',
    'public.reject_reservation_request(uuid, text)',
    'public.accept_reservation_terms(uuid)',
    'public.reservation_payment_info(uuid)',
    'public.reservation_plan_charges(uuid)',
    'public.audit_reservations_export(uuid, integer)',
    'public.request_reservations_cancellation(uuid)',
    'public.undo_reservations_cancellation(uuid)',
    'public.close_reservations_service(uuid, text)',
    'public.reactivate_closed_reservations(uuid)',
    'public.set_space_payment_details(uuid, text, text, text)']
  loop
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'authenticated no puede ejecutar %', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'anon puede ejecutar %', f;
    end if;
  end loop;

  -- Y llamar al barrido con una sesión de usuario no funciona.
  perform public.s93_as('dc000000-0000-0000-0000-000000000002');
  perform public.s93_expect_error($q$ select public.reservations_lifecycle_sweep(now()) $q$,
    'permission denied', 'el barrido no se llama con sesión de usuario');
  perform public.s93_boss();
end $$;
select 'funciones internas cerradas: OK';

rollback;
