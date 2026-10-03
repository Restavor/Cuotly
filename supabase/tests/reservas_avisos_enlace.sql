-- ============================================================
-- Suite 97 · El enlace del comensal (`/c/[token]`)
--            (Fase F de agents; migración 179; RN-RES-08, RN-RES-10, RN-RES-11, RN-RES-12; decisiones 154 y 158)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · Decisión 154 · el enlace usa los 32 primeros caracteres del token (128 bits) y son únicos; un token mal
--     formado, en mayúsculas o desconocido no encuentra nada; ver no escribe nada.
--   · RN-RES-12 · la vista del comensal no devuelve más que lo suyo y lo público del restaurante (ni su teléfono ni su
--     correo ni el token entero).
--   · RN-RES-08 · cancelar desde el enlace: plazo exacto (`hora − plazo`, inclusivo), actor `customer`, motivo
--     `customer_link`, repetir no duplica el efecto, ni el evento ni el aviso; el restaurante y el comensal a la vez
--     dejan un evento y un aviso.
--   · RN-RES-10 · cancelar desde el enlace también avisa («reserva cancelada»); una solicitud pendiente se puede
--     cancelar; una rechazada o ya cancelada se dice como tal.
--   · RN-RES-11 · en pausa el enlace funciona; con Reservas cerrada, no (decisión 158).
--   · Una reserva de plataforma no tiene enlace, ni una anonimizada.
--   · Privilegios: solo el servidor (`service_role`) llama a estas funciones.
--
-- Prefijo de esta suite: df100000-.

begin;

set local role postgres;

insert into auth.users (id, email, role, aud) values
  ('df100000-0000-0000-0000-000000000001', 'duena@suite97.test', 'authenticated', 'authenticated'),
  ('df100000-0000-0000-0000-000000000004', 'propietario-a@suite97.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('df100000-0000-0000-0000-000000000001', 'duena@suite97.test', 'Dueña 97'),
  ('df100000-0000-0000-0000-000000000004', 'propietario-a@suite97.test', 'Propietario A 97')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled) values
  ('df100000-0000-0000-0000-000000000010', 'Espacio 97', 'espacio-97', 'Europe/Madrid',
   'df100000-0000-0000-0000-000000000001', false);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('df100000-0000-0000-0000-000000000015', 'df100000-0000-0000-0000-000000000010', 'Grupo 97');

-- A: activa · B: en pausa · C: cerrada.
insert into public.establishments (id, space_id, group_id, code, name, status, address, city) values
  ('df100000-0000-0000-0000-000000000020', 'df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000015', 'R97A', 'Casa Ana 97', 'active', 'Calle Uno 1, 41001', 'Sevilla'),
  ('df100000-0000-0000-0000-000000000021', 'df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000015', 'R97B', 'Bar Blas 97', 'active', 'Calle Dos 2, 41002', 'Sevilla'),
  ('df100000-0000-0000-0000-000000000022', 'df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000015', 'R97C', 'Café Cuca 97', 'active', 'Calle Tres 3, 41003', 'Sevilla');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('df100000-0000-0000-0000-000000000040', 'df100000-0000-0000-0000-000000000020', 'df100000-0000-0000-0000-000000000004', 'local_owner');

insert into public.reservation_settings (id, space_id, establishment_id, service_status, public_slug, local_phone_e164, customer_cancel_limit_minutes) values
  ('df100000-0000-0000-0000-000000000060', 'df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000020', 'active', 'casa-ana-97', '+34955000001', 120),
  ('df100000-0000-0000-0000-000000000061', 'df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000021', 'paused', 'bar-blas-97', '+34955000002', 120),
  ('df100000-0000-0000-0000-000000000062', 'df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000022', 'closed', 'cafe-cuca-97', '+34955000003', 120);

insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros)
values ('df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000020', 'topup', 5000000);

-- ------------------------------------------------------------
-- Ayudantes del test
-- ------------------------------------------------------------
create function public.s97_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function public.s97_server() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
end $$;

create function public.s97_boss() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'set local role postgres';
end $$;

