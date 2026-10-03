-- Fase E de Restavor agents (COB-02) · tercera de tres migraciones.
--
-- El ciclo de vida de Reservas después de cobrar (PRD de agents §6.12, RN-RES-11):
--
--   1 · `reservations_lifecycle_sweep(p_now)`: el barrido diario. `active → past_due`,
--       `past_due → paused` a los `grace_days` del vencimiento más antiguo, `ending →
--       closed` al acabar el periodo pagado, y a los 30 días del cierre, el recordatorio
--       de descarga y el borrado de datos personales (anonimizar, nunca `DELETE`).
--       Recibe la hora como parámetro para que las suites simulen fechas.
--   2 · Las transiciones que pide una persona: `request_reservations_cancellation()`
--       (darse de baja), `undo_reservations_cancellation()` (anular la baja),
--       `close_reservations_service()` y `reactivate_closed_reservations()` (Restavor).
--   3 · `reservations_purge()`: anonimiza reservas, avisos, llamadas y nombres del Equipo
--       conservando fecha, hora, personas, origen, estado, libro y cifras (§6.13).
--   4 · `claim_email_deliveries_for_keys()`: gemela de la del push (migración 160) para
--       los dos correos que salen al momento (decisión 137): «Aprobado» y «En pausa».
--
-- Cada transición deja su apunte en `reservation_service_events` y en `audit_log`. Las
-- funciones internas están reservadas a `service_role` (CLAUDE.md).
--
-- Se comprueba con `supabase/tests/reservas_cobro_y_ciclo.sql`.

-- ------------------------------------------------------------
-- 1 · Piezas internas
-- ------------------------------------------------------------
-- Cierra Reservas: la suscripción pasa a `cancelled` (no existía ninguna función que lo
-- hiciera, decisión 135) y el restaurante a `closed`.
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
          jsonb_build_object('from', v_set.service_status, 'cause', p_cause)
          || case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason', p_reason) end);

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_set.space_id, p_actor, 'reservations.closed', 'establishment', p_establishment_id,
          jsonb_build_object('service_status', v_set.service_status),
          jsonb_build_object('service_status', 'closed', 'cause', p_cause), p_reason);
end;
$$;

-- Anonimiza los datos personales de un restaurante cuyo Reservas lleva cerrado 30 días
-- (PRD §6.13). Un `UPDATE` del sistema: se conservan fecha, hora, personas, origen y
-- estado, el libro del saldo y las cifras. `reservation_events` y `audit_log` nunca
-- tuvieron datos personales, así que no hay nada que tocar en ellos.
create or replace function public.reservations_purge(p_establishment_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.reservation_settings;
  v_reservations integer;
  v_notifications integer;
  v_calls integer;
  v_staff integer;
begin
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null or v_set.service_status <> 'closed' then
    raise exception 'Solo se anonimiza un restaurante con Reservas cerrada';
  end if;
  if v_set.data_purged_at is not null then
    return jsonb_build_object('already_purged', true);
  end if;

  update public.reservations
  set customer_name = 'Anónimo', phone_e164 = null, email = null, notes = null,
      anonymized_at = p_now, updated_at = now()
  where establishment_id = p_establishment_id and anonymized_at is null;
  get diagnostics v_reservations = row_count;

  update public.reservation_notifications
  set recipient = null, error = null, anonymized_at = p_now, updated_at = now()
  where establishment_id = p_establishment_id and anonymized_at is null;
  get diagnostics v_notifications = row_count;

  update public.agent_calls
  set caller_e164 = null, summary = null, transferred_to_e164 = null, anonymized_at = p_now
  where establishment_id = p_establishment_id and anonymized_at is null;
  get diagnostics v_calls = row_count;

  -- El Equipo sin cuenta: nombre anónimo, sin PIN y desactivado. Propietarios y
  -- Encargados son cuentas de Restavor app: sus nombres no son de Reservas.
  update public.reservation_staff
  set name = 'Anónimo', pin_hmac = null, active = false,
      deactivated_at = coalesce(deactivated_at, p_now), anonymized_at = p_now
  where establishment_id = p_establishment_id and kind = 'staff' and anonymized_at is null;
  get diagnostics v_staff = row_count;

  update public.reservation_settings set data_purged_at = p_now, updated_at = now() where id = v_set.id;

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  values (v_set.space_id, p_establishment_id, 'purged', null,
          jsonb_build_object('reservations', v_reservations, 'notifications', v_notifications,
                             'calls', v_calls, 'staff', v_staff));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_set.space_id, null, 'reservations.purged', 'establishment', p_establishment_id,
          jsonb_build_object('reservations', v_reservations, 'notifications', v_notifications,
                             'calls', v_calls, 'staff', v_staff));

  return jsonb_build_object('reservations', v_reservations, 'notifications', v_notifications,
                            'calls', v_calls, 'staff', v_staff);
end;
$$;

