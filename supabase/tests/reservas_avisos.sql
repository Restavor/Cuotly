-- ============================================================
-- Suite 96 · Avisos a los comensales de Reservas
--            (Fase F de agents; migración 179; RN-RES-10, RN-AGT-07, RN-AGT-03, RN-AGT-06, RN-RES-08, RN-RES-11, RN-RES-12)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-RES-10 · el canal de cada aviso (PRD §15): con email → solo email; solo teléfono con permiso → WhatsApp; un
--     WhatsApp no entregable sale por SMS; una reserva de plataforma no avisa nunca; el idioma de la reserva; cada
--     transición de la agenda genera su aviso y solo el suyo; cambiar solo el nombre no avisa; los tres interruptores
--     en las 64 combinaciones; un fijo español no recibe nada; el último aviso sustituye a los anteriores.
--   · RN-AGT-07 · un WhatsApp o SMS solo sale con saldo ≥ tarifa del país del número, y el precio exacto se apunta en el
--     libro; sin tarifa o sin saldo no sale y queda anotado; reclamar dos veces cobra una; toda salida sin enviar
--     devuelve lo cobrado una sola vez; el precio real del SMS corrige el cobro (más, menos, igual, otra moneda).
--   · RN-AGT-03 · las tarifas de mensajería por país.
--   · RN-RES-12 · ni los eventos, ni el `audit_log`, ni los incidentes, ni el error de un aviso guardan datos
--     personales del comensal; el equipo del espacio sin sesión de soporte no ve avisos; el destinatario no se lee por
--     API; las funciones internas están cerradas por RPC.
--   · RN-RES-11 · en pausa los avisos siguen; con Reservas cerrada no se avisa.
--   · Decisión 153 · un fallo al preparar el aviso nunca impide guardar la reserva.
--
-- La concurrencia (varios reclamos a la vez) no cabe en un archivo `psql -f`: la prueba
-- `apps/web/scripts/avisos-concurrency-test.mjs`.
--
-- Dentro de una transacción `now()` no avanza: los reintentos se adelantan a mano con `s96_due()`.
--
-- Prefijo de esta suite: df000000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name)
values ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'Bosco')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('df000000-0000-0000-0000-000000000001', 'duena@suite96.test', 'authenticated', 'authenticated'),
  ('df000000-0000-0000-0000-000000000002', 'admin@suite96.test', 'authenticated', 'authenticated'),
  ('df000000-0000-0000-0000-000000000004', 'propietario-a@suite96.test', 'authenticated', 'authenticated'),
  ('df000000-0000-0000-0000-000000000005', 'propietario-b@suite96.test', 'authenticated', 'authenticated'),
  ('df000000-0000-0000-0000-000000000006', 'extrano@suite96.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('df000000-0000-0000-0000-000000000001', 'duena@suite96.test', 'Dueña 96'),
  ('df000000-0000-0000-0000-000000000002', 'admin@suite96.test', 'Admin 96'),
  ('df000000-0000-0000-0000-000000000004', 'propietario-a@suite96.test', 'Propietario A 96'),
  ('df000000-0000-0000-0000-000000000005', 'propietario-b@suite96.test', 'Propietario B 96'),
  ('df000000-0000-0000-0000-000000000006', 'extrano@suite96.test', 'Extraño 96')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled) values
  ('df000000-0000-0000-0000-000000000010', 'Espacio 96', 'espacio-96', 'Europe/Madrid',
   'df000000-0000-0000-0000-000000000001', false);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000002', 'admin', 'active');

insert into public.groups (id, space_id, name) values
  ('df000000-0000-0000-0000-000000000015', 'df000000-0000-0000-0000-000000000010', 'Grupo 96');

