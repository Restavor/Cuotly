-- Fase A de Restavor agents (APP-00) · tercera de tres migraciones.
--
-- Lo que hace falta para que Restavor app abra la puerta y un restaurante pida
-- Reservas (decisiones 88, 89 y 91; RN-APP-01 y RN-APP-03):
--
--   1 · `establishment_permissions.manage_reservations` y `reservations_my_role()`:
--       el Propietario del restaurante y su Encargado de Reservas (un Editor con el
--       permiso). Sus casillas en "Usuarios y accesos" llegan en la Fase B.
--   2 · Tres tablas con RLS: `reservation_service_requests` (la solicitud),
--       `reservation_service_events` (sus apuntes) y `reservation_settings` (el ciclo
--       de vida del servicio, decisión 91). Solo se lee: escriben las RPC.
--   3 · `reservation_service_terms()`, `request_reservations()` y
--       `create_reservation_request_on_behalf()`. Pedir Reservas crea la solicitud
--       con la aceptación de las condiciones, avisa al restaurante y al equipo y no
--       crea nada más: ni suscripción, ni cobro, ni `plan_commitments` (RN-APP-03).
--       Aprobar y rechazar son de la Fase E.
--   4 · `my_products()` (RN-APP-01) y `my_contexts()`: un restaurante que solo
--       tiene Reservas deja de dar panel de Restavor web (PRD de agents §4.2).
--   5 · Los dos tipos de aviso nuevos y su enlace.
--   6 · Las tres tablas, clasificadas para la transferencia de restaurante.
--
-- Se comprueba con `supabase/tests/restavor_app_puerta_comun.sql`.

-- ------------------------------------------------------------
-- 1 · El Encargado
-- ------------------------------------------------------------
alter table public.establishment_permissions
  add column manage_reservations boolean not null default false;

comment on column public.establishment_permissions.manage_reservations is
  'PRD de agents §3.1 · el Encargado de Reservas: un Editor con este permiso ve y maneja Reservas. Sin él, un Editor no ve Reservas. El Propietario lo tiene todo por su rol.';

-- Quién es quien pregunta en Reservas, dentro de un restaurante: 'owner' (el
-- Propietario del restaurante o el global de su grupo), 'manager' (un Editor con
-- `manage_reservations`) o nulo. Lleva `is_establishment_client()` dentro porque
-- aparece en políticas y en `my_products()` y no debe contestar a un extraño.
create or replace function public.reservations_my_role(p_establishment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or not public.is_establishment_client(p_establishment_id) then null
    when exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id and em.user_id = auth.uid()
        and em.revoked_at is null and em.role = 'local_owner'
    ) or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id and gm.user_id = auth.uid()
        and gm.revoked_at is null and gm.role = 'global_owner'
    ) then 'owner'
    when exists (
      select 1 from public.establishment_memberships em
      join public.establishment_permissions ep on ep.establishment_membership_id = em.id
      where em.establishment_id = p_establishment_id and em.user_id = auth.uid()
        and em.revoked_at is null and em.role = 'editor' and ep.manage_reservations
    ) then 'manager'
    else null
  end;
$$;

