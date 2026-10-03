-- Fase E1 de Restavor agents · correcciones de la revisión independiente.
--
-- Las migraciones 172 a 174 ya están en la rama `agents`, así que las correcciones van
-- en una nueva (CLAUDE.md: nunca se edita una migración subida).
--
--   1 · Revisar el servicio Reservas ya no deja de cobrar: la guarda de la migración 156
--       solo impide *entrar* en Reservas, no que una suscripción que ya es de Reservas
--       pase a la versión nueva del servicio.
--   2 · El Encargado no lee datos de comensales con Reservas cerrada (PRD §6.12: «solo
--       el Propietario entra»). Lo comprueba la política por `reservations_can_read()`.
--   3 · Solo Restavor registra o condona un pago de Reservas (PRD §3.2): un trabajador
--       asignado ya podía registrar pagos y activar el servicio.
--   4 · Reservas no se activa sin condiciones aceptadas; al aceptarlas se activa si ya
--       estaba pagado.
--   5 · El correo al momento tiene arrendamiento: dos reclamos seguidos no lo envían dos veces.
--   6 · El barrido no anuncia cambios que su propio bloque deshizo.
--   7 · «Anular la baja» no devuelve el servicio completo si queda deuda vencida.
--   8 · El motivo interno de un cierre no va al evento que lee el Propietario (queda en
--       `audit_log.reason`).
--   9 · El IBAN se valida con el dígito de control (módulo 97).
--
-- Se comprueba con `supabase/tests/reservas_cobro_y_ciclo.sql` (bloque 16).

-- 1 · La guarda deja pasar el cambio de versión de una suscripción que ya es de Reservas.
create or replace function public.guard_reservations_subscription()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind <> 'service' or new.service_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.service_id is not distinct from old.service_id then
    return new;
  end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.kind = 'reservations') then
    return new;
  end if;
  -- Revisar el servicio (RN-COM-19 a 30) mueve la suscripción de una versión a otra del
  -- mismo servicio: ya es de Reservas, no entra por la puerta de atrás.
  if tg_op = 'UPDATE'
     and exists (select 1 from public.services s where s.id = old.service_id and s.kind = 'reservations') then
    return new;
  end if;
  if coalesce(current_setting('restavor.reservations_approval', true), '') <> 'on' then
    raise exception 'Reservas solo se contrata aprobando la solicitud del restaurante (RN-APP-03)';
  end if;
  return new;
end;
$$;

-- 2 · Quién lee las reservas de un restaurante.
create or replace function public.reservations_can_read(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.reservations_my_role(p_establishment_id) = 'owner', false)
      or (coalesce(public.reservations_my_role(p_establishment_id) = 'manager', false)
          and exists (select 1 from public.reservation_settings rs
                      where rs.establishment_id = p_establishment_id and rs.service_status <> 'closed'))
      or public.reservations_can_read_diner_data(p_establishment_id);
$$;

-- 3 · Solo Restavor registra o condona un pago de Reservas.
create or replace function public.financial_entries_reservations_hook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid;
begin
  if auth.uid() is not null and public.charge_is_reservations(new.charge_id) then
    select c.space_id into v_space from public.charges c where c.id = new.charge_id;
    if not public.has_capability(v_space, 'manage_clients') then
      raise exception 'Solo Restavor registra los pagos de Reservas';
    end if;
  end if;
  perform public.reservations_after_payment(new.charge_id);
  return null;
end;
$$;