-- A: activa, con saldo, teléfono y dirección · B: casi sin saldo · C: sin teléfono del local · D: en pausa ·
-- E: cerrada · F: activa, con saldo, para los casos de plataforma y de reintentos.
insert into public.establishments (id, space_id, group_id, code, name, status, address, city, contact_email) values
  ('df000000-0000-0000-0000-000000000020', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000015', 'R96A', 'Casa Ana 96', 'active', 'Calle Uno 1, 41001', 'Sevilla', 'reservas@casaana96.test'),
  ('df000000-0000-0000-0000-000000000021', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000015', 'R96B', 'Bar Blas 96', 'active', 'Calle Dos 2, 41002', 'Sevilla', null),
  ('df000000-0000-0000-0000-000000000022', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000015', 'R96C', 'Café Cuca 96', 'active', 'Calle Tres 3, 41003', 'Sevilla', null),
  ('df000000-0000-0000-0000-000000000023', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000015', 'R96D', 'Mesón Dani 96', 'active', 'Calle Cuatro 4, 41004', 'Sevilla', null),
  ('df000000-0000-0000-0000-000000000024', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000015', 'R96E', 'Taberna Eva 96', 'active', 'Calle Cinco 5, 41005', 'Sevilla', null),
  ('df000000-0000-0000-0000-000000000025', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000015', 'R96F', 'Freiduría Fran 96', 'active', 'Calle Seis 6, 41006', 'Sevilla', null);

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('df000000-0000-0000-0000-000000000040', 'df000000-0000-0000-0000-000000000020', 'df000000-0000-0000-0000-000000000004', 'local_owner'),
  ('df000000-0000-0000-0000-000000000041', 'df000000-0000-0000-0000-000000000021', 'df000000-0000-0000-0000-000000000005', 'local_owner'),
  ('df000000-0000-0000-0000-000000000042', 'df000000-0000-0000-0000-000000000023', 'df000000-0000-0000-0000-000000000004', 'local_owner');

insert into public.reservation_settings (id, space_id, establishment_id, service_status, public_slug, local_phone_e164) values
  ('df000000-0000-0000-0000-000000000060', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000020', 'active', 'casa-ana-96', '+34955000001'),
  ('df000000-0000-0000-0000-000000000061', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000021', 'active', 'bar-blas-96', '+34955000002'),
  ('df000000-0000-0000-0000-000000000062', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000022', 'active', 'cafe-cuca-96', null),
  ('df000000-0000-0000-0000-000000000063', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000023', 'paused', 'meson-dani-96', '+34955000004'),
  ('df000000-0000-0000-0000-000000000064', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000024', 'closed', 'taberna-eva-96', '+34955000005'),
  ('df000000-0000-0000-0000-000000000065', 'df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000025', 'active', 'freiduria-fran-96', '+34955000006');

-- Cena todos los días, 20:00–23:30 (última 22:30), aforo 60, en A, B, C, D y F.
insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
select ('df000000-0000-0000-0000-0000000000' || lpad((70 + n)::text, 2, '0'))::uuid, 'df000000-0000-0000-0000-000000000010',
       ('df000000-0000-0000-0000-0000000000' || lpad((20 + n)::text, 2, '0'))::uuid,
       'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 60
from generate_series(0, 5) n;

-- Saldo: A 5 €, B 0,01 €, C 5 €, D 1 €, E 1 €, F 5 € (en millonésimas de euro).
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros) values
  ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000020', 'topup', 5000000),
  ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000021', 'topup', 10000),
  ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000022', 'topup', 5000000),
  ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000023', 'topup', 1000000),
  ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000024', 'topup', 1000000),
  ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000025', 'topup', 5000000);

-- Tarifas de PRUEBA (RN-AGT-03). Las del sembrado valen lo mismo; la restricción única decide.
insert into public.messaging_rates (channel, country, price_micros, currency, valid_from) values
  ('whatsapp_utility', 'ES', 16000, 'EUR', date '2026-01-01'),
  ('sms', 'ES', 80000, 'EUR', date '2026-01-01'),
  ('whatsapp_utility', 'PT', 16000, 'EUR', date '2026-01-01'),
  ('sms', 'PT', 80000, 'EUR', date '2026-01-01')
on conflict (channel, country, valid_from) do update set price_micros = excluded.price_micros, currency = 'EUR';

-- Un SMS cobrado en dólares, para la corrección de precio con cambio.
insert into public.fx_rates (date, currency, rate_to_eur) values (current_date, 'USD', 0.5)
on conflict (date, currency) do update set rate_to_eur = 0.5;

-- ------------------------------------------------------------
-- Ayudantes del test
-- ------------------------------------------------------------
create function public.s96_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function public.s96_server() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
end $$;

create function public.s96_boss() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'set local role postgres';
end $$;

create function public.s96_eq(p_actual text, p_expected text, p_what text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '% FALLIDO: %  (esperado %)', p_what, coalesce(p_actual, 'nulo'), coalesce(p_expected, 'nulo');
  end if;
end $$;

create function public.s96_expect_error(p_sql text, p_pattern text, p_what text) returns void
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

create function public.s96_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

create function public.s96_d(p_n integer) returns date
language sql stable as $$ select public.s96_today() + p_n $$;

-- Saldo de un restaurante (como el dueño de la base: lo lee directamente).
create function public.s96_balance(p_est uuid) returns bigint
language sql stable as $$
  select coalesce(sum(amount_micros), 0)::bigint from public.agent_balance_entries where establishment_id = p_est
$$;

-- Suma neta del libro de un aviso (cobro, devoluciones y correcciones).
create function public.s96_net(p_notice uuid) returns bigint
language sql stable as $$
  select coalesce(sum(amount_micros), 0)::bigint from public.agent_balance_entries
  where source_type = 'notification' and source_id = p_notice
$$;

-- Los avisos de una reserva, en orden: «plantilla:canal:estado[:motivo]».
create function public.s96_notices(p_res uuid) returns text
language sql stable as $$
  select coalesce(string_agg(n.template || ':' || coalesce(n.channel, '-') || ':' || n.status
                             || coalesce(':' || n.skip_reason, ''), ' | ' order by e.seq, (n.fallback_of is not null), n.created_at, n.channel), '')
  from public.reservation_notifications n left join public.reservation_events e on e.id = n.event_id
  where n.reservation_id = p_res
$$;

create function public.s96_events(p_res uuid, p_type text default null) returns bigint
language sql stable as $$
  select count(*) from public.reservation_events where reservation_id = p_res and (p_type is null or type = p_type)
$$;

-- El aviso vigente (el último creado) de una reserva y, si se pide, de un canal.
create function public.s96_notice(p_res uuid, p_channel text default null) returns uuid
language sql stable as $$
  select n.id from public.reservation_notifications n left join public.reservation_events e on e.id = n.event_id
  where n.reservation_id = p_res and (p_channel is null or n.channel = p_channel)
  order by e.seq desc nulls last, n.created_at desc limit 1
$$;

-- Adelanta los reintentos (dentro de una transacción `now()` no avanza).
create function public.s96_due(p_notice uuid) returns void
language sql as $$
  update public.reservation_notifications set next_attempt_at = now() - interval '1 second'
  where id = p_notice and status = 'queued'
$$;

-- Reservar (Casa Ana, manual, es) con valores por defecto.
create function public.s96_book(
  p_date date, p_time time, p_party integer, p_name text, p_phone text, p_email text default null,
  p_source text default 'manual', p_lang text default 'es', p_est uuid default 'df000000-0000-0000-0000-000000000020',
  p_id uuid default null, p_consent boolean default false, p_platform text default null, p_force boolean default false
) returns jsonb
language sql as $$
  select public.book_reservation(p_est, p_id, p_date, p_time, p_party, p_name, p_phone, p_email, null, p_lang,
                                 p_source, p_force, null, p_consent, p_platform)
$$;

-- Reclamar como el servidor (un restaurante), con los permisivos de las pruebas (sin lista y sin bloqueo de dominios).
create function public.s96_claim(
  p_est uuid, p_limit integer default 10, p_allow text[] default null, p_enforce boolean default false,
  p_block boolean default false
) returns jsonb
language plpgsql as $$
declare
  v jsonb;
begin
  perform public.s96_server();
  v := public.claim_reservation_notices(p_est, p_limit, p_allow, p_enforce, p_block);
  perform public.s96_boss();
  return v;
end $$;

create function public.s96_report(
  p_id uuid, p_attempt integer, p_result text, p_provider text default null, p_msg text default null, p_error text default null
) returns jsonb
language plpgsql as $$
declare
  v jsonb;
begin
  perform public.s96_server();
  v := public.report_reservation_notice(p_id, p_attempt, p_result, p_provider, p_msg, p_error);
  perform public.s96_boss();
  return v;
end $$;

create function public.s96_event(
  p_id uuid, p_event text, p_provider text default null, p_msg text default null,
  p_amount numeric default null, p_currency text default null, p_error text default null
) returns jsonb
language plpgsql as $$
declare
  v jsonb;
begin
  perform public.s96_server();
  v := public.reservation_notice_provider_event(p_id, p_provider, p_msg, p_event, p_amount, p_currency, p_error);
  perform public.s96_boss();
  return v;
end $$;


-- Cierra lo que haya en cola de un restaurante para que el reclamo de la prueba siguiente vea solo lo suyo.
create function public.s96_clear(p_est uuid) returns void
language sql as $$
  update public.reservation_notifications set status = 'failed', error = 'test_cleanup', next_attempt_at = null
  where establishment_id = p_est and status = 'queued'
$$;

grant execute on function
  public.s96_as(uuid, text), public.s96_server(), public.s96_boss(), public.s96_eq(text, text, text),
  public.s96_expect_error(text, text, text), public.s96_today(), public.s96_d(integer), public.s96_balance(uuid),
  public.s96_net(uuid), public.s96_notices(uuid), public.s96_events(uuid, text), public.s96_notice(uuid, text),
  public.s96_due(uuid), public.s96_book(date, time, integer, text, text, text, text, text, uuid, uuid, boolean, text, boolean),
  public.s96_claim(uuid, integer, text[], boolean, boolean), public.s96_report(uuid, integer, text, text, text, text),
  public.s96_event(uuid, text, text, text, numeric, text, text), public.s96_clear(uuid)
to authenticated, service_role;

-- ------------------------------------------------------------
-- RN-RES-10 · qué aviso nace de qué evento (la plantilla)
-- ------------------------------------------------------------
do $$
begin
  perform public.s96_eq(public.reservation_notice_template('created', '{"status":"confirmed"}'), 'confirmed', 'RN-RES-10: alta confirmada');
  perform public.s96_eq(public.reservation_notice_template('created', '{"status":"pending"}'), 'pending_received', 'RN-RES-10: alta de grupo');
  perform public.s96_eq(public.reservation_notice_template('confirmed', '{}'), 'group_confirmed', 'RN-RES-10: grupo aceptado');
  perform public.s96_eq(public.reservation_notice_template('rejected', '{}'), 'group_rejected', 'RN-RES-10: grupo rechazado');
  perform public.s96_eq(public.reservation_notice_template('cancelled', '{}'), 'cancelled', 'RN-RES-10: cancelada');
  perform public.s96_eq(public.reservation_notice_template('updated', '{"changed":["time"]}'), 'modified', 'RN-RES-10: cambia la hora');
  perform public.s96_eq(public.reservation_notice_template('updated', '{"changed":["date","name"]}'), 'modified', 'RN-RES-10: cambia el día');
  perform public.s96_eq(public.reservation_notice_template('updated', '{"changed":["party_size"]}'), 'modified', 'RN-RES-10: cambian las personas');
  perform public.s96_eq(public.reservation_notice_template('updated', '{"changed":["name","phone","email","notes","language"]}'), null,
    'RN-RES-10: editar solo el contacto no avisa');
  perform public.s96_eq(public.reservation_notice_template('updated', '{"changed":["party_size"],"status_from":"confirmed","status_to":"pending"}'),
    'pending_received', 'RN-RES-10: el agente sube una confirmada al umbral → solicitud recibida');
  perform public.s96_eq(public.reservation_notice_template('no_show', '{}'), null, 'RN-RES-10: «No vino» no avisa');
  perform public.s96_eq(public.reservation_notice_template('opened', '{}'), null, 'RN-RES-10: abrir la ficha no avisa');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 · el canal, en las 64 combinaciones (una sola función para encolar, reclamar y el respaldo)
-- ------------------------------------------------------------
do $$
declare
  i integer;
  v_email boolean; v_phone boolean; v_consent boolean; v_ne boolean; v_nw boolean; v_ns boolean;
  v_got record;
  v_expected_channel text;
  v_expected_reason text;
begin
  for i in 0..63 loop
    v_email := (i & 1) <> 0; v_phone := (i & 2) <> 0; v_consent := (i & 4) <> 0;
    v_ne := (i & 8) <> 0; v_nw := (i & 16) <> 0; v_ns := (i & 32) <> 0;
    select * into v_got from public.reservation_notice_pick_channel(
      case when v_email then 'a@b.es' end, case when v_phone then '+34600000001' end, v_consent, v_ne, v_nw, v_ns);
    -- La referencia, escrita de otra manera: correo, WhatsApp, SMS; solo lo activado y lo que el comensal puede recibir.
    v_expected_channel := case
      when v_email and v_ne then 'email'
      when v_phone and v_consent and v_nw then 'whatsapp'
      when v_phone and v_consent and v_ns then 'sms'
    end;
    v_expected_reason := case
      when v_expected_channel is not null then null
      when v_email or (v_phone and v_consent) then 'messaging_disabled'
      when v_phone then 'no_consent'
      else 'no_contact'
    end;
    perform public.s96_eq(v_got.channel, v_expected_channel, format('RN-RES-10: canal (combinación %s)', i));
    perform public.s96_eq(v_got.reason, v_expected_reason, format('RN-RES-10: motivo (combinación %s)', i));
  end loop;

  -- Un fijo español no recibe ni WhatsApp ni SMS; un móvil de otro país sí.
  perform public.s96_eq((select channel from public.reservation_notice_pick_channel(null, '+34955123456', true, true, true, true)), null,
    'RN-RES-10: un fijo +34 9… no recibe nada');
  perform public.s96_eq((select reason from public.reservation_notice_pick_channel(null, '+34855123456', true, true, true, true)), 'no_contact',
    'RN-RES-10: un fijo +34 8… no recibe nada (sin contacto utilizable)');
  perform public.s96_eq((select channel from public.reservation_notice_pick_channel(null, '+34655123456', true, true, true, true)), 'whatsapp',
    'RN-RES-10: un móvil +34 6… recibe WhatsApp');
  perform public.s96_eq((select channel from public.reservation_notice_pick_channel(null, '+351912345678', true, true, true, true)), 'whatsapp',
    'RN-RES-10: un móvil de otro país recibe WhatsApp');
  -- El respaldo de un WhatsApp solo mira el SMS.
  perform public.s96_eq((select channel from public.reservation_notice_pick_channel('a@b.es', '+34600000001', true, true, true, true, 2)), 'sms',
    'RN-RES-10: el respaldo solo mira el SMS');
  perform public.s96_eq((select reason from public.reservation_notice_pick_channel('a@b.es', '+34600000001', true, true, true, false, 2)), 'messaging_disabled',
    'RN-RES-10: sin SMS activado no hay respaldo');
  -- El prefijo manda el país, y lo desconocido no tiene tarifa.
  perform public.s96_eq(public.reservation_phone_country('+34600000001'), 'ES', 'RN-AGT-03: +34 → ES');
  perform public.s96_eq(public.reservation_phone_country('+351912345678'), 'PT', 'RN-AGT-03: +351 → PT');
  perform public.s96_eq(public.reservation_phone_country('+33612345678'), 'FR', 'RN-AGT-03: +33 → FR');
  perform public.s96_eq(public.reservation_phone_country('+12025550123'), 'US', 'RN-AGT-03: +1 → US');
  perform public.s96_eq(public.reservation_phone_country('+99912345678'), null, 'RN-AGT-03: un prefijo desconocido no tiene país');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 · con email → solo email (y no cuesta nada)
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_claim jsonb; v_n uuid; v_bal bigint := public.s96_balance('df000000-0000-0000-0000-000000000020');
begin
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(10), '21:00', 4, 'Zacarías Quintanilla', '+34600777111', 'zacarias.quintanilla@suite96.test');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_n := public.s96_notice(v_res);
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:queued', 'RN-RES-10: con email y teléfono, un solo aviso y por email');
  perform public.s96_eq((select count(*)::text from public.reservation_notifications where reservation_id = v_res), '1', 'RN-RES-10: nunca dos canales');

  v_claim := public.s96_claim('df000000-0000-0000-0000-000000000020');
  perform public.s96_eq(jsonb_array_length(v_claim)::text, '1', 'RN-RES-10: el reclamo devuelve el aviso');
  perform public.s96_eq(v_claim -> 0 ->> 'channel', 'email', 'RN-RES-10: se envía por email');
  perform public.s96_eq(v_claim -> 0 ->> 'recipient', 'zacarias.quintanilla@suite96.test', 'RN-RES-10: el destino es el email');
  perform public.s96_eq(v_claim -> 0 ->> 'language', 'es', 'RN-RES-10: idioma de la reserva');
  perform public.s96_eq(v_claim -> 0 ->> 'attempt', '1', 'RN-RES-10: primer intento');
  perform public.s96_eq(v_claim -> 0 ->> 'template', 'confirmed', 'RN-RES-10: plantilla');
  perform public.s96_eq(v_claim -> 0 -> 'restaurant' ->> 'phone', '+34955000001', 'RN-RES-10: teléfono del restaurante para el texto');
  perform public.s96_eq(v_claim -> 0 -> 'restaurant' ->> 'address', 'Calle Uno 1, 41001', 'RN-RES-10: dirección del restaurante para el texto');
  perform public.s96_eq(length(v_claim -> 0 ->> 'link_token')::text, '32', 'Decisión 154: el enlace es de 32 caracteres');
  perform public.s96_eq((select left(cancel_token, 32) from public.reservations where id = v_res), v_claim -> 0 ->> 'link_token',
    'Decisión 154: el enlace es el principio del token');
  perform public.s96_eq((v_claim -> 0 ->> 'date'), public.s96_d(10)::text, 'RN-RES-10: fecha de la reserva');
  perform public.s96_eq((v_claim -> 0 ->> 'time'), '21:00', 'RN-RES-10: hora de la reserva');
  perform public.s96_eq(public.s96_balance('df000000-0000-0000-0000-000000000020')::text, v_bal::text, 'RN-AGT-07: el email no cuesta nada');

  perform public.s96_eq(public.s96_report(v_n, 1, 'sent', 'resend', 'em_1')::text, '{"outcome": "sent"}', 'RN-RES-10: informar del envío');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:sent', 'RN-RES-10: enviado');
  perform public.s96_eq(public.s96_events(v_res, 'notification_sent')::text, '1', 'RN-RES-10: el historial dice que se envió');
  perform public.s96_eq((select provider || ':' || provider_message_id from public.reservation_notifications where id = v_n), 'resend:em_1',
    'RN-RES-10: proveedor e identificador');
  -- Reclamar otra vez no devuelve nada: ya está enviado.
  perform public.s96_eq(jsonb_array_length(public.s96_claim('df000000-0000-0000-0000-000000000020'))::text, '0', 'RN-RES-10: lo enviado no se reclama');
end $$;

-- ------------------------------------------------------------
-- RN-AGT-07 · solo teléfono con permiso y saldo → WhatsApp, con SU precio exacto
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_claim jsonb; v_n uuid; v_bal bigint;
begin
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(11), '21:00', 2, 'Zacarías Quintanilla', '+34600777111');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_n := public.s96_notice(v_res);
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:queued', 'RN-RES-10: solo teléfono con permiso → WhatsApp');

  v_bal := public.s96_balance('df000000-0000-0000-0000-000000000020');
  v_claim := public.s96_claim('df000000-0000-0000-0000-000000000020');
  perform public.s96_eq(v_claim -> 0 ->> 'channel', 'whatsapp', 'RN-RES-10: se envía por WhatsApp');
  perform public.s96_eq(v_claim -> 0 ->> 'recipient', '+34600777111', 'RN-RES-10: el destino es el teléfono');
  perform public.s96_eq((v_bal - public.s96_balance('df000000-0000-0000-0000-000000000020'))::text, '16000',
    'RN-AGT-07: el WhatsApp descuenta su precio exacto (0,016 €)');
  perform public.s96_eq(public.s96_net(v_n)::text, '-16000', 'RN-AGT-07: el apunte es del aviso');
  perform public.s96_eq((select kind || ':' || amount_micros::text || ':' || idempotency_key from public.agent_balance_entries where source_id = v_n and source_type = 'notification'),
    'whatsapp:-16000:notice:' || v_n::text || ':charge:whatsapp', 'RN-AGT-07: kind, importe y clave de idempotencia del cobro');
  perform public.s96_eq((select cost_micros::text from public.reservation_notifications where id = v_n), '16000', 'RN-AGT-07: el coste queda en el aviso');
  perform public.s96_eq(public.s96_report(v_n, 1, 'sent', 'meta', 'wamid.1')::text, '{"outcome": "sent"}', 'RN-RES-10: informar del envío');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 / RN-AGT-07 · WhatsApp no entregable → SMS, y se devuelve el del WhatsApp
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_claim jsonb; v_wa uuid; v_sms uuid; v_bal bigint := public.s96_balance('df000000-0000-0000-0000-000000000020');
begin
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(12), '21:00', 2, 'Zacarías Quintanilla', '+34600777222');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_wa := public.s96_notice(v_res);
  v_claim := public.s96_claim('df000000-0000-0000-0000-000000000020');
  perform public.s96_eq(public.s96_net(v_wa)::text, '-16000', 'RN-AGT-07: cobrado el WhatsApp');

  perform public.s96_eq(public.s96_report(v_wa, 1, 'undeliverable', 'meta', null, 'meta_131026')::text,
    '{"outcome": "failed", "fallback": true}', 'RN-RES-10: no entregable → fallido con respaldo');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:failed | confirmed:sms:queued',
    'RN-RES-10: el mismo aviso sale por SMS (fila nueva)');
  perform public.s96_eq(public.s96_net(v_wa)::text, '0', 'RN-AGT-07: el WhatsApp no entregado se devuelve');
  perform public.s96_eq((select error from public.reservation_notifications where id = v_wa), 'whatsapp_undeliverable', 'RN-RES-10: el error es un código');
  v_sms := public.s96_notice(v_res, 'sms');
  perform public.s96_eq((select fallback_of::text from public.reservation_notifications where id = v_sms), v_wa::text, 'Decisión 157: el SMS apunta al WhatsApp');
  perform public.s96_eq((select data ->> 'fallback' from public.reservation_events where reservation_id = v_res and type = 'notification_failed'),
    'sms', 'RN-RES-10: el historial dice que pasó a SMS');

  v_claim := public.s96_claim('df000000-0000-0000-0000-000000000020');
  perform public.s96_eq(v_claim -> 0 ->> 'channel', 'sms', 'RN-RES-10: se reclama el SMS');
  perform public.s96_eq(public.s96_net(v_sms)::text, '-80000', 'RN-AGT-07: el SMS cuesta 0,08 €');
  perform public.s96_eq((v_bal - public.s96_balance('df000000-0000-0000-0000-000000000020'))::text, '80000',
    'RN-AGT-07: el saldo solo baja lo del SMS');
  perform public.s96_eq(public.s96_report(v_sms, 1, 'sent', 'sms', 'SM1')::text, '{"outcome": "sent"}', 'RN-RES-10: SMS enviado');

  -- Informar dos veces el mismo no entregable: el segundo no hace nada (ya no está en cola).
  perform public.s96_eq(public.s96_report(v_wa, 1, 'undeliverable', 'meta', null, 'meta_131026') ->> 'outcome', 'stale',
    'RN-AGT-07: un informe repetido no vuelve a devolver ni a crear otro SMS');
  perform public.s96_eq((select count(*)::text from public.reservation_notifications where reservation_id = v_res), '2', 'RN-RES-10: solo dos filas');
end $$;

-- ------------------------------------------------------------
-- RN-AGT-07 · saldo menor que la tarifa → no sale y queda anotado (y no se cobra nada)
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_claim jsonb; v_n uuid;
begin
  perform public.s96_as('df000000-0000-0000-0000-000000000005');
  v := public.s96_book(public.s96_d(10), '21:00', 2, 'Zacarías Quintanilla', '+34600777333', null, 'manual', 'es',
                       'df000000-0000-0000-0000-000000000021');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_n := public.s96_notice(v_res);
  perform public.s96_eq(public.s96_balance('df000000-0000-0000-0000-000000000021')::text, '10000', 'RN-AGT-07: B tiene 0,01 €');

  v_claim := public.s96_claim('df000000-0000-0000-0000-000000000021');
  perform public.s96_eq(jsonb_array_length(v_claim)::text, '0', 'RN-AGT-07: con saldo menor que la tarifa no sale nada');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:skipped:no_balance', 'RN-AGT-07: queda anotado «sin saldo»');
  perform public.s96_eq(public.s96_balance('df000000-0000-0000-0000-000000000021')::text, '10000', 'RN-AGT-07: no se descuenta nada');
  perform public.s96_eq((select count(*)::text from public.agent_balance_entries where source_id = v_n), '0', 'RN-AGT-07: ni un apunte');
  perform public.s96_eq((select data ->> 'reason' from public.reservation_events where reservation_id = v_res and type = 'notification_skipped'),
    'no_balance', 'RN-AGT-07: el historial dice «Aviso no enviado: sin saldo»');
  -- Con un saldo justo igual a la tarifa sí sale (RN-AGT-07: «igual o mayor»).
  perform public.s96_boss();
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros)
  values ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000021', 'topup', 6000);
  perform public.s96_as('df000000-0000-0000-0000-000000000005');
  v := public.s96_book(public.s96_d(11), '21:00', 2, 'Zacarías Quintanilla', '+34600777333', null, 'manual', 'es',
                       'df000000-0000-0000-0000-000000000021');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_claim := public.s96_claim('df000000-0000-0000-0000-000000000021');
  perform public.s96_eq(jsonb_array_length(v_claim)::text, '1', 'RN-AGT-07: saldo igual a la tarifa → sale');
  perform public.s96_eq(public.s96_balance('df000000-0000-0000-0000-000000000021')::text, '0', 'RN-AGT-07: queda a cero, nunca en negativo');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 · una reserva de plataforma no avisa nunca (y no se escribe nada)
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid;
begin
  perform public.s96_server();
  v := public.s96_book(public.s96_d(13), '21:00', 2, 'Zacarías Quintanilla', '+34600777444', 'zacarias.quintanilla@suite96.test',
                       'platform', 'es', 'df000000-0000-0000-0000-000000000025', null, false, 'TheFork');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(v ->> 'outcome', 'accepted', 'RN-RES-10: la plataforma entra');
  perform public.s96_eq((select count(*)::text from public.reservation_notifications where reservation_id = v_res), '0',
    'RN-RES-10: plataforma → ni un aviso, ni omitido');
  perform public.s96_eq(public.s96_events(v_res, 'notification_skipped')::text, '0', 'RN-RES-10: plataforma → ni un evento de aviso');
  -- Cancelarla tampoco avisa.
  perform public.s96_server();
  perform public.cancel_reservation('df000000-0000-0000-0000-000000000025', v_res, 'platform');
  perform public.s96_boss();
  perform public.s96_eq((select count(*)::text from public.reservation_notifications where reservation_id = v_res), '0',
    'RN-RES-10: cancelar una de plataforma tampoco avisa');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 · el inglés usa el texto en inglés
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_claim jsonb;
begin
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(14), '21:00', 2, 'Zacarías Quintanilla', '+34600777555', 'zacarias.quintanilla@suite96.test', 'manual', 'en');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_claim := public.s96_claim('df000000-0000-0000-0000-000000000020');
  perform public.s96_eq(v_claim -> 0 ->> 'language', 'en', 'RN-RES-10: el aviso va en el idioma de la reserva (en)');
  perform public.s96_eq((select language from public.reservation_notifications where reservation_id = v_res), 'en', 'RN-RES-10: el aviso guarda el idioma');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 · cada transición de la agenda genera su aviso, y solo el suyo
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_pend uuid; v_pend2 uuid; v_new uuid;
begin
  -- Alta de un grupo del agente (≥ 9): solicitud recibida.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(20), '21:00', 12, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'agent');
  perform public.s96_boss();
  v_pend := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(v ->> 'status', 'pending', 'RN-RES-10: el grupo grande queda pendiente');
  perform public.s96_eq(public.s96_notices(v_pend), 'pending_received:email:queued', 'RN-RES-10: alta de grupo → solicitud recibida');

  -- Confirmarlo: grupo aceptado.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.confirm_reservation('df000000-0000-0000-0000-000000000020', v_pend);
  perform public.s96_boss();
  perform public.s96_eq(public.s96_notices(v_pend), 'pending_received:email:queued | group_confirmed:email:queued', 'RN-RES-10: confirmar → grupo aceptado');
  -- Confirmar otra vez no duplica.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.confirm_reservation('df000000-0000-0000-0000-000000000020', v_pend);
  perform public.s96_boss();
  perform public.s96_eq((select count(*)::text from public.reservation_notifications where reservation_id = v_pend), '2', 'RN-RES-10: repetir no duplica el aviso');

  -- Otro grupo, rechazado.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(21), '21:00', 10, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'agent');
  perform public.s96_boss();
  v_pend2 := (v ->> 'reservation_id')::uuid;
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.reject_reservation('df000000-0000-0000-0000-000000000020', v_pend2);
  perform public.s96_boss();
  perform public.s96_eq(public.s96_notices(v_pend2), 'pending_received:email:queued | group_rejected:email:queued', 'RN-RES-10: rechazar → grupo rechazado');

  -- Una reserva normal: editar la hora avisa; editar solo el nombre, no; cancelar avisa.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(22), '21:00', 4, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test');
  v_res := (v ->> 'reservation_id')::uuid;
  v := public.s96_book(public.s96_d(22), '22:00', 4, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'manual', 'es',
                       'df000000-0000-0000-0000-000000000020', v_res);
  v := public.s96_book(public.s96_d(22), '22:00', 4, 'Zacarías Q.', null, 'zacarias.quintanilla@suite96.test', 'manual', 'es',
                       'df000000-0000-0000-0000-000000000020', v_res);
  perform public.s96_boss();
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:queued | modified:email:queued',
    'RN-RES-10: cambiar la hora avisa; cambiar solo el nombre, no');
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.cancel_reservation('df000000-0000-0000-0000-000000000020', v_res, 'customer');
  perform public.s96_boss();
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:queued | modified:email:queued | cancelled:email:queued',
    'RN-RES-10: cancelar avisa');

  -- El agente que sube una confirmada al umbral la deja pendiente: solicitud recibida.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(23), '21:00', 4, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test');
  v_new := (v ->> 'reservation_id')::uuid;
  perform public.s96_server();
  v := public.s96_book(public.s96_d(23), '21:00', 9, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'agent', 'es',
                       'df000000-0000-0000-0000-000000000020', v_new);
  perform public.s96_boss();
  perform public.s96_eq(v ->> 'status', 'pending', 'RN-RES-10: el agente sube la reserva al umbral → pendiente');
  perform public.s96_eq(public.s96_notices(v_new), 'confirmed:email:queued | pending_received:email:queued',
    'RN-RES-10: subir al umbral → solicitud recibida');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 · lo último sustituye a lo anterior: solo sale el último aviso de una reserva
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_claim jsonb; v_first uuid;
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000020'::uuid);
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(30), '21:00', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test');
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_boss();
  v_first := public.s96_notice(v_res);
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(30), '21:30', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'manual', 'es',
                       'df000000-0000-0000-0000-000000000020', v_res);
  perform public.s96_boss();
  v_claim := public.s96_claim('df000000-0000-0000-0000-000000000020');
  perform public.s96_eq(jsonb_array_length(v_claim)::text, '1', 'RN-RES-10: solo sale un aviso de la reserva');
  perform public.s96_eq(v_claim -> 0 ->> 'template', 'modified', 'RN-RES-10: el que sale es el último (modificada)');
  perform public.s96_eq(v_claim -> 0 ->> 'time', '21:30', 'RN-RES-10: con la hora de ahora');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:skipped:obsolete | modified:email:queued',
    'RN-RES-10: el anterior queda «obsoleto»');
  perform public.s96_eq(public.s96_events(v_res, 'notification_skipped')::text, '0', 'RN-RES-10: un aviso obsoleto no ensucia el historial');
  -- Y un aviso de «confirmada» que ya no aplica porque la reserva se canceló.
  perform public.s96_report(public.s96_notice(v_res), 1, 'sent', 'resend', 'em_obs');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 · sin contacto utilizable: se anota por qué y no se cobra
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid;
begin
  -- Un fijo español con permiso: nada (no_contact).
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(31), '21:00', 2, 'Zacarías Quintanilla', '+34955123456');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:-:skipped:no_contact', 'RN-RES-10: un fijo español no recibe nada');
  perform public.s96_eq((select data ->> 'reason' from public.reservation_events where reservation_id = v_res and type = 'notification_skipped'),
    'no_contact', 'RN-RES-10: el historial dice por qué');

  -- El agente, solo teléfono y sin permiso: no_consent.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(32), '21:00', 2, 'Zacarías Quintanilla', '+34600777666', null, 'agent', 'es',
                       'df000000-0000-0000-0000-000000000020', null, false);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:-:skipped:no_consent', 'RN-RES-10: sin email y sin permiso → no_consent');
  -- Con permiso del comensal sí.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(32), '21:30', 2, 'Zacarías Quintanilla', '+34600777666', null, 'agent', 'es',
                       'df000000-0000-0000-0000-000000000020', null, true);
  perform public.s96_boss();
  perform public.s96_eq(public.s96_notices((v ->> 'reservation_id')::uuid), 'confirmed:whatsapp:queued', 'RN-RES-10: con permiso → WhatsApp');
