-- Fase E2 de Restavor agents · correcciones de la revisión independiente (migración 176 ya subida).
--
--   1 · El soporte de plataforma con una sesión de Reservas abierta en ESE restaurante también lee el saldo
--       (`agent_balance()` y `agent_balance_can_read()` usaban solo la puerta de espacio; la política del libro,
--       la de restaurante). PRD §3.2: «Soporte (en sesión): sí».
--   2 · El libro del saldo no se vacía con `TRUNCATE` (tenía disparador de UPDATE y DELETE, no de TRUNCATE, y
--       `service_role` tiene el privilegio).
--   3 · El aviso de saldo sale también cuando varios apuntes entran en una sola sentencia (el disparador por
--       fila veía todos los apuntes de la sentencia ya sumados): pasa a ser por sentencia, con tabla de transición.
--   4 · Una clave de idempotencia repetida devuelve el MISMO apunte; una clave usada para otra operación o con otro
--       importe da error, no el apunte ajeno.
--   5 · Un pago de Stripe que no cuadra deja UN incidente abierto por recarga, no uno por reintento.
--   6 · El umbral de saldo bajo es configurable por Restavor (RN-AGT-05 lo decía y no había cómo).
--   7 · Reabrir un cierre vuelve a armar también el aviso de saldo agotado.
--
-- Se comprueba con `supabase/tests/reservas_saldo.sql` (bloque «correcciones de la revisión»).

-- ------------------------------------------------------------
-- 2 · Ni TRUNCATE
-- ------------------------------------------------------------
create or replace function public.agent_balance_entries_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'El libro del saldo no se vacía: una corrección es otro apunte (RN-AGT-01)';
  end if;

  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'El libro del saldo no se borra: una corrección es otro apunte (RN-AGT-01)';
  end if;

  if coalesce(current_setting('restavor.ledger_move', true), '') = 'on'
     and (to_jsonb(new) - 'space_id') = (to_jsonb(old) - 'space_id') then
    return new;
  end if;
  raise exception 'El libro del saldo no se edita: una corrección es otro apunte (RN-AGT-01)';
end;
$$;

revoke all on function public.agent_balance_entries_immutable() from public, anon, authenticated;

create trigger agent_balance_entries_no_truncate
  before truncate on public.agent_balance_entries
  for each statement execute function public.agent_balance_entries_immutable();

-- ------------------------------------------------------------
-- 3 · El aviso de saldo, por sentencia
-- ------------------------------------------------------------
drop trigger agent_balance_entries_alerts on public.agent_balance_entries;

create or replace function public.agent_balance_entries_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_set public.reservation_settings;
  v_after bigint;
  v_before bigint;
  v_threshold bigint;
  v_key_tail text;
begin
  -- Un restaurante por vuelta, en orden: dos sentencias a la vez bloquean las filas de ajustes en el mismo orden.
  for v_row in
    select n.establishment_id, sum(n.amount_micros)::bigint as delta, (array_agg(n.id order by n.id))[1] as first_id
    from new_rows n
    group by n.establishment_id
    order by n.establishment_id
  loop
    select * into v_set from public.reservation_settings where establishment_id = v_row.establishment_id for update;
    if v_set.id is null or v_set.service_status not in ('active', 'past_due', 'paused', 'ending') then
      continue;
    end if;

    select coalesce(sum(e.amount_micros), 0)::bigint into v_after
    from public.agent_balance_entries e where e.establishment_id = v_row.establishment_id;
    v_before := v_after - v_row.delta;
    v_threshold := v_set.low_balance_threshold_cents::bigint * 10000;
    v_key_tail := v_row.establishment_id::text || ':' || v_row.first_id::text;

    -- Recuperarse vuelve a armar los avisos.
    if v_after > 0 and v_set.balance_empty_notified_at is not null then
      update public.reservation_settings set balance_empty_notified_at = null where id = v_set.id;
    end if;
    if v_after >= v_threshold and v_set.low_balance_notified_at is not null then
      update public.reservation_settings set low_balance_notified_at = null where id = v_set.id;
    end if;

    -- A cero o menos: el aviso fuerte (y el bajo queda dado, no hace falta otro).
    if v_after <= 0 and v_before > 0 and v_set.balance_empty_notified_at is null then
      update public.reservation_settings
      set balance_empty_notified_at = now(), low_balance_notified_at = coalesce(low_balance_notified_at, now())
      where id = v_set.id;
      perform public.reservations_notify_balance(
        v_row.establishment_id, 'agent_balance_empty', 'agent_balance_empty:' || v_key_tail, null);
    elsif v_threshold > 0 and v_after < v_threshold and v_before >= v_threshold
          and v_set.low_balance_notified_at is null then
      update public.reservation_settings set low_balance_notified_at = now() where id = v_set.id;
      perform public.reservations_notify_balance(
        v_row.establishment_id, 'agent_balance_low', 'agent_balance_low:' || v_key_tail,
        round(v_after::numeric / 10000)::bigint);
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.agent_balance_entries_alerts() from public, anon, authenticated;