create function public.s97_eq(p_actual text, p_expected text, p_what text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '% FALLIDO: %  (esperado %)', p_what, coalesce(p_actual, 'nulo'), coalesce(p_expected, 'nulo');
  end if;
end $$;

create function public.s97_expect_error(p_sql text, p_pattern text, p_what text) returns void
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

-- Una reserva directa (como postgres): su `starts_at` es lo que cuenta para el plazo.
create function public.s97_res(
  p_id uuid, p_est uuid, p_starts timestamptz, p_status text default 'confirmed', p_source text default 'manual',
  p_email text default 'zacarias.quintanilla@suite97.test', p_cancel_reason text default null
) returns uuid
language plpgsql as $$
begin
  insert into public.reservations (id, space_id, establishment_id, date, time, starts_at, party_size, customer_name, email, language, status,
                                   source, platform_name, cancel_reason, cancelled_at)
  values (p_id, 'df100000-0000-0000-0000-000000000010', p_est, (p_starts at time zone 'Europe/Madrid')::date,
          (p_starts at time zone 'Europe/Madrid')::time, p_starts, 3, 'Zacarías Quintanilla', p_email, 'es', p_status, p_source,
          case when p_source = 'platform' then 'TheFork' end, p_cancel_reason, case when p_status = 'cancelled' then now() end);
  return p_id;
end $$;

create function public.s97_token(p_id uuid) returns text
language sql stable as $$ select left(cancel_token, 32) from public.reservations where id = p_id $$;

create function public.s97_notices(p_res uuid) returns text
language sql stable as $$
  select coalesce(string_agg(template || ':' || coalesce(channel, '-') || ':' || status || coalesce(':' || skip_reason, ''), ' | ' order by created_at, id), '')
  from public.reservation_notifications where reservation_id = p_res
$$;

create function public.s97_view(p_token text) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform public.s97_server();
  v := public.reservation_customer_view(p_token);
  perform public.s97_boss();
  return v;
end $$;

create function public.s97_cancel(p_token text) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform public.s97_server();
  v := public.reservation_customer_cancel(p_token);
  perform public.s97_boss();
  return v;
end $$;

grant execute on function
  public.s97_as(uuid, text), public.s97_server(), public.s97_boss(), public.s97_eq(text, text, text),
  public.s97_expect_error(text, text, text),
  public.s97_res(uuid, uuid, timestamptz, text, text, text, text), public.s97_token(uuid), public.s97_notices(uuid),
  public.s97_view(text), public.s97_cancel(text)
to authenticated, service_role;

-- ------------------------------------------------------------
-- Decisión 154 · el token del enlace: 32 caracteres, únicos, y solo en minúsculas hexadecimales
-- ------------------------------------------------------------
do $$
declare
  v_a uuid; v_tok text;
begin
  v_a := public.s97_res('df100000-0000-0000-0000-0000000000a1', 'df100000-0000-0000-0000-000000000020', now() + interval '5 days');
  v_tok := public.s97_token(v_a);
  perform public.s97_eq(length(v_tok)::text, '32', 'Decisión 154: el enlace es de 32 caracteres');
  perform public.s97_eq((v_tok ~ '^[0-9a-f]{32}$')::text, 'true', 'Decisión 154: hexadecimal en minúsculas');
  perform public.s97_eq((public.s97_view(v_tok) ->> 'found'), 'true', 'Decisión 154: el enlace encuentra la reserva');
  -- Mal formado, en mayúsculas, demasiado corto, demasiado largo, nulo y desconocido: nada.
  perform public.s97_eq((public.s97_view(upper(v_tok)) ->> 'found'), 'false', 'Decisión 154: en mayúsculas no encuentra nada');
  perform public.s97_eq((public.s97_view(left(v_tok, 31)) ->> 'found'), 'false', 'Decisión 154: demasiado corto');
  perform public.s97_eq((public.s97_view(v_tok || 'a') ->> 'found'), 'false', 'Decisión 154: demasiado largo');
  perform public.s97_eq((public.s97_view('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz') ->> 'found'), 'false', 'Decisión 154: no hexadecimal');
  perform public.s97_eq((public.s97_view(null) ->> 'found'), 'false', 'Decisión 154: nulo');
  perform public.s97_eq((public.s97_view('00000000000000000000000000000000') ->> 'found'), 'false', 'Decisión 154: desconocido');
  perform public.s97_eq((public.s97_cancel('00000000000000000000000000000000') ->> 'outcome'), 'not_found', 'Decisión 154: cancelar un desconocido');
  perform public.s97_eq((public.s97_cancel(null) ->> 'outcome'), 'not_found', 'Decisión 154: cancelar con nulo');
  -- El índice único sobre los 32 primeros impide dos enlaces iguales.
  perform public.s97_expect_error(
    format($q$insert into public.reservations (space_id, establishment_id, date, time, starts_at, party_size, customer_name, email, language, status, source, cancel_token)
      values ('df100000-0000-0000-0000-000000000010', 'df100000-0000-0000-0000-000000000020', current_date, '21:00', now(), 2, 'X', 'x@y.es', 'es', 'confirmed', 'manual', %L)$q$,
      v_tok || repeat('0', 32)),
    'duplicate|unique|único', 'Decisión 154: dos reservas con el mismo enlace');
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · lo que ve el comensal: lo suyo y lo público del restaurante, y ver no escribe nada
-- ------------------------------------------------------------
do $$
declare
  v_tok text := public.s97_token('df100000-0000-0000-0000-0000000000a1'); v jsonb;
  v_ev bigint; v_nt bigint; v_rl bigint;
begin
  select count(*) into v_ev from public.reservation_events;
  select count(*) into v_nt from public.reservation_notifications;
  select count(*) into v_rl from public.reservations_rate_limits;
  v := public.s97_view(v_tok);
  perform public.s97_eq(v ->> 'status', 'confirmed', 'RN-RES-08: estado');
  perform public.s97_eq(v ->> 'can_cancel', 'true', 'RN-RES-08: se puede cancelar a cinco días');
  perform public.s97_eq(v ->> 'party_size', '3', 'RN-RES-08: personas');
  perform public.s97_eq(v ->> 'customer_name', 'Zacarías Quintanilla', 'RN-RES-08: su nombre');
  perform public.s97_eq(v ->> 'language', 'es', 'RN-RES-08: idioma');
  perform public.s97_eq(v ->> 'service_status', 'active', 'RN-RES-08: servicio');
  perform public.s97_eq(v -> 'restaurant' ->> 'name', 'Casa Ana 97', 'RN-RES-08: restaurante');
  perform public.s97_eq(v -> 'restaurant' ->> 'city', 'Sevilla', 'RN-RES-08: ciudad');
  perform public.s97_eq(v -> 'restaurant' ->> 'phone', '+34955000001', 'RN-RES-08: teléfono del restaurante');
  perform public.s97_eq(v -> 'restaurant' ->> 'address', 'Calle Uno 1, 41001', 'RN-RES-08: dirección');
  -- Nada del contacto del comensal ni el token entero.
  if (v::text) ~* 'suite97|cancel_token|"email"|"phone_e164"|\+346' then
    raise exception 'RN-RES-12 FALLIDO: la vista del comensal devuelve su contacto o el token: %', v;
  end if;
  perform public.s97_eq((select count(*) from public.reservation_events)::text, v_ev::text, 'Decisión 154: ver no escribe eventos');
  perform public.s97_eq((select count(*) from public.reservation_notifications)::text, v_nt::text, 'Decisión 154: ver no escribe avisos');
  perform public.s97_eq((select count(*) from public.reservations_rate_limits)::text, v_rl::text, 'Decisión 154: ver no cuenta intentos');
end $$;

-- ------------------------------------------------------------
-- RN-RES-08 · cancelar desde el enlace: actor `customer`, motivo `customer_link`, repetir no duplica; y también avisa
-- ------------------------------------------------------------
do $$
declare
  v_res uuid := 'df100000-0000-0000-0000-0000000000a1'; v_tok text; v jsonb;
begin
  v_tok := public.s97_token(v_res);
  v := public.s97_cancel(v_tok);
  perform public.s97_eq(v ->> 'outcome', 'cancelled', 'RN-RES-08: se cancela desde el enlace');
  perform public.s97_eq(v ->> 'establishment_id', 'df100000-0000-0000-0000-000000000020', 'AVI-01: el servidor recibe el restaurante para enviar el aviso al momento');
  perform public.s97_eq((select status || ':' || cancel_reason from public.reservations where id = v_res), 'cancelled:customer_link', 'RN-RES-08: motivo customer_link');
  perform public.s97_eq((select (cancelled_at is not null)::text from public.reservations where id = v_res), 'true', 'RN-RES-08: hora de la cancelación');
  perform public.s97_eq((select actor_type || ':' || coalesce(actor_label, '-') from public.reservation_events where reservation_id = v_res and type = 'cancelled'),
    'customer:Cliente', 'RN-RES-08: el actor es el cliente');
  perform public.s97_eq((select data ->> 'reason' from public.reservation_events where reservation_id = v_res and type = 'cancelled'), 'customer_link', 'RN-RES-08: el evento dice el motivo');
  perform public.s97_eq((select count(*)::text from public.reservation_events where reservation_id = v_res and type = 'cancelled'), '1', 'RN-RES-08: un evento');
  perform public.s97_eq(public.s97_notices(v_res), 'cancelled:email:queued', 'RN-RES-10: cancelar desde el enlace también avisa');
  -- Repetir no duplica el efecto, ni el evento ni el aviso.
  perform public.s97_eq((public.s97_cancel(v_tok) ->> 'outcome'), 'already_cancelled', 'RN-RES-08: repetir lo dice');
  perform public.s97_eq((public.s97_cancel(v_tok) ->> 'cancel_reason'), 'customer_link', 'RN-RES-08: y con su motivo');
  perform public.s97_eq((select count(*)::text from public.reservation_events where reservation_id = v_res and type = 'cancelled'), '1', 'RN-RES-08: repetir no duplica el evento');
  perform public.s97_eq(public.s97_notices(v_res), 'cancelled:email:queued', 'RN-RES-10: repetir no duplica el aviso');
  -- La vista de una cancelada lo cuenta y ya no deja cancelar.
  v := public.s97_view(v_tok);
  perform public.s97_eq(v ->> 'status' || ':' || (v ->> 'can_cancel') || ':' || (v ->> 'cancel_reason'), 'cancelled:false:customer_link', 'RN-RES-08: la vista de una cancelada');
  -- Auditoría sin datos personales.
  perform public.s97_eq((select count(*)::text from public.audit_log where space_id = 'df100000-0000-0000-0000-000000000010'
                         and (coalesce(new_value::text, '') || coalesce(old_value::text, '')) ~* 'quintanilla|suite97'), '0', 'RN-RES-12: la auditoría no guarda datos del comensal');
end $$;

-- ------------------------------------------------------------
-- RN-RES-08 · el plazo exacto: `hora − plazo`, inclusivo
-- ------------------------------------------------------------
do $$
declare
  v_ok uuid; v_late uuid; v_limit interval := interval '120 minutes'; v jsonb;
begin
  -- Justo en el plazo: se puede. Un segundo después: no.
  v_ok := public.s97_res('df100000-0000-0000-0000-0000000000b1', 'df100000-0000-0000-0000-000000000020', now() + v_limit);
  v_late := public.s97_res('df100000-0000-0000-0000-0000000000b2', 'df100000-0000-0000-0000-000000000020', now() + v_limit - interval '1 second');
  perform public.s97_eq((public.s97_view(public.s97_token(v_ok)) ->> 'can_cancel'), 'true', 'RN-RES-08: en el instante exacto del plazo, la vista dice que se puede');
  perform public.s97_eq((public.s97_view(public.s97_token(v_late)) ->> 'can_cancel'), 'false', 'RN-RES-08: un segundo después, la vista dice que no');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_late)) ->> 'outcome'), 'deadline_passed', 'RN-RES-08: pasado el plazo no se cancela');
  perform public.s97_eq((select status from public.reservations where id = v_late), 'confirmed', 'RN-RES-08: y la reserva sigue');
  perform public.s97_eq((select count(*)::text from public.reservation_events where reservation_id = v_late and type = 'cancelled'), '0', 'RN-RES-08: sin evento');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_ok)) ->> 'outcome'), 'cancelled', 'RN-RES-08: en el instante exacto del plazo se cancela');
  -- El plazo es el de cada restaurante.
  update public.reservation_settings set customer_cancel_limit_minutes = 30 where establishment_id = 'df100000-0000-0000-0000-000000000020';
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_late)) ->> 'outcome'), 'cancelled', 'RN-RES-08: con un plazo de 30 minutos, a dos horas, sí');
  update public.reservation_settings set customer_cancel_limit_minutes = 120 where establishment_id = 'df100000-0000-0000-0000-000000000020';
  -- Una reserva pasada no se cancela.
  v_late := public.s97_res('df100000-0000-0000-0000-0000000000b3', 'df100000-0000-0000-0000-000000000020', now() - interval '2 hours');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_late)) ->> 'outcome'), 'deadline_passed', 'RN-RES-08: una reserva pasada no se cancela');