end $$;

-- ------------------------------------------------------------
-- Decisión 152 · los tres interruptores, desde la cuenta y con auditoría
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_audit jsonb;
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000020'::uuid);
  -- Un extraño no los cambia; la persona propietaria, sí, y queda auditado.
  perform public.s96_as('df000000-0000-0000-0000-000000000006');
  perform public.s96_expect_error($q$select public.set_notice_channels('df000000-0000-0000-0000-000000000020', true, true, true)$q$,
    'permiso|acceso', 'Decisión 152: un extraño cambia los canales');
  perform public.s96_as('df000000-0000-0000-0000-000000000005');
  perform public.s96_expect_error($q$select public.set_notice_channels('df000000-0000-0000-0000-000000000020', true, true, true)$q$,
    'permiso|acceso', 'Decisión 152: el dueño de otro restaurante cambia los canales');
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.s96_expect_error($q$select public.set_notice_channels('df000000-0000-0000-0000-000000000020', null, true, true)$q$,
    'canal', 'Decisión 152: un canal sin valor');
  perform public.set_notice_channels('df000000-0000-0000-0000-000000000020', false, true, false);
  perform public.s96_boss();
  perform public.s96_eq((select notify_email::text || notify_whatsapp::text || notify_sms::text from public.reservation_settings
                         where establishment_id = 'df000000-0000-0000-0000-000000000020'), 'falsetruefalse', 'Decisión 152: canales guardados');
  select new_value into v_audit from public.audit_log
  where action = 'reservations.notice_channels_changed' and entity_id = 'df000000-0000-0000-0000-000000000020'
  order by created_at desc limit 1;
  perform public.s96_eq(v_audit::text, '{"sms": false, "email": false, "whatsapp": true}', 'Decisión 152: la auditoría guarda el valor nuevo');
  perform public.s96_eq((select old_value::text from public.audit_log where action = 'reservations.notice_channels_changed'
                         and entity_id = 'df000000-0000-0000-0000-000000000020' order by created_at desc limit 1),
    '{"sms": true, "email": true, "whatsapp": true}', 'Decisión 152: la auditoría guarda el valor anterior');
  perform public.s96_eq((select actor_id::text from public.audit_log where action = 'reservations.notice_channels_changed'
                         and entity_id = 'df000000-0000-0000-0000-000000000020' order by created_at desc limit 1),
    'df000000-0000-0000-0000-000000000004', 'Decisión 152: la auditoría guarda quién');

  -- Con el email apagado, un comensal con email y móvil recibe WhatsApp (el primero activado).
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(33), '21:00', 2, 'Zacarías Quintanilla', '+34600777777', 'zacarias.quintanilla@suite96.test');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:queued', 'Decisión 152: email apagado → WhatsApp');

  -- Y se vuelve a decidir al reclamar: ahora WhatsApp apagado y SMS encendido, antes de enviar.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels('df000000-0000-0000-0000-000000000020', false, false, true);
  perform public.s96_boss();
  perform public.s96_eq((public.s96_claim('df000000-0000-0000-0000-000000000020') -> 0 ->> 'channel'), 'sms',
    'Decisión 153: el canal se vuelve a decidir al reclamar');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:sms:queued', 'Decisión 153: el aviso cambia de canal');
  perform public.s96_eq(public.s96_net(public.s96_notice(v_res))::text, '-80000', 'RN-AGT-07: se cobra el SMS, no el WhatsApp');

  -- Con todo apagado nada sale (messaging_disabled) y no se cobra.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels('df000000-0000-0000-0000-000000000020', false, false, false);
  v := public.s96_book(public.s96_d(34), '21:00', 2, 'Zacarías Quintanilla', '+34600777778', 'zacarias.quintanilla@suite96.test');
  perform public.s96_boss();
  perform public.s96_eq(public.s96_notices((v ->> 'reservation_id')::uuid), 'confirmed:-:skipped:messaging_disabled',
    'Decisión 152: todo apagado → messaging_disabled');

  -- Interruptor apagado ENTRE encolar y reclamar con el gasto ya retenido: se devuelve (sin dejar el cobro colgado).
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels('df000000-0000-0000-0000-000000000020', true, true, true);
  v := public.s96_book(public.s96_d(35), '21:00', 2, 'Zacarías Quintanilla', '+34600777779');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_claim('df000000-0000-0000-0000-000000000020');
  perform public.s96_eq(public.s96_net(public.s96_notice(v_res))::text, '-16000', 'RN-AGT-07: WhatsApp cobrado');
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels('df000000-0000-0000-0000-000000000020', true, false, false);
  perform public.s96_boss();
  perform public.s96_due(public.s96_notice(v_res));
  perform public.s96_eq(jsonb_array_length(public.s96_claim('df000000-0000-0000-0000-000000000020'))::text, '0',
    'Decisión 152: con el canal apagado el reintento no sale');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:skipped:messaging_disabled',
    'Decisión 152: queda omitido por interruptor');
  perform public.s96_eq(public.s96_net(public.s96_notice(v_res))::text, '0', 'RN-AGT-07: y lo retenido se devuelve');

  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels('df000000-0000-0000-0000-000000000020', true, true, true);
  perform public.s96_boss();
