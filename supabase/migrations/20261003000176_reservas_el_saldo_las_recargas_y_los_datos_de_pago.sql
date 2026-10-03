-- Fase E2 de Restavor agents · el saldo, las recargas y la puerta de los datos de pago.
--
-- Lo que construye (PRD de agents §5.2, §8.6 y §10.5; decisiones 94, 144 y 145):
--
--   1 · El libro del saldo (`agent_balance_entries`) deja de ser inmutable solo «por
--       costumbre»: un disparador impide editar y borrar un apunte (RN-AGT-01), también
--       al servidor. Lleva clave de idempotencia por restaurante.
--   2 · Avisos de saldo bajo y saldo a 0, **una vez por cruce** (RN-AGT-05 y RN-AGT-06).
--   3 · Recarga a mano de Restavor, ajuste (con motivo y `aal2`) y devolución del saldo al
--       darse de baja (RN-AGT-02 y RN-AGT-08).
--   4 · Recarga con tarjeta: crear la recarga (solo el Propietario), apuntar la sesión de
--       Stripe, completarla (idempotente por sesión, por el importe SIN IVA) y caducarla
--       (RN-AGT-04). El servidor llama a las tres últimas con la clave de servicio.
--   5 · Lecturas del saldo: gasto del mes por tipo y «unos N minutos de llamadas»
--       (RN-AGT-09), calculadas en la base de datos.
--   6 · Tarifas de mensajería editables por la plataforma (`set_messaging_rate`).
--   7 · **La puerta de los datos de pago** (decisión 144, de Bosco): aprobar y reactivar
--       Reservas exigen que el espacio tenga cargado un IBAN o un Bizum. Hasta entonces el
--       pago está «Próximamente» y nada se aprueba, para que ningún cobro corra hacia la
--       pausa sin dónde pagarse.
--
-- Se comprueba con `supabase/tests/reservas_saldo.sql` (suite 94).

-- ------------------------------------------------------------
-- 1 · El libro, de verdad inmutable, y su clave de idempotencia
-- ------------------------------------------------------------
alter table public.agent_balance_entries
  add column idempotency_key text;

create unique index agent_balance_entries_idempotency_idx
  on public.agent_balance_entries (establishment_id, idempotency_key)
  where idempotency_key is not null;

alter table public.agent_topups
  add column idempotency_key text;

create unique index agent_topups_idempotency_idx
  on public.agent_topups (establishment_id, idempotency_key)
  where idempotency_key is not null;

alter table public.reservation_settings
  add column balance_empty_notified_at timestamptz;

grant select (balance_empty_notified_at) on public.reservation_settings to authenticated;

-- Un apunte no se edita ni se borra, ni siquiera con la clave de servicio (RN-AGT-01). Dos
-- excepciones, ninguna para una persona: el borrado en cascada de un restaurante o un
-- espacio enteros (algo que la aplicación nunca hace: se archiva) y el cambio de `space_id`
-- de una transferencia (decisión 100), que se declara con `restavor.ledger_move = 'on'` y
-- solo vale si no cambia ninguna otra columna.
create or replace function public.agent_balance_entries_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

create trigger agent_balance_entries_immutable
  before update or delete on public.agent_balance_entries
  for each row execute function public.agent_balance_entries_immutable();

-- ------------------------------------------------------------
-- 2 · Datos de pago cargados (la puerta) y avisos de saldo
-- ------------------------------------------------------------
-- ¿Tiene el espacio un sitio al que pagar? Interna: la usan las funciones que aprueban.
create or replace function public.space_has_payment_details(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select s.payment_iban is not null or s.payment_bizum_phone is not null
    from public.spaces s where s.id = p_space_id
  ), false);
$$;

revoke all on function public.space_has_payment_details(uuid) from public, anon, authenticated;
grant execute on function public.space_has_payment_details(uuid) to service_role;