end $$;

-- ------------------------------------------------------------
-- RN-RES-10 · cada estado: pendiente se cancela, rechazada y «no vino» no, cancelada se dice
-- ------------------------------------------------------------
do $$
declare
  v_p uuid; v_r uuid; v_n uuid;
begin
  v_p := public.s97_res('df100000-0000-0000-0000-0000000000c1', 'df100000-0000-0000-0000-000000000020', now() + interval '4 days', 'pending');
  perform public.s97_eq((public.s97_view(public.s97_token(v_p)) ->> 'can_cancel'), 'true', 'RN-RES-10: una solicitud pendiente se puede cancelar');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_p)) ->> 'outcome'), 'cancelled', 'RN-RES-10: se cancela la solicitud');
  perform public.s97_eq(public.s97_notices(v_p), 'cancelled:email:queued', 'RN-RES-10: y se avisa');

  v_r := public.s97_res('df100000-0000-0000-0000-0000000000c2', 'df100000-0000-0000-0000-000000000020', now() + interval '4 days', 'cancelled', 'manual',
                        'zacarias.quintanilla@suite97.test', 'rejected');
  perform public.s97_eq((public.s97_view(public.s97_token(v_r)) ->> 'cancel_reason'), 'rejected', 'RN-RES-10: la vista dice «rechazada»');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_r)) ->> 'outcome'), 'already_cancelled', 'RN-RES-10: una rechazada no se cancela');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_r)) ->> 'cancel_reason'), 'rejected', 'RN-RES-10: y se sabe por qué');

  v_n := public.s97_res('df100000-0000-0000-0000-0000000000c3', 'df100000-0000-0000-0000-000000000020', now() + interval '4 days', 'no_show');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_n)) ->> 'outcome'), 'not_cancellable', 'RN-RES-10: «no vino» no se cancela');
  perform public.s97_eq((public.s97_view(public.s97_token(v_n)) ->> 'can_cancel'), 'false', 'RN-RES-10: la vista tampoco lo deja');