end $$;

-- ------------------------------------------------------------
-- RN-AGT-07 · cambiar de canal y volver: lo devuelto se vuelve a cobrar (no sale gratis) y cada cobro, una devolución
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_n uuid;
  v_est uuid := 'df000000-0000-0000-0000-000000000020';
begin
  perform public.s96_clear(v_est);
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels(v_est, true, true, true);
  v := public.s96_book(public.s96_d(36), '21:00', 2, 'Zacarías Quintanilla', '+34600777780');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_n := public.s96_notice(v_res);

  -- Intento 1 por WhatsApp: cobrado, y el proveedor pide reintentar.
  perform public.s96_eq(public.s96_claim(v_est) -> 0 ->> 'channel', 'whatsapp', 'RN-AGT-07: primer intento por WhatsApp');
  perform public.s96_eq(public.s96_net(v_n)::text, '-16000', 'RN-AGT-07: WhatsApp cobrado');
  perform public.s96_report(v_n, 1, 'retry', null, null, 'meta_131000');

  -- El restaurante apaga WhatsApp: el reintento sale por SMS y se devuelve el WhatsApp.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels(v_est, true, false, true);
  perform public.s96_boss();
  perform public.s96_due(v_n);
  perform public.s96_eq(public.s96_claim(v_est) -> 0 ->> 'channel', 'sms', 'RN-AGT-07: el reintento pasa a SMS');
  perform public.s96_eq(public.s96_net(v_n)::text, '-80000', 'RN-AGT-07: queda cobrado solo el SMS');
  perform public.s96_report(v_n, 2, 'retry', null, null, 'sms_30001');

  -- Y lo vuelve a encender (y apaga el SMS): el WhatsApp se cobra DE NUEVO, no sale gratis.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels(v_est, true, true, false);
  perform public.s96_boss();
  perform public.s96_due(v_n);
  perform public.s96_eq(public.s96_claim(v_est) -> 0 ->> 'channel', 'whatsapp', 'RN-AGT-07: vuelve a WhatsApp');
  perform public.s96_eq(public.s96_net(v_n)::text, '-16000', 'RN-AGT-07: el WhatsApp se vuelve a cobrar (no sale gratis)');

  -- Al terminar sin enviar, se devuelve lo cobrado una sola vez más.
  perform public.s96_report(v_n, 3, 'failed', null, null, 'meta_100');
  perform public.s96_eq(public.s96_net(v_n)::text, '0', 'RN-AGT-07: todo devuelto');
  perform public.s96_eq((select count(*)::text from public.agent_balance_entries where source_id = v_n and source_type = 'notification' and kind in ('whatsapp','sms')), '3',
    'RN-AGT-07: tres cobros (WhatsApp, SMS, WhatsApp)');
  perform public.s96_eq((select count(*)::text from public.agent_balance_entries where source_id = v_n and source_type = 'notification' and kind = 'refund'), '3',
    'RN-AGT-07: tres devoluciones, una por cobro');

  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.set_notice_channels(v_est, true, true, true);
  perform public.s96_boss();
end $$;

-- ------------------------------------------------------------
-- RN-AGT-07 · reclamar dos veces con saldo = tarifa: un solo cobro, y el reintento no mira el saldo
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_n uuid; v_claim1 jsonb; v_claim2 jsonb;
  v_est uuid := 'df000000-0000-0000-0000-000000000023';
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000023'::uuid);
  -- D está en pausa: la reserva se crea directamente (la agenda no deja crear en pausa).
  insert into public.reservations (id, space_id, establishment_id, date, time, starts_at, party_size, customer_name, phone_e164, language, status, source, whatsapp_consent)
  values ('df000000-0000-0000-0000-0000000000d1', 'df000000-0000-0000-0000-000000000010', v_est, public.s96_d(10), '21:00',
          (public.s96_d(10) + time '21:00') at time zone 'Europe/Madrid', 2, 'Zacarías Quintanilla', '+34600888111', 'es', 'confirmed', 'manual', true);
  v_res := 'df000000-0000-0000-0000-0000000000d1';
  perform public.reservation_log_event(v_est, v_res, 'created', 'member', null, '{"status":"confirmed","source":"manual"}');
  v_n := public.s96_notice(v_res);
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:queued', 'RN-RES-11: en pausa los avisos siguen');
  -- Dejar el saldo justo en la tarifa del WhatsApp.
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, note)
  values ('df000000-0000-0000-0000-000000000010', v_est, 'adjustment', -(public.s96_balance(v_est) - 16000), 'Dejar justo la tarifa');
  perform public.s96_eq(public.s96_balance(v_est)::text, '16000', 'RN-AGT-07: saldo justo igual a la tarifa');

  v_claim1 := public.s96_claim(v_est);
  perform public.s96_eq(jsonb_array_length(v_claim1)::text, '1', 'RN-AGT-07: el primer reclamo cobra y devuelve');
  perform public.s96_eq(public.s96_balance(v_est)::text, '0', 'RN-AGT-07: saldo a cero');
  perform public.s96_due(v_n);
  v_claim2 := public.s96_claim(v_est);
  perform public.s96_eq(jsonb_array_length(v_claim2)::text, '1', 'RN-AGT-07: el reintento NO se queda sin saldo (ya está cobrado)');
  perform public.s96_eq(v_claim2 -> 0 ->> 'attempt', '2', 'RN-AGT-07: segundo intento');
  perform public.s96_eq(public.s96_net(v_n)::text, '-16000', 'RN-AGT-07: un solo cobro');
  perform public.s96_eq((select count(*)::text from public.agent_balance_entries where source_id = v_n and source_type = 'notification'), '1',
    'RN-AGT-07: un solo apunte del aviso');
  perform public.s96_eq(public.s96_balance(v_est)::text, '0', 'RN-AGT-07: el saldo no cambia en el reintento');