revoke all on function public.reservations_my_role(uuid) from public, anon;
grant execute on function public.reservations_my_role(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2 · Las tablas
-- ------------------------------------------------------------
create table public.reservation_service_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- Quién la pide: el restaurante. Nulo cuando la crea el equipo en su nombre.
  requested_by uuid references public.profiles (id),
  -- Identidad del EQUIPO: privilegio de columna, el cliente no la lee (P7).
  created_on_behalf_by uuid references public.profiles (id),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected')),
  rejection_reason text,
  service_version_id uuid references public.service_versions (id),
  terms_accepted_by uuid references public.profiles (id),
  terms_accepted_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reservation_service_requests is
  'RN-APP-03 · la solicitud de un restaurante para contratar Reservas, con la aceptación de las condiciones. Aprobarla o rechazarla es de la Fase E; aquí solo se crea.';

-- Una sola solicitud abierta por restaurante.
create unique index reservation_service_requests_one_open_idx
  on public.reservation_service_requests (establishment_id) where status = 'requested';
-- CA-17 · la misma petición dos veces es una sola solicitud.
create unique index reservation_service_requests_idempotency_idx
  on public.reservation_service_requests (establishment_id, idempotency_key) where idempotency_key is not null;
create index reservation_service_requests_space_idx
  on public.reservation_service_requests (space_id, created_at desc);

create table public.reservation_service_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  request_id uuid references public.reservation_service_requests (id),
  type text not null check (type in (
    'requested', 'approved', 'rejected', 'terms_accepted', 'activated', 'past_due',
    'paused', 'reactivated', 'ending', 'closed', 'purged', 'support_session'
  )),
  actor_id uuid references public.profiles (id),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.reservation_service_events is
  'Decisión 91 · apuntes del ciclo de vida de Reservas. Solo se añaden filas; no se editan ni se borran.';

create index reservation_service_events_establishment_idx
  on public.reservation_service_events (establishment_id, created_at desc);

create table public.reservation_settings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id),
  service_status text not null default 'approved_pending_payment' check (service_status in (
    'approved_pending_payment', 'active', 'past_due', 'paused', 'ending', 'closed'
  )),
  grace_days smallint not null default 7 check (grace_days >= 0),
  onboarding_completed_at timestamptz,
  activated_at timestamptz,
  ending_at timestamptz,
  closed_at timestamptz,
  data_purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id)
);

comment on table public.reservation_settings is
  'Decisión 91 · el ciclo de vida de Reservas de un restaurante, independiente del de su plan de Restavor web. Solo columnas del ciclo de vida; la configuración del agente llega en la Fase B.';

alter table public.reservation_service_requests enable row level security;
alter table public.reservation_service_events enable row level security;
alter table public.reservation_settings enable row level security;

-- Solo lectura: lo escriben las RPC. El equipo del espacio lo ve por su espacio; el
-- restaurante, por su rol en Reservas.
create policy reservation_service_requests_select on public.reservation_service_requests
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) = 'owner');

create policy reservation_service_events_select on public.reservation_service_events
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) = 'owner');

create policy reservation_settings_select on public.reservation_settings
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

-- Privilegios: ni escrituras directas ni columnas con identidad del equipo (P7).
revoke all on public.reservation_service_requests from anon, authenticated;
revoke all on public.reservation_service_events from anon, authenticated;
revoke all on public.reservation_settings from anon, authenticated;

grant select (id, space_id, establishment_id, requested_by, status, rejection_reason, service_version_id,
              terms_accepted_by, terms_accepted_at, reviewed_at, created_at, updated_at)
  on public.reservation_service_requests to authenticated;
grant select (id, space_id, establishment_id, request_id, type, data, created_at)
  on public.reservation_service_events to authenticated;
grant select on public.reservation_settings to authenticated;

-- Modo soporte y espacios archivados: solo lectura (RN-ADM-07).
create trigger reservation_service_requests_guard_support_read_only
  before insert or update or delete on public.reservation_service_requests
  for each row execute function public.guard_support_read_only();
create trigger reservation_service_requests_cuotly_read_only
  before insert or update or delete on public.reservation_service_requests
  for each row execute function public.guard_space_read_only();
create trigger reservation_service_events_guard_support_read_only
  before insert or update or delete on public.reservation_service_events
  for each row execute function public.guard_support_read_only();
create trigger reservation_service_events_cuotly_read_only
  before insert or update or delete on public.reservation_service_events
  for each row execute function public.guard_space_read_only();
create trigger reservation_settings_guard_support_read_only
  before insert or update or delete on public.reservation_settings
  for each row execute function public.guard_support_read_only();
create trigger reservation_settings_cuotly_read_only
  before insert or update or delete on public.reservation_settings
  for each row execute function public.guard_space_read_only();