create trigger agent_balance_entries_alerts
  after insert on public.agent_balance_entries
  referencing new table as new_rows
  for each statement execute function public.agent_balance_entries_alerts();


-- 1 · El soporte de plataforma, en sesión de Reservas de ese restaurante, también lee el saldo.
create or replace function public.agent_balance(p_establishment_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- El servidor (service_role) no tiene sesión de usuario; todo lo demás, sí.
  -- `coalesce`: sin rol, `reservations_my_role()` devuelve nulo y `nulo in (...)` no es
  -- falso, es nulo; sin ello el `if` no saltaría y se enseñaría el saldo a un extraño.
  if auth.uid() is not null
     and not (public.reservations_team_can_read(v_space_id, p_establishment_id)
              or coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false)) then
    raise exception 'No tienes acceso al saldo de este restaurante';
  end if;

  return coalesce((
    select sum(e.amount_micros)
    from public.agent_balance_entries e
    where e.establishment_id = p_establishment_id
  ), 0)::bigint;
end;
$$;

revoke all on function public.agent_balance(uuid) from public, anon;
grant execute on function public.agent_balance(uuid) to authenticated, service_role;

create or replace function public.agent_balance_can_read(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
      or public.reservations_team_can_read(public.establishment_space_id(p_establishment_id), p_establishment_id)
      or coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false);
$$;

revoke all on function public.agent_balance_can_read(uuid) from public, anon, authenticated;
grant execute on function public.agent_balance_can_read(uuid) to service_role;

-- ------------------------------------------------------------
-- 6 · El umbral de saldo bajo, configurable por Restavor (RN-AGT-05)
-- ------------------------------------------------------------
create or replace function public.set_low_balance_threshold(p_establishment_id uuid, p_cents integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_set public.reservation_settings;
  v_balance bigint;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null or not public.has_capability(v_space, 'manage_clients') then
    raise exception 'Solo Restavor cambia el aviso de saldo bajo';
  end if;
  if p_cents is null or p_cents < 0 then
    raise exception 'El aviso de saldo bajo no puede ser negativo';
  end if;
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_set.low_balance_threshold_cents = p_cents then
    return;
  end if;

  select coalesce(sum(e.amount_micros), 0)::bigint into v_balance
  from public.agent_balance_entries e where e.establishment_id = p_establishment_id;

  -- Con un umbral nuevo, el aviso se vuelve a armar si el saldo ya está por encima de él.
  update public.reservation_settings
  set low_balance_threshold_cents = p_cents,
      low_balance_notified_at = case when v_balance >= p_cents::bigint * 10000 then null else low_balance_notified_at end,
      updated_at = now()
  where id = v_set.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_space, auth.uid(), 'reservations.low_balance_threshold_changed', 'establishment', p_establishment_id,
          jsonb_build_object('threshold_cents', v_set.low_balance_threshold_cents),
          jsonb_build_object('threshold_cents', p_cents));
end;
$$;

revoke all on function public.set_low_balance_threshold(uuid, integer) from public, anon;
grant execute on function public.set_low_balance_threshold(uuid, integer) to authenticated;