end $$;

-- ------------------------------------------------------------
-- Decisión 155 · informes: el intento vigente manda, reintentos 1/5/15 y tope de cuatro
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_n uuid; v_r jsonb; v_wait interval;
  v_est uuid := 'df000000-0000-0000-0000-000000000025';
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000025'::uuid);
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  -- F no es de A: la reserva se crea con la función del servidor (origen web, sin sesión).
  perform public.s96_server();
  v := public.s96_book(public.s96_d(40), '21:00', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'web', 'es', v_est);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_n := public.s96_notice(v_res);

  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est))::text, '1', 'Decisión 155: intento 1');
  -- Un informe de un intento que no es el vigente no cambia nada.
  perform public.s96_eq(public.s96_report(v_n, 2, 'sent', 'resend', 'em_x') ->> 'outcome', 'stale', 'Decisión 155: un intento que no es el vigente es obsoleto');
  v_r := public.s96_report(v_n, 1, 'retry', null, null, 'timeout');
  perform public.s96_eq(v_r::text, '{"outcome": "retry", "in_minutes": 1}', 'Decisión 155: primer reintento a 1 minuto');
  perform public.s96_eq((select next_attempt_at - now() from public.reservation_notifications where id = v_n)::text, '00:01:00', 'Decisión 155: a 1 minuto');
  perform public.s96_eq((select error from public.reservation_notifications where id = v_n), 'timeout', 'Decisión 155: el error es un código');
  -- Un error que no es un código (texto del proveedor con un contacto) no se guarda.
  perform public.s96_due(v_n);
  perform public.s96_claim(v_est);
  v_r := public.s96_report(v_n, 2, 'retry', null, null, 'No se pudo enviar a zacarias.quintanilla@suite96.test');
  perform public.s96_eq(v_r::text, '{"outcome": "retry", "in_minutes": 5}', 'Decisión 155: segundo reintento a 5 minutos');
  perform public.s96_eq((select error from public.reservation_notifications where id = v_n), null, 'RN-RES-12: el texto del proveedor no se guarda');
  perform public.s96_due(v_n);
  perform public.s96_claim(v_est);
  v_r := public.s96_report(v_n, 3, 'retry', null, null, 'timeout');
  perform public.s96_eq(v_r::text, '{"outcome": "retry", "in_minutes": 15}', 'Decisión 155: tercer reintento a 15 minutos');
  perform public.s96_due(v_n);
  perform public.s96_claim(v_est);
  v_r := public.s96_report(v_n, 4, 'retry', null, null, 'timeout');
  perform public.s96_eq(v_r ->> 'outcome', 'failed', 'Decisión 155: el cuarto intento es el último');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:failed', 'Decisión 155: fallido tras cuatro intentos');
  perform public.s96_eq((select error from public.reservation_notifications where id = v_n), 'max_attempts', 'Decisión 155: motivo max_attempts');
  perform public.s96_eq((select data ->> 'reason' from public.reservation_events where reservation_id = v_res and type = 'notification_failed'),
    'max_attempts', 'Decisión 155: el historial dice que falló');
  -- Un informe tardío de un aviso ya cerrado no lo reabre.
  perform public.s96_eq(public.s96_report(v_n, 4, 'sent', 'resend', 'em_late') ->> 'outcome', 'stale', 'Decisión 155: un informe tardío no reabre');

  -- El tope se aplica también al reclamar: un aviso que llega con cuatro intentos hechos se cierra solo.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(41), '21:00', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'web', 'es', v_est);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_n := public.s96_notice(v_res);
  update public.reservation_notifications set attempts = 4, next_attempt_at = now() - interval '1 second' where id = v_n;
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est))::text, '0', 'Decisión 155: con cuatro intentos no se reclama');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:failed', 'Decisión 155: se cierra al reclamar (tope)');
end $$;

-- ------------------------------------------------------------
-- RN-AGT-07 · devolución: una sola vez por muchas veces que se informe, y «no cobrado» + fallido = una
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_n uuid; i integer;
  v_est uuid := 'df000000-0000-0000-0000-000000000025';
  v_bal bigint;
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000025'::uuid);
  v_bal := public.s96_balance(v_est);
  perform public.s96_server();
  v := public.s96_book(public.s96_d(42), '21:00', 2, 'Zacarías Quintanilla', '+34600999111', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  perform public.s96_report(v_n, 1, 'sent', 'meta', 'wamid.refund');
  perform public.s96_eq((v_bal - public.s96_balance(v_est))::text, '16000', 'RN-AGT-07: WhatsApp cobrado');

  -- Meta dice «no cobrado»: devolución, una vez, aunque lo digan veinte veces.
  for i in 1..20 loop
    perform public.s96_event(null, 'not_charged', 'meta', 'wamid.refund');
  end loop;
  perform public.s96_eq(public.s96_net(v_n)::text, '0', 'RN-AGT-07: «no cobrado» devuelve lo cobrado');
  perform public.s96_eq((select count(*)::text from public.agent_balance_entries where source_id = v_n and kind = 'refund'), '1',
    'RN-AGT-07: veinte avisos «no cobrado» = una devolución');
  perform public.s96_eq(public.s96_balance(v_est)::text, v_bal::text, 'RN-AGT-07: el saldo vuelve a donde estaba');

  -- Y si después llega «fallido», no se devuelve otra vez (lo neto ya es cero).
  perform public.s96_event(null, 'failed', 'meta', 'wamid.refund', null, null, 'meta_131000');
  perform public.s96_eq((select count(*)::text from public.agent_balance_entries where source_id = v_n and kind = 'refund'), '1',
    'RN-AGT-07: «no cobrado» + fallido = una sola devolución');
  perform public.s96_eq(public.s96_balance(v_est)::text, v_bal::text, 'RN-AGT-07: el saldo no se pasa de devuelto');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:failed', 'RN-AGT-07: el aviso queda fallido');
end $$;

-- ------------------------------------------------------------
-- Decisión 155 · estados monótonos y webhooks que llegan antes que el informe
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_n uuid; v_est uuid := 'df000000-0000-0000-0000-000000000025';
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000025'::uuid);
  perform public.s96_server();
  v := public.s96_book(public.s96_d(43), '21:00', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'web', 'es', v_est);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  -- El webhook de entregado llega antes que el informe del envío.
  perform public.s96_eq(public.s96_event(v_n, 'delivered', 'resend', 'em_fast') ->> 'outcome', 'delivered', 'Decisión 155: entregado antes del informe');
  perform public.s96_eq(public.s96_report(v_n, 1, 'sent', 'resend', 'em_fast') ->> 'outcome', 'stale', 'Decisión 155: el informe llega tarde y no retrocede el estado');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:delivered', 'Decisión 155: se queda entregado');
  perform public.s96_eq((select provider_message_id from public.reservation_notifications where id = v_n), 'em_fast', 'Decisión 155: el identificador se guardó');
  -- Un fallo posterior no baja un aviso entregado, ni un reintento.
  perform public.s96_eq(public.s96_event(v_n, 'failed', 'resend', 'em_fast', null, null, 'bounce') ->> 'outcome', 'ignored', 'Decisión 155: entregado nunca pasa a fallido');
  perform public.s96_eq(public.s96_event(v_n, 'undeliverable', 'resend', 'em_fast') ->> 'outcome', 'ignored', 'Decisión 155: entregado nunca pasa a no entregable');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:delivered', 'Decisión 155: sigue entregado');
  -- Se busca también por proveedor + identificador y lo desconocido se dice.
  perform public.s96_eq(public.s96_event(null, 'delivered', 'resend', 'em_fast') ->> 'outcome', 'ignored', 'Decisión 155: se encuentra por proveedor e identificador');
  perform public.s96_eq(public.s96_event(null, 'delivered', 'resend', 'em_no_existe') ->> 'outcome', 'unknown', 'Decisión 155: un identificador desconocido');
  perform public.s96_expect_error($q$select public.reservation_notice_provider_event(null, 'resend', 'x', 'inventado', null, null, null)$q$,
    'Suceso', 'Decisión 155: un suceso inventado');
  perform public.s96_expect_error($q$select public.report_reservation_notice(null, 1, 'inventado')$q$, 'Resultado', 'Decisión 155: un resultado inventado');
end $$;

-- ------------------------------------------------------------
-- RN-AGT-07 · el precio real del SMS corrige el cobro (más, menos, igual, otra moneda, sin cambio)
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_n uuid; v_est uuid := 'df000000-0000-0000-0000-000000000025'; v_bal bigint; v_out jsonb;
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000025'::uuid);
  -- Tres SMS (el comensal no tiene email ni WhatsApp: se apaga WhatsApp en F para forzar el SMS).
  perform public.s96_boss();
  update public.reservation_settings set notify_whatsapp = false where establishment_id = v_est;

  -- Más caro: 0,10 € (provisional 0,08 €).
  perform public.s96_server();
  v := public.s96_book(public.s96_d(44), '21:00', 2, 'Zacarías Quintanilla', '+34600999222', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid; v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  perform public.s96_report(v_n, 1, 'sent', 'sms', 'SMmas');
  perform public.s96_eq(public.s96_net(v_n)::text, '-80000', 'RN-AGT-07: SMS provisional');
  perform public.s96_eq(public.s96_event(v_n, 'price', 'sms', 'SMmas', 0.10, 'EUR') ->> 'outcome', 'priced', 'RN-AGT-07: precio real conocido');
  perform public.s96_eq(public.s96_net(v_n)::text, '-100000', 'RN-AGT-07: precio real mayor → se cobra la diferencia');
  perform public.s96_eq((select kind from public.agent_balance_entries where idempotency_key = 'notice:' || v_n::text || ':price'), 'sms', 'RN-AGT-07: la diferencia es un cobro');
  -- Repetirlo no vuelve a corregir.
  perform public.s96_eq(public.s96_event(v_n, 'price', 'sms', 'SMmas', 0.10, 'EUR') ->> 'outcome', 'ignored', 'RN-AGT-07: la corrección es una sola');
  perform public.s96_eq(public.s96_net(v_n)::text, '-100000', 'RN-AGT-07: el neto no cambia al repetir');

  -- Más barato: 0,05 €.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(44), '21:30', 2, 'Zacarías Quintanilla', '+34600999333', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid; v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  perform public.s96_report(v_n, 1, 'sent', 'sms', 'SMmenos');
  perform public.s96_event(v_n, 'price', 'sms', 'SMmenos', 0.05, 'EUR');
  perform public.s96_eq(public.s96_net(v_n)::text, '-50000', 'RN-AGT-07: precio real menor → se devuelve la diferencia');
  perform public.s96_eq((select kind from public.agent_balance_entries where idempotency_key = 'notice:' || v_n::text || ':price'), 'refund', 'RN-AGT-07: la diferencia es una devolución');

  -- Igual: 0,08 €.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(45), '21:00', 2, 'Zacarías Quintanilla', '+34600999444', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid; v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  perform public.s96_report(v_n, 1, 'sent', 'sms', 'SMigual');
  v_bal := public.s96_balance(v_est);
  perform public.s96_event(v_n, 'price', 'sms', 'SMigual', 0.08, 'EUR');
  perform public.s96_eq(public.s96_balance(v_est)::text, v_bal::text, 'RN-AGT-07: precio igual → no se apunta nada');
  perform public.s96_eq((select count(*)::text from public.agent_balance_entries where idempotency_key = 'notice:' || v_n::text || ':price'), '0',
    'RN-AGT-07: precio igual → ni un apunte');
  perform public.s96_eq((select (price_final_at is not null)::text from public.reservation_notifications where id = v_n), 'true',
    'RN-AGT-07: el precio queda como definitivo');

  -- En dólares con cambio 0,5: 0,20 USD = 0,10 €.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(45), '21:30', 2, 'Zacarías Quintanilla', '+34600999555', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid; v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  perform public.s96_report(v_n, 1, 'sent', 'sms', 'SMusd');
  perform public.s96_event(v_n, 'price', 'sms', 'SMusd', 0.20, 'USD');
  perform public.s96_eq(public.s96_net(v_n)::text, '-100000', 'RN-AGT-07: dólares con cambio ≠ 1 → 0,20 USD = 0,10 €');
  perform public.s96_eq((select price_currency || ':' || price_original::text from public.reservation_notifications where id = v_n), 'USD:0.20',
    'RN-AGT-07: se guarda el importe original y su moneda');

  -- En una moneda sin cambio cargado: se queda el provisional (nunca ×1) y hay un incidente.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(46), '21:00', 2, 'Zacarías Quintanilla', '+34600999666', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid; v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  perform public.s96_report(v_n, 1, 'sent', 'sms', 'SMjpy');
  v_out := public.s96_event(v_n, 'price', 'sms', 'SMjpy', 12.0, 'JPY');
  perform public.s96_eq(v_out ->> 'outcome', 'no_fx', 'RN-AGT-07: sin cambio de moneda');
  perform public.s96_eq(public.s96_net(v_n)::text, '-80000', 'RN-AGT-07: sin cambio queda el provisional, nunca el importe como euros');
  perform public.s96_eq((select count(*)::text from public.reservation_incidents where establishment_id = v_est and data ->> 'code' = 'no_fx'), '1',
    'RN-AGT-07: queda un incidente');
  -- Y una corrección llega aunque el SMS haya fallado después (decide el precio, no el estado).
  perform public.s96_event(v_n, 'failed', 'sms', 'SMjpy', null, null, 'sms_30008');
  perform public.s96_eq(public.s96_net(v_n)::text, '0', 'RN-AGT-07: un SMS fallido se devuelve');
  perform public.s96_event(v_n, 'price', 'sms', 'SMjpy', 0.04, 'EUR');
  perform public.s96_eq(public.s96_net(v_n)::text, '-40000', 'RN-AGT-07: si el proveedor lo cobró, se cobra lo que cobró (decide el precio)');

  perform public.s96_boss();
  update public.reservation_settings set notify_whatsapp = true where establishment_id = v_est;
end $$;

-- ------------------------------------------------------------
-- RN-AGT-07 · sin tarifa del país del número no sale (y no se cobra); y sin datos del restaurante tampoco
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_est uuid := 'df000000-0000-0000-0000-000000000025'; v_bal bigint;
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000025'::uuid);
  v_bal := public.s96_balance(v_est);
  perform public.s96_server();
  v := public.s96_book(public.s96_d(50), '21:00', 2, 'Zacarías Quintanilla', '+33612345678', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est))::text, '0', 'RN-AGT-07: sin tarifa de Francia no sale');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:skipped:no_rate', 'RN-AGT-07: queda «sin tarifa»');
  perform public.s96_eq(public.s96_balance(v_est)::text, v_bal::text, 'RN-AGT-07: no se cobra nada');
  perform public.s96_eq((select count(*)::text from public.reservation_incidents where establishment_id = v_est and data ->> 'code' = 'no_rate_fr'), '1',
    'RN-AGT-07: un incidente que dice qué país falta');
  perform public.s96_eq((select kind from public.reservation_incidents where establishment_id = v_est and data ->> 'code' = 'no_rate_fr'), 'whatsapp',
    'RN-AGT-07: del canal que falta');

  -- Un número de otro país con tarifa (Portugal) sí sale, a SU precio.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(50), '21:30', 2, 'Zacarías Quintanilla', '+351912345678', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est))::text, '1', 'RN-AGT-07: con tarifa de Portugal sale');

  -- Restaurante C: sin teléfono del local → el texto no sería el de textos-avisos.md: no sale y deja un incidente.
  perform public.s96_server();
  v := public.s96_book(public.s96_d(51), '21:00', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'web', 'es',
                       'df000000-0000-0000-0000-000000000022');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(jsonb_array_length(public.s96_claim('df000000-0000-0000-0000-000000000022'))::text, '0', 'Decisión 164: sin teléfono del local no sale');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:skipped:missing_data', 'Decisión 164: queda «faltan datos»');
  perform public.s96_eq((select count(*)::text from public.reservation_incidents where establishment_id = 'df000000-0000-0000-0000-000000000022' and data ->> 'code' = 'missing_data'), '1',
    'Decisión 164: un incidente');
  -- Sin dirección: «confirmada» y «grupo aceptado» no salen, pero «cancelada» sí.
  perform set_config('cuotly.data_change', 'on', true);
  update public.establishments set address = null where id = 'df000000-0000-0000-0000-000000000022';
  perform set_config('cuotly.data_change', '', true);
  update public.reservation_settings set local_phone_e164 = '+34955000003' where establishment_id = 'df000000-0000-0000-0000-000000000022';
  perform public.s96_server();
  v := public.s96_book(public.s96_d(51), '21:30', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test', 'web', 'es',
                       'df000000-0000-0000-0000-000000000022');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(jsonb_array_length(public.s96_claim('df000000-0000-0000-0000-000000000022'))::text, '0', 'Decisión 164: «confirmada» sin dirección no sale');
  perform public.s96_server();
  perform public.cancel_reservation('df000000-0000-0000-0000-000000000022', v_res, 'agent');
  perform public.s96_boss();
  perform public.s96_eq(jsonb_array_length(public.s96_claim('df000000-0000-0000-0000-000000000022'))::text, '1', 'Decisión 164: «cancelada» sin dirección sí sale');
