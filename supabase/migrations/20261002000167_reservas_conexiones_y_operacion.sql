-- Fase B de Restavor agents (AGT-01) · séptima de siete migraciones.
--
-- Conexiones, operación y datos de Reservas (PRD de agents §8.7 y §9.4) y lo que
-- hay que ampliar de lo que ya existía:
--
--   1 · `reservation_platform_connections` (credenciales cifradas, que ni el
--       restaurante ni el equipo leen por consulta), `reservation_incidents`,
--       `reservations_api_idempotency`, `reservations_rate_limits`,
--       `reservation_monthly_stats` y `web_push_subscriptions`.
--   2 · La clave ajena de `reservations.platform_connection_id`.
--   3 · Avisos nuevos (§9.4): los tipos de `notifications.event_type`, el tipo de
--       entidad `reservation` y el canal `web_push` de `notification_deliveries`.
--   4 · `establishment_transfer_tables()`: las tablas nuevas, clasificadas.
--
-- Se comprueba con `supabase/tests/reservas_cimientos.sql`.

-- ------------------------------------------------------------
-- 1 · Conexiones, incidentes y estadísticas
-- ------------------------------------------------------------
create table public.reservation_platform_connections (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  provider text not null check (btrim(provider) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  -- Cifradas con el sistema de `INTEGRATIONS_VAULT_KEY` del repositorio. Nadie las
  -- lee por consulta: las descifra el servidor.
  credentials_encrypted text,
  status text not null default 'disconnected' check (status in ('connected', 'error', 'disconnected')),
  -- { can_cancel, can_modify, has_webhooks }
  capabilities jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reservation_platform_connections is
  'PRD de agents §10.2 · una conexión a una plataforma de reservas (TheFork, CoverManager…). Las credenciales van cifradas y no salen de la base hacia ninguna pantalla.';

create index reservation_platform_connections_establishment_idx
  on public.reservation_platform_connections (establishment_id);

-- La reserva de plataforma apunta a su conexión (migración 164).
alter table public.reservations
  add constraint reservations_platform_connection_fk
  foreign key (platform_connection_id) references public.reservation_platform_connections (id);

create table public.reservation_incidents (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  kind text not null check (kind in ('platform', 'email', 'whatsapp', 'sms', 'agent', 'web', 'payment', 'system')),
  severity text not null check (severity in ('error', 'info')),
  title text not null check (btrim(title) <> ''),
  -- Los contactos van enmascarados (ju***@gmail.com): nunca datos de comensales.
  detail text,
  data jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  -- Del equipo de Restavor: identidad, privilegio de columna.
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.reservation_incidents is
  'PRD de agents §8.7 · errores y avisos de operación de Reservas. Los lee el equipo del espacio, no el restaurante.';

create index reservation_incidents_open_idx
  on public.reservation_incidents (establishment_id, created_at desc) where resolved_at is null;

-- La API del agente guarda la respuesta de cada petición para repetirla. No se
-- borra: a las 24 horas se vacía `response` con un UPDATE (puede llevar datos
-- personales) y la clave deja de valer.
create table public.reservations_api_idempotency (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  key text not null,
  request_hash text not null,
  response jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (establishment_id, key)
);

comment on table public.reservations_api_idempotency is
  'PRD de agents §8.7 · idempotencia de la API del agente. Solo el servidor la lee y la escribe.';

-- Una fila por cubo (clave o IP más ruta), que se reinicia con UPDATE al empezar
-- cada ventana: no crece ni se borra. No es de ningún espacio.
create table public.reservations_rate_limits (
  bucket text primary key,
  count integer not null default 0 check (count >= 0),
  window_start timestamptz not null default now()
);

comment on table public.reservations_rate_limits is
  'PRD de agents §8.7 · límite de peticiones por cubo. Sin espacio: la clave es de la API, no de un restaurante. Solo el servidor.';

create table public.reservation_monthly_stats (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  source text not null check (source in ('agent', 'platform', 'web', 'manual')),
  reservations_count integer not null default 0 check (reservations_count >= 0),
  people_count integer not null default 0 check (people_count >= 0),
  calls_count integer not null default 0 check (calls_count >= 0),
  call_minutes integer not null default 0 check (call_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id, month, source)
);

comment on table public.reservation_monthly_stats is
  'RN-RES-12 · cifras mensuales sin datos personales. Sobreviven al borrado de los datos de un restaurante cerrado.';

-- Suscripciones de Web Push de una persona: sin espacio ni restaurante, como
-- `push_devices`. `endpoint` y las claves son secretos del navegador.
create table public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

comment on table public.web_push_subscriptions is
  'PRD de agents §9.4 · suscripciones de push web de una persona. Sin espacio, como push_devices. Endpoint y claves, solo para el servidor.';

create index web_push_subscriptions_user_idx
  on public.web_push_subscriptions (user_id) where revoked_at is null;

-- ------------------------------------------------------------
-- RLS, privilegios y solo lectura en soporte
-- ------------------------------------------------------------
alter table public.reservation_platform_connections enable row level security;
alter table public.reservation_incidents enable row level security;
alter table public.reservations_api_idempotency enable row level security;
alter table public.reservations_rate_limits enable row level security;
alter table public.reservation_monthly_stats enable row level security;
alter table public.web_push_subscriptions enable row level security;

-- "Ver estado de las conexiones": el restaurante y el equipo (PRD §3.2).
create policy reservation_platform_connections_select on public.reservation_platform_connections
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

-- Los incidentes son de operación: solo el equipo del espacio.
create policy reservation_incidents_select on public.reservation_incidents
  for select to authenticated
  using (public.is_space_member(space_id));

-- Solo el servidor: la política dice que nadie con sesión las lee.
create policy reservations_api_idempotency_select on public.reservations_api_idempotency
  for select to authenticated using (false);
create policy reservations_rate_limits_select on public.reservations_rate_limits
  for select to authenticated using (false);

-- Cifras: sin datos personales, las ven el restaurante y el equipo.
create policy reservation_monthly_stats_select on public.reservation_monthly_stats
  for select to authenticated
  using (public.is_space_member(space_id) or public.reservations_my_role(establishment_id) in ('owner', 'manager'));

create policy web_push_subscriptions_select on public.web_push_subscriptions
  for select to authenticated using (user_id = auth.uid());

revoke all on public.reservation_platform_connections from anon, authenticated;
revoke all on public.reservation_incidents from anon, authenticated;
revoke all on public.reservations_api_idempotency from anon, authenticated;
revoke all on public.reservations_rate_limits from anon, authenticated;
revoke all on public.reservation_monthly_stats from anon, authenticated;
revoke all on public.web_push_subscriptions from anon, authenticated;

grant select (id, space_id, establishment_id, provider, display_name, status, capabilities,
              last_sync_at, last_error, last_error_at, created_at, updated_at)
  on public.reservation_platform_connections to authenticated;
grant select (id, space_id, establishment_id, kind, severity, title, detail, data, resolved_at, created_at)
  on public.reservation_incidents to authenticated;
grant select on public.reservation_monthly_stats to authenticated;
grant select (id, user_id, user_agent, created_at, last_seen_at, revoked_at)
  on public.web_push_subscriptions to authenticated;

create trigger reservation_platform_connections_guard_support_read_only
  before insert or update or delete on public.reservation_platform_connections
  for each row execute function public.guard_support_read_only();
create trigger reservation_platform_connections_cuotly_read_only
  before insert or update or delete on public.reservation_platform_connections
  for each row execute function public.guard_space_read_only();
create trigger reservation_incidents_guard_support_read_only
  before insert or update or delete on public.reservation_incidents
  for each row execute function public.guard_support_read_only();
create trigger reservation_incidents_cuotly_read_only
  before insert or update or delete on public.reservation_incidents
  for each row execute function public.guard_space_read_only();
create trigger reservations_api_idempotency_guard_support_read_only
  before insert or update or delete on public.reservations_api_idempotency
  for each row execute function public.guard_support_read_only();
create trigger reservations_api_idempotency_cuotly_read_only
  before insert or update or delete on public.reservations_api_idempotency
  for each row execute function public.guard_space_read_only();
create trigger reservation_monthly_stats_guard_support_read_only
  before insert or update or delete on public.reservation_monthly_stats
  for each row execute function public.guard_support_read_only();
create trigger reservation_monthly_stats_cuotly_read_only
  before insert or update or delete on public.reservation_monthly_stats
  for each row execute function public.guard_space_read_only();

-- ------------------------------------------------------------
-- 3 · Avisos nuevos (PRD de agents §9.4)
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
    'reservation_service_request', 'reservation_service_received',
    -- Migración 167 (PRD de agents §9.4)
    'reservation_new', 'reservation_group_pending', 'reservation_group_pending_reminder',
    'agent_balance_low', 'agent_balance_empty', 'agent_off_long', 'reservations_payment_due',
    'reservations_past_due', 'reservations_paused', 'reservations_activated',
    'reservations_ending', 'reservations_closed_purge_soon', 'platform_connection_error',
    'reservation_service_approved', 'reservation_service_rejected', 'agent_topup_receipt'
  ));

alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications
  add constraint notifications_entity_type_check check (entity_type in (
    'request', 'job', 'task', 'establishment', 'charge', 'absence', 'menu', 'quote',
    'integration', 'report', 'cuotly_charge', 'space', 'support_session', 'incident', 'review',
    'reservation'
  ));

-- El nuevo canal de entrega: push web. La cola del repositorio no lo reparte
-- (§9.4): lo envía el servidor al crear el aviso.
alter table public.notification_deliveries drop constraint notification_deliveries_channel_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check check (channel in ('email', 'push', 'web_push'));

-- ------------------------------------------------------------
-- 4 · Las tablas nuevas, clasificadas para la transferencia de restaurante
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.establishment_transfer_tables()
 RETURNS TABLE(table_name text, travels boolean)
 LANGUAGE sql
 IMMUTABLE
AS $function$
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
    ('reservation_settings', false),
    -- Fase B de agents (migraciones 161 a 167) · todo lo demás de Reservas se queda
    -- con el espacio que la presta, por lo mismo (decisión 100: la opción «Transferir
    -- también Reservas» y lo que arrastra se construyen en la Fase E). Los documentos
    -- del agente apuntan a archivos de `files`, que sí viajan: ese cabo suelto es
    -- parte de esa misma decisión.
    ('reservation_shifts', false), ('reservation_closed_dates', false),
    ('reservation_staff', false), ('reservation_devices', false),
    ('reservation_pin_attempts', false), ('reservation_support_sessions', false),
    ('reservations', false), ('reservation_events', false),
    ('reservation_duplicate_dismissals', false), ('reservation_notifications', false),
    ('reservation_platform_connections', false), ('reservation_incidents', false),
    ('reservation_monthly_stats', false), ('reservations_api_idempotency', false),
    ('agent_state', false), ('agent_state_events', false), ('agent_schedule_windows', false),
    ('agent_knowledge_documents', false), ('agent_knowledge_faqs', false),
    ('agent_knowledge_settings', false), ('agent_knowledge_snapshots', false),
    ('agent_calls', false), ('agent_api_keys', false),
    ('agent_balance_entries', false), ('agent_topups', false)
  ) as t(table_name, travels);
$function$;