-- ------------------------------------------------------------
-- 5 · Los dos avisos nuevos y su enlace
-- ------------------------------------------------------------
alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications
  add constraint notifications_event_type_check check (event_type in (
    'request_submitted', 'job_unassigned', 'job_assigned', 'job_started', 'job_published',
    'correction_requested', 'job_reassignment_requested', 'task_reassignment_requested',
    'terms_version_published', 'menu_publication_requested', 'menu_assigned',
    'menu_needs_information', 'menu_published', 'menu_publication_error',
    'menu_not_prepared_reminder', 'menu_publication_overdue', 'quote_sent', 'quote_accepted',
    'quote_rejected', 'integration_sync_failed', 'integration_reauthorization_required',
    'report_schedule_due_soon', 'report_sent', 'cuotly_payment_due_soon',
    'cuotly_payment_due_today', 'cuotly_payment_overdue_24h', 'cuotly_payment_overdue_48h',
    'cuotly_payment_final_notice', 'cuotly_space_archived', 'cuotly_space_reactivated',
    'support_session_started', 'space_ownership_transferred', 'space_archived_by_owner',
    'incident_opened', 'incident_updated', 'incident_replied', 'storage_threshold_80',
    'storage_threshold_100', 'security_incident', 'consumption_threshold_80',
    'consumption_threshold_100', 't2_threshold_50', 't2_threshold_80', 't2_threshold_100',
    't2_critical_alert', 't2_reassignment_suggestion', 't3_threshold_75', 't3_threshold_90',
    't3_threshold_100', 'establishment_paused_nonpayment', 'establishment_suspended_nonpayment',
    'establishment_reactivated', 'charge_due_today', 'absence_requested', 'absence_decided',
    'absence_uncovered_jobs', 'establishment_access_granted', 'panel_invitation_pending_review',
    'panel_invitation_decided', 'review_received', 'low_review_received',
    'plan_revision_published', 'request_created_on_behalf', 'space_deleted_by_platform',
    'establishment_deleted_by_platform', 'credit_quote_requested',
    -- Migración 158 (RN-APP-03)
    'reservation_service_request', 'reservation_service_received'
  ));

-- El aviso al restaurante lleva a la puerta de Restavor app (`/`); los de agents, a `/agents…`.
alter table public.notifications drop constraint notifications_deep_link_check;
alter table public.notifications
  add constraint notifications_deep_link_check check (
    deep_link like '/espacios/%'
    or deep_link like '/administracion/%'
    or deep_link = '/estado'
    or deep_link = '/'
    or deep_link like '/agents%'
  );

-- ------------------------------------------------------------
-- 3 · Pedir Reservas
-- ------------------------------------------------------------
-- Las condiciones vigentes de Reservas para quien aún no contrató: la política de
-- `service_versions` solo se las enseña a quien ya está suscrito, así que se lee aquí.
create or replace function public.reservation_service_terms(p_establishment_id uuid)
returns table (service_id uuid, service_version_id uuid, version integer, conditions text,
               price_cents integer, published_at timestamptz)
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
  -- `coalesce`: `reservations_my_role()` es nulo para un extraño y `not (null or false)`
  -- es nulo, que un `if` no toma como cierto: sin él, el extraño pasaba.
  if not (coalesce(public.reservations_my_role(p_establishment_id) = 'owner', false)
          or public.has_capability(v_space, 'manage_clients')) then
    return;
  end if;
  if not exists (select 1 from public.spaces s where s.id = v_space and s.reservations_enabled) then
    return;
  end if;

  return query
    select s.id, v.id, v.version, v.conditions, s.price_cents, v.published_at
    from public.services s
    join public.service_versions v on v.service_id = s.lineage_id
    where s.space_id = v_space and s.kind = 'reservations'
      and s.superseded_at is null and s.archived_at is null
    order by v.version desc
    limit 1;
end;
$$;

revoke all on function public.reservation_service_terms(uuid) from public, anon;
grant execute on function public.reservation_service_terms(uuid) to authenticated;