end $$;

-- ------------------------------------------------------------
-- Decisión 165 · lista permitida y dominios reservados (antes de cobrar)
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_est uuid := 'df000000-0000-0000-0000-000000000025'; v_bal bigint; v_claim jsonb;
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000025'::uuid);
  v_bal := public.s96_balance(v_est);
  perform public.s96_server();
  v := public.s96_book(public.s96_d(52), '21:00', 2, 'Zacarías Quintanilla', '+34600555111', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  -- Con la lista exigida y el número fuera de ella: no sale, no cobra, ni una llamada.
  v_claim := public.s96_claim(v_est, 10, array['+34600000000', 'otro@suite96.test'], true);
  perform public.s96_eq(jsonb_array_length(v_claim)::text, '0', 'Decisión 165: fuera de la lista permitida no sale');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:whatsapp:skipped:not_allowed', 'Decisión 165: queda «no permitido»');
  perform public.s96_eq(public.s96_balance(v_est)::text, v_bal::text, 'Decisión 165: la lista se comprueba ANTES de cobrar');
  perform public.s96_eq((select count(*)::text from public.agent_balance_entries where source_id = public.s96_notice(v_res)), '0', 'Decisión 165: cero apuntes');

  -- Dentro de la lista, sale (sin importar mayúsculas y espacios).
  perform public.s96_server();
  v := public.s96_book(public.s96_d(52), '21:30', 2, 'Zacarías Quintanilla', '+34600555222', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_claim := public.s96_claim(v_est, 10, array[' +34600555222 '], true);
  perform public.s96_eq(jsonb_array_length(v_claim)::text, '1', 'Decisión 165: en la lista sí sale');

  -- Un dominio reservado se rechaza siempre que se pida bloquearlos (proveedor real).
  perform public.s96_server();
  v := public.s96_book(public.s96_d(53), '21:00', 2, 'Zacarías Quintanilla', null, 'rebota@dominio.test', 'web', 'es', v_est);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est, 10, null, false, true))::text, '0', 'Decisión 165: un correo a un dominio .test no sale con proveedor real');
  perform public.s96_eq(public.s96_notices(v_res), 'confirmed:email:skipped:not_allowed', 'Decisión 165: queda «no permitido»');
  foreach v_bal in array array[1] loop null; end loop;
  perform public.s96_server();
  v := public.s96_book(public.s96_d(53), '21:30', 2, 'Zacarías Quintanilla', null, 'rebota@example.com', 'web', 'es', v_est);
  perform public.s96_boss();
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est, 10, null, false, true))::text, '0', 'Decisión 165: example.com tampoco');
  perform public.s96_server();
  v := public.s96_book(public.s96_d(53), '22:00', 2, 'Zacarías Quintanilla', null, 'persona@restaurante-real.es', 'web', 'es', v_est);
  perform public.s96_boss();
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est, 10, null, false, true))::text, '1', 'Decisión 165: un dominio real sí sale');
end $$;

-- ------------------------------------------------------------
-- Decisión 155 · un aviso venenoso no bloquea el lote y no se queda a la cabeza
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_est uuid := 'df000000-0000-0000-0000-000000000025'; v_ids uuid[] := '{}'; v_res uuid; v_claim jsonb; i integer;
begin
  perform public.s96_clear('df000000-0000-0000-0000-000000000025'::uuid);
  create function public.s96_poison() returns trigger language plpgsql as $f$
  begin
    raise exception 'veneno de prueba';
  end $f$;
  create trigger s96_poison before update on public.reservation_notifications
    for each row when (new.recipient = 'veneno@restaurante-real.es') execute function public.s96_poison();

  for i in 1..3 loop
    perform public.s96_server();
    v := public.s96_book(public.s96_d(58), (array['21:00', '21:30', '22:00'])[i]::time, 2, 'Zacarías Quintanilla', null,
      case when i = 2 then 'veneno@restaurante-real.es' else 'bueno' || i::text || '@restaurante-real.es' end, 'web', 'es', v_est);
    perform public.s96_boss();
    v_ids := v_ids || (v ->> 'reservation_id')::uuid;
  end loop;
  v_claim := public.s96_claim(v_est);
  perform public.s96_eq(jsonb_array_length(v_claim)::text, '2', 'Decisión 155: los dos avisos sanos salen aunque el tercero falle');
  perform public.s96_eq(public.s96_notices(v_ids[2]), 'confirmed:email:failed', 'Decisión 155: el venenoso queda fallido');
  perform public.s96_eq((select error from public.reservation_notifications where reservation_id = v_ids[2]), 'claim_error', 'Decisión 155: con el código claim_error');
  perform public.s96_eq((select count(*)::text from public.reservation_incidents where establishment_id = v_est and data ->> 'code' = 'claim_error'), '1',
    'Decisión 155: y un incidente');
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est))::text, '0', 'Decisión 155: no vuelve a la cabeza de la cola');
  drop trigger s96_poison on public.reservation_notifications;
  drop function public.s96_poison();
end $$;

-- ------------------------------------------------------------
-- Decisión 153 · un fallo al preparar el aviso NUNCA impide guardar la reserva
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_est uuid := 'df000000-0000-0000-0000-000000000020';
begin
  create function public.s96_boom() returns trigger language plpgsql as $f$
  begin
    raise exception 'fallo forzado al preparar un aviso';
  end $f$;
  create trigger s96_boom before insert on public.reservation_notifications
    for each row execute function public.s96_boom();

  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(70), '21:00', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test');
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid;
  perform public.s96_eq(v ->> 'outcome', 'accepted', 'Decisión 153: la reserva se guarda aunque falle el aviso');
  perform public.s96_eq((select count(*)::text from public.reservations where id = v_res), '1', 'Decisión 153: existe');
  perform public.s96_eq((select count(*)::text from public.reservation_notifications where reservation_id = v_res), '0', 'Decisión 153: sin aviso (no se esconde)');
  perform public.s96_eq(public.s96_events(v_res, 'created')::text, '1', 'Decisión 153: el evento de la reserva existe');
  perform public.s96_eq((select data ->> 'reason' from public.reservation_events where reservation_id = v_res and type = 'notification_skipped'),
    'enqueue_error', 'Decisión 153: el historial dice que el aviso no se pudo preparar');
  perform public.s96_eq((select count(*)::text from public.reservation_incidents where establishment_id = v_est and data ->> 'code' = 'enqueue_error'), '1',
    'Decisión 153: queda un incidente');
  -- Y cambiar o cancelar tampoco se rompe.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.cancel_reservation(v_est, v_res, 'customer');
  perform public.s96_boss();
  perform public.s96_eq((select status from public.reservations where id = v_res), 'cancelled', 'Decisión 153: la cancelación también se guarda');
  drop trigger s96_boom on public.reservation_notifications;
  drop function public.s96_boom();
  -- Los avisos vuelven a funcionar en cuanto desaparece el fallo.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(70), '22:00', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test');
  perform public.s96_boss();
  perform public.s96_eq(public.s96_notices((v ->> 'reservation_id')::uuid), 'confirmed:email:queued', 'Decisión 153: sin fallo vuelve a haber aviso');