-- Quién puede mirar el saldo de un restaurante (como `agent_balance()`): el Propietario, el
-- Encargado, el equipo del espacio, o el servidor.
create or replace function public.agent_balance_can_read(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
      or public.reservations_team_can_read(public.establishment_space_id(p_establishment_id))
      or coalesce(public.reservations_my_role(p_establishment_id) in ('owner', 'manager'), false);
$$;

revoke all on function public.agent_balance_can_read(uuid) from public, anon, authenticated;
grant execute on function public.agent_balance_can_read(uuid) to service_role;

-- Un aviso de saldo al Propietario y al Encargado del restaurante (RN-AGT-05). Como los de
-- la agenda: cada uno lleva su clave y repetirlo no crea otro.
create or replace function public.reservations_notify_balance(
  p_establishment_id uuid, p_event_type text, p_dedupe_key text, p_amount_cents bigint default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid := public.establishment_space_id(p_establishment_id);
  v_user uuid;
  v_id uuid;
  v_n integer := 0;
begin
  if v_space_id is null then
    return 0;
  end if;
  for v_user in
    select em.user_id from public.establishment_memberships em
    where em.establishment_id = p_establishment_id and em.revoked_at is null and em.role = 'local_owner'
    union
    select gm.user_id from public.group_memberships gm
    join public.establishments e on e.group_id = gm.group_id
    where e.id = p_establishment_id and gm.revoked_at is null and gm.role = 'global_owner'
    union
    select em.user_id from public.establishment_memberships em
    join public.establishment_permissions ep on ep.establishment_membership_id = em.id
    where em.establishment_id = p_establishment_id and em.revoked_at is null and em.role = 'editor' and ep.manage_reservations
  loop
    v_id := public.emit_notification(
      v_space_id, v_user, p_event_type, 'client', 'establishment', p_establishment_id,
      '/agents/' || p_establishment_id::text || '/saldo', p_dedupe_key, p_establishment_id, null,
      p_amount_cents, true);
    if v_id is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.reservations_notify_balance(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.reservations_notify_balance(uuid, text, text, bigint) to service_role;

-- RN-AGT-05 y RN-AGT-06 · el aviso sale cuando el saldo CRUZA el umbral (o el cero), no cada vez
-- que baja. Se vuelve a armar al recuperarse. Un apunte del libro es la única puerta del saldo,
-- así que el disparador está aquí y cubre las llamadas de la Fase G sin tocar nada más.
create or replace function public.agent_balance_entries_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.reservation_settings;
  v_after bigint;
  v_before bigint;
  v_threshold bigint;
  v_key_tail text := new.establishment_id::text || ':' || new.id::text;
begin
  select * into v_set from public.reservation_settings
  where establishment_id = new.establishment_id for update;
  if v_set.id is null or v_set.service_status not in ('active', 'past_due', 'paused', 'ending') then
    return null;
  end if;

  select coalesce(sum(e.amount_micros), 0)::bigint into v_after
  from public.agent_balance_entries e where e.establishment_id = new.establishment_id;
  v_before := v_after - new.amount_micros;
  v_threshold := v_set.low_balance_threshold_cents::bigint * 10000;

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
      new.establishment_id, 'agent_balance_empty', 'agent_balance_empty:' || v_key_tail, null);
  elsif v_threshold > 0 and v_after < v_threshold and v_before >= v_threshold
        and v_set.low_balance_notified_at is null then
    update public.reservation_settings set low_balance_notified_at = now() where id = v_set.id;
    perform public.reservations_notify_balance(
      new.establishment_id, 'agent_balance_low', 'agent_balance_low:' || v_key_tail,
      round(v_after::numeric / 10000)::bigint);
  end if;
  return null;
end;
$$;

revoke all on function public.agent_balance_entries_alerts() from public, anon, authenticated;

create trigger agent_balance_entries_alerts
  after insert on public.agent_balance_entries
  for each row execute function public.agent_balance_entries_alerts();

-- ------------------------------------------------------------
-- 3 · Recarga a mano, ajuste y devolución (solo Restavor)
-- ------------------------------------------------------------
-- RN-AGT-04 · «Sin Stripe configurado Restavor puede registrar recargas a mano (transferencia o
-- Bizum) con el mismo apunte». Solo el equipo con `manage_clients`.
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
    -- Pulsar dos veces no recarga dos veces: devuelve el apunte que ya hizo la primera.
    return (select e.id from public.agent_balance_entries e
            where e.establishment_id = p_establishment_id and e.idempotency_key = p_idempotency_key);
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

-- RN-AGT-02 · un ajuste (±) solo de Restavor, con motivo y segundo paso (`aal2`).
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
    return (select e.id from public.agent_balance_entries e
            where e.establishment_id = p_establishment_id and e.idempotency_key = p_idempotency_key);
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_space, auth.uid(), 'reservations.balance_adjusted', 'establishment', p_establishment_id,
          jsonb_build_object('entry_id', v_id, 'amount_cents', p_amount_cents), v_reason);
  return v_id;
end;
$$;

revoke all on function public.adjust_agent_balance(uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_agent_balance(uuid, integer, text, text) to authenticated;

-- RN-AGT-08 · al darse de baja, el saldo no gastado se devuelve a mano si lo piden: un apunte
-- `payout` (−). Solo con la baja pedida o Reservas cerrada, sin pasar de lo que hay, con `aal2`.
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

-- ------------------------------------------------------------
-- 4 · Recarga con tarjeta (D-C)
-- ------------------------------------------------------------
-- RN-AGT-04 · solo el Propietario. 10, 20, 50 € u otro (mínimo 10 €), más el IVA del espacio.
-- El IVA se redondea al céntimo con el redondeo de siempre (medio céntimo se aleja de cero),
-- igual que lo calcula `core/agents/balance.ts`.
create or replace function public.create_agent_topup(
  p_establishment_id uuid, p_net_cents integer, p_idempotency_key text)
returns table (topup_id uuid, net_cents integer, vat_cents integer, total_cents integer, vat_rate_percent numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_status text;
  v_rate numeric;
  v_vat integer;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null or public.reservations_my_role(p_establishment_id) is distinct from 'owner' then
    raise exception 'Solo el propietario del restaurante puede recargar el saldo';
  end if;
  select s.service_status into v_status from public.reservation_settings s where s.establishment_id = p_establishment_id;
  if v_status is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_status = 'closed' then
    raise exception 'Reservas está cerrada: no se puede recargar';
  end if;
  if p_net_cents is null or p_net_cents < 1000 then
    raise exception 'La recarga mínima es de 10 €';
  end if;
  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Falta la clave de idempotencia';
  end if;

  select t.id into v_id from public.agent_topups t
  where t.establishment_id = p_establishment_id and t.idempotency_key = p_idempotency_key;

  if v_id is null then
    select sp.tax_rate_percent into v_rate from public.spaces sp where sp.id = v_space;
    v_vat := round(p_net_cents::numeric * v_rate / 100)::integer;
    insert into public.agent_topups
      (space_id, establishment_id, net_cents, vat_cents, total_cents, vat_rate_percent, status, created_by, idempotency_key)
    values
      (v_space, p_establishment_id, p_net_cents, v_vat, p_net_cents + v_vat, v_rate, 'created', auth.uid(), p_idempotency_key)
    on conflict (establishment_id, idempotency_key) where idempotency_key is not null do nothing
    returning id into v_id;
    if v_id is null then
      select t.id into v_id from public.agent_topups t
      where t.establishment_id = p_establishment_id and t.idempotency_key = p_idempotency_key;
    end if;
  end if;

  return query
    select t.id, t.net_cents, t.vat_cents, t.total_cents, t.vat_rate_percent
    from public.agent_topups t where t.id = v_id;
end;
$$;

revoke all on function public.create_agent_topup(uuid, integer, text) from public, anon;
grant execute on function public.create_agent_topup(uuid, integer, text) to authenticated;

-- El IVA con el que se calcularía una recarga: el del espacio (RN-AGT-04). El restaurante no lee la fila del
-- espacio, así que la pantalla lo pide aquí para enseñar «Pagarás 24,20 € (20,00 € + 21 % de IVA)» antes de pagar.
create or replace function public.agent_topup_vat_rate(p_establishment_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if not public.agent_balance_can_read(p_establishment_id) then
    raise exception 'No tienes acceso al saldo de este restaurante';
  end if;
  return (select sp.tax_rate_percent from public.spaces sp where sp.id = v_space);
end;
$$;

revoke all on function public.agent_topup_vat_rate(uuid) from public, anon;
grant execute on function public.agent_topup_vat_rate(uuid) to authenticated, service_role;

-- Las tres siguientes son del servidor (la ruta de recarga y el webhook de Stripe), con la
-- clave de servicio: `revoke ... from public, anon, authenticated` (CLAUDE.md).
create or replace function public.attach_topup_session(p_topup_id uuid, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  select t.stripe_checkout_session_id into v_current
  from public.agent_topups t where t.id = p_topup_id and t.status = 'created' for update;
  if not found then
    return false;
  end if;
  if v_current is not null then
    return v_current = p_session_id;
  end if;
  update public.agent_topups set stripe_checkout_session_id = p_session_id, updated_at = now() where id = p_topup_id;
  return true;
end;
$$;

revoke all on function public.attach_topup_session(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_topup_session(uuid, text) to service_role;

-- `checkout.session.completed`: un apunte `topup` por el importe SIN IVA (el IVA no es saldo),
-- idempotente por sesión de Stripe. Devuelve qué pasó, para que el webhook conteste siempre 200
-- (Stripe reintenta lo que no contesta 2xx) y deje constancia:
--   credited · apuntado ahora · already · ya estaba apuntado · unknown · no es una recarga nuestra
--   mismatch · lo pagado no coincide con lo pedido: no se apunta nada y queda un incidente.
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
    insert into public.reservation_incidents (space_id, establishment_id, kind, severity, title, detail, data)
    values (v_t.space_id, v_t.establishment_id, 'payment', 'error',
            'Una recarga pagada no coincide con la pedida',
            'Stripe confirmó un importe distinto del que se pidió: no se ha apuntado nada. Hay que mirarlo a mano.',
            jsonb_build_object('topup_id', v_t.id, 'expected_cents', v_t.total_cents,
                               'received_cents', p_amount_total_cents, 'currency', p_currency));
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

-- `checkout.session.expired`: la recarga queda `expired`, sin apunte.
create or replace function public.expire_agent_topup(p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.agent_topups;
begin
  select * into v_t from public.agent_topups t
  where t.stripe_checkout_session_id = p_session_id and t.status = 'created' for update;
  if v_t.id is null then
    return false;
  end if;
  update public.agent_topups set status = 'expired', updated_at = now() where id = v_t.id;
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_t.space_id, null, 'reservations.topup_expired', 'establishment', v_t.establishment_id,
          jsonb_build_object('status', 'created'), jsonb_build_object('status', 'expired', 'topup_id', v_t.id));
  return true;
end;
$$;

revoke all on function public.expire_agent_topup(text) from public, anon, authenticated;
grant execute on function public.expire_agent_topup(text) to service_role;

-- ------------------------------------------------------------
-- 5 · Lo que enseña la pantalla de Saldo
-- ------------------------------------------------------------


-- Gasto de un mes por tipo (en la zona del restaurante) y las llamadas del mes: cuántas y cuántos
-- segundos. Devuelve cifras, nunca una fila de una llamada: ni el número ni el resumen.
create or replace function public.agent_spend_summary(p_establishment_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_kinds jsonb;
  v_calls bigint;
  v_seconds bigint;
begin
  if public.establishment_space_id(p_establishment_id) is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if not public.agent_balance_can_read(p_establishment_id) then
    raise exception 'No tienes acceso al saldo de este restaurante';
  end if;
  select coalesce(s.timezone, 'Europe/Madrid') into v_tz
  from public.reservation_settings s where s.establishment_id = p_establishment_id;
  v_tz := coalesce(v_tz, 'Europe/Madrid');
  v_from := date_trunc('month', p_month)::timestamp at time zone v_tz;
  v_to := (date_trunc('month', p_month) + interval '1 month')::timestamp at time zone v_tz;

  select coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'entries', k.n, 'micros', k.total) order by k.kind), '[]'::jsonb)
  into v_kinds
  from (
    select e.kind, count(*) as n, sum(e.amount_micros)::bigint as total
    from public.agent_balance_entries e
    where e.establishment_id = p_establishment_id and e.created_at >= v_from and e.created_at < v_to
    group by e.kind
  ) k;

  select count(*), coalesce(sum(c.duration_seconds), 0)
  into v_calls, v_seconds
  from public.agent_calls c
  where c.establishment_id = p_establishment_id and c.started_at >= v_from and c.started_at < v_to;

  return jsonb_build_object('by_kind', v_kinds,
                            'calls', jsonb_build_object('count', v_calls, 'seconds', v_seconds));
end;
$$;

revoke all on function public.agent_spend_summary(uuid, date) from public, anon;
grant execute on function public.agent_spend_summary(uuid, date) to authenticated, service_role;

-- RN-AGT-09 · «unos N minutos de llamadas» = saldo ÷ coste medio del minuto de ese restaurante en
-- los últimos 30 días. Sin llamadas con coste en esos 30 días, nulo: no se enseña ni se inventa.
create or replace function public.agent_minutes_estimate(p_establishment_id uuid, p_now timestamptz default now())
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cost bigint;
  v_seconds bigint;
  v_balance bigint;
begin
  if public.establishment_space_id(p_establishment_id) is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if not public.agent_balance_can_read(p_establishment_id) then
    raise exception 'No tienes acceso al saldo de este restaurante';
  end if;

  select coalesce(sum(c.cost_eur_micros), 0)::bigint, coalesce(sum(c.duration_seconds), 0)::bigint
  into v_cost, v_seconds
  from public.agent_calls c
  where c.establishment_id = p_establishment_id
    and c.started_at >= p_now - interval '30 days' and c.started_at <= p_now
    and c.cost_eur_micros is not null and c.duration_seconds is not null and c.duration_seconds > 0;

  if v_seconds = 0 or v_cost = 0 then
    return null;
  end if;

  select coalesce(sum(e.amount_micros), 0)::bigint into v_balance
  from public.agent_balance_entries e where e.establishment_id = p_establishment_id;
  if v_balance <= 0 then
    return 0;
  end if;
  return floor(v_balance::numeric / (v_cost::numeric / (v_seconds::numeric / 60)))::integer;
end;
$$;

revoke all on function public.agent_minutes_estimate(uuid, timestamptz) from public, anon;
grant execute on function public.agent_minutes_estimate(uuid, timestamptz) to authenticated, service_role;

-- ------------------------------------------------------------
-- 6 · Tarifas de mensajería (solo la plataforma)
-- ------------------------------------------------------------
-- Una tarifa nueva es una fila nueva con su `valid_from` (el historial no se reescribe).
create or replace function public.set_messaging_rate(
  p_channel text, p_country text, p_price_micros bigint, p_valid_from date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_country text := upper(btrim(coalesce(p_country, '')));
begin
  if not public.is_platform_owner() then
    raise exception 'Solo Restavor web cambia las tarifas de mensajería';
  end if;
  if p_channel is null or p_channel not in ('whatsapp_utility', 'sms') then
    raise exception 'El canal de la tarifa no es válido';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'El país de la tarifa no es válido';
  end if;
  if p_price_micros is null or p_price_micros < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;
  if p_valid_from is null or p_valid_from < current_date then
    raise exception 'Una tarifa nueva vale desde hoy o desde una fecha futura';
  end if;
  if exists (select 1 from public.messaging_rates r
             where r.channel = p_channel and r.country = v_country and r.valid_from = p_valid_from) then
    raise exception 'Ya hay una tarifa con esa fecha de inicio: usa otra fecha';
  end if;

  insert into public.messaging_rates (channel, country, price_micros, currency, valid_from)
  values (p_channel, v_country, p_price_micros, 'EUR', p_valid_from)
  returning id into v_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (null, auth.uid(), 'platform.messaging_rate_set', 'messaging_rate', v_id,
          jsonb_build_object('channel', p_channel, 'country', v_country,
                             'price_micros', p_price_micros, 'valid_from', p_valid_from));
  return v_id;
end;
$$;

revoke all on function public.set_messaging_rate(text, text, bigint, date) from public, anon;
grant execute on function public.set_messaging_rate(text, text, bigint, date) to authenticated;

-- ------------------------------------------------------------
-- 7 · Aprobar y reactivar exigen datos de pago (decisión 144)
-- ------------------------------------------------------------

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
        low_balance_notified_at = null, updated_at = now()
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

create or replace function public.reactivate_closed_reservations(p_establishment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_set public.reservation_settings;
  v_acc public.terms_acceptances;
  v_sub uuid;
  v_charge uuid;
  v_total bigint;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null or not public.has_capability(v_space, 'manage_clients') then
    raise exception 'Solo Restavor puede reactivar Reservas';
  end if;
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_set.service_status = 'approved_pending_payment' then
    return v_set.subscription_id;
  end if;
  if v_set.service_status <> 'closed' then
    raise exception 'Reservas no está cerrada';
  end if;
  if v_set.data_purged_at is not null or v_set.closed_at is null or v_set.closed_at + interval '30 days' <= now() then
    raise exception 'Pasaron los 30 días: para volver hace falta una solicitud nueva';
  end if;

  if not public.space_has_payment_details(v_set.space_id) then
    raise exception 'Antes de reactivar hay que cargar los datos de pago del espacio (IBAN o Bizum)';
  end if;

  -- Lo aceptado antes sigue valiendo: se copia a la suscripción nueva.
  select ta.* into v_acc from public.terms_acceptances ta
  where ta.establishment_id = p_establishment_id and ta.service_version_id is not null and ta.channel = 'in_app'
  order by ta.accepted_at desc limit 1;

  select * into v_sub, v_charge
  from public.reservations_start_subscription(
    p_establishment_id, auth.uid(), v_acc.service_version_id, v_acc.accepted_by, v_acc.accepted_at);

  update public.reservation_settings
  set subscription_id = v_sub, service_status = 'approved_pending_payment',
      activated_at = null, ending_at = null, closed_at = null, updated_at = now()
  where id = v_set.id;

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  values (v_set.space_id, p_establishment_id, 'reactivated', auth.uid(),
          jsonb_build_object('from', 'closed', 'cause', 'reactivated_by_restavor', 'charge_id', v_charge));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_set.space_id, auth.uid(), 'reservations.reactivated', 'establishment', p_establishment_id,
          jsonb_build_object('service_status', 'closed'),
          jsonb_build_object('service_status', 'approved_pending_payment', 'subscription_id', v_sub));

  v_total := (select c.total_cents from public.charges c where c.id = v_charge);
  perform public.reservations_emit_to_owners(
    p_establishment_id, 'reservation_service_approved', '/agents/' || p_establishment_id::text,
    'reservation_service_approved:' || v_sub::text, v_total);

  return v_sub;
end;
$$;

revoke all on function public.reactivate_closed_reservations(uuid) from public, anon;
grant execute on function public.reactivate_closed_reservations(uuid) to authenticated;


-- ------------------------------------------------------------
-- 8 · Qué espacios ofrecen Reservas (para el panel de Administración)
-- ------------------------------------------------------------
-- `set_space_reservations_enabled()` existe desde la migración 156 pero ninguna pantalla leía el estado de cada
-- espacio. Solo la plataforma lo ve; encender o apagar lo sigue decidiendo `is_platform_owner()` en esa función.
create or replace function public.platform_reservations_spaces()
returns table (space_id uuid, name text, slug text, reservations_enabled boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_member() then
    raise exception 'Solo Restavor web ve qué espacios ofrecen Reservas';
  end if;
  return query
    select s.id, s.name, s.slug, s.reservations_enabled
    from public.spaces s
    where not public.space_is_gone(s.id)
    order by s.name;
end;
$$;

revoke all on function public.platform_reservations_spaces() from public, anon;
grant execute on function public.platform_reservations_spaces() to authenticated;