end $$;

-- ------------------------------------------------------------
-- RN-RES-08 · el restaurante y el comensal a la vez: un evento y un aviso
-- ------------------------------------------------------------
do $$
declare
  v_res uuid; v_tok text;
begin
  v_res := public.s97_res('df100000-0000-0000-0000-0000000000d1', 'df100000-0000-0000-0000-000000000020', now() + interval '6 days');
  v_tok := public.s97_token(v_res);
  perform public.s97_as('df100000-0000-0000-0000-000000000004');
  perform public.cancel_reservation('df100000-0000-0000-0000-000000000020', v_res, 'customer');
  perform public.s97_boss();
  perform public.s97_eq((public.s97_cancel(v_tok) ->> 'outcome'), 'already_cancelled', 'RN-RES-08: si el restaurante ya la canceló, el enlace lo dice');
  perform public.s97_eq((select count(*)::text from public.reservation_events where reservation_id = v_res and type = 'cancelled'), '1', 'RN-RES-08: un solo evento de cancelación');
  perform public.s97_eq(public.s97_notices(v_res), 'cancelled:email:queued', 'RN-RES-10: un solo aviso');
  perform public.s97_eq((select cancel_reason from public.reservations where id = v_res), 'customer', 'RN-RES-08: queda el motivo del restaurante');

  -- Al revés: primero el enlace, después el restaurante.
  v_res := public.s97_res('df100000-0000-0000-0000-0000000000d2', 'df100000-0000-0000-0000-000000000020', now() + interval '6 days');
  perform public.s97_cancel(public.s97_token(v_res));
  perform public.s97_as('df100000-0000-0000-0000-000000000004');
  perform public.cancel_reservation('df100000-0000-0000-0000-000000000020', v_res, 'customer');
  perform public.s97_boss();
  perform public.s97_eq((select count(*)::text from public.reservation_events where reservation_id = v_res and type = 'cancelled'), '1', 'RN-RES-08: primero el enlace, después el restaurante: un evento');
  perform public.s97_eq(public.s97_notices(v_res), 'cancelled:email:queued', 'RN-RES-10: y un aviso');