revoke all on function public.reservations_close_internal(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reservations_purge(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reservations_close_internal(uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.reservations_purge(uuid, timestamptz) to service_role;

-- ------------------------------------------------------------
-- 2 · El barrido diario
-- ------------------------------------------------------------
-- Devuelve qué cambió, las claves de los avisos nuevos (el servidor manda su push al
-- momento) y cuáles de ellos salen también por correo al momento. Un restaurante que
-- falla no deja sin barrer a los demás: su error vuelve en `errors`, no se traga.
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
begin
  for v_row in
    select rs.id from public.reservation_settings rs
    where rs.service_status in ('active', 'past_due', 'paused', 'ending', 'closed')
    order by rs.id
  loop
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
      v_errors := v_errors || jsonb_build_object('establishment_id', v_set.establishment_id, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('changes', v_changes, 'keys', to_jsonb(v_keys),
                            'email_now_keys', to_jsonb(v_email_now), 'errors', v_errors);
end;
$$;

revoke all on function public.reservations_lifecycle_sweep(timestamptz) from public, anon, authenticated;
grant execute on function public.reservations_lifecycle_sweep(timestamptz) to service_role;

-- ------------------------------------------------------------
-- 3 · Lo que pide una persona
-- ------------------------------------------------------------
-- Quién puede pedir la baja, anularla o ver el plan: el Propietario del restaurante o
-- Restavor (`manage_clients`). Ni el Encargado ni la tablet (PRD §3.2: «Plan, pagos,
-- darse de baja» es del Propietario y de Restavor).
create or replace function public.reservations_plan_actor(p_establishment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if public.reservations_my_role(p_establishment_id) = 'owner' then
    return 'owner';
  end if;
  if public.has_capability(v_space, 'manage_clients') then
    return 'restavor';
  end if;
  raise exception 'Solo el propietario del restaurante o Restavor pueden gestionar el plan de Reservas';
end;
$$;

revoke all on function public.reservations_plan_actor(uuid) from public, anon;
grant execute on function public.reservations_plan_actor(uuid) to authenticated, service_role;

-- Darse de baja (decisión 134): sigue hasta el final del periodo pagado y nunca antes de
-- ahora; la deuda se mantiene.
create or replace function public.request_reservations_cancellation(p_establishment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_plan_actor(p_establishment_id);
  v_set public.reservation_settings;
  v_ending timestamptz;
begin
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_set.service_status = 'ending' then
    return v_set.ending_at;
  end if;
  if v_set.service_status not in ('active', 'past_due', 'paused') then
    raise exception 'Reservas no se puede dar de baja en este estado';
  end if;

  select greatest(coalesce(max(c.period_end), now()), now()) into v_ending
  from public.charges c
  where c.establishment_id = p_establishment_id and public.charge_is_reservations(c.id)
    and public.reservations_charge_outstanding(c.id) <= 0 and c.period_end > now();

  update public.reservation_settings
  set service_status = 'ending', ending_at = v_ending, updated_at = now()
  where id = v_set.id;

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  values (v_set.space_id, p_establishment_id, 'ending', auth.uid(),
          jsonb_build_object('from', v_set.service_status, 'ending_at', v_ending, 'by', v_actor));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_set.space_id, auth.uid(), 'reservations.cancellation_requested', 'establishment', p_establishment_id,
          jsonb_build_object('service_status', v_set.service_status),
          jsonb_build_object('service_status', 'ending', 'ending_at', v_ending));

  perform public.reservations_emit_to_owners(
    p_establishment_id, 'reservations_ending', '/agents/' || p_establishment_id::text || '/plan',
    'reservations_ending:' || p_establishment_id::text || ':' || extract(epoch from v_ending)::bigint::text, null);

  return v_ending;
end;
$$;

revoke all on function public.request_reservations_cancellation(uuid) from public, anon;
grant execute on function public.request_reservations_cancellation(uuid) to authenticated;

create or replace function public.undo_reservations_cancellation(p_establishment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.reservations_plan_actor(p_establishment_id);
  v_set public.reservation_settings;
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

  update public.reservation_settings
  set service_status = 'active', ending_at = null, updated_at = now()
  where id = v_set.id;

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  values (v_set.space_id, p_establishment_id, 'reactivated', auth.uid(),
          jsonb_build_object('from', 'ending', 'cause', 'cancellation_undone', 'by', v_actor));
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_set.space_id, auth.uid(), 'reservations.cancellation_undone', 'establishment', p_establishment_id,
          jsonb_build_object('service_status', 'ending'), jsonb_build_object('service_status', 'active'));
end;
$$;

revoke all on function public.undo_reservations_cancellation(uuid) from public, anon;
grant execute on function public.undo_reservations_cancellation(uuid) to authenticated;

-- Restavor cierra Reservas a mano (solo desde la pausa, con motivo): la deuda se mantiene.
create or replace function public.close_reservations_service(p_establishment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_set public.reservation_settings;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null or not public.has_capability(v_space, 'manage_clients') then
    raise exception 'Solo Restavor puede cerrar Reservas';
  end if;
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;
  if v_set.service_status = 'closed' then
    return;
  end if;
  if v_set.service_status <> 'paused' then
    raise exception 'Reservas solo se cierra a mano desde la pausa';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'Cerrar Reservas pide un motivo de hasta 500 caracteres';
  end if;
  perform public.reservations_close_internal(p_establishment_id, auth.uid(), 'closed_by_restavor', v_reason, now());
end;
$$;

revoke all on function public.close_reservations_service(uuid, text) from public, anon;
grant execute on function public.close_reservations_service(uuid, text) to authenticated;

-- Reactivar una Reservas cerrada, durante los 30 días y antes del borrado: nueva
-- suscripción y cobro nuevo; al pagarlo vuelve a `active` con todos sus datos.
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
-- 4 · El correo al momento (decisión 137)
-- ------------------------------------------------------------
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
    set attempts = d.attempts + 1
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