-- Los avisos de una solicitud: al equipo que la aprueba (propietario y administradores
-- del espacio) y, como acuse, al restaurante que la pidió. Interna.
create or replace function public.reservations_notify_internal(p_request_id uuid, p_notify_client boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.reservation_service_requests;
  v_slug text;
  v_member record;
begin
  select * into v_req from public.reservation_service_requests where id = p_request_id;
  if v_req.id is null then
    return;
  end if;
  v_slug := public.space_slug(v_req.space_id);

  for v_member in
    select sm.user_id from public.space_memberships sm
    where sm.space_id = v_req.space_id and sm.status = 'active' and sm.role in ('owner', 'admin')
  loop
    perform public.emit_notification(
      v_req.space_id, v_member.user_id, 'reservation_service_request', 'staff', 'establishment',
      v_req.establishment_id, '/espacios/' || v_slug || '/reservas',
      'reservation_service_request:' || v_req.id::text, v_req.establishment_id);
  end loop;

  if p_notify_client and v_req.requested_by is not null then
    perform public.emit_notification(
      v_req.space_id, v_req.requested_by, 'reservation_service_received', 'client', 'establishment',
      v_req.establishment_id, '/',
      'reservation_service_received:' || v_req.id::text, v_req.establishment_id);
  end if;
end;
$$;

revoke all on function public.reservations_notify_internal(uuid, boolean) from public, anon, authenticated;

-- El restaurante pide Reservas (RN-APP-03). Solo su Propietario; solo si el espacio las
-- ofrece; con las condiciones vigentes; una sola abierta; la misma petición, una sola vez.
create or replace function public.request_reservations(
  p_establishment_id uuid, p_service_version_id uuid, p_idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null then
    raise exception 'Restaurante no encontrado';
  end if;

  -- CA-17 · pulsar dos veces no pide dos veces.
  if p_idempotency_key is not null then
    select id into v_id from public.reservation_service_requests
    where establishment_id = p_establishment_id and idempotency_key = p_idempotency_key
      and requested_by = v_actor;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if public.reservations_my_role(p_establishment_id) is distinct from 'owner' then
    raise exception 'Solo el propietario del restaurante puede pedir Reservas';
  end if;
  if not exists (select 1 from public.spaces s where s.id = v_space and s.reservations_enabled) then
    raise exception 'Este espacio todavía no ofrece Reservas';
  end if;
  if not exists (select 1 from public.reservation_service_terms(p_establishment_id) t
                 where t.service_version_id = p_service_version_id) then
    raise exception 'Las condiciones han cambiado: vuelve a leerlas antes de aceptar';
  end if;
  if exists (select 1 from public.reservation_settings rs
             where rs.establishment_id = p_establishment_id and rs.service_status <> 'closed') then
    raise exception 'Este restaurante ya tiene Reservas';
  end if;
  if exists (select 1 from public.reservation_service_requests q
             where q.establishment_id = p_establishment_id and q.status = 'requested') then
    raise exception 'Este restaurante ya tiene una solicitud de Reservas en marcha';
  end if;

  insert into public.reservation_service_requests
    (space_id, establishment_id, requested_by, status, service_version_id,
     terms_accepted_by, terms_accepted_at, idempotency_key)
  values
    (v_space, p_establishment_id, v_actor, 'requested', p_service_version_id,
     v_actor, now(), p_idempotency_key)
  returning id into v_id;

  insert into public.reservation_service_events (space_id, establishment_id, request_id, type, actor_id, data)
  values
    (v_space, p_establishment_id, v_id, 'requested', v_actor, '{}'::jsonb),
    (v_space, p_establishment_id, v_id, 'terms_accepted', v_actor,
     jsonb_build_object('service_version_id', p_service_version_id));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space, v_actor, 'reservations.requested', 'establishment', p_establishment_id,
          jsonb_build_object('request_id', v_id, 'service_version_id', p_service_version_id));

  perform public.reservations_notify_internal(v_id, true);
  return v_id;
end;
$$;

revoke all on function public.request_reservations(uuid, uuid, text) from public, anon;
grant execute on function public.request_reservations(uuid, uuid, text) to authenticated;

-- El equipo la crea en nombre del restaurante (como `create_request_on_behalf`): sin
-- aceptación de condiciones, que llega después, y sin acuse al restaurante.
create or replace function public.create_reservation_request_on_behalf(
  p_establishment_id uuid, p_idempotency_key text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_space uuid := public.establishment_space_id(p_establishment_id);
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Hace falta una sesión';
  end if;
  if v_space is null then
    raise exception 'Restaurante no encontrado';
  end if;
  if not public.has_capability(v_space, 'manage_clients') then
    raise exception 'No tienes permiso para crear solicitudes en nombre de este restaurante';
  end if;

  if p_idempotency_key is not null then
    select id into v_id from public.reservation_service_requests
    where establishment_id = p_establishment_id and idempotency_key = p_idempotency_key
      and created_on_behalf_by = v_actor;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if not exists (select 1 from public.spaces s where s.id = v_space and s.reservations_enabled) then
    raise exception 'Este espacio todavía no ofrece Reservas';
  end if;
  if exists (select 1 from public.reservation_settings rs
             where rs.establishment_id = p_establishment_id and rs.service_status <> 'closed') then
    raise exception 'Este restaurante ya tiene Reservas';
  end if;
  if exists (select 1 from public.reservation_service_requests q
             where q.establishment_id = p_establishment_id and q.status = 'requested') then
    raise exception 'Este restaurante ya tiene una solicitud de Reservas en marcha';
  end if;

  insert into public.reservation_service_requests
    (space_id, establishment_id, requested_by, created_on_behalf_by, status, idempotency_key)
  values
    (v_space, p_establishment_id, null, v_actor, 'requested', p_idempotency_key)
  returning id into v_id;

  insert into public.reservation_service_events (space_id, establishment_id, request_id, type, actor_id, data)
  values (v_space, p_establishment_id, v_id, 'requested', v_actor, jsonb_build_object('on_behalf', true));

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space, v_actor, 'reservations.requested_on_behalf', 'establishment', p_establishment_id,
          jsonb_build_object('request_id', v_id));

  perform public.reservations_notify_internal(v_id, false);
  return v_id;
end;
$$;

revoke all on function public.create_reservation_request_on_behalf(uuid, text) from public, anon;
grant execute on function public.create_reservation_request_on_behalf(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 4 · La puerta: qué abre cada persona
-- ------------------------------------------------------------
-- Un restaurante cuya relación con Restavor es solo Reservas: hay o hubo solicitud o
-- ajustes de Reservas y no tiene plan ni otro servicio. No da panel de Restavor web.
create or replace function public.establishment_is_reservations_only(p_establishment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_establishment_client(p_establishment_id)
    and (exists (select 1 from public.reservation_settings rs where rs.establishment_id = p_establishment_id)
         or exists (select 1 from public.reservation_service_requests q where q.establishment_id = p_establishment_id))
    and not exists (
      select 1 from public.subscriptions s
      left join public.services sv on sv.id = s.service_id
      where s.establishment_id = p_establishment_id and s.status = 'active'
        and (s.kind = 'plan' or (s.kind = 'service' and sv.kind <> 'reservations'))
    );
$$;

revoke all on function public.establishment_is_reservations_only(uuid) from public, anon;
grant execute on function public.establishment_is_reservations_only(uuid) to authenticated;

-- RN-APP-01 · qué productos puede abrir quien pregunta (web, agents) y qué puede
-- contratar (agents_offer) o ha solicitado (agents_requests). SECURITY DEFINER porque
-- hay que mirar solicitudes y ajustes de Reservas que la RLS tapa a quien aún no
-- contrató; todo se filtra por `auth.uid()` y por `reservations_my_role()`.
create or replace function public.my_products()
returns table (kind text, space_id uuid, space_slug text, establishment_id uuid,
               establishment_name text, detail text, reason text, at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  -- web · soy del equipo de un espacio de mantenimiento.
  select 'web'::text, sm.space_id, public.space_slug(sm.space_id), null::uuid, null::text,
         'team'::text, null::text, null::timestamptz
  from public.space_memberships sm
  where auth.uid() is not null and sm.user_id = auth.uid() and sm.status = 'active'

  union all

  -- web · tengo el panel de un restaurante con plan o con algún servicio que no sea Reservas.
  select 'web', e.space_id, public.space_slug(e.space_id), e.id, e.name, 'panel', null, null
  from public.establishments e
  where public.is_establishment_client(e.id) and not public.establishment_is_reservations_only(e.id)

  union all

  -- agents · Propietario o Encargado de un restaurante con Reservas contratada; o el
  -- Propietario de uno cerrado durante los 30 días de descarga.
  select 'agents', e.space_id, public.space_slug(e.space_id), e.id, e.name, rs.service_status, null, null
  from public.reservation_settings rs
  join public.establishments e on e.id = rs.establishment_id
  where (public.reservations_my_role(e.id) in ('owner', 'manager') and rs.service_status <> 'closed')
     or (public.reservations_my_role(e.id) = 'owner' and rs.service_status = 'closed'
         and rs.data_purged_at is null and rs.closed_at > now() - interval '30 days')

  union all

  -- agents_offer · soy Propietario, no tiene Reservas ni solicitud en marcha, y el espacio las ofrece.
  select 'agents_offer', e.space_id, public.space_slug(e.space_id), e.id, e.name, null, null, null
  from public.establishments e
  join public.spaces sp on sp.id = e.space_id
  where sp.reservations_enabled
    and public.reservations_my_role(e.id) = 'owner'
    and not exists (select 1 from public.reservation_settings rs
                    where rs.establishment_id = e.id and rs.service_status <> 'closed')
    and not exists (select 1 from public.reservation_service_requests q
                    where q.establishment_id = e.id and q.status = 'requested')

  union all

  -- agents_requests · mis solicitudes enviadas o rechazadas (la última de cada restaurante), para enseñar su estado.
  select 'agents_requests', q.space_id, public.space_slug(q.space_id), e.id, e.name, q.status,
         q.rejection_reason, coalesce(q.reviewed_at, q.created_at)
  from public.reservation_service_requests q
  join public.establishments e on e.id = q.establishment_id
  where public.reservations_my_role(e.id) = 'owner'
    and q.status in ('requested', 'rejected')
    and q.id = (select q2.id from public.reservation_service_requests q2
                where q2.establishment_id = q.establishment_id order by q2.created_at desc limit 1)
    and not exists (select 1 from public.reservation_settings rs
                    where rs.establishment_id = e.id and rs.service_status <> 'closed');
$$;

revoke all on function public.my_products() from public, anon;
grant execute on function public.my_products() to authenticated;

-- `my_contexts()` sigue siendo SECURITY INVOKER y con la misma firma (la usa la app
-- móvil): solo deja fuera los restaurantes que son solo Reservas.
create or replace function public.my_contexts()
returns table (kind text, space_id uuid, space_slug text, space_name text, space_timezone text,
               establishment_id uuid, establishment_name text, role text)
language sql
stable
set search_path = public
as $$
  -- Los espacios de mantenimiento donde soy miembro activo, con mi rol.
  select 'space'::text,
         s.id,
         s.slug,
         s.name,
         s.timezone,
         null::uuid,
         null::text,
         m.role::text
  from public.space_memberships m
  join public.spaces s on s.id = m.space_id
  where m.user_id = auth.uid() and m.status = 'active'

  union all

  -- Los paneles de restaurante a los que tengo acceso COMO CLIENTE. La
  -- condición no es `can_read_establishment()`: esa también es cierta para
  -- el equipo, que ya ve el restaurante dentro de su espacio y lo vería
  -- aquí otra vez como si fuera un contexto suyo.
  -- RN-APP-01 · un restaurante que solo tiene Reservas no tiene panel de Restavor web.
  select 'establishment'::text,
         e.space_id,
         public.space_slug(e.space_id),
         null::text,
         public.establishment_timezone(e.id),
         e.id,
         e.name,
         null::text
  from public.establishments e
  where public.is_establishment_client(e.id)
    and not public.establishment_is_reservations_only(e.id)
  order by 1, 7 nulls first, 4;
$$;

-- ------------------------------------------------------------
-- 6 · Las tres tablas nuevas, clasificadas para la transferencia (RN-TRA-13)
-- ------------------------------------------------------------
-- Copia viva de la definición de la migración 131 con tres líneas más. La
-- suite `las_cuatro_del_grupo_c.sql` falla si una tabla con `space_id` y
-- `establishment_id` no está en esta lista.
create or replace function public.establishment_transfer_tables()
returns table(table_name text, travels boolean)
language sql
immutable
as $$
  select * from (values
    -- Viaja: el trabajo del restaurante.
    ('requests', true), ('request_attachments', true),
    ('jobs', true), ('tasks', true), ('corrections', true),
    ('conversations', true), ('files', true),
    ('menus', true), ('menu_templates', true), ('menu_publications', true),
    ('menu_corrections', true), ('menu_downloads', true),
    ('integrations', true), ('metric_points', true), ('sync_runs', true),
    -- RN-INT-10 (migración 117) · su ficha de Google es suya.
    ('reviews', true),
    ('opportunities', true), ('opportunity_detections', true), ('opportunity_notes', true),
    ('reports', true),
    ('establishment_notes', true), ('internal_notes', true),
    -- Se queda: el dinero y el plan que cobró el origen (RN-TRA-04),
    -- sus ciclos de consumo (RN-TRA-12), lo que se le aceptó a él y los
    -- avisos que recibió su equipo.
    ('charges', false), ('payments', false), ('receipts', false),
    ('financial_entries', false), ('quotes', false),
    ('subscriptions', false), ('plan_commitments', false), ('scheduled_plan_changes', false),
    ('consumption_cycles', false), ('consumption_entries', false),
    ('menu_update_cycles', false), ('menu_update_entries', false),
    ('acceptances', false), ('terms_acceptances', false),
    -- RN-COM-23 (migración 131) · lo que aceptó, con el plan de origen.
    ('revision_acceptances', false),
    ('space_exports', false), ('notifications', false),
    -- Las copias son del espacio que las hizo: llevan dentro material de
    -- SU equipo —conversaciones internas incluidas— y quien lo generó
    -- responde de ello. El destino empieza a hacer las suyas al día
    -- siguiente, con el barrido de RN-BCK-02.
    ('establishment_backups', false),
    -- Se queda y además se retira: RN-TRA-08, el acceso del EQUIPO de
    -- origen no significa nada en otro espacio, y dejarlo vivo sería una
    -- puerta abierta a un restaurante que ya no es suyo.
    ('worker_establishments', false),
    -- RN-EST-19 (migración 119) · lo mismo, y por lo mismo: quien lo
    -- llevaba es del equipo de origen.
    ('establishment_managers', false),
    -- RN-ACC-13 (migración 114) · se queda, y además deja de poder
    -- gastarse: lo garantiza la comprobación de espacio de
    -- `consume_establishment_invitation()`, no esta lista.
    ('establishment_invitations', false),
    -- RN-APP-03 (migración 158) · Reservas se queda con el espacio que la
    -- presta: su solicitud, sus apuntes y su ciclo de vida cuelgan de la
    -- suscripción y los cobros de ese espacio (decisión 91), que tampoco
    -- viajan. Lo que pase con Reservas al transferir el restaurante lo
    -- decide Bosco con la Fase E, que es cuando hay cobros de Reservas.
    ('reservation_service_requests', false), ('reservation_service_events', false),
    ('reservation_settings', false)
  ) as t(table_name, travels);
$$;