end $$;

-- ------------------------------------------------------------
-- RN-RES-11 · en pausa el enlace funciona; con Reservas cerrada, no
-- ------------------------------------------------------------
do $$
declare
  v_p uuid; v_c uuid;
begin
  v_p := public.s97_res('df100000-0000-0000-0000-0000000000e1', 'df100000-0000-0000-0000-000000000021', now() + interval '3 days');
  perform public.s97_eq((public.s97_view(public.s97_token(v_p)) ->> 'can_cancel'), 'true', 'RN-RES-11: en pausa el enlace deja cancelar');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_p)) ->> 'outcome'), 'cancelled', 'RN-RES-11: y cancela');

  v_c := public.s97_res('df100000-0000-0000-0000-0000000000e2', 'df100000-0000-0000-0000-000000000022', now() + interval '3 days');
  perform public.s97_eq((public.s97_view(public.s97_token(v_c)) ->> 'service_status'), 'closed', 'Decisión 158: la vista dice «cerrado»');
  perform public.s97_eq((public.s97_view(public.s97_token(v_c)) ->> 'can_cancel'), 'false', 'Decisión 158: con Reservas cerrada no deja cancelar');
  perform public.s97_eq((public.s97_view(public.s97_token(v_c)) -> 'restaurant' ->> 'phone'), '+34955000003', 'Decisión 158: y da el teléfono para llamar');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_c)) ->> 'outcome'), 'closed', 'Decisión 158: y no cancela');
  perform public.s97_eq((select status from public.reservations where id = v_c), 'confirmed', 'Decisión 158: la reserva sigue');
