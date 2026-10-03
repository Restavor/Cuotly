-- Fase E de Restavor agents (COB-01) · segunda de tres migraciones.
--
-- Aprobar y rechazar la solicitud de Reservas, cobrar la primera mensualidad y activar
-- el servicio al registrarse el pago (PRD de agents §4.4, §6.12; RN-APP-03, RN-RES-11):
--
--   1 · Dónde se guardan los datos de pago (decisión 132): `spaces.payment_iban`,
--       `payment_bizum_phone` y `payment_note`, que edita el propietario del espacio.
--       Hasta que se rellenen, las pantallas y el correo dicen «sin configurar».
--   2 · Las piezas internas: propietarios del restaurante, deuda viva de un cobro de
--       Reservas, «desde cuándo está vencido» y el aviso a propietarios.
--   3 · `reservations_start_subscription()` (interna): la suscripción al servicio
--       Reservas **sin** `plan_commitments` ni `consumption_cycles` (D-H) y su primer
--       cobro con el motor de siempre.
--   4 · `approve_reservation_request()`, `reject_reservation_request()`,
--       `accept_reservation_terms()` y `reservation_payment_info()`.
--   5 · El gancho de reactivación (decisión 134): un disparador sobre
--       `financial_entries`, no una edición de `register_payment()`. Cualquier pago o
--       condonación de un cobro de Reservas llama a `reservations_after_payment()`.
--   6 · Los avisos de dinero y pausa pasan a ser obligatorios.
--
-- Se comprueba con `supabase/tests/reservas_cobro_y_ciclo.sql`.

-- ------------------------------------------------------------
-- 1 · Los datos de pago
-- ------------------------------------------------------------
alter table public.spaces
  add column payment_iban text,
  add column payment_bizum_phone text,
  add column payment_note text,
  add constraint spaces_payment_iban_len check (payment_iban is null or char_length(payment_iban) between 15 and 42),
  add constraint spaces_payment_bizum_len check (payment_bizum_phone is null or char_length(payment_bizum_phone) between 9 and 20),
  add constraint spaces_payment_note_len check (payment_note is null or char_length(payment_note) <= 300);

comment on column public.spaces.payment_iban is
  'Decisión 132 · IBAN al que paga el restaurante las mensualidades de Reservas. Solo lo lee el equipo del espacio; el restaurante lo ve por `reservation_payment_info()`.';

alter table public.reservation_staff
  add column anonymized_at timestamptz;

comment on column public.reservation_staff.anonymized_at is
  'PRD de agents §6.13 · el nombre del Equipo se anonimiza (UPDATE) a los 30 días del cierre de Reservas.';

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
  if v_iban is not null and v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
    raise exception 'El IBAN no tiene un formato válido';
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