-- 9 · Dígito de control del IBAN (ISO 13616, módulo 97 cifra a cifra para no desbordar).
create or replace function public.iban_is_valid(p_iban text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_iban text := upper(coalesce(p_iban, ''));
  v_moved text;
  v_digits text := '';
  v_ch text;
  v_rem integer := 0;
  i integer;
begin
  if v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
    return false;
  end if;
  v_moved := substr(v_iban, 5) || substr(v_iban, 1, 4);
  for i in 1 .. char_length(v_moved) loop
    v_ch := substr(v_moved, i, 1);
    if v_ch ~ '[0-9]' then
      v_digits := v_digits || v_ch;
    else
      v_digits := v_digits || (ascii(v_ch) - 55)::text;
    end if;
  end loop;
  for i in 1 .. char_length(v_digits) loop
    v_rem := (v_rem * 10 + substr(v_digits, i, 1)::integer) % 97;
  end loop;
  return v_rem = 1;
end;
$$;

revoke all on function public.iban_is_valid(text) from public, anon, authenticated;
grant execute on function public.iban_is_valid(text) to service_role;

create or replace function public.set_space_payment_details(
  p_space_id uuid, p_iban text, p_bizum_phone text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iban text := nullif(upper(regexp_replace(coalesce(p_iban, ''), '\s+', '', 'g')), '');
  v_bizum text := nullif(btrim(coalesce(p_bizum_phone, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_old public.spaces;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if not public.has_capability(p_space_id, 'manage_space') then
    raise exception 'Solo el propietario del espacio puede cambiar los datos de pago';
  end if;
  select * into v_old from public.spaces where id = p_space_id for update;
  if v_old.id is null then
    raise exception 'El espacio no existe';
  end if;
  if v_iban is not null and not public.iban_is_valid(v_iban) then
    raise exception 'El IBAN no es válido: revisa que no haya una errata';
  end if;
  if v_bizum is not null and v_bizum !~ '^\+?[0-9 ]{9,20}$' then
    raise exception 'El teléfono de Bizum no tiene un formato válido';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'La nota de pago admite 300 caracteres como máximo';
  end if;

  update public.spaces
  set payment_iban = v_iban, payment_bizum_phone = v_bizum, payment_note = v_note
  where id = p_space_id;

  -- El IBAN no se copia a la auditoría: solo qué cambió.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (p_space_id, auth.uid(), 'space.payment_details_changed', 'space', p_space_id,
          jsonb_build_object('iban_set', v_old.payment_iban is not null,
                             'bizum_set', v_old.payment_bizum_phone is not null,
                             'note_set', v_old.payment_note is not null),
          jsonb_build_object('iban_set', v_iban is not null,
                             'bizum_set', v_bizum is not null,
                             'note_set', v_note is not null));
end;
$$;

revoke all on function public.set_space_payment_details(uuid, text, text, text) from public, anon;
grant execute on function public.set_space_payment_details(uuid, text, text, text) to authenticated;

-- 4 · El gancho de pago exige condiciones aceptadas.
create or replace function public.reservations_after_payment(p_charge_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.charges;
  v_set public.reservation_settings;
  v_to text;
  v_cause text;
begin
  select * into v_charge from public.charges where id = p_charge_id;
  if v_charge.id is null or not public.charge_is_reservations(v_charge.id) then
    return null;
  end if;

  select * into v_set from public.reservation_settings
  where establishment_id = v_charge.establishment_id for update;
  if v_set.id is null then
    return null;
  end if;

  if v_set.service_status = 'approved_pending_payment' then
    -- Sin condiciones aceptadas no se activa (PRD §4.4 paso 4, RN-DAT-07): el pago queda
    -- registrado y Reservas se activa en cuanto el Propietario las acepte.
    if public.reservations_charge_outstanding(v_charge.id) <= 0
       and v_charge.subscription_id is not distinct from v_set.subscription_id
       and exists (select 1 from public.terms_acceptances ta where ta.subscription_id = v_set.subscription_id) then
      v_to := 'active';
      v_cause := 'first_payment';
    end if;
  elsif v_set.service_status in ('past_due', 'paused') then
    if public.reservations_overdue_since(v_charge.establishment_id) is null then
      v_to := 'active';
      v_cause := 'payment';
    end if;
  end if;

  if v_to is null then
    return v_set.service_status;
  end if;

  update public.reservation_settings
  set service_status = v_to,
      activated_at = case when v_cause = 'first_payment' then now() else activated_at end,
      updated_at = now()
  where id = v_set.id;

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  values (v_set.space_id, v_set.establishment_id,
          case when v_cause = 'first_payment' then 'activated' else 'reactivated' end,
          auth.uid(), jsonb_build_object('from', v_set.service_status, 'cause', v_cause));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_set.space_id, auth.uid(),
          case when v_cause = 'first_payment' then 'reservations.activated' else 'reservations.reactivated' end,
          'establishment', v_set.establishment_id,
          jsonb_build_object('service_status', v_set.service_status),
          jsonb_build_object('service_status', v_to, 'charge_id', v_charge.id));

  perform public.reservations_emit_to_owners(
    v_set.establishment_id, 'reservations_activated', '/agents/' || v_set.establishment_id::text,
    'reservations_activated:' || v_set.establishment_id::text || ':' || v_charge.id::text, null);

  return v_to;
end;
$$;

revoke all on function public.reservations_after_payment(uuid) from public, anon, authenticated;
grant execute on function public.reservations_after_payment(uuid) to service_role;

create or replace function public.accept_reservation_terms(p_establishment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.reservation_settings;
  v_terms record;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if public.reservations_my_role(p_establishment_id) is distinct from 'owner' then
    raise exception 'Solo el propietario del restaurante puede aceptar las condiciones de Reservas';
  end if;
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id;
  if v_set.id is null or v_set.subscription_id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  select * into v_terms from public.subscription_terms(v_set.subscription_id);
  if v_terms.current_version_id is null then
    raise exception 'Reservas no tiene condiciones publicadas';
  end if;

  v_id := public.accept_subscription_terms(v_set.subscription_id, v_terms.current_version_id);

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  select v_set.space_id, p_establishment_id, 'terms_accepted', auth.uid(),
         jsonb_build_object('service_version_id', v_terms.current_version_id)
  where not exists (
    select 1 from public.reservation_service_events e
    where e.establishment_id = p_establishment_id and e.type = 'terms_accepted'
      and e.data ->> 'service_version_id' = v_terms.current_version_id::text
      and e.actor_id = auth.uid());

  update public.reservation_service_requests
  set terms_accepted_by = auth.uid(), terms_accepted_at = now(), updated_at = now()
  where establishment_id = p_establishment_id and status = 'approved' and terms_accepted_at is null;

  -- Si el primer cobro ya estaba saldado, aceptar las condiciones es lo que faltaba.
  perform public.reservations_after_payment(c.id)
  from public.charges c
  where c.subscription_id = v_set.subscription_id
  order by c.created_at
  limit 1;

  return v_id;
end;
$$;

revoke all on function public.accept_reservation_terms(uuid) from public, anon;
grant execute on function public.accept_reservation_terms(uuid) to authenticated;

-- 8 · El motivo interno del cierre no va al evento.
create or replace function public.reservations_close_internal(
  p_establishment_id uuid, p_actor uuid, p_cause text, p_reason text, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.reservation_settings;
  v_sub uuid;
begin
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;

  for v_sub in
    select s.id from public.subscriptions s
    where s.establishment_id = p_establishment_id and s.kind = 'service' and s.status = 'active'
      and public.subscription_is_reservations(s.id)
  loop
    update public.subscriptions set status = 'cancelled' where id = v_sub;
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (v_set.space_id, p_actor, 'subscription.service_cancelled', 'subscription', v_sub,
            jsonb_build_object('establishment_id', p_establishment_id, 'via', 'reservations', 'cause', p_cause));
  end loop;

  update public.reservation_settings
  set service_status = 'closed', closed_at = p_now, updated_at = now()
  where id = v_set.id;

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  values (v_set.space_id, p_establishment_id, 'closed', p_actor,
          jsonb_build_object('from', v_set.service_status, 'cause', p_cause));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_set.space_id, p_actor, 'reservations.closed', 'establishment', p_establishment_id,
          jsonb_build_object('service_status', v_set.service_status),
          jsonb_build_object('service_status', 'closed', 'cause', p_cause), p_reason);
end;
$$;

revoke all on function public.reservations_close_internal(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reservations_close_internal(uuid, uuid, text, text, timestamptz) to service_role;

-- 6 · El barrido no anuncia lo que deshizo.
create or replace function public.reservations_lifecycle_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_set public.reservation_settings;
  v_status text;
  v_overdue timestamptz;
  v_deadline timestamptz;
  v_charge record;
  v_est uuid;
  v_link text;
  v_key text;
  v_keys text[] := '{}';
  v_email_now text[] := '{}';
  v_changes jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_closed_at timestamptz;
  v_keys_0 text[];
  v_email_0 text[];
  v_changes_0 jsonb;
begin
  for v_row in
    select rs.id from public.reservation_settings rs
    where rs.service_status in ('active', 'past_due', 'paused', 'ending', 'closed')
    order by rs.id
  loop
    v_keys_0 := v_keys; v_email_0 := v_email_now; v_changes_0 := v_changes;
    begin
      select * into v_set from public.reservation_settings where id = v_row.id for update;
      v_est := v_set.establishment_id;
      v_status := v_set.service_status;
      v_link := '/agents/' || v_est::text;
      v_overdue := public.reservations_overdue_since(v_est, p_now);

      -- active → past_due: algún cobro de Reservas venció y sigue con deuda.
      if v_status = 'active' and v_overdue is not null then
        update public.reservation_settings set service_status = 'past_due', updated_at = now() where id = v_set.id;
        insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
        values (v_set.space_id, v_est, 'past_due', null, jsonb_build_object('overdue_since', v_overdue));
        insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
        values (v_set.space_id, null, 'reservations.past_due', 'establishment', v_est,
                jsonb_build_object('service_status', 'active'),
                jsonb_build_object('service_status', 'past_due', 'overdue_since', v_overdue));
        v_changes := v_changes || jsonb_build_object('establishment_id', v_est, 'from', 'active', 'to', 'past_due');
        v_status := 'past_due';
        v_key := 'reservations_past_due:' || v_est::text || ':due:' || extract(epoch from v_overdue)::bigint::text;
        if public.reservations_emit_to_owners(v_est, 'reservations_past_due', v_link || '/plan', v_key, null) > 0 then
          v_keys := v_keys || v_key;
        end if;
      end if;

      -- past_due y la deuda ya está saldada: vuelve a active (por si el pago no pasó por el gancho).
      if v_status = 'past_due' and v_overdue is null then
        update public.reservation_settings set service_status = 'active', updated_at = now() where id = v_set.id;
        insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
        values (v_set.space_id, v_est, 'reactivated', null, jsonb_build_object('from', 'past_due', 'cause', 'sweep'));
        v_changes := v_changes || jsonb_build_object('establishment_id', v_est, 'from', 'past_due', 'to', 'active');
        v_status := 'active';
      end if;

      -- past_due → paused a los `grace_days` del vencimiento más antiguo; dos días antes, un aviso.
      if v_status = 'past_due' then
        v_deadline := v_overdue + make_interval(days => v_set.grace_days);
        if p_now >= v_deadline then
          update public.reservation_settings set service_status = 'paused', updated_at = now() where id = v_set.id;
          insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
          values (v_set.space_id, v_est, 'paused', null,
                  jsonb_build_object('overdue_since', v_overdue, 'grace_days', v_set.grace_days));
          insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
          values (v_set.space_id, null, 'reservations.paused', 'establishment', v_est,
                  jsonb_build_object('service_status', 'past_due'),
                  jsonb_build_object('service_status', 'paused', 'overdue_since', v_overdue));
          v_changes := v_changes || jsonb_build_object('establishment_id', v_est, 'from', 'past_due', 'to', 'paused');
          v_status := 'paused';
          v_key := 'reservations_paused:' || v_est::text || ':' || extract(epoch from v_overdue)::bigint::text;
          if public.reservations_emit_to_owners(v_est, 'reservations_paused', v_link || '/plan', v_key, null) > 0 then
            v_keys := v_keys || v_key;
            v_email_now := v_email_now || v_key;
          end if;
        elsif p_now >= v_deadline - interval '2 days' then
          v_key := 'reservations_past_due:' || v_est::text || ':grace:' || extract(epoch from v_overdue)::bigint::text;
          if public.reservations_emit_to_owners(v_est, 'reservations_past_due', v_link || '/plan', v_key, null) > 0 then
            v_keys := v_keys || v_key;
          end if;
        end if;
      end if;

      -- Cinco días antes del vencimiento de un cobro sin pagar (decisión 133), una vez por cobro.
      if v_status = 'active' then
        for v_charge in
          select c.id, c.total_cents from public.charges c
          where c.establishment_id = v_est and public.charge_is_reservations(c.id)
            and c.due_at >= p_now and c.due_at - interval '5 days' <= p_now
            and public.reservations_charge_outstanding(c.id) > 0
        loop
          v_key := 'reservations_payment_due:' || v_charge.id::text;
          if public.reservations_emit_to_owners(v_est, 'reservations_payment_due', v_link || '/plan', v_key, v_charge.total_cents) > 0 then
            v_keys := v_keys || v_key;
          end if;
        end loop;
      end if;

      -- ending → closed al acabar el periodo pagado.
      if v_status = 'ending' and v_set.ending_at is not null and p_now >= v_set.ending_at then
        perform public.reservations_close_internal(v_est, null, 'period_ended', null, p_now);
        v_changes := v_changes || jsonb_build_object('establishment_id', v_est, 'from', 'ending', 'to', 'closed');
        v_status := 'closed';
      end if;

      -- closed: a los 23 días el recordatorio de descarga; a los 30, la anonimización.
      if v_status = 'closed' then
        select rs.closed_at into v_closed_at from public.reservation_settings rs where rs.id = v_set.id;
        if v_set.data_purged_at is null and v_closed_at is not null then
          if p_now >= v_closed_at + interval '30 days' then
            perform public.reservations_purge(v_est, p_now);
            v_changes := v_changes || jsonb_build_object('establishment_id', v_est, 'from', 'closed', 'to', 'purged');
          elsif p_now >= v_closed_at + interval '23 days' then
            v_key := 'reservations_closed_purge_soon:' || v_est::text || ':' || extract(epoch from v_closed_at)::bigint::text;
            if public.reservations_emit_to_owners(v_est, 'reservations_closed_purge_soon', v_link || '/cuenta-cerrada', v_key, null) > 0 then
              v_keys := v_keys || v_key;
            end if;
          end if;
        end if;
      end if;
    exception when others then
      -- Lo que el bloque deshizo no se anuncia: se vuelve a los acumuladores de antes.
      v_keys := v_keys_0; v_email_now := v_email_0; v_changes := v_changes_0;
      v_errors := v_errors || jsonb_build_object('establishment_id', v_set.establishment_id, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('changes', v_changes, 'keys', to_jsonb(v_keys),
                            'email_now_keys', to_jsonb(v_email_now), 'errors', v_errors);
end;
$$;

revoke all on function public.reservations_lifecycle_sweep(timestamptz) from public, anon, authenticated;
grant execute on function public.reservations_lifecycle_sweep(timestamptz) to service_role;

-- 7 · Anular la baja con deuda vencida.
create or replace function public.undo_reservations_cancellation(p_establishment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_plan_actor(p_establishment_id);
  v_set public.reservation_settings;
  v_overdue timestamptz;
  v_to text;
begin
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_set.service_status = 'active' then
    return;
  end if;
  if v_set.service_status <> 'ending' then
    raise exception 'Este restaurante no tiene la baja pedida';
  end if;
  if v_set.ending_at is not null and v_set.ending_at <= now() then
    raise exception 'El periodo pagado ya acabó: Reservas se cerrará en el próximo barrido';
  end if;

  v_overdue := public.reservations_overdue_since(p_establishment_id);
  v_to := case
    when v_overdue is null then 'active'
    when now() >= v_overdue + make_interval(days => v_set.grace_days) then 'paused'
    else 'past_due'
  end;

  update public.reservation_settings
  set service_status = v_to, ending_at = null, updated_at = now()
  where id = v_set.id;

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  values (v_set.space_id, p_establishment_id, 'reactivated', auth.uid(),
          jsonb_build_object('from', 'ending', 'to', v_to, 'cause', 'cancellation_undone', 'by', v_actor));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_set.space_id, auth.uid(), 'reservations.cancellation_undone', 'establishment', p_establishment_id,
          jsonb_build_object('service_status', 'ending'), jsonb_build_object('service_status', v_to));
end;
$$;

revoke all on function public.undo_reservations_cancellation(uuid) from public, anon;
grant execute on function public.undo_reservations_cancellation(uuid) to authenticated;

-- 5 · El correo al momento con arrendamiento.
CREATE OR REPLACE FUNCTION public.claim_email_deliveries_for_keys(p_dedupe_keys text[])
 RETURNS TABLE(delivery_id uuid, notification_id uuid, attempts integer, channel text, recipient_email text, push_tokens text[], event_type text, audience text, deep_link text, space_name text, entity_type text, establishment_name text, amount_cents bigint, threshold_percent integer, subject text, digest_id uuid, digest_date date, digest_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with tomados as (
    select d.id from public.notification_deliveries d
    join public.notifications nt on nt.id = d.notification_id
    where d.status = 'pending' and d.channel = 'email' and d.next_attempt_at <= now()
      and nt.dedupe_key = any (p_dedupe_keys)
    order by d.next_attempt_at
    limit 50
    for update of d skip locked
  ),
  marcados as (
    update public.notification_deliveries d
    set attempts = d.attempts + 1,
        -- Arrendamiento: mientras se envía, otro reclamo no lo ve (el correo del dinero no sale dos veces).
        next_attempt_at = now() + interval '5 minutes'
    from tomados t
    where d.id = t.id
    returning d.id, d.notification_id, d.digest_id, d.attempts, d.channel
  )
  select m.id, m.notification_id, m.attempts, m.channel,
         coalesce(p.email, pd_perfil.email),
         case when m.channel = 'push' then
           coalesce((
             select array_agg(dev.expo_push_token order by dev.last_seen_at desc)
             from public.push_devices dev
             where dev.user_id = coalesce(n.recipient_id, dg.profile_id)
               and dev.revoked_at is null
           ), '{}'::text[])
         else null end,
         n.event_type, n.audience, n.deep_link,
         coalesce(s.name, s_digest.name),
         n.entity_type,
         ctx.establishment_name,
         n.amount_cents,
         n.threshold_percent,
         ctx.subject,
         dg.id, dg.digest_date, dg.notification_count
  from marcados m
  left join public.notifications n on n.id = m.notification_id
  left join public.notification_digests dg on dg.id = m.digest_id
  left join public.profiles p on p.id = n.recipient_id
  left join public.profiles pd_perfil on pd_perfil.id = dg.profile_id
  left join public.spaces s on s.id = n.space_id
  left join public.spaces s_digest on s_digest.id = dg.space_id
  left join lateral public.notification_push_context(n.id) ctx on true;
end;
$function$

;

revoke all on function public.claim_email_deliveries_for_keys(text[]) from public, anon, authenticated;
grant execute on function public.claim_email_deliveries_for_keys(text[]) to service_role;