end $$;

-- ------------------------------------------------------------
-- Una reserva de plataforma no tiene enlace, ni una anonimizada
-- ------------------------------------------------------------
do $$
declare
  v_pl uuid; v_an uuid;
begin
  v_pl := public.s97_res('df100000-0000-0000-0000-0000000000f1', 'df100000-0000-0000-0000-000000000020', now() + interval '5 days', 'confirmed', 'platform');
  perform public.s97_eq((public.s97_view(public.s97_token(v_pl)) ->> 'found'), 'false', 'RN-RES-10: una de plataforma no tiene enlace');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_pl)) ->> 'outcome'), 'not_found', 'RN-RES-10: ni se cancela por él');
  perform public.s97_eq((select status from public.reservations where id = v_pl), 'confirmed', 'RN-RES-10: sigue confirmada');

  v_an := public.s97_res('df100000-0000-0000-0000-0000000000f2', 'df100000-0000-0000-0000-000000000020', now() + interval '5 days');
  update public.reservations set customer_name = 'Anónimo', email = null, anonymized_at = now() where id = v_an;
  perform public.s97_eq((public.s97_view(public.s97_token(v_an)) ->> 'found'), 'false', 'RN-RES-12: una anonimizada no se encuentra');
  perform public.s97_eq((public.s97_cancel(public.s97_token(v_an)) ->> 'outcome'), 'not_found', 'RN-RES-12: ni se cancela');
end $$;

-- ------------------------------------------------------------
-- Privilegios: solo el servidor llama a estas funciones
-- ------------------------------------------------------------
do $$
declare
  v_f text;
begin
  perform public.s97_as('df100000-0000-0000-0000-000000000004', 'aal2');
  for v_f in select unnest(array[
    $q$select public.reservation_customer_view('00000000000000000000000000000000')$q$,
    $q$select public.reservation_customer_cancel('00000000000000000000000000000000')$q$
  ]) loop
    perform public.s97_expect_error(v_f, 'permission denied', 'Privilegios: una persona con sesión llama a ' || left(v_f, 40));
  end loop;
  perform public.s97_boss();
  -- Sin sesión (anon).
  execute 'set local role anon';
  perform public.s97_expect_error($q$select public.reservation_customer_view('00000000000000000000000000000000')$q$, 'permission denied', 'Privilegios: anon llama a la vista');
  perform public.s97_expect_error($q$select public.reservation_customer_cancel('00000000000000000000000000000000')$q$, 'permission denied', 'Privilegios: anon cancela');
  perform public.s97_boss();
end $$;

rollback;