-- 4 · Una clave de idempotencia repetida solo devuelve el MISMO apunte.
create or replace function public.record_manual_topup(
  p_establishment_id uuid, p_net_cents integer, p_method text, p_note text, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null or not public.has_capability(v_space, 'manage_clients') then
    raise exception 'Solo Restavor registra recargas a mano';
  end if;
  if not exists (select 1 from public.reservation_settings where establishment_id = p_establishment_id) then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if p_method is null or p_method not in ('transfer', 'bizum', 'other') then
    raise exception 'El método de la recarga no es válido';
  end if;
  if p_net_cents is null or p_net_cents <= 0 then
    raise exception 'El importe de la recarga debe ser mayor que cero';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  insert into public.agent_balance_entries
    (space_id, establishment_id, kind, amount_micros, source_type, note, created_by, idempotency_key)
  values
    (v_space, p_establishment_id, 'topup', p_net_cents::bigint * 10000, 'manual_topup', v_note, auth.uid(), p_idempotency_key)
  on conflict (establishment_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    -- Pulsar dos veces no recarga dos veces: devuelve el apunte que ya hizo la primera... si es el mismo.
    select e.id into v_id from public.agent_balance_entries e
    where e.establishment_id = p_establishment_id and e.idempotency_key = p_idempotency_key
      and e.kind = 'topup' and e.amount_micros = p_net_cents::bigint * 10000;
    if v_id is null then
      raise exception 'Esa clave de idempotencia ya se usó para otra operación';
    end if;
    return v_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space, auth.uid(), 'reservations.balance_topup_manual', 'establishment', p_establishment_id,
          jsonb_build_object('entry_id', v_id, 'amount_cents', p_net_cents, 'method', p_method), v_note);

  perform public.reservations_notify_balance(
    p_establishment_id, 'agent_topup_receipt', 'agent_topup_receipt:manual:' || v_id::text, p_net_cents);

  return v_id;
end;
$$;

revoke all on function public.record_manual_topup(uuid, integer, text, text, text) from public, anon;
grant execute on function public.record_manual_topup(uuid, integer, text, text, text) to authenticated;

create or replace function public.adjust_agent_balance(
  p_establishment_id uuid, p_amount_cents integer, p_reason text, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null or not public.has_capability(v_space, 'manage_clients') then
    raise exception 'Solo Restavor ajusta el saldo';
  end if;
  if not public.session_is_two_factor() then
    raise exception 'Ajustar el saldo pide la verificación en dos pasos';
  end if;
  if not exists (select 1 from public.reservation_settings where establishment_id = p_establishment_id) then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_reason is null then
    raise exception 'Un ajuste de saldo siempre dice por qué';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'El importe del ajuste no puede ser cero';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  insert into public.agent_balance_entries
    (space_id, establishment_id, kind, amount_micros, source_type, note, created_by, idempotency_key)
  values
    (v_space, p_establishment_id, 'adjustment', p_amount_cents::bigint * 10000, 'adjustment', v_reason, auth.uid(), p_idempotency_key)
  on conflict (establishment_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id from public.agent_balance_entries e
    where e.establishment_id = p_establishment_id and e.idempotency_key = p_idempotency_key
      and e.kind = 'adjustment' and e.amount_micros = p_amount_cents::bigint * 10000;
    if v_id is null then
      raise exception 'Esa clave de idempotencia ya se usó para otra operación';
    end if;
    return v_id;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space, auth.uid(), 'reservations.balance_adjusted', 'establishment', p_establishment_id,
          jsonb_build_object('entry_id', v_id, 'amount_cents', p_amount_cents), v_reason);
  return v_id;
end;
$$;

revoke all on function public.adjust_agent_balance(uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_agent_balance(uuid, integer, text, text) to authenticated;

create or replace function public.record_balance_payout(
  p_establishment_id uuid, p_amount_cents integer, p_note text, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_set public.reservation_settings;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_balance bigint;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null or not public.has_capability(v_space, 'manage_clients') then
    raise exception 'Solo Restavor devuelve el saldo';
  end if;
  if not public.session_is_two_factor() then
    raise exception 'Devolver el saldo pide la verificación en dos pasos';
  end if;
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_set.service_status not in ('ending', 'closed') then
    raise exception 'El saldo solo se devuelve cuando el restaurante se ha dado de baja';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe a devolver debe ser mayor que cero';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  v_id := (select e.id from public.agent_balance_entries e
           where e.establishment_id = p_establishment_id and e.idempotency_key = p_idempotency_key);
  if v_id is not null then
    if not exists (select 1 from public.agent_balance_entries e
                   where e.id = v_id and e.kind = 'payout' and e.amount_micros = -(p_amount_cents::bigint * 10000)) then
      raise exception 'Esa clave de idempotencia ya se usó para otra operación';
    end if;
    return v_id;
  end if;

  select coalesce(sum(e.amount_micros), 0)::bigint into v_balance
  from public.agent_balance_entries e where e.establishment_id = p_establishment_id;
  if p_amount_cents::bigint * 10000 > v_balance then
    raise exception 'No se puede devolver más de lo que hay en el saldo';
  end if;

  insert into public.agent_balance_entries
    (space_id, establishment_id, kind, amount_micros, source_type, note, created_by, idempotency_key)
  values
    (v_space, p_establishment_id, 'payout', -(p_amount_cents::bigint * 10000), 'payout', v_note, auth.uid(), p_idempotency_key)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space, auth.uid(), 'reservations.balance_payout', 'establishment', p_establishment_id,
          jsonb_build_object('entry_id', v_id, 'amount_cents', p_amount_cents), v_note);
  return v_id;
end;
$$;

revoke all on function public.record_balance_payout(uuid, integer, text, text) from public, anon;
grant execute on function public.record_balance_payout(uuid, integer, text, text) to authenticated;

-- 5 · Un incidente por recarga que no cuadra.
create or replace function public.complete_agent_topup(
  p_session_id text, p_amount_total_cents integer, p_currency text default 'eur')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.agent_topups;
  v_entry uuid;
begin
  select * into v_t from public.agent_topups t where t.stripe_checkout_session_id = p_session_id for update;
  if v_t.id is null then
    return jsonb_build_object('outcome', 'unknown');
  end if;

  v_entry := (select e.id from public.agent_balance_entries e where e.stripe_checkout_session_id = p_session_id);
  if v_entry is not null then
    return jsonb_build_object('outcome', 'already', 'entry_id', v_entry, 'topup_id', v_t.id);
  end if;

  if p_amount_total_cents is distinct from v_t.total_cents or lower(coalesce(p_currency, '')) <> 'eur' then
    -- Stripe reintenta lo que no contesta bien y repite eventos: un incidente abierto por recarga, no uno por llegada.
    if not exists (select 1 from public.reservation_incidents i
                   where i.establishment_id = v_t.establishment_id and i.kind = 'payment' and i.resolved_at is null
                     and i.data ->> 'topup_id' = v_t.id::text) then
      insert into public.reservation_incidents (space_id, establishment_id, kind, severity, title, detail, data)
      values (v_t.space_id, v_t.establishment_id, 'payment', 'error',
              'Una recarga pagada no coincide con la pedida',
              'Stripe confirmó un importe distinto del que se pidió: no se ha apuntado nada. Hay que mirarlo a mano.',
              jsonb_build_object('topup_id', v_t.id, 'expected_cents', v_t.total_cents,
                                 'received_cents', p_amount_total_cents, 'currency', p_currency));
    end if;
    return jsonb_build_object('outcome', 'mismatch', 'topup_id', v_t.id);
  end if;

  insert into public.agent_balance_entries
    (space_id, establishment_id, kind, amount_micros, source_type, source_id, stripe_checkout_session_id)
  values
    (v_t.space_id, v_t.establishment_id, 'topup', v_t.net_cents::bigint * 10000, 'topup', v_t.id, p_session_id)
  returning id into v_entry;

  -- Pagó aunque Stripe lo diera por caducado: el dinero llegó, la recarga queda pagada.
  update public.agent_topups set status = 'paid', updated_at = now() where id = v_t.id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_t.space_id, null, 'reservations.topup_paid', 'establishment', v_t.establishment_id,
          jsonb_build_object('status', v_t.status),
          jsonb_build_object('status', 'paid', 'topup_id', v_t.id, 'entry_id', v_entry,
                             'net_cents', v_t.net_cents, 'total_cents', v_t.total_cents));

  perform public.reservations_notify_balance(
    v_t.establishment_id, 'agent_topup_receipt', 'agent_topup_receipt:' || v_t.id::text, v_t.total_cents);

  return jsonb_build_object('outcome', 'credited', 'entry_id', v_entry, 'topup_id', v_t.id);
end;
$$;

revoke all on function public.complete_agent_topup(text, integer, text) from public, anon, authenticated;
grant execute on function public.complete_agent_topup(text, integer, text) to service_role;

-- 7 · Reabrir un cierre vuelve a armar los dos avisos de saldo.
create or replace function public.approve_reservation_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.reservation_service_requests;
  v_set public.reservation_settings;
  v_tz text;
  v_sub uuid;
  v_charge uuid;
  v_total bigint;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión';
  end if;

  select * into v_req from public.reservation_service_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;
  if not public.has_capability(v_req.space_id, 'manage_clients') then
    raise exception 'No tienes permiso para aprobar solicitudes de Reservas';
  end if;

  -- Pulsar dos veces no aprueba dos veces: la segunda devuelve la misma suscripción.
  if v_req.status = 'approved' then
    return (select rs.subscription_id from public.reservation_settings rs
            where rs.establishment_id = v_req.establishment_id);
  end if;
  if v_req.status <> 'requested' then
    raise exception 'Esta solicitud ya está resuelta';
  end if;
  if public.establishment_is_gone(v_req.establishment_id) then
    raise exception 'Restaurante no encontrado';
  end if;
  -- Sin datos de pago no hay a dónde pagar la primera mensualidad: el cobro correría hacia la pausa
  -- sin que el restaurante pudiera hacer nada. Se carga antes (decisión 144).
  if not public.space_has_payment_details(v_req.space_id) then
    raise exception 'Antes de aprobar hay que cargar los datos de pago del espacio (IBAN o Bizum)';
  end if;
  if not exists (select 1 from public.spaces s where s.id = v_req.space_id and s.reservations_enabled) then
    raise exception 'Este espacio todavía no ofrece Reservas';
  end if;

  select * into v_set from public.reservation_settings
  where establishment_id = v_req.establishment_id for update;
  if v_set.id is not null and v_set.service_status <> 'closed' then
    raise exception 'Este restaurante ya tiene Reservas';
  end if;

  select * into v_sub, v_charge
  from public.reservations_start_subscription(
    v_req.establishment_id, v_actor, v_req.service_version_id, v_req.terms_accepted_by, v_req.terms_accepted_at);

  select sp.timezone into v_tz from public.spaces sp where sp.id = v_req.space_id;

  if v_set.id is null then
    insert into public.reservation_settings
      (space_id, establishment_id, subscription_id, service_status, timezone)
    values
      (v_req.space_id, v_req.establishment_id, v_sub, 'approved_pending_payment', coalesce(v_tz, 'Europe/Madrid'));
  else
    -- Vuelve un restaurante cuyo Reservas se cerró (y cuyos datos ya se anonimizaron):
    -- conserva su configuración y empieza el ciclo de nuevo.
    update public.reservation_settings
    set subscription_id = v_sub, service_status = 'approved_pending_payment',
        activated_at = null, ending_at = null, closed_at = null, data_purged_at = null,
        low_balance_notified_at = null, balance_empty_notified_at = null, updated_at = now()
    where id = v_set.id;
  end if;

  update public.reservation_service_requests
  set status = 'approved', reviewed_by = v_actor, reviewed_at = now(), updated_at = now()
  where id = v_req.id;

  insert into public.reservation_service_events (space_id, establishment_id, request_id, type, actor_id, data)
  values (v_req.space_id, v_req.establishment_id, v_req.id, 'approved', v_actor,
          jsonb_build_object('subscription_id', v_sub, 'charge_id', v_charge));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_req.space_id, v_actor, 'reservations.approved', 'establishment', v_req.establishment_id,
          jsonb_build_object('request_id', v_req.id, 'subscription_id', v_sub, 'charge_id', v_charge));

  v_total := (select c.total_cents from public.charges c where c.id = v_charge);
  perform public.reservations_emit_to_owners(
    v_req.establishment_id, 'reservation_service_approved', '/agents/' || v_req.establishment_id::text,
    'reservation_service_approved:' || v_req.id::text, v_total);

  return v_sub;
end;
$$;

revoke all on function public.approve_reservation_request(uuid) from public, anon;
grant execute on function public.approve_reservation_request(uuid) to authenticated;