end $$;

-- ------------------------------------------------------------
-- RN-RES-11 · en pausa los avisos siguen; con Reservas cerrada no se avisa
-- ------------------------------------------------------------
do $$
declare
  v_est uuid := 'df000000-0000-0000-0000-000000000023'; v_res uuid := 'df000000-0000-0000-0000-0000000000d2'; v_closed uuid := 'df000000-0000-0000-0000-000000000024';
  v_claim jsonb; v_n uuid;
begin
  -- Cancelar con el servicio en pausa avisa.
  insert into public.reservations (id, space_id, establishment_id, date, time, starts_at, party_size, customer_name, email, language, status, source)
  values (v_res, 'df000000-0000-0000-0000-000000000010', v_est, public.s96_d(12), '21:00',
          (public.s96_d(12) + time '21:00') at time zone 'Europe/Madrid', 2, 'Zacarías Quintanilla', 'zacarias.quintanilla@suite96.test', 'es', 'confirmed', 'manual');
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.cancel_reservation(v_est, v_res, 'customer');
  perform public.s96_boss();
  perform public.s96_eq(public.s96_notices(v_res), 'cancelled:email:queued', 'RN-RES-11: en pausa, cancelar avisa');
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est))::text, '1', 'RN-RES-11: en pausa el aviso sale');

  -- Cerrada: no se crea ningún aviso al encolar...
  insert into public.reservations (id, space_id, establishment_id, date, time, starts_at, party_size, customer_name, email, language, status, source)
  values ('df000000-0000-0000-0000-0000000000e1', 'df000000-0000-0000-0000-000000000010', v_closed, public.s96_d(12), '21:00',
          (public.s96_d(12) + time '21:00') at time zone 'Europe/Madrid', 2, 'Zacarías Quintanilla', 'zacarias.quintanilla@suite96.test', 'es', 'confirmed', 'manual');
  perform public.reservation_log_event(v_closed, 'df000000-0000-0000-0000-0000000000e1', 'cancelled', 'system', null, '{}');
  perform public.s96_eq((select count(*)::text from public.reservation_notifications where reservation_id = 'df000000-0000-0000-0000-0000000000e1'), '0',
    'RN-RES-11: con Reservas cerrada no se crea el aviso');
  -- ...y uno que ya estaba en cola cuando se cerró se descarta al reclamar.
  update public.reservation_settings set service_status = 'active' where establishment_id = v_closed;
  perform public.reservation_log_event(v_closed, 'df000000-0000-0000-0000-0000000000e1', 'cancelled', 'system', null, '{}');
  v_n := public.s96_notice('df000000-0000-0000-0000-0000000000e1');
  perform public.s96_eq(public.s96_notices('df000000-0000-0000-0000-0000000000e1'), 'cancelled:email:queued', 'RN-RES-11: con el servicio activo, aviso');
  update public.reservation_settings set service_status = 'closed', closed_at = now() where establishment_id = v_closed;
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_closed))::text, '0', 'RN-RES-11: cerrada, el reclamo no devuelve nada');
  perform public.s96_eq(public.s96_notices('df000000-0000-0000-0000-0000000000e1'), 'cancelled:email:skipped:obsolete', 'RN-RES-11: queda obsoleto');
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · la anonimización: sin contacto no hay aviso, y el destinatario desaparece
-- ------------------------------------------------------------
do $$
declare
  v_est uuid := 'df000000-0000-0000-0000-000000000024'; v_n uuid; v_res uuid := 'df000000-0000-0000-0000-0000000000e2';
begin
  update public.reservation_settings set service_status = 'active', closed_at = null where establishment_id = v_est;
  insert into public.reservations (id, space_id, establishment_id, date, time, starts_at, party_size, customer_name, email, language, status, source)
  values (v_res, 'df000000-0000-0000-0000-000000000010', v_est, public.s96_d(12), '21:30',
          (public.s96_d(12) + time '21:30') at time zone 'Europe/Madrid', 2, 'Zacarías Quintanilla', 'persona@restaurante-real.es', 'es', 'confirmed', 'manual');
  perform public.reservation_log_event(v_est, v_res, 'cancelled', 'system', null, '{}');
  v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  perform public.s96_eq((select recipient from public.reservation_notifications where id = v_n), 'persona@restaurante-real.es', 'RN-RES-12: el destinatario se guarda al reclamar');
  update public.reservation_settings set service_status = 'closed', closed_at = now() where establishment_id = v_est;
  perform public.reservations_purge(v_est, now());
  perform public.s96_eq((select (recipient is null and anonymized_at is not null)::text from public.reservation_notifications where id = v_n), 'true',
    'RN-RES-12: anonimizar borra el destinatario');
  -- Un aviso en cola de una reserva anonimizada se descarta.
  update public.reservation_settings set service_status = 'active', closed_at = null where establishment_id = v_est;
  insert into public.reservation_notifications (space_id, establishment_id, reservation_id, template, channel, language, status, next_attempt_at)
  values ('df000000-0000-0000-0000-000000000010', v_est, v_res, 'confirmed', 'email', 'es', 'queued', now());
  perform public.s96_eq(jsonb_array_length(public.s96_claim(v_est))::text, '0', 'RN-RES-12: reserva anonimizada → nada sale');
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · ni los eventos, ni la auditoría, ni los incidentes, ni el error guardan datos del comensal
-- ------------------------------------------------------------
do $$
declare
  v_leaks text;
begin
  select string_agg(distinct src, ', ') into v_leaks from (
    select 'reservation_events' as src from public.reservation_events
      where establishment_id::text like 'df000000-%' and data::text ~* 'quintanilla|zacar|suite96|restaurante-real|rebota|@|\+34600|\+351|\+3361'
    union all
    select 'audit_log' from public.audit_log
      where space_id = 'df000000-0000-0000-0000-000000000010'
        and (coalesce(new_value::text, '') || coalesce(old_value::text, '')) ~* 'quintanilla|zacar|suite96|restaurante-real|rebota|\+34600|\+351|\+3361'
    union all
    select 'reservation_incidents' from public.reservation_incidents
      where establishment_id::text like 'df000000-%'
        and (data::text || coalesce(title, '') || coalesce(detail, '')) ~* 'quintanilla|zacar|suite96|restaurante-real|rebota|\+34600|\+351|\+3361'
    union all
    select 'reservation_notifications.error' from public.reservation_notifications
      where establishment_id::text like 'df000000-%' and error is not null and error !~ '^[a-z0-9_.:-]{1,60}$'
  ) s;
  if v_leaks is not null then
    raise exception 'RN-RES-12 FALLIDO: datos de un comensal en %', v_leaks;
  end if;
  -- El CHECK de incidentes lo vigila también por sí solo.
  perform public.s96_expect_error($q$insert into public.reservation_incidents (space_id, establishment_id, kind, severity, title, data)
    values ('df000000-0000-0000-0000-000000000010', 'df000000-0000-0000-0000-000000000020', 'email', 'error', 'x', '{"email": "a@b.es"}')$q$,
    'data_no_personal', 'RN-RES-12: un incidente con datos personales en `data`');
  -- Y el del error de un aviso.
  perform public.s96_expect_error($q$update public.reservation_notifications set error = 'No se pudo enviar a a@b.es' where id = (select id from public.reservation_notifications limit 1)$q$,
    'error_is_code', 'RN-RES-12: un error que no es un código');
  -- Los contactos de los incidentes salen enmascarados.
  perform public.s96_eq(public.reservations_mask_contact('zacarias.quintanilla@suite96.test'), 'z***@s***', 'RN-RES-12: correo enmascarado');
  perform public.s96_eq(public.reservations_mask_contact('+34600777111'), '+34•••••••11', 'RN-RES-12: teléfono enmascarado');
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · privilegios: el destinatario no se lee por API y las funciones internas están cerradas
-- ------------------------------------------------------------
do $$
declare
  v_n integer; v_f text;
begin
  -- La persona propietaria lee los avisos de su restaurante, pero con lista de columnas.
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  select count(*) into v_n from public.reservation_notifications where establishment_id = 'df000000-0000-0000-0000-000000000020';
  if v_n = 0 then
    raise exception 'RN-RES-12 FALLIDO: la propietaria debería ver los avisos de su restaurante';
  end if;
  perform public.s96_expect_error($q$select recipient from public.reservation_notifications$q$, 'permission denied', 'RN-RES-12: leer el destinatario por API');
  perform public.s96_expect_error($q$select provider_message_id from public.reservation_notifications$q$, 'permission denied', 'RN-RES-12: leer el identificador del proveedor');
  perform public.s96_expect_error($q$select error from public.reservation_notifications$q$, 'permission denied', 'RN-RES-12: leer el error');
  perform public.s96_expect_error($q$select * from public.reservation_notifications$q$, 'permission denied', 'RN-RES-12: select * sobre los avisos');
  perform public.s96_expect_error($q$update public.reservation_notifications set status = 'sent'$q$, 'permission denied', 'RN-RES-12: escribir un aviso por API');
  select count(*) into v_n from (select id, template, channel, status, skip_reason, sent_at from public.reservation_notifications limit 5) x;
  perform public.s96_boss();

  -- El administrador del espacio sin sesión de soporte: cero avisos y cero filas de reservas.
  perform public.s96_as('df000000-0000-0000-0000-000000000002', 'aal2');
  select count(*) into v_n from public.reservation_notifications;
  perform public.s96_eq(v_n::text, '0', 'RN-RES-12: el equipo del espacio sin sesión de soporte ve cero avisos');
  perform public.s96_boss();

  -- Un extraño y quien no está en ese restaurante: tampoco.
  perform public.s96_as('df000000-0000-0000-0000-000000000006');
  select count(*) into v_n from public.reservation_notifications;
  perform public.s96_eq(v_n::text, '0', 'RN-RES-12: un extraño ve cero avisos');
  perform public.s96_boss();

  -- Funciones internas y del servidor: ninguna puerta por RPC para quien tiene sesión.
  perform public.s96_as('df000000-0000-0000-0000-000000000004', 'aal2');
  for v_f in select unnest(array[
    $q$select public.claim_reservation_notices('df000000-0000-0000-0000-000000000020')$q$,
    $q$select public.report_reservation_notice(gen_random_uuid(), 1, 'sent')$q$,
    $q$select public.reservation_notice_provider_event(gen_random_uuid(), 'fake', null, 'delivered')$q$,
    $q$select public.reservation_notice_due_establishments()$q$,
    $q$select public.reservation_notices_price_pending()$q$,
    $q$select public.reservation_customer_view('00000000000000000000000000000000')$q$,
    $q$select public.reservation_customer_cancel('00000000000000000000000000000000')$q$,
    $q$select public.reservation_rate_limit_hit('cancel:1', 5, 60)$q$,
    $q$select public.whatsapp_autoreply_context('+34600000000')$q$,
    $q$select public.reservation_notice_prepare(gen_random_uuid(), null, false, false)$q$,
    $q$select public.reservation_notice_settle(gen_random_uuid())$q$,
    $q$select public.reservation_notice_close(gen_random_uuid(), 'failed', 'x')$q$,
    $q$select public.reservation_notice_fail_over(gen_random_uuid())$q$,
    $q$select public.reservation_notice_enqueue(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'created', '{}')$q$,
    $q$select public.reservation_notice_pick_channel('a@b.es', null, false, true, true, true)$q$,
    $q$select public.reservations_open_incident('df000000-0000-0000-0000-000000000020', 'system', 'error', 'x', null, '{}')$q$,
    $q$select public.messaging_rate_micros('sms', 'ES', current_date)$q$,
    $q$select public.reservation_phone_country('+34600000000')$q$,
    $q$select public.reservation_log_event('df000000-0000-0000-0000-000000000020', gen_random_uuid(), 'opened', 'member')$q$
  ]) loop
    perform public.s96_expect_error(v_f, 'permission denied', 'CLAUDE.md: función interna abierta por RPC: ' || left(v_f, 70));
  end loop;
  perform public.s96_boss();
