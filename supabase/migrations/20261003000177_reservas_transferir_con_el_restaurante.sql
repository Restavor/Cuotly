-- Fase E2 de Restavor agents · «Transferir también Reservas» (decisión 100; decisión 149, de Bosco el 03/10/2026).
--
-- Al transferir un restaurante a otro espacio habrá una opción «Transferir también Reservas», **siempre
-- desactivada por defecto**. Desactivada, Reservas se queda en el origen (decisión 111, como hasta ahora).
-- Activada (Bosco eligió la opción más completa):
--
--   · **Todo viaja con el restaurante**: la agenda, el equipo y los dispositivos, el agente, las conexiones, los
--     incidentes y **el saldo** (sus apuntes cambian de `space_id`, sin tocar un céntimo: el libro sigue siendo
--     inmutable, el cambio de espacio lo declara `restavor.ledger_move`). El destino tiene que ofrecer Reservas.
--   · **Suscripción nueva**: la del origen se cancela (sus cobros, pagos y su deuda se quedan en el origen,
--     RN-TRA-04) y el destino crea una suscripción nueva con su propio servicio y su primer cobro. El restaurante
--     pasa por «Aprobado: datos para pagar» como en una contratación: acepta las condiciones del destino y paga
--     su primer mes allí (lo ya pagado al origen no se devuelve solo: lo decide el origen a mano).
--   · **Solo con Reservas activa y sin ningún cobro pendiente**, y solo a un espacio que ofrezca Reservas y
--     tenga datos de pago cargados (decisión 144). Se comprueba al proponer y otra vez al aceptar.
--
-- Se comprueba con `supabase/tests/reservas_transferencia.sql` (suite 95).

-- ------------------------------------------------------------
-- 1 · La opción, en la propuesta
-- ------------------------------------------------------------
alter table public.establishment_transfers
  add column with_reservations boolean not null default false;

comment on column public.establishment_transfers.with_reservations is
  'Decisión 149 · «Transferir también Reservas». Desactivada por defecto: Reservas se queda en el origen.';

-- ------------------------------------------------------------
-- 2 · Qué tablas de Reservas viajan (la suite falla si una tabla nueva no está aquí)
-- ------------------------------------------------------------
-- Las 28 tablas de Reservas con `space_id` y `establishment_id`. En `establishment_transfer_tables()` siguen
-- como «se queda» (lo que pasa con la opción desactivada); esta lista es la de la opción activada.
create or replace function public.reservations_transfer_tables()
returns table (table_name text)
language sql
immutable
as $$
  select * from (values
    ('agent_api_keys'), ('agent_balance_entries'), ('agent_calls'),
    ('agent_knowledge_documents'), ('agent_knowledge_faqs'), ('agent_knowledge_settings'),
    ('agent_knowledge_snapshots'), ('agent_schedule_windows'), ('agent_state'), ('agent_state_events'),
    ('agent_topups'),
    ('reservation_closed_dates'), ('reservation_devices'), ('reservation_duplicate_dismissals'),
    ('reservation_events'), ('reservation_incidents'), ('reservation_monthly_stats'),
    ('reservation_notifications'), ('reservation_pin_attempts'), ('reservation_platform_connections'),
    ('reservation_service_events'), ('reservation_service_requests'), ('reservation_settings'),
    ('reservation_shifts'), ('reservation_staff'), ('reservation_support_sessions'),
    ('reservations'), ('reservations_api_idempotency')
  ) as t(table_name);
$$;

comment on function public.reservations_transfer_tables() is
  'Decisión 149 · las tablas de Reservas que viajan con el restaurante si se activa «Transferir también Reservas».';