-- ------------------------------------------------------------
-- 2 · Piezas internas
-- ------------------------------------------------------------
-- Los Propietarios del restaurante: el `local_owner` y el `global_owner` de su grupo.
create or replace function public.reservations_owner_ids(p_establishment_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select em.user_id from public.establishment_memberships em
  where em.establishment_id = p_establishment_id and em.revoked_at is null and em.role = 'local_owner'
  union
  select gm.user_id from public.group_memberships gm
  join public.establishments e on e.group_id = gm.group_id
  where e.id = p_establishment_id and gm.revoked_at is null and gm.role = 'global_owner';
$$;

-- La deuda viva de un cobro, sin pedir visibilidad financiera a quien pregunta (la usan
-- el barrido, que no es de ningún espacio, y el gancho de pago). Misma suma que
-- `charge_outstanding_cents()`: los apuntes del libro del cobro (RN-FIN-02).
create or replace function public.reservations_charge_outstanding(p_charge_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(fe.amount_cents), 0)::bigint
  from public.financial_entries fe where fe.charge_id = p_charge_id;
$$;

-- Desde cuándo está vencido el cobro de Reservas más antiguo con deuda (nulo si no hay).
create or replace function public.reservations_overdue_since(p_establishment_id uuid, p_now timestamptz default now())
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select min(c.due_at)
  from public.charges c
  where c.establishment_id = p_establishment_id
    and c.due_at < p_now
    and public.charge_is_reservations(c.id)
    and public.reservations_charge_outstanding(c.id) > 0;
$$;

-- Un aviso a los Propietarios del restaurante (los de dinero son solo de ellos, §6.12).
-- Devuelve cuántos se crearon: repetir la misma clave no crea ninguno (idempotente).
create or replace function public.reservations_emit_to_owners(
  p_establishment_id uuid, p_event_type text, p_deep_link text, p_dedupe_key text,
  p_amount_cents bigint default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_user uuid;
  v_id uuid;
  v_n integer := 0;
begin
  if v_space is null then
    return 0;
  end if;
  for v_user in select * from public.reservations_owner_ids(p_establishment_id) loop
    v_id := public.emit_notification(
      v_space, v_user, p_event_type, 'client', 'establishment', p_establishment_id,
      p_deep_link, p_dedupe_key, p_establishment_id, null, p_amount_cents, true);
    if v_id is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.reservations_owner_ids(uuid) from public, anon, authenticated;
revoke all on function public.reservations_charge_outstanding(uuid) from public, anon, authenticated;
revoke all on function public.reservations_overdue_since(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reservations_emit_to_owners(uuid, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.reservations_owner_ids(uuid) to service_role;
grant execute on function public.reservations_charge_outstanding(uuid) to service_role;
grant execute on function public.reservations_overdue_since(uuid, timestamptz) to service_role;
grant execute on function public.reservations_emit_to_owners(uuid, text, text, text, bigint) to service_role;

-- ------------------------------------------------------------
-- 3 · La suscripción a Reservas y su primer cobro (interna)
-- ------------------------------------------------------------
-- Reservas NO crea `plan_commitments` ni `consumption_cycles` (D-H, decisión 95): por eso
-- no pasa por `create_service_subscription()`. La guarda de la migración 156 solo deja
-- insertar con `restavor.reservations_approval = 'on'`, que se pone y se quita aquí.
create or replace function public.reservations_start_subscription(
  p_establishment_id uuid, p_actor uuid, p_terms_version_id uuid, p_terms_accepted_by uuid,
  p_terms_accepted_at timestamptz)
returns table (subscription_id uuid, charge_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_service uuid;
  v_sub uuid;
  v_charge uuid;
begin
  select s.id into v_service
  from public.services s
  where s.space_id = v_space and s.kind = 'reservations'
    and s.superseded_at is null and s.archived_at is null
  order by s.created_at
  limit 1;
  if v_service is null then
    raise exception 'Este espacio no tiene el servicio Reservas en su catálogo';
  end if;

  perform set_config('restavor.reservations_approval', 'on', true);
  insert into public.subscriptions (space_id, establishment_id, kind, service_id, created_by)
  values (v_space, p_establishment_id, 'service', v_service, p_actor)
  returning id into v_sub;
  perform set_config('restavor.reservations_approval', 'off', true);

  -- La aceptación que ya dio el restaurante al pedir Reservas pasa a `terms_acceptances`
  -- (necesita una suscripción, PRD §4.4). Si la solicitud la creó el equipo en su nombre,
  -- aún no hay aceptación y la da el Propietario en `/agents/<id>/condiciones`.
  if p_terms_version_id is not null and p_terms_accepted_by is not null then
    insert into public.terms_acceptances
      (space_id, establishment_id, subscription_id, service_version_id, channel, accepted_by, accepted_at)
    values
      (v_space, p_establishment_id, v_sub, p_terms_version_id, 'in_app', p_terms_accepted_by,
       coalesce(p_terms_accepted_at, now()));
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space, p_actor, 'subscription.service_created', 'subscription', v_sub,
          jsonb_build_object('establishment_id', p_establishment_id, 'service_id', v_service,
                             'via', 'reservations'));

  v_charge := public.generate_monthly_charge_internal(v_sub, null);
  return query select v_sub, v_charge;
end;
$$;

revoke all on function public.reservations_start_subscription(uuid, uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reservations_start_subscription(uuid, uuid, uuid, uuid, timestamptz) to service_role;

-- ------------------------------------------------------------
-- 4 · Aprobar, rechazar, aceptar condiciones y datos de pago
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

create or replace function public.reject_reservation_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.reservation_service_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión';
  end if;
  select * into v_req from public.reservation_service_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;
  if not public.has_capability(v_req.space_id, 'manage_clients') then
    raise exception 'No tienes permiso para rechazar solicitudes de Reservas';
  end if;
  if v_req.status = 'rejected' then
    return;
  end if;
  if v_req.status <> 'requested' then
    raise exception 'Esta solicitud ya está resuelta';
  end if;
  if v_reason is null then
    raise exception 'Rechazar una solicitud pide un motivo';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'El motivo admite 500 caracteres como máximo';
  end if;

  update public.reservation_service_requests
  set status = 'rejected', rejection_reason = v_reason, reviewed_by = v_actor,
      reviewed_at = now(), updated_at = now()
  where id = v_req.id;

  insert into public.reservation_service_events (space_id, establishment_id, request_id, type, actor_id, data)
  values (v_req.space_id, v_req.establishment_id, v_req.id, 'rejected', v_actor,
          jsonb_build_object('reason', v_reason));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value, reason)
  values (v_req.space_id, v_actor, 'reservations.rejected', 'establishment', v_req.establishment_id,
          jsonb_build_object('request_id', v_req.id), v_reason);

  perform public.reservations_emit_to_owners(
    v_req.establishment_id, 'reservation_service_rejected', '/',
    'reservation_service_rejected:' || v_req.id::text, null);
end;
$$;

revoke all on function public.reject_reservation_request(uuid, text) from public, anon;
grant execute on function public.reject_reservation_request(uuid, text) to authenticated;

-- El Propietario acepta las condiciones de Reservas cuando la solicitud la creó el equipo
-- en su nombre (PRD §4.4 paso 4). Reutiliza `accept_subscription_terms()`.
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

  return v_id;
end;
$$;

revoke all on function public.accept_reservation_terms(uuid) from public, anon;
grant execute on function public.accept_reservation_terms(uuid) to authenticated;

-- «Aprobado: datos para pagar» (PRD §4.4): el importe con IVA, el IBAN, el Bizum y el
-- concepto, del cobro de Reservas más antiguo con deuda. Solo el Propietario del
-- restaurante, el equipo del espacio (`manage_clients`) y el servidor (que compone el
-- correo).
create or replace function public.reservation_payment_info(p_establishment_id uuid)
returns table (
  charge_id uuid, concept text, reference text, base_cents integer, tax_cents integer,
  total_cents integer, outstanding_cents bigint, due_at timestamptz,
  period_start timestamptz, period_end timestamptz,
  iban text, bizum_phone text, payment_note text, payee_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space is null then
    return;
  end if;
  if auth.uid() is null then
    -- El servidor (correo de «Aprobado» y de «En pausa»): solo con la clave de servicio.
    if coalesce(auth.role(), '') <> 'service_role' then
      return;
    end if;
  elsif not (coalesce(public.reservations_my_role(p_establishment_id) = 'owner', false)
             or public.has_capability(v_space, 'manage_clients')) then
    return;
  end if;

  return query
    select c.id, c.concept,
           'Reservas ' || e.name || ' ' || to_char(c.period_start at time zone sp.timezone, 'YYYY-MM'),
           c.base_cents, c.tax_cents, c.total_cents,
           public.reservations_charge_outstanding(c.id), c.due_at, c.period_start, c.period_end,
           sp.payment_iban, sp.payment_bizum_phone, sp.payment_note, sp.legal_name
    from public.charges c
    join public.establishments e on e.id = c.establishment_id
    join public.spaces sp on sp.id = c.space_id
    where c.establishment_id = p_establishment_id
      and public.charge_is_reservations(c.id)
      and public.reservations_charge_outstanding(c.id) > 0
    order by c.due_at asc, c.issued_at asc
    limit 1;
end;
$$;

revoke all on function public.reservation_payment_info(uuid) from public, anon;
grant execute on function public.reservation_payment_info(uuid) to authenticated, service_role;

-- Los cobros de Reservas de un restaurante para «Plan y pagos» (PRD §11.1, `AjustesPlan`):
-- los últimos 24, con su deuda viva y su estado. Mismos permisos que `reservation_payment_info`.
create or replace function public.reservation_plan_charges(p_establishment_id uuid)
returns table (
  charge_id uuid, concept text, period_start timestamptz, period_end timestamptz,
  total_cents integer, outstanding_cents bigint, due_at timestamptz, issued_at timestamptz, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
begin
  if v_space is null then
    return;
  end if;
  if auth.uid() is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      return;
    end if;
  elsif not (coalesce(public.reservations_my_role(p_establishment_id) = 'owner', false)
             or public.has_capability(v_space, 'manage_clients')) then
    return;
  end if;

  return query
    select c.id, c.concept, c.period_start, c.period_end, c.total_cents,
           public.reservations_charge_outstanding(c.id), c.due_at, c.issued_at,
           case
             when public.reservations_charge_outstanding(c.id) <= 0 then 'paid'
             when now() > c.due_at then 'overdue'
             when public.reservations_charge_outstanding(c.id) < c.total_cents then 'partially_paid'
             else 'pending'
           end
    from public.charges c
    where c.establishment_id = p_establishment_id and public.charge_is_reservations(c.id)
    order by c.period_start desc, c.issued_at desc
    limit 24;
end;
$$;

revoke all on function public.reservation_plan_charges(uuid) from public, anon;
grant execute on function public.reservation_plan_charges(uuid) to authenticated, service_role;

-- Descargar todas las reservas en Excel (PRD §6.13): el Propietario cuando quiera, y el soporte en
-- sesión. Descargar datos personales deja huella en la auditoría —quién y cuántas filas, nunca los
-- datos—, igual que abrir una sesión de soporte.
create or replace function public.audit_reservations_export(p_establishment_id uuid, p_rows integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_via text;
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if public.reservations_my_role(p_establishment_id) = 'owner' then
    v_via := 'owner';
  elsif public.reservations_can_read_diner_data(p_establishment_id) then
    v_via := 'restavor_support';
  else
    raise exception 'No tienes permiso para descargar las reservas de este restaurante';
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space, auth.uid(), 'reservations.exported', 'establishment', p_establishment_id,
          jsonb_build_object('rows', greatest(coalesce(p_rows, 0), 0), 'via', v_via));
end;
$$;

revoke all on function public.audit_reservations_export(uuid, integer) from public, anon;
grant execute on function public.audit_reservations_export(uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- 5 · El gancho de reactivación
-- ------------------------------------------------------------
-- Tras un pago o una condonación de un cobro de Reservas (PRD §6.12):
--   · `approved_pending_payment` → `active` si el cobro queda saldado (`activated_at`).
--   · `past_due`/`paused` → `active` solo si NO queda ningún cobro de Reservas vencido
--     con deuda; con un pago parcial sigue igual.
--   · `ending` y `closed`: pagar deuda antigua la salda pero no cambia el estado.
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
    if public.reservations_charge_outstanding(v_charge.id) <= 0
       and v_charge.subscription_id is not distinct from v_set.subscription_id then
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

create or replace function public.financial_entries_reservations_hook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reservations_after_payment(new.charge_id);
  return null;
end;
$$;

revoke all on function public.financial_entries_reservations_hook() from public, anon, authenticated;

-- Solo los apuntes que reducen la deuda (pago y condonación). Un pago registrado por el
-- equipo, por el barrido o desde una función futura entra por la misma puerta.
create trigger financial_entries_reservations_after_payment
  after insert on public.financial_entries
  for each row
  when (new.entry_type in ('payment', 'waiver'))
  execute function public.financial_entries_reservations_hook();

-- ------------------------------------------------------------
-- 6 · Avisos obligatorios
-- ------------------------------------------------------------
-- Lo que mueve dinero o pausa un servicio no se puede silenciar (como el impago de
-- Restavor web). Copia viva de la migración 141, con los tipos de Reservas añadidos.
create or replace function public.notification_event_is_mandatory(p_event_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_event_type in (
    't2_threshold_100',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'cuotly_payment_final_notice',
    'cuotly_space_archived',
    'support_session_started',
    'space_ownership_transferred',
    'space_archived_by_owner',
    'security_incident',
    'space_deleted_by_platform',
    'establishment_deleted_by_platform',
    -- Fase E de Restavor agents (decisión 99 y PRD §6.12)
    'reservation_service_approved',
    'reservation_service_rejected',
    'reservations_payment_due',
    'reservations_past_due',
    'reservations_paused',
    'reservations_ending',
    'reservations_closed_purge_soon'
  );
$$;