end $$;

-- ------------------------------------------------------------
-- RN-RES-08 · el historial sale en orden: la reserva antes que su aviso
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_types text;
begin
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(80), '21:00', 2, 'Zacarías Quintanilla', '+34955123456');
  v_res := (v ->> 'reservation_id')::uuid;
  select string_agg(h.type, ' > ' order by ord) into v_types
  from public.reservation_history('df000000-0000-0000-0000-000000000020', v_res) with ordinality as h(id, type, actor_type, actor_name, data, created_at, ord);
  perform public.s96_boss();
  perform public.s96_eq(v_types, 'created > notification_skipped', 'RN-RES-08: el historial pone la reserva antes que su aviso');
end $$;

-- ------------------------------------------------------------
-- Decisión 162 y límites de uso
-- ------------------------------------------------------------
do $$
declare
  v_ctx jsonb;
begin
  perform public.s96_server();
  -- WhatsApp a +34600777111 se mandó (prueba anterior, Casa Ana): el contexto sale con su idioma y teléfono.
  v_ctx := public.whatsapp_autoreply_context('+34600777111');
  perform public.s96_eq(v_ctx ->> 'allowed', 'true', 'Decisión 162: primera respuesta de la hora');
  perform public.s96_eq(v_ctx ->> 'found', 'true', 'Decisión 162: se sabe de qué restaurante es');
  perform public.s96_eq(v_ctx ->> 'restaurant_name', 'Casa Ana 96', 'Decisión 162: del restaurante que se lo mandó');
  perform public.s96_eq(v_ctx ->> 'restaurant_phone', '+34955000001', 'Decisión 162: con su teléfono');
  perform public.s96_eq(v_ctx ->> 'language', 'es', 'Decisión 162: en el idioma del último aviso');
  -- Una respuesta por número y hora.
  perform public.s96_eq(public.whatsapp_autoreply_context('+34600777111') ->> 'allowed', 'false', 'Decisión 162: una respuesta por número y hora');
  -- Un número que nunca recibió nada: respuesta genérica.
  v_ctx := public.whatsapp_autoreply_context('+34611000000');
  perform public.s96_eq(v_ctx ->> 'allowed' || ':' || (v_ctx ->> 'found'), 'true:false', 'Decisión 162: sin restaurante conocido, texto genérico');
  -- Teléfono mal formado: nada.
  perform public.s96_eq(public.whatsapp_autoreply_context('34611000000') ->> 'allowed', 'false', 'Decisión 162: un número mal formado no recibe respuesta');
  -- El límite de uso: cubos con nombre fijo, ventana y máximo.
  perform public.s96_eq(public.reservation_rate_limit_hit('cancel:7', 2, 60)::text, 'true', 'Límite: primer intento');
  perform public.s96_eq(public.reservation_rate_limit_hit('cancel:7', 2, 60)::text, 'true', 'Límite: segundo intento');
  perform public.s96_eq(public.reservation_rate_limit_hit('cancel:7', 2, 60)::text, 'false', 'Límite: el tercero se pasa');
  perform public.s96_expect_error($q$select public.reservation_rate_limit_hit('cualquier cosa', 2, 60)$q$, 'Cubo', 'Límite: un cubo con nombre libre');
  perform public.s96_boss();
  update public.reservations_rate_limits set window_start = now() - interval '2 minutes' where bucket = 'cancel:7';
  perform public.s96_server();
  perform public.s96_eq(public.reservation_rate_limit_hit('cancel:7', 2, 60)::text, 'true', 'Límite: pasada la ventana, se reinicia');
  perform public.s96_boss();
end $$;

-- ------------------------------------------------------------
-- Precio pendiente del SMS: solo los de proveedor real, desde 2 minutos, cada 10, hasta 20 veces
-- ------------------------------------------------------------
do $$
declare
  v_n uuid; v_cnt integer; v_est uuid := 'df000000-0000-0000-0000-000000000025'; v_res uuid; v jsonb;
begin
  perform public.s96_boss();
  update public.reservation_settings set notify_whatsapp = false where establishment_id = v_est;
  perform public.s96_server();
  v := public.s96_book(public.s96_d(56), '21:00', 2, 'Zacarías Quintanilla', '+34600321321', null, 'web', 'es', v_est, null, true);
  perform public.s96_boss();
  v_res := (v ->> 'reservation_id')::uuid; v_n := public.s96_notice(v_res);
  perform public.s96_claim(v_est);
  perform public.s96_report(v_n, 1, 'sent', 'sms', 'SMpend');
  perform public.s96_server();
  select count(*) into v_cnt from public.reservation_notices_price_pending() where notice_id = v_n;
  perform public.s96_eq(v_cnt::text, '0', 'AVI-06: antes de 2 minutos no se consulta el precio');
  perform public.s96_boss();
  update public.reservation_notifications set sent_at = now() - interval '3 minutes' where id = v_n;
  perform public.s96_server();
  select count(*) into v_cnt from public.reservation_notices_price_pending() where notice_id = v_n;
  perform public.s96_eq(v_cnt::text, '1', 'AVI-06: pasados 2 minutos, se consulta');
  select count(*) into v_cnt from public.reservation_notices_price_pending() where notice_id = v_n;
  perform public.s96_eq(v_cnt::text, '0', 'AVI-06: no se vuelve a consultar hasta 10 minutos después');
  perform public.s96_boss();
  update public.reservation_notifications set price_checked_at = now() - interval '11 minutes', price_checks = 20 where id = v_n;
  perform public.s96_server();
  select count(*) into v_cnt from public.reservation_notices_price_pending() where notice_id = v_n;
  perform public.s96_eq(v_cnt::text, '0', 'AVI-06: tras 20 consultas se deja de consultar');
  perform public.s96_boss();
  -- Los de proveedor falso no se consultan nunca.
  update public.reservation_notifications set price_checks = 0, provider = 'fake' where id = v_n;
  perform public.s96_server();
  select count(*) into v_cnt from public.reservation_notices_price_pending() where notice_id = v_n;
  perform public.s96_eq(v_cnt::text, '0', 'AVI-06: el proveedor falso no consulta precios');
  perform public.s96_boss();
  update public.reservation_settings set notify_whatsapp = true where establishment_id = v_est;
end $$;

-- ------------------------------------------------------------
-- Decisión 159 · Pruebas › Mensajes: solo los de proveedor falso, solo para quien gestiona clientes en Restavor
-- ------------------------------------------------------------
do $$
declare
  v jsonb; v_res uuid; v_n uuid; v_real uuid; v_est uuid := 'df000000-0000-0000-0000-000000000020';
  v_space uuid := 'df000000-0000-0000-0000-000000000010'; v_list jsonb;
begin
  perform public.s96_clear(v_est);
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(57), '21:00', 2, 'Zacarías Quintanilla', null, 'zacarias.quintanilla@suite96.test');
  v_res := (v ->> 'reservation_id')::uuid;
  v := public.s96_book(public.s96_d(57), '21:30', 2, 'Zacarías Quintanilla', null, 'otro.comensal@suite96.test');
  perform public.s96_boss();
  v_n := public.s96_notice(v_res);
  v_real := public.s96_notice((v ->> 'reservation_id')::uuid);
  perform public.s96_claim(v_est);
  perform public.s96_report(v_n, 1, 'sent', 'fake', 'fake_email_1');
  perform public.s96_report(v_real, 1, 'sent', 'resend', 'em_real');

  -- Un extraño y la propietaria del restaurante (que no es del equipo de Restavor) no los ven.
  perform public.s96_as('df000000-0000-0000-0000-000000000006');
  perform public.s96_expect_error(format($q$select public.reservation_fake_notices(%L)$q$, v_space), 'permiso', 'Decisión 159: un extraño ve los mensajes de prueba');
  perform public.s96_expect_error(format($q$select public.reservation_fake_notice_event(%L, 'delivered')$q$, v_n), 'permiso', 'Decisión 159: un extraño simula un suceso');
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  perform public.s96_expect_error(format($q$select public.reservation_fake_notices(%L)$q$, v_space), 'permiso', 'Decisión 159: la propietaria del restaurante no es del equipo de Restavor');
  perform public.s96_boss();

  -- Quien gestiona clientes en Restavor (la dueña del espacio) los ve, y solo los de proveedor falso.
  perform public.s96_as('df000000-0000-0000-0000-000000000001');
  v_list := public.reservation_fake_notices(v_space);
  perform public.s96_eq((select count(*)::text from jsonb_array_elements(v_list) i where i ->> 'notice_id' = v_real::text), '0',
    'Decisión 159: un aviso real no sale en la lista');
  v_list := (select jsonb_agg(i) from jsonb_array_elements(v_list) i where i ->> 'notice_id' = v_n::text);
  perform public.s96_eq(jsonb_array_length(v_list)::text, '1', 'Decisión 159: el aviso de proveedor falso sale');
  perform public.s96_eq(v_list -> 0 ->> 'template', 'confirmed', 'Decisión 159: con su plantilla');
  perform public.s96_eq(v_list -> 0 ->> 'recipient', 'zacarias.quintanilla@suite96.test', 'Decisión 159: y su destinatario (es una prueba)');
  perform public.s96_eq(v_list -> 0 -> 'restaurant' ->> 'phone', '+34955000001', 'Decisión 159: con lo del restaurante para redactar');
  perform public.s96_eq(length(v_list -> 0 ->> 'link_token')::text, '32', 'Decisión 159: y el enlace');

  -- Simular que se entregó; y no se puede sobre un aviso que no es de proveedor falso.
  perform public.s96_eq(public.reservation_fake_notice_event(v_n, 'delivered') ->> 'outcome', 'delivered', 'Decisión 159: simular entregado');
  perform public.s96_expect_error(format($q$select public.reservation_fake_notice_event(%L, 'delivered')$q$, v_real), 'prueba', 'Decisión 159: simular sobre un aviso real');
  perform public.s96_expect_error(format($q$select public.reservation_fake_notice_event(%L, 'inventado')$q$, v_n), 'Suceso', 'Decisión 159: un suceso inventado');
  perform public.s96_boss();
  perform public.s96_eq((select status from public.reservation_notifications where id = v_n), 'delivered', 'Decisión 159: el aviso queda entregado');
  perform public.s96_eq((select status from public.reservation_notifications where id = v_real), 'sent', 'Decisión 159: el real no se tocó');
end $$;

-- ------------------------------------------------------------
-- Los restaurantes con avisos pendientes
-- ------------------------------------------------------------
do $$
declare
  v_n integer; v jsonb;
begin
  perform public.s96_as('df000000-0000-0000-0000-000000000004');
  v := public.s96_book(public.s96_d(57), '22:00', 2, 'Zacarías Quintanilla', null, 'tercero@suite96.test');
  perform public.s96_boss();
  perform public.s96_server();
  select count(*) into v_n from public.reservation_notice_due_establishments(200)
  where establishment_id::text like 'df000000-%';
  perform public.s96_boss();
  if v_n < 1 then
    raise exception 'Decisión 155: los restaurantes con avisos por enviar deberían aparecer';
  end if;
  -- Ningún aviso en cola vencido queda fuera por error: contar con lo que hay.
  perform public.s96_eq((select count(distinct establishment_id)::text from public.reservation_notifications
                         where status = 'queued' and next_attempt_at <= now() and establishment_id::text like 'df000000-%'),
    (select count(*)::text from public.reservation_notice_due_establishments(200) where establishment_id::text like 'df000000-%'),
    'Decisión 155: cada restaurante con avisos vencidos aparece una vez');
end $$;

rollback;