-- ------------------------------------------------------------
-- 3 · ¿Se puede? (una sola pregunta, para proponer y para aceptar)
-- ------------------------------------------------------------
-- Devuelve el motivo por el que no, en español, o nulo si se puede. Interna: la usan las dos funciones de abajo.
create or replace function public.reservations_transfer_blocker(p_establishment_id uuid, p_to_space_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_set public.reservation_settings;
begin
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id;
  if v_set.id is null then
    return 'Este restaurante no tiene Reservas: no hay nada que transferir con él';
  end if;
  if v_set.service_status <> 'active' then
    return 'Reservas solo se transfiere con el servicio activo y sin pagos pendientes';
  end if;
  if exists (
    select 1 from public.charges c
    where c.establishment_id = p_establishment_id
      and public.charge_is_reservations(c.id)
      and public.reservations_charge_outstanding(c.id) > 0
  ) then
    return 'Reservas solo se transfiere sin ningún cobro pendiente: primero se cobra, y después se transfiere';
  end if;
  if not exists (select 1 from public.spaces s where s.id = p_to_space_id and s.reservations_enabled) then
    return 'El espacio de destino no ofrece Reservas';
  end if;
  if not public.space_has_payment_details(p_to_space_id) then
    return 'El espacio de destino todavía no tiene cargados los datos de pago de Reservas';
  end if;
  return null;
end;
$$;

revoke all on function public.reservations_transfer_blocker(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reservations_transfer_blocker(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 4 · El traspaso (interna: la llama `accept_establishment_transfer()`)
-- ------------------------------------------------------------
create or replace function public.reservations_transfer_internal(
  p_establishment_id uuid, p_from_space_id uuid, p_to_space_id uuid, p_actor uuid, p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.reservation_settings;
  v_tab record;
  v_sub uuid;
  v_charge uuid;
  v_total bigint;
begin
  select * into v_set from public.reservation_settings where establishment_id = p_establishment_id for update;
  if v_set.id is null then
    raise exception 'Este restaurante no tiene Reservas';
  end if;

  -- 1 · Todo lo de Reservas cambia de espacio. El libro del saldo es inmutable: solo vale cambiar `space_id`,
  --     y solo mientras esta marca está puesta (la quita el último paso).
  perform set_config('restavor.ledger_move', 'on', true);
  for v_tab in select t.table_name from public.reservations_transfer_tables() t loop
    execute format('update public.%I set space_id = $1 where establishment_id = $2 and space_id = $3', v_tab.table_name)
      using p_to_space_id, p_establishment_id, p_from_space_id;
  end loop;
  perform set_config('restavor.ledger_move', 'off', true);

  -- 2 · La suscripción del origen se cancela; sus cobros y su dinero se quedan allí (RN-TRA-04).
  update public.subscriptions set status = 'cancelled' where id = v_set.subscription_id and status = 'active';
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (p_from_space_id, p_actor, 'subscription.service_cancelled', 'subscription', v_set.subscription_id,
          jsonb_build_object('establishment_id', p_establishment_id, 'via', 'reservations', 'cause', 'transfer'));

  -- 3 · La suscripción nueva, en el destino y con su servicio: sin aceptación todavía (la da el restaurante).
  select s.subscription_id, s.charge_id into v_sub, v_charge
  from public.reservations_start_subscription(p_establishment_id, p_actor, null, null, null) s;

  -- 4 · Como una contratación: «Aprobado: datos para pagar» (condiciones del destino y primer mes allí).
  update public.reservation_settings
  set subscription_id = v_sub, service_status = 'approved_pending_payment',
      activated_at = null, ending_at = null, closed_at = null, data_purged_at = null,
      low_balance_notified_at = null, balance_empty_notified_at = null, updated_at = now()
  where id = v_set.id;

  insert into public.reservation_service_events (space_id, establishment_id, type, actor_id, data)
  values (p_to_space_id, p_establishment_id, 'approved', p_actor,
          jsonb_build_object('cause', 'transfer', 'transfer_id', p_transfer_id, 'subscription_id', v_sub, 'charge_id', v_charge));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values
    (p_from_space_id, p_actor, 'reservations.transferred', 'establishment', p_establishment_id,
     jsonb_build_object('space_id', p_from_space_id, 'service_status', v_set.service_status),
     jsonb_build_object('space_id', p_to_space_id, 'transfer_id', p_transfer_id)),
    (p_to_space_id, p_actor, 'reservations.transferred', 'establishment', p_establishment_id,
     jsonb_build_object('space_id', p_from_space_id),
     jsonb_build_object('space_id', p_to_space_id, 'transfer_id', p_transfer_id, 'subscription_id', v_sub,
                        'service_status', 'approved_pending_payment'));

  v_total := (select c.total_cents from public.charges c where c.id = v_charge);
  perform public.reservations_emit_to_owners(
    p_establishment_id, 'reservation_service_approved', '/agents/' || p_establishment_id::text,
    'reservation_service_approved:' || v_sub::text, v_total);
end;
$$;

revoke all on function public.reservations_transfer_internal(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reservations_transfer_internal(uuid, uuid, uuid, uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 5 · Proponer y aceptar, con la opción
-- ------------------------------------------------------------
-- La firma de `propose_establishment_transfer` cambia (un parámetro más): se sustituye la antigua para que una
-- llamada con tres argumentos no sea ambigua.
drop function public.propose_establishment_transfer(uuid, uuid, text);


create or replace function public.propose_establishment_transfer(
  p_establishment_id uuid,
  p_to_space_id uuid,
  p_reason text default null,
  p_with_reservations boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_space_id uuid;
  v_status text;
  v_transfer_id uuid;
  v_blocker text;
begin
  select space_id, status into v_from_space_id, v_status
  from public.establishments where id = p_establishment_id for update;

  if v_from_space_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  if not public.space_owner_is_me(v_from_space_id) then
    raise exception 'Solo el propietario del espacio puede proponer una transferencia';
  end if;

  if p_to_space_id = v_from_space_id then
    raise exception 'El restaurante ya está en ese espacio';
  end if;

  if not exists (select 1 from public.spaces where id = p_to_space_id) then
    raise exception 'El espacio de destino no existe';
  end if;

  -- RN-TRA-05 · con deuda vencida no se transfiere. Sin esto, cambiar de
  -- espacio sería la manera de escapar de la deuda, y existe la guarda
  -- contraria: de una parada por impago se sale cobrando (RN-FIN-13).
  if public.establishment_has_overdue_debt_internal(p_establishment_id) then
    raise exception 'Este restaurante tiene deuda vencida: primero se cobra, y después se transfiere';
  end if;

  -- Lo que ya no tiene servicio no se ofrece: transferir un archivado es
  -- mandar a otro sitio algo que no está en marcha.
  if v_status = 'archived' then
    raise exception 'Un restaurante archivado no se transfiere: reactívalo primero';
  end if;

  -- Decisión 149 · «Transferir también Reservas»: siempre desactivada por defecto. Activada, se comprueba ya que se
  -- puede (y se vuelve a comprobar al aceptar, que es cuando se mueve).
  if p_with_reservations then
    v_blocker := public.reservations_transfer_blocker(p_establishment_id, p_to_space_id);
    if v_blocker is not null then
      raise exception '%', v_blocker;
    end if;
  end if;

  -- RN-TRA-06 · una propuesta viva por restaurante. Se dice en vez de
  -- dejar que reviente el índice único con un mensaje de PostgreSQL.
  if exists (
    select 1 from public.establishment_transfers
    where establishment_id = p_establishment_id and state = 'pending'
  ) then
    raise exception 'Este restaurante ya tiene una propuesta de transferencia abierta: retírala antes de hacer otra';
  end if;

  insert into public.establishment_transfers
    (establishment_id, from_space_id, to_space_id, reason, proposed_by, with_reservations)
  values (p_establishment_id, v_from_space_id, p_to_space_id, nullif(btrim(p_reason), ''), auth.uid(),
          coalesce(p_with_reservations, false))
  returning id into v_transfer_id;

  -- RN-TRA-09 · en los dos espacios. El destino tiene que poder leer en su
  -- propio libro que le han ofrecido un restaurante, no solo verlo en una
  -- pantalla.
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values
    (v_from_space_id, auth.uid(), 'establishment_transfer.proposed', 'establishment', p_establishment_id,
     jsonb_build_object('transfer_id', v_transfer_id, 'to_space_id', p_to_space_id, 'with_reservations', coalesce(p_with_reservations, false)), nullif(btrim(p_reason), '')),
    (p_to_space_id, auth.uid(), 'establishment_transfer.proposed', 'establishment', p_establishment_id,
     jsonb_build_object('transfer_id', v_transfer_id, 'from_space_id', v_from_space_id, 'with_reservations', coalesce(p_with_reservations, false)), nullif(btrim(p_reason), ''));

  return v_transfer_id;
end;
$$;

revoke all on function public.propose_establishment_transfer(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.propose_establishment_transfer(uuid, uuid, text, boolean) to authenticated;

create or replace function public.accept_establishment_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.establishment_transfers;
  v_tabla record;
  v_group_name text;
  v_new_group_id uuid;
  v_sql text;
  v_blocker text;
begin
  select * into v_t from public.establishment_transfers where id = p_transfer_id for update;
  if v_t.id is null then
    raise exception 'Propuesta no encontrada';
  end if;

  if not public.space_owner_is_me(v_t.to_space_id) then
    raise exception 'Solo el propietario del espacio de destino puede aceptarla';
  end if;

  -- CA-17 · aceptarla dos veces no mueve nada la segunda.
  if v_t.state = 'accepted' then
    return;
  end if;

  if v_t.state <> 'pending' then
    raise exception 'Esta propuesta ya está %', v_t.state;
  end if;

  -- El restaurante sigue donde estaba (RN-TRA-03), así que se vuelve a
  -- comprobar aquí: entre proponer y aceptar puede haber pasado una
  -- mensualidad sin pagar.
  if public.establishment_has_overdue_debt_internal(v_t.establishment_id) then
    raise exception 'Este restaurante tiene deuda vencida: no se puede aceptar la transferencia hasta que se cobre';
  end if;

  -- Decisión 149 · con Reservas, también tiene que seguir pudiéndose: entre proponer y aceptar puede haber vencido
  -- un cobro o pausarse el servicio.
  if v_t.with_reservations then
    v_blocker := public.reservations_transfer_blocker(v_t.establishment_id, v_t.to_space_id);
    if v_blocker is not null then
      raise exception '%', v_blocker;
    end if;
  end if;

  if (select space_id from public.establishments where id = v_t.establishment_id) <> v_t.from_space_id then
    raise exception 'El restaurante ya no está en el espacio que lo ofreció';
  end if;

  -- RN-TRA-10 · un grupo no se parte. El restaurante llega a un grupo del
  -- DESTINO con el mismo nombre, que se crea si no lo había. El grupo de
  -- origen se queda con los que no se movieron.
  select g.name into v_group_name
  from public.groups g
  join public.establishments e on e.group_id = g.id
  where e.id = v_t.establishment_id;

  select id into v_new_group_id
  from public.groups
  where space_id = v_t.to_space_id and lower(btrim(name)) = lower(btrim(coalesce(v_group_name, '')))
  limit 1;

  if v_new_group_id is null then
    insert into public.groups (space_id, name)
    values (v_t.to_space_id, coalesce(nullif(btrim(v_group_name), ''), 'Sin grupo'))
    returning id into v_new_group_id;
  end if;

  -- 1 · las tablas que tienen `establishment_id` y viajan.
  for v_tabla in
    select t.table_name from public.establishment_transfer_tables() t where t.travels
  loop
    v_sql := format(
      'update public.%I set space_id = $1 where establishment_id = $2 and space_id = $3',
      v_tabla.table_name);
    execute v_sql using v_t.to_space_id, v_t.establishment_id, v_t.from_space_id;
  end loop;

  -- 2 · las que llegan por su padre. El orden de la lista importa: un hijo
  -- se mueve mirando a un padre que la pasada anterior ya movió.
  for v_tabla in
    select c.table_name, c.parent_column, c.parent_table
    from public.establishment_transfer_child_tables() c
  loop
    v_sql := format(
      'update public.%I h set space_id = $1 where h.space_id = $2 and exists (
         select 1 from public.%I p where p.id = h.%I and p.space_id = $1)',
      v_tabla.table_name, v_tabla.parent_table, v_tabla.parent_column);
    execute v_sql using v_t.to_space_id, v_t.from_space_id;
  end loop;

  -- 3 · las que guardan `entity_type` + `entity_id` a mano. Solo las
  -- entidades que acaban de viajar: un evento de `space` es del espacio.
  for v_tabla in select e.table_name from public.establishment_transfer_entity_tables() e
  loop
    v_sql := format($f$
      update public.%I ev set space_id = $1
      where ev.space_id = $2 and (
        (ev.entity_type = 'job' and exists (select 1 from public.jobs j where j.id = ev.entity_id and j.space_id = $1))
        or (ev.entity_type = 'task' and exists (select 1 from public.tasks t where t.id = ev.entity_id and t.space_id = $1))
        or (ev.entity_type = 'request' and exists (select 1 from public.requests r where r.id = ev.entity_id and r.space_id = $1))
        or (ev.entity_type = 'establishment' and ev.entity_id = $3)
        or (ev.entity_type = 'opportunity' and exists (select 1 from public.opportunities o where o.id = ev.entity_id and o.space_id = $1))
        or (ev.entity_type = 'report' and exists (select 1 from public.reports rp where rp.id = ev.entity_id and rp.space_id = $1))
      )$f$, v_tabla.table_name);
    execute v_sql using v_t.to_space_id, v_t.from_space_id, v_t.establishment_id;
  end loop;

  -- 4 · RN-TRA-08 · el acceso del EQUIPO de origen se retira. No se borra
  -- —no se borra nada—, se marca retirado: dejarlo vivo sería una puerta
  -- abierta a un restaurante que ya no es de ese espacio.
  update public.worker_establishments
  set revoked_at = now(), revoked_by = auth.uid()
  where establishment_id = v_t.establishment_id
    and space_id = v_t.from_space_id
    and revoked_at is null;

  -- 5 · y el restaurante. Va el último a propósito: los pasos 1 a 3 miran
  -- `space_id` para saber qué mover, y moverlo antes les quitaría la
  -- referencia con la que distinguen lo suyo.
  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments
  set space_id = v_t.to_space_id, group_id = v_new_group_id
  where id = v_t.establishment_id;
  perform set_config('cuotly.status_change', 'off', true);

  update public.establishment_transfers
  set state = 'accepted', decided_by = auth.uid(), decided_at = now()
  where id = p_transfer_id;

  -- Decisión 149 · Reservas viaja con el restaurante (su agenda, su equipo y su saldo) y empieza una suscripción
  -- nueva en el destino. Va después de mover el restaurante: la suscripción se crea en SU espacio.
  if v_t.with_reservations then
    perform public.reservations_transfer_internal(v_t.establishment_id, v_t.from_space_id, v_t.to_space_id, auth.uid(), p_transfer_id);
  end if;

  -- RN-TRA-09 · el apunte en los dos libros. El del destino es el primero
  -- de la historia de ese restaurante ahí, y dice de dónde vino: es lo que
  -- explica por qué aparece con años de trabajo dentro (RN-TRA-11).
  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values
    (v_t.from_space_id, auth.uid(), 'establishment_transfer.accepted', 'establishment', v_t.establishment_id,
     jsonb_build_object('space_id', v_t.from_space_id),
     jsonb_build_object('space_id', v_t.to_space_id, 'transfer_id', p_transfer_id), v_t.reason),
    (v_t.to_space_id, auth.uid(), 'establishment_transfer.accepted', 'establishment', v_t.establishment_id,
     jsonb_build_object('space_id', v_t.from_space_id),
     jsonb_build_object('space_id', v_t.to_space_id, 'transfer_id', p_transfer_id), v_t.reason);
end;
$$;

revoke all on function public.accept_establishment_transfer(uuid) from public, anon;
grant execute on function public.accept_establishment_transfer(uuid) to authenticated;
