-- ============================================================
-- Suite 90 · Cimientos de Restavor agents
--            (Fase B de agents; migraciones 161 a 167; decisiones 103 a 109)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-RES-12 · cada restaurante lee solo lo suyo en TODAS las tablas nuevas.
--   · RN-RES-12 · el equipo del espacio (propietario o administrador) NO ve reservas,
--     eventos, avisos ni llamadas sin una sesión de soporte de Reservas abierta,
--     con el segundo paso (`aal2`) y con la marca de soporte; la sesión es de un
--     restaurante, de una persona y caduca; el Modo soporte de la plataforma no
--     abre esa puerta.
--   · RN-RES-12 · un Editor sin `manage_reservations` no ve nada de Reservas; con
--     el permiso, solo lo de su restaurante.
--   · RN-RES-12 · `reservation_events` no admite datos personales, y el
--     `audit_log` de las RPC de esta fase tampoco los lleva.
--   · RN-AGT-01 · el saldo es un libro inmutable con signo, derivado, al céntimo.
--   · CLAUDE.md · RLS activo y sin escrituras directas en cada tabla nueva, los dos
--     disparadores de solo lectura, ninguna columna con la identidad del equipo,
--     secretos (PIN, token, clave de API, credenciales) fuera del alcance del
--     cliente y funciones internas cerradas por RPC.
--   · RN-RES-01 · un turno válido (apertura < última hora de reserva <= cierre).
--   · RN-APP-04 · quién cambia la marca de soporte y el permiso "Gestionar Reservas"
--     (por edición y por invitación).
--
-- Prefijo de esta suite: d9000000-.

begin;

set local role postgres;

-- Bosco: el correo que reconoce `is_platform_owner()`. Mismo id que en las demás suites.
insert into auth.users (id, email, role, aud) values
  ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name)
values ('ffb00000-0000-0000-0000-000000000001', 'info@restavor.com', 'Bosco')
on conflict (id) do nothing;

insert into auth.users (id, email, role, aud) values
  ('d9000000-0000-0000-0000-000000000001', 'duena@suite90.test', 'authenticated', 'authenticated'),
  ('d9000000-0000-0000-0000-000000000002', 'admin@suite90.test', 'authenticated', 'authenticated'),
  ('d9000000-0000-0000-0000-000000000003', 'soporte@suite90.test', 'authenticated', 'authenticated'),
  ('d9000000-0000-0000-0000-000000000004', 'propietario-a@suite90.test', 'authenticated', 'authenticated'),
  ('d9000000-0000-0000-0000-000000000005', 'encargado-a@suite90.test', 'authenticated', 'authenticated'),
  ('d9000000-0000-0000-0000-000000000006', 'editor-a@suite90.test', 'authenticated', 'authenticated'),
  ('d9000000-0000-0000-0000-000000000007', 'propietario-b@suite90.test', 'authenticated', 'authenticated'),
  ('d9000000-0000-0000-0000-000000000008', 'extrano@suite90.test', 'authenticated', 'authenticated'),
  ('d9000000-0000-0000-0000-000000000009', 'trabajador@suite90.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d9000000-0000-0000-0000-000000000001', 'duena@suite90.test', 'Dueña 90'),
  ('d9000000-0000-0000-0000-000000000002', 'admin@suite90.test', 'Admin 90'),
  ('d9000000-0000-0000-0000-000000000003', 'soporte@suite90.test', 'Soporte 90'),
  ('d9000000-0000-0000-0000-000000000004', 'propietario-a@suite90.test', 'Propietario A 90'),
  ('d9000000-0000-0000-0000-000000000005', 'encargado-a@suite90.test', 'Encargado A 90'),
  ('d9000000-0000-0000-0000-000000000006', 'editor-a@suite90.test', 'Editor A 90'),
  ('d9000000-0000-0000-0000-000000000007', 'propietario-b@suite90.test', 'Propietario B 90'),
  ('d9000000-0000-0000-0000-000000000008', 'extrano@suite90.test', 'Extraño 90'),
  ('d9000000-0000-0000-0000-000000000009', 'trabajador@suite90.test', 'Trabajador 90')
on conflict (id) do nothing;

insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled) values
  ('d9000000-0000-0000-0000-000000000010', 'Espacio 90', 'espacio-90', 'Europe/Madrid',
   'd9000000-0000-0000-0000-000000000001', false);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000003', 'admin', 'active'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000009', 'worker', 'active');

-- Dos grupos y dos restaurantes: A (Casa Pepe) y B (Bar La Plaza), en el mismo espacio.
insert into public.groups (id, space_id, name) values
  ('d9000000-0000-0000-0000-000000000015', 'd9000000-0000-0000-0000-000000000010', 'Grupo A 90'),
  ('d9000000-0000-0000-0000-000000000016', 'd9000000-0000-0000-0000-000000000010', 'Grupo B 90');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000015', 'R90A', 'Casa Pepe 90', 'active'),
  ('d9000000-0000-0000-0000-000000000021', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000016', 'R90B', 'Bar La Plaza 90', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('d9000000-0000-0000-0000-000000000040', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000004', 'local_owner'),
  ('d9000000-0000-0000-0000-000000000041', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000005', 'editor'),
  ('d9000000-0000-0000-0000-000000000042', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000006', 'editor'),
  ('d9000000-0000-0000-0000-000000000043', 'd9000000-0000-0000-0000-000000000021', 'd9000000-0000-0000-0000-000000000007', 'local_owner');

-- El Encargado de Casa Pepe tiene "Gestionar Reservas"; el otro Editor, no.
insert into public.establishment_permissions (establishment_membership_id, manage_reservations) values
  ('d9000000-0000-0000-0000-000000000041', true),
  ('d9000000-0000-0000-0000-000000000042', false);

-- Ajustes, turnos y días cerrados.
insert into public.reservation_settings (id, space_id, establishment_id, service_status, public_slug) values
  ('d9000000-0000-0000-0000-000000000060', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'active', 'casa-pepe-90'),
  ('d9000000-0000-0000-0000-000000000061', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'active', 'bar-la-plaza-90');

insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity) values
  ('d9000000-0000-0000-0000-000000000070', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'Cena', '{2,3,4,5,6,7}', '20:00', '23:30', '22:30', 60),
  ('d9000000-0000-0000-0000-000000000071', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'Cena', '{2,3,4,5,6,7}', '20:00', '23:30', '22:30', 30);
insert into public.reservation_closed_dates (space_id, establishment_id, date, reason) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', '2026-10-12', 'Fiesta'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', '2026-10-12', 'Fiesta');

-- Personas y dispositivos.
insert into public.reservation_staff (id, space_id, establishment_id, kind, name, pin_hmac) values
  ('d9000000-0000-0000-0000-000000000080', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'staff', 'Ana Ruiz', 'hmac-ana'),
  ('d9000000-0000-0000-0000-000000000081', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'staff', 'Luis Gil', 'hmac-luis');
insert into public.reservation_devices (id, space_id, establishment_id, name, token_hash, activated_by) values
  ('d9000000-0000-0000-0000-000000000090', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'Tablet barra', 'tokenhash-a', 'd9000000-0000-0000-0000-000000000003'),
  ('d9000000-0000-0000-0000-000000000091', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'Tablet sala', 'tokenhash-b', 'd9000000-0000-0000-0000-000000000003');
insert into public.reservation_pin_attempts (space_id, establishment_id, device_id, failed_count) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000090', 2);

-- Sesiones de soporte de Reservas sobre A:
--   · 03 (marcado) abierta y vigente;
--   · 02 (sin marcar) abierta y vigente;
--   · Bosco abierta y vigente (plataforma);
--   · 03 sobre B, ya caducada;
--   · Bosco cerrada (sobre B).
insert into public.reservation_support_sessions (id, space_id, establishment_id, actor_id, reason, started_at, expires_at, ended_at) values
  ('d9000000-0000-0000-0000-0000000000a0', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000003', 'Revisar una duda de aforo', now() - interval '5 minutes', now() + interval '55 minutes', null),
  ('d9000000-0000-0000-0000-0000000000a1', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000002', 'Sin la marca de soporte', now() - interval '5 minutes', now() + interval '55 minutes', null),
  ('d9000000-0000-0000-0000-0000000000a2', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'ffb00000-0000-0000-0000-000000000001', 'Soporte de plataforma', now() - interval '5 minutes', now() + interval '55 minutes', null),
  ('d9000000-0000-0000-0000-0000000000a3', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'd9000000-0000-0000-0000-000000000003', 'Sesión que ya caducó', now() - interval '2 hours', now() - interval '1 hour', null),
  ('d9000000-0000-0000-0000-0000000000a4', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'ffb00000-0000-0000-0000-000000000001', 'Sesión cerrada', now() - interval '30 minutes', now() + interval '30 minutes', now() - interval '1 minute');

-- La marca de soporte: solo 03.
update public.space_memberships set can_support_reservations = true
where space_id = 'd9000000-0000-0000-0000-000000000010' and user_id = 'd9000000-0000-0000-0000-000000000003';

-- Reservas: dos en A, una en B.
insert into public.reservations (id, space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, source) values
  ('d9000000-0000-0000-0000-0000000000b0', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000070', '2026-09-26', '21:00', '2026-09-26 19:00+00', 4, 'Lucía Fernández', '+34612345678', 'manual'),
  ('d9000000-0000-0000-0000-0000000000b1', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000070', '2026-09-26', '21:30', '2026-09-26 19:30+00', 2, 'Raúl Moreno', '+34699888777', 'web'),
  ('d9000000-0000-0000-0000-0000000000b2', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'd9000000-0000-0000-0000-000000000071', '2026-09-26', '21:00', '2026-09-26 19:00+00', 3, 'Carla Sanz', '+34611222333', 'agent');
insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, actor_label, data) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-0000000000b0', 'created', 'web', 'Web', '{}'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'd9000000-0000-0000-0000-0000000000b2', 'created', 'agent', 'Agente', '{}');
insert into public.reservation_notifications (space_id, establishment_id, reservation_id, template, channel, recipient) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-0000000000b0', 'confirmed', 'sms', '+34612345678'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'd9000000-0000-0000-0000-0000000000b2', 'confirmed', 'sms', '+34611222333');
insert into public.reservation_duplicate_dismissals (space_id, establishment_id, reservation_a, reservation_b) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-0000000000b0', 'd9000000-0000-0000-0000-0000000000b1');

-- Agente.
insert into public.agent_state (space_id, establishment_id) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021');
insert into public.agent_state_events (space_id, establishment_id, state, actor_user_id) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'on', 'd9000000-0000-0000-0000-000000000003'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'on', 'd9000000-0000-0000-0000-000000000003');
insert into public.agent_schedule_windows (space_id, establishment_id, weekdays, start_time, end_time) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', '{1,2,3}', '12:00', '16:00'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', '{1,2,3}', '12:00', '16:00');
insert into public.agent_knowledge_faqs (space_id, establishment_id, question, answer) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', '¿Tenéis terraza?', 'Sí, con reserva.'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', '¿Admitís perros?', 'En la terraza.');
insert into public.agent_knowledge_settings (space_id, establishment_id, instructions) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'Sé amable.'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'Sé breve.');
insert into public.agent_knowledge_snapshots (space_id, establishment_id, version, content, content_hash) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 1, 'ficha A', 'hash-a'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 1, 'ficha B', 'hash-b');
insert into public.agent_calls (space_id, establishment_id, external_call_id, started_at, caller_e164, outcome, summary) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'call-a-1', '2026-09-26 12:00+00', '+34612345678', 'booked', 'Reserva para 4'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'call-b-1', '2026-09-26 12:00+00', '+34611222333', 'question', 'Duda');
insert into public.agent_api_keys (space_id, establishment_id, prefix, key_hash) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'rk_a', 'keyhash-a'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'rk_b', 'keyhash-b');

-- Saldo y recargas.
insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, stripe_checkout_session_id, created_by) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'topup', 10000000, 'cs_test_a1', 'd9000000-0000-0000-0000-000000000003'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'call', -1234567, null, null),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'topup', 5000000, 'cs_test_b1', null);
insert into public.agent_topups (space_id, establishment_id, stripe_checkout_session_id, net_cents, vat_cents, total_cents, vat_rate_percent, status, created_by) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'cs_test_a1', 1000, 210, 1210, 21, 'paid', 'd9000000-0000-0000-0000-000000000003'),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'cs_test_b1', 500, 105, 605, 21, 'paid', null);

-- Conexiones, incidentes, cifras y suscripciones de push.
insert into public.reservation_platform_connections (id, space_id, establishment_id, provider, display_name, credentials_encrypted, status) values
  ('d9000000-0000-0000-0000-0000000000c0', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'demo', 'TheFork', 'cifrado-a', 'connected'),
  ('d9000000-0000-0000-0000-0000000000c1', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'demo', 'CoverManager', 'cifrado-b', 'error');
insert into public.reservation_incidents (space_id, establishment_id, kind, severity, title, resolved_by) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'platform', 'error', 'CoverManager no conecta', null),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'email', 'info', 'Rebote', 'd9000000-0000-0000-0000-000000000003');
insert into public.reservations_api_idempotency (space_id, establishment_id, key, request_hash, response, expires_at) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'k1', 'h1', '{"ok": true}', now() + interval '1 day');
insert into public.reservations_rate_limits (bucket) values ('suite90-bucket');
insert into public.reservation_monthly_stats (space_id, establishment_id, month, source, reservations_count) values
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', '2026-09-01', 'agent', 12),
  ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', '2026-09-01', 'agent', 7);
insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('d9000000-0000-0000-0000-000000000004', 'https://push.example/a', 'p256dh-a', 'auth-a'),
  ('d9000000-0000-0000-0000-000000000007', 'https://push.example/b', 'p256dh-b', 'auth-b');

-- Funciones auxiliares de la suite (se van con el rollback).
create function public.s90_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  execute 'set local role authenticated';
end $$;

-- Cuántas filas devuelve una consulta con el rol y la sesión actuales. Un
-- privilegio denegado cuenta como cero filas: lo que importa es no ver nada.
create function public.s90_count(p_sql text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into v;
  return v;
exception when insufficient_privilege then
  return 0;
end $$;

grant execute on function public.s90_as(uuid, text) to authenticated, service_role;
grant execute on function public.s90_count(text) to authenticated, service_role;

-- ------------------------------------------------------------
-- RN-RES-12 · aislamiento entre restaurantes en TODAS las tablas nuevas
-- ------------------------------------------------------------
do $$
declare
  v_tablas text[] := array[
    'reservation_settings', 'reservation_shifts', 'reservation_closed_dates', 'reservation_staff',
    'reservation_devices', 'reservation_pin_attempts', 'reservation_support_sessions',
    'reservations', 'reservation_events', 'reservation_duplicate_dismissals',
    'agent_state', 'agent_state_events', 'agent_schedule_windows', 'agent_knowledge_documents',
    'agent_knowledge_faqs', 'agent_knowledge_settings', 'agent_knowledge_snapshots', 'agent_calls',
    'agent_api_keys', 'agent_balance_entries', 'agent_topups', 'reservation_notifications',
    'reservation_platform_connections', 'reservation_incidents', 'reservations_api_idempotency',
    'reservation_monthly_stats'
  ];
  v_t text;
  v_n bigint;
  v_vistas_a bigint := 0;
begin
  -- El Propietario de A: nada de B en ninguna tabla; algo de A en las que le tocan.
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  foreach v_t in array v_tablas loop
    v_n := public.s90_count(format('select 1 from public.%I where establishment_id = %L', v_t,
                                   'd9000000-0000-0000-0000-000000000021'));
    if v_n <> 0 then
      raise exception 'RN-RES-12 FALLIDO: el Propietario de Casa Pepe lee % fila(s) de Bar La Plaza en %', v_n, v_t;
    end if;
    v_vistas_a := v_vistas_a + public.s90_count(format('select 1 from public.%I where establishment_id = %L', v_t,
                                                       'd9000000-0000-0000-0000-000000000020'));
  end loop;
  if v_vistas_a < 20 then
    raise exception 'RN-RES-12 FALLIDO: el Propietario de Casa Pepe casi no ve lo suyo (% filas); el aislamiento no puede ser vacuo', v_vistas_a;
  end if;
  reset role;

  -- Y al revés.
  perform public.s90_as('d9000000-0000-0000-0000-000000000007');
  foreach v_t in array v_tablas loop
    v_n := public.s90_count(format('select 1 from public.%I where establishment_id = %L', v_t,
                                   'd9000000-0000-0000-0000-000000000020'));
    if v_n <> 0 then
      raise exception 'RN-RES-12 FALLIDO: el Propietario de Bar La Plaza lee % fila(s) de Casa Pepe en %', v_n, v_t;
    end if;
  end loop;
  if public.s90_count('select 1 from public.reservations') <> 1 then
    raise exception 'RN-RES-12 FALLIDO: el Propietario de Bar La Plaza debería ver exactamente su reserva';
  end if;
  reset role;

  -- Un extraño no ve nada de nada.
  perform public.s90_as('d9000000-0000-0000-0000-000000000008');
  foreach v_t in array v_tablas loop
    v_n := public.s90_count(format('select 1 from public.%I', v_t));
    if v_n <> 0 then
      raise exception 'RN-RES-12 FALLIDO: una persona ajena lee % fila(s) de %', v_n, v_t;
    end if;
  end loop;
  reset role;
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · el equipo del espacio no ve datos de comensales sin sesión de soporte
-- ------------------------------------------------------------
do $$
declare
  v_t text;
  v_n bigint;
  v_comensales text[] := array['reservations', 'reservation_events', 'reservation_notifications',
                               'agent_calls', 'reservation_duplicate_dismissals'];
  v_actor uuid;
begin
  -- La propietaria y el administrador sin marca: cero filas de comensales...
  foreach v_actor in array array['d9000000-0000-0000-0000-000000000001'::uuid, 'd9000000-0000-0000-0000-000000000002'::uuid] loop
    perform public.s90_as(v_actor, 'aal2');
    foreach v_t in array v_comensales loop
      v_n := public.s90_count(format('select 1 from public.%I', v_t));
      if v_n <> 0 then
        raise exception 'RN-RES-12 FALLIDO: % del espacio lee % fila(s) de % sin sesión de soporte', v_actor, v_n, v_t;
      end if;
    end loop;
    -- ...pero sí la configuración y las cifras.
    if public.s90_count('select 1 from public.reservation_settings') <> 2
       or public.s90_count('select 1 from public.reservation_shifts') <> 2
       or public.s90_count('select 1 from public.agent_balance_entries') <> 3
       or public.s90_count('select 1 from public.reservation_monthly_stats') <> 2 then
      raise exception 'RN-RES-12 FALLIDO: el equipo del espacio debería ver la configuración, el saldo y las cifras';
    end if;
    reset role;
  end loop;

  -- La administradora con la marca y una sesión abierta, pero sin el segundo paso: nada.
  perform public.s90_as('d9000000-0000-0000-0000-000000000003', 'aal1');
  v_n := public.s90_count('select 1 from public.reservations');
  if v_n <> 0 then
    raise exception 'RN-RES-12 FALLIDO: el soporte sin aal2 lee % reserva(s)', v_n;
  end if;
  reset role;

  -- Con el segundo paso: lee las de A (dos), no las de B (su sesión de B caducó).
  perform public.s90_as('d9000000-0000-0000-0000-000000000003', 'aal2');
  if public.s90_count('select 1 from public.reservations where establishment_id = ''d9000000-0000-0000-0000-000000000020''') <> 2 then
    raise exception 'RN-RES-12 FALLIDO: el soporte con sesión abierta y aal2 debería leer las 2 reservas de Casa Pepe';
  end if;
  if public.s90_count('select 1 from public.reservations where establishment_id = ''d9000000-0000-0000-0000-000000000021''') <> 0 then
    raise exception 'RN-RES-12 FALLIDO: la sesión caducada de Bar La Plaza sigue abriendo sus reservas';
  end if;
  if public.s90_count('select 1 from public.agent_calls where establishment_id = ''d9000000-0000-0000-0000-000000000020''') <> 1
     or public.s90_count('select 1 from public.reservation_events where establishment_id = ''d9000000-0000-0000-0000-000000000020''') <> 1
     or public.s90_count('select 1 from public.reservation_notifications where establishment_id = ''d9000000-0000-0000-0000-000000000020''') <> 1 then
    raise exception 'RN-RES-12 FALLIDO: la sesión de soporte debería abrir llamadas, eventos y avisos de Casa Pepe';
  end if;
  reset role;

  -- La sesión de soporte es de una persona: la sesión de 03 no sirve a nadie más
  -- (02 tiene la suya, pero no está marcado como soporte).
  perform public.s90_as('d9000000-0000-0000-0000-000000000002', 'aal2');
  if public.s90_count('select 1 from public.reservations') <> 0 then
    raise exception 'RN-RES-12 FALLIDO: quien no está marcado como soporte lee reservas con una sesión abierta';
  end if;
  reset role;

  -- Bosco (plataforma, can_support por ser el propietario) con su sesión y aal2.
  perform public.s90_as('ffb00000-0000-0000-0000-000000000001', 'aal2');
  if public.s90_count('select 1 from public.reservations where establishment_id = ''d9000000-0000-0000-0000-000000000020''') <> 2 then
    raise exception 'RN-RES-12 FALLIDO: la plataforma con sesión de Reservas abierta y aal2 debería leer las reservas de Casa Pepe';
  end if;
  -- Su sesión de B está cerrada.
  if public.s90_count('select 1 from public.reservations where establishment_id = ''d9000000-0000-0000-0000-000000000021''') <> 0 then
    raise exception 'RN-RES-12 FALLIDO: una sesión de soporte cerrada sigue abriendo las reservas';
  end if;
  reset role;
  perform public.s90_as('ffb00000-0000-0000-0000-000000000001', 'aal1');
  if public.s90_count('select 1 from public.reservations') <> 0 then
    raise exception 'RN-RES-12 FALLIDO: la plataforma sin segundo paso lee reservas';
  end if;
  reset role;
end $$;

-- El Modo soporte de la plataforma (`support_sessions`) NO abre los datos de comensales.
insert into public.support_sessions (space_id, actor_id, reason, access_level, started_at, expires_at)
values ('d9000000-0000-0000-0000-000000000010', 'ffb00000-0000-0000-0000-000000000001', 'Modo soporte de plataforma',
        'read', now(), now() + interval '30 minutes');
delete from public.reservation_support_sessions where actor_id = 'ffb00000-0000-0000-0000-000000000001';
do $$
begin
  perform public.s90_as('ffb00000-0000-0000-0000-000000000001', 'aal2');
  if not public.is_space_member('d9000000-0000-0000-0000-000000000010') then
    raise exception 'RN-RES-12 FALLIDO: la fixture del Modo soporte no entra en el espacio; la prueba sería vacua';
  end if;
  if public.s90_count('select 1 from public.reservations') <> 0
     or public.s90_count('select 1 from public.agent_calls') <> 0 then
    raise exception 'RN-RES-12 FALLIDO: el Modo soporte de la plataforma abre reservas o llamadas de comensales';
  end if;
  if public.s90_count('select 1 from public.reservation_settings') <> 2 then
    raise exception 'RN-RES-12 FALLIDO: el Modo soporte debería seguir viendo la configuración';
  end if;
  reset role;
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · quien solo ejecuta trabajos de mantenimiento no ve la configuración, el saldo
-- ni la operación de Reservas: el equipo de Restavor es el propietario y los administradores
-- ------------------------------------------------------------
do $$
declare
  v_t text;
  v_n bigint;
  v_bloqueado boolean := false;
begin
  perform public.s90_as('d9000000-0000-0000-0000-000000000009', 'aal2');
  foreach v_t in array array[
    'reservation_settings', 'reservation_shifts', 'reservation_closed_dates', 'reservation_staff',
    'reservation_devices', 'reservation_support_sessions', 'agent_state', 'agent_knowledge_faqs',
    'agent_balance_entries', 'agent_topups', 'reservation_platform_connections', 'reservation_incidents',
    'reservation_monthly_stats', 'agent_api_keys', 'reservations', 'agent_calls'
  ] loop
    v_n := public.s90_count(format('select 1 from public.%I', v_t));
    if v_n <> 0 then
      raise exception 'RN-RES-12 FALLIDO: un trabajador del espacio lee % fila(s) de %', v_n, v_t;
    end if;
  end loop;
  begin
    perform public.agent_balance('d9000000-0000-0000-0000-000000000020');
  exception when others then v_bloqueado := true;
  end;
  reset role;
  if not v_bloqueado then
    raise exception 'RN-RES-12 FALLIDO: un trabajador del espacio pregunta el saldo de un restaurante';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · un Editor sin "Gestionar Reservas" no ve nada de Reservas
-- ------------------------------------------------------------
do $$
declare
  v_t text;
  v_n bigint;
begin
  perform public.s90_as('d9000000-0000-0000-0000-000000000006');
  foreach v_t in array array['reservation_settings', 'reservation_shifts', 'reservations', 'agent_state',
                             'agent_balance_entries', 'agent_calls', 'reservation_staff'] loop
    v_n := public.s90_count(format('select 1 from public.%I', v_t));
    if v_n <> 0 then
      raise exception 'RN-RES-12 FALLIDO: un Editor sin manage_reservations lee % fila(s) de %', v_n, v_t;
    end if;
  end loop;
  if public.reservations_my_role('d9000000-0000-0000-0000-000000000020') is not null then
    raise exception 'RN-RES-12 FALLIDO: un Editor sin manage_reservations tiene rol en Reservas';
  end if;
  reset role;

  -- Con el permiso: el Encargado lee lo de su restaurante y solo eso.
  perform public.s90_as('d9000000-0000-0000-0000-000000000005');
  if public.reservations_my_role('d9000000-0000-0000-0000-000000000020') <> 'manager' then
    raise exception 'RN-RES-12 FALLIDO: el Editor con manage_reservations debería ser Encargado';
  end if;
  if public.s90_count('select 1 from public.reservations') <> 2
     or public.s90_count('select 1 from public.reservation_settings') <> 1
     or public.s90_count('select 1 from public.agent_balance_entries') <> 2 then
    raise exception 'RN-RES-12 FALLIDO: el Encargado debería ver las reservas, los ajustes y el saldo de Casa Pepe, y nada más';
  end if;
  -- El Encargado no ve la clave del agente ni los incidentes de operación.
  if public.s90_count('select 1 from public.agent_api_keys') <> 0
     or public.s90_count('select 1 from public.reservation_incidents') <> 0 then
    raise exception 'RN-RES-12 FALLIDO: el Encargado ve la clave del agente o los incidentes (son de Restavor)';
  end if;
  reset role;
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · secretos e identidades: ninguna columna con la identidad del equipo
-- ni los PIN, tokens, claves o credenciales llegan a un cliente
-- ------------------------------------------------------------
do $$
declare
  v_par text[];
  v_cols text[][] := array[
    ['reservation_staff', 'pin_hmac'],
    ['reservation_devices', 'token_hash'], ['reservation_devices', 'activated_by'],
    ['reservation_support_sessions', 'actor_id'],
    ['reservations', 'cancel_token'], ['reservations', 'created_by_user_id'],
    ['reservation_events', 'actor_user_id'],
    ['reservation_duplicate_dismissals', 'dismissed_by'],
    ['agent_state', 'changed_by_user_id'], ['agent_state_events', 'actor_user_id'],
    ['agent_api_keys', 'key_hash'],
    ['agent_balance_entries', 'created_by'], ['agent_topups', 'created_by'],
    ['reservation_platform_connections', 'credentials_encrypted'],
    ['reservation_incidents', 'resolved_by'],
    ['web_push_subscriptions', 'endpoint'], ['web_push_subscriptions', 'p256dh'], ['web_push_subscriptions', 'auth']
  ];
  v_i integer;
begin
  for v_i in 1 .. array_length(v_cols, 1) loop
    if has_column_privilege('authenticated', 'public.' || v_cols[v_i][1], v_cols[v_i][2], 'select') then
      raise exception 'CLAUDE.md MUST FALLIDO: un cliente puede leer %.% (identidad del equipo o secreto)', v_cols[v_i][1], v_cols[v_i][2];
    end if;
    if has_column_privilege('anon', 'public.' || v_cols[v_i][1], v_cols[v_i][2], 'select') then
      raise exception 'CLAUDE.md MUST FALLIDO: anon puede leer %.%', v_cols[v_i][1], v_cols[v_i][2];
    end if;
  end loop;

  -- reservation_settings ya no tiene el grant de tabla entera: cada columna nueva se decide.
  if has_table_privilege('authenticated', 'public.reservation_settings', 'select') then
    raise exception 'CLAUDE.md MUST FALLIDO: reservation_settings vuelve a tener select de tabla entera';
  end if;
end $$;

-- Y comprobado de verdad, sentado como cliente: leer un secreto da 403.
do $$
declare
  v_blocked boolean;
begin
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  v_blocked := false;
  begin
    perform pin_hmac from public.reservation_staff;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'RN-RES-12 FALLIDO: el Propietario puede leer pin_hmac';
  end if;
  v_blocked := false;
  begin
    perform actor_id from public.reservation_support_sessions;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'RN-RES-12 FALLIDO: el Propietario puede leer quién abrió una sesión de soporte (P7)';
  end if;
  -- Lo permitido sí se lee: el Propietario ve el motivo y la hora de la sesión de soporte.
  if public.s90_count('select reason, started_at from public.reservation_support_sessions') <> 2 then
    raise exception 'RN-RES-12 FALLIDO: el Propietario debería ver las 2 sesiones de soporte de su restaurante (Historial)';
  end if;
  reset role;
end $$;

-- ------------------------------------------------------------
-- CLAUDE.md · RLS activo, sin escrituras directas y los dos disparadores
-- ------------------------------------------------------------
do $$
declare
  v_t text;
  v_tablas_espacio text[] := array[
    'reservation_settings', 'reservation_shifts', 'reservation_closed_dates', 'reservation_staff',
    'reservation_devices', 'reservation_pin_attempts', 'reservation_support_sessions',
    'reservations', 'reservation_events', 'reservation_duplicate_dismissals',
    'agent_state', 'agent_state_events', 'agent_schedule_windows', 'agent_knowledge_documents',
    'agent_knowledge_faqs', 'agent_knowledge_settings', 'agent_knowledge_snapshots', 'agent_calls',
    'agent_api_keys', 'agent_balance_entries', 'agent_topups', 'reservation_notifications',
    'reservation_platform_connections', 'reservation_incidents', 'reservations_api_idempotency',
    'reservation_monthly_stats'
  ];
  v_sin_espacio text[] := array['messaging_rates', 'fx_rates', 'reservations_rate_limits', 'web_push_subscriptions'];
  v_n integer;
begin
  foreach v_t in array v_tablas_espacio || v_sin_espacio loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_t)::regclass) then
      raise exception 'CLAUDE.md MUST FALLIDO: % no tiene RLS activada', v_t;
    end if;
    select count(*) into v_n from pg_policy where polrelid = ('public.' || v_t)::regclass and polcmd = 'r';
    if v_n <> 1 then
      raise exception 'CLAUDE.md MUST FALLIDO: % debería tener exactamente una política de lectura y tiene %', v_t, v_n;
    end if;
    select count(*) into v_n from pg_policy where polrelid = ('public.' || v_t)::regclass and polcmd <> 'r';
    if v_n <> 0 then
      raise exception 'CLAUDE.md MUST FALLIDO: % tiene políticas de escritura (escriben las RPC)', v_t;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_t, 'insert')
       or has_table_privilege('authenticated', 'public.' || v_t, 'update')
       or has_table_privilege('authenticated', 'public.' || v_t, 'delete')
       or has_table_privilege('anon', 'public.' || v_t, 'select') then
      raise exception 'CLAUDE.md MUST FALLIDO: % tiene escrituras directas o lectura anónima', v_t;
    end if;
  end loop;

  -- Cada tabla con `space_id` lleva los dos disparadores de solo lectura.
  foreach v_t in array v_tablas_espacio loop
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || v_t)::regclass
                   and tgname = v_t || '_guard_support_read_only') then
      raise exception 'CLAUDE.md MUST FALLIDO: % no tiene su disparador de solo lectura en Modo soporte', v_t;
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || v_t)::regclass
                   and tgname = v_t || '_cuotly_read_only') then
      raise exception 'CLAUDE.md MUST FALLIDO: % no tiene su disparador de solo lectura en espacio archivado', v_t;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = v_t and column_name = 'space_id' and is_nullable = 'NO') then
      raise exception 'CLAUDE.md MUST FALLIDO: % no tiene space_id NOT NULL', v_t;
    end if;
    -- Y están clasificadas para la transferencia de restaurante.
    if not exists (select 1 from public.establishment_transfer_tables() where table_name = v_t) then
      raise exception 'RN-TRA FALLIDO: % no está clasificada en establishment_transfer_tables()', v_t;
    end if;
  end loop;
end $$;

-- Un cliente no escribe ni borra por consulta directa.
do $$
declare
  v_blocked boolean := false;
begin
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  begin
    insert into public.reservations (space_id, establishment_id, date, time, starts_at, party_size, customer_name, phone_e164, source)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', '2026-10-01', '21:00',
            '2026-10-01 19:00+00', 2, 'Intruso', '+34600000000', 'manual');
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'CLAUDE.md MUST FALLIDO: un cliente inserta una reserva por consulta directa';
  end if;
  v_blocked := false;
  begin
    update public.reservations set party_size = 99;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'CLAUDE.md MUST FALLIDO: un cliente cambia una reserva por consulta directa';
  end if;
  v_blocked := false;
  begin
    delete from public.reservations;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'CLAUDE.md MUST FALLIDO: un cliente borra reservas por consulta directa';
  end if;
  reset role;
end $$;

-- ------------------------------------------------------------
-- RN-RES-12 · eventos y auditoría sin datos personales de comensales
-- ------------------------------------------------------------
do $$
declare
  v_ok boolean;
  v_data text;
begin
  -- Claves de datos personales, también anidadas: rechazadas.
  foreach v_data in array array[
    '{"phone_e164": "+34612345678"}',
    '{"customer_name": "Lucía"}',
    '{"changes": {"email": "lucia@example.com"}}',
    '{"after": [{"notes": "alergia"}]}',
    '{"Name" : "Lucía"}'
  ] loop
    v_ok := false;
    begin
      insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, data)
      values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020',
              'd9000000-0000-0000-0000-0000000000b0', 'updated', 'member', v_data::jsonb);
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then
      raise exception 'RN-RES-12 FALLIDO: reservation_events admite datos personales (%)', v_data;
    end if;
  end loop;

  -- Lo que sí cuenta qué cambió, sin el dato: aceptado.
  insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, data)
  values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020',
          'd9000000-0000-0000-0000-0000000000b0', 'updated', 'member',
          '{"changed": ["phone", "time"], "time_from": "21:00", "time_to": "21:30"}');

  -- El nombre de una persona no va en la etiqueta del actor: solo etiquetas genéricas.
  v_ok := false;
  begin
    insert into public.reservation_events (space_id, establishment_id, reservation_id, type, actor_type, actor_label)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020',
            'd9000000-0000-0000-0000-0000000000b0', 'updated', 'member', 'Ana Ruiz');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then
    raise exception 'RN-RES-12 FALLIDO: reservation_events guarda el nombre de una persona en actor_label';
  end if;
end $$;

-- Solo inserción: un cliente no edita un evento.
do $$
declare
  v_blocked boolean := false;
begin
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  begin
    update public.reservation_events set type = 'cancelled';
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'RN-RES-12 FALLIDO: un cliente puede editar reservation_events';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-AGT-01 · el libro del saldo
-- ------------------------------------------------------------
do $$
declare
  v_ok boolean;
  v_saldo bigint;
begin
  -- Como el servidor: sin sesión de usuario (los reclamos de la prueba anterior se limpian).
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
  -- El signo lo fija el tipo de apunte.
  v_ok := false;
  begin
    insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'call', 500);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-AGT-01 FALLIDO: una llamada puede sumar saldo'; end if;

  v_ok := false;
  begin
    insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'topup', -500);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-AGT-01 FALLIDO: una recarga puede restar saldo'; end if;

  v_ok := false;
  begin
    insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'adjustment', 1000);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-AGT-01 FALLIDO: un ajuste de Restavor puede quedar sin motivo'; end if;

  -- Un ajuste con motivo, de cualquiera de los dos signos, vale.
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, note)
  values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'adjustment', -2000, 'Corrección de la llamada duplicada');

  -- Idempotencia de la recarga: el mismo webhook dos veces es un apunte.
  v_ok := false;
  begin
    insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, stripe_checkout_session_id)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'topup', 10000000, 'cs_test_a1');
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-AGT-01 FALLIDO: la misma sesión de Stripe suma dos veces'; end if;

  -- El saldo se deriva: 10.000.000 - 1.234.567 - 2.000 = 8.763.433 millonésimas.
  v_saldo := public.agent_balance('d9000000-0000-0000-0000-000000000020');
  if v_saldo <> 8763433 then
    raise exception 'RN-AGT-01 FALLIDO: el saldo derivado es % y debería ser 8763433', v_saldo;
  end if;
  -- Al céntimo: 8.763.433 / 10.000 = 876,3433 → 876 céntimos.
  if public.agent_balance_cents('d9000000-0000-0000-0000-000000000020') <> 876 then
    raise exception 'RN-AGT-01 FALLIDO: el saldo en céntimos es % y debería ser 876', public.agent_balance_cents('d9000000-0000-0000-0000-000000000020');
  end if;
  -- Redondeo: medio céntimo se aleja de cero, en los dos sentidos.
  insert into public.agent_balance_entries (id, space_id, establishment_id, kind, amount_micros, note)
  values ('d9000000-0000-0000-0000-0000000000d0', 'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'adjustment', -5000005, 'Prueba de redondeo');
  -- B: 5.000.000 - 5.000.005 = -5 micros → -0,0005 céntimo → 0.
  if public.agent_balance_cents('d9000000-0000-0000-0000-000000000021') <> 0 then
    raise exception 'RN-AGT-01 FALLIDO: -5 millonésimas deberían redondear a 0 céntimos';
  end if;
  insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, note)
  values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000021', 'adjustment', -5000, 'Medio céntimo');
  -- B: -5.005 micros = -0,5005 céntimo → -1.
  if public.agent_balance_cents('d9000000-0000-0000-0000-000000000021') <> -1 then
    raise exception 'RN-AGT-01 FALLIDO: -5.005 millonésimas deberían redondear a -1 céntimo (es %)', public.agent_balance_cents('d9000000-0000-0000-0000-000000000021');
  end if;
end $$;

-- Quién pregunta el saldo: el Propietario, el Encargado y el equipo; nadie más.
do $$
declare
  v_bloqueado boolean;
begin
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  if public.agent_balance('d9000000-0000-0000-0000-000000000020') <> 8763433 then
    raise exception 'RN-AGT-01 FALLIDO: el Propietario no ve su saldo';
  end if;
  v_bloqueado := false;
  begin
    perform public.agent_balance('d9000000-0000-0000-0000-000000000021');
  exception when others then v_bloqueado := true;
  end;
  if not v_bloqueado then
    raise exception 'RN-AGT-01 FALLIDO: el Propietario de Casa Pepe pregunta el saldo de Bar La Plaza';
  end if;
  -- Es un libro: nadie con sesión edita ni borra un apunte.
  v_bloqueado := false;
  begin
    update public.agent_balance_entries set amount_micros = 1;
  exception when insufficient_privilege then v_bloqueado := true;
  end;
  if not v_bloqueado then
    raise exception 'RN-AGT-01 FALLIDO: un cliente edita un apunte del saldo';
  end if;
  reset role;

  perform public.s90_as('d9000000-0000-0000-0000-000000000002');
  if public.agent_balance('d9000000-0000-0000-0000-000000000020') <> 8763433 then
    raise exception 'RN-AGT-01 FALLIDO: el equipo del espacio no ve el saldo';
  end if;
  reset role;

  perform public.s90_as('d9000000-0000-0000-0000-000000000008');
  v_bloqueado := false;
  begin
    perform public.agent_balance('d9000000-0000-0000-0000-000000000020');
  exception when others then v_bloqueado := true;
  end;
  reset role;
  if not v_bloqueado then
    raise exception 'RN-AGT-01 FALLIDO: una persona ajena pregunta el saldo de un restaurante';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-RES-01 · un turno válido, y las restricciones de los ajustes
-- ------------------------------------------------------------
do $$
declare
  v_ok boolean;
  v_caso text[];
begin
  -- apertura < última hora de reserva <= cierre. Cada caso es (apertura, última, cierre).
  foreach v_caso slice 1 in array array[
    array['21:00', '23:00', '22:00'],  -- la última hora pasa del cierre
    array['20:00', '20:00', '23:30'],  -- apertura = última hora
    array['23:00', '22:00', '23:30']   -- apertura después de la última
  ] loop
    v_ok := false;
    begin
      insert into public.reservation_shifts (space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
      values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'Mal', '{1}',
              v_caso[1]::time, v_caso[3]::time, v_caso[2]::time, 10);
    exception when check_violation then v_ok := true;
    end;
    if not v_ok then
      raise exception 'RN-RES-01 FALLIDO: se guardó un turno inválido (%)', v_caso;
    end if;
  end loop;

  -- Día de la semana fuera de 1..7 y aforo no positivo.
  v_ok := false;
  begin
    insert into public.reservation_shifts (space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'Mal', '{0,8}', '20:00', '23:30', '22:30', 10);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-RES-01 FALLIDO: un turno acepta días de la semana fuera de 1 a 7'; end if;

  v_ok := false;
  begin
    insert into public.reservation_shifts (space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', 'Mal', '{1}', '20:00', '23:30', '22:30', 0);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-RES-01 FALLIDO: un turno acepta aforo cero'; end if;

  -- Ajustes: huecos de 15 o 30, teléfonos distintos y en E.164.
  v_ok := false;
  begin
    update public.reservation_settings set slot_interval_minutes = 20
    where establishment_id = 'd9000000-0000-0000-0000-000000000020';
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-RES-01 FALLIDO: los huecos aceptan 20 minutos'; end if;

  v_ok := false;
  begin
    update public.reservation_settings
    set local_phone_e164 = '+34954000000', transfer_phone_e164 = '+34954000000'
    where establishment_id = 'd9000000-0000-0000-0000-000000000020';
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-LLA-06 FALLIDO: el teléfono para pasar llamadas puede ser el del local'; end if;

  v_ok := false;
  begin
    update public.reservation_settings set local_phone_e164 = '954 000 000'
    where establishment_id = 'd9000000-0000-0000-0000-000000000020';
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-RES-01 FALLIDO: el teléfono del local se guarda sin formato E.164'; end if;

  -- Dirección pública única.
  v_ok := false;
  begin
    update public.reservation_settings set public_slug = 'casa-pepe-90'
    where establishment_id = 'd9000000-0000-0000-0000-000000000021';
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-RES-01 FALLIDO: dos restaurantes comparten la dirección pública'; end if;

  -- Una reserva sin teléfono ni email no se guarda mientras no esté anonimizada (RN-RES-12).
  v_ok := false;
  begin
    insert into public.reservations (space_id, establishment_id, date, time, starts_at, party_size, customer_name, source)
    values ('d9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000020', '2026-10-01', '21:00',
            '2026-10-01 19:00+00', 2, 'Sin contacto', 'manual');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'RN-RES-12 FALLIDO: se guardó una reserva sin ningún contacto'; end if;

  -- Anonimizar es un UPDATE del sistema, no un DELETE: la fila sigue y se conserva lo que no es personal.
  update public.reservations
  set customer_name = 'Anónimo', phone_e164 = null, email = null, notes = null, anonymized_at = now()
  where id = 'd9000000-0000-0000-0000-0000000000b1';
  if not exists (select 1 from public.reservations where id = 'd9000000-0000-0000-0000-0000000000b1'
                 and anonymized_at is not null and party_size = 2 and source = 'web') then
    raise exception 'RN-RES-12 FALLIDO: anonimizar no conserva la reserva';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-APP-04 · la marca de soporte: solo la cambia el propietario del espacio
-- ------------------------------------------------------------
do $$
declare
  v_bloqueado boolean;
  v_n integer;
  v_nuevo jsonb;
begin
  -- Un administrador no puede marcarse ni marcar a nadie.
  perform public.s90_as('d9000000-0000-0000-0000-000000000002');
  v_bloqueado := false;
  begin
    perform public.set_member_can_support_reservations(
      'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000002', true);
  exception when others then v_bloqueado := true;
  end;
  if not v_bloqueado then
    raise exception 'RN-APP-04 FALLIDO: un administrador se marca como soporte de Reservas';
  end if;
  -- Ni siquiera por consulta directa: o la política no le deja ver la fila o el
  -- disparador lo para; en los dos casos la marca no cambia.
  begin
    update public.space_memberships set can_support_reservations = true
    where user_id = 'd9000000-0000-0000-0000-000000000002';
  exception when others then null;
  end;
  if exists (select 1 from public.space_memberships where user_id = 'd9000000-0000-0000-0000-000000000002'
             and can_support_reservations) then
    raise exception 'RN-APP-04 FALLIDO: un administrador se marcó como soporte con un UPDATE directo';
  end if;
  reset role;

  -- La propietaria sí pasa la política de escritura de la tabla, y aun así el UPDATE
  -- directo se para en el disparador: la marca solo cambia por la RPC.
  perform public.s90_as('d9000000-0000-0000-0000-000000000001');
  v_bloqueado := false;
  begin
    update public.space_memberships set can_support_reservations = true
    where user_id = 'd9000000-0000-0000-0000-000000000002';
  exception when others then v_bloqueado := true;
  end;
  if not v_bloqueado then
    raise exception 'RN-APP-04 FALLIDO: la propietaria cambia la marca de soporte con un UPDATE directo, sin pasar por la RPC';
  end if;
  reset role;

  -- La propietaria sí por la RPC; deja un apunte, y repetir el mismo valor no deja otro.
  perform public.s90_as('d9000000-0000-0000-0000-000000000001');
  perform public.set_member_can_support_reservations(
    'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000002', true);
  perform public.set_member_can_support_reservations(
    'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000002', true);
  reset role;
  select count(*), max(new_value::text)::jsonb into v_n, v_nuevo
  from public.audit_log
  where action = 'membership.support_reservations_changed'
    and entity_id = 'd9000000-0000-0000-0000-000000000002';
  if v_n <> 1 then
    raise exception 'RN-APP-04 FALLIDO: cambiar la marca dos veces al mismo valor dejó % apuntes de auditoría (debe ser 1)', v_n;
  end if;
  if v_nuevo <> '{"can_support_reservations": true}'::jsonb then
    raise exception 'RN-APP-04 FALLIDO: el apunte de auditoría de la marca lleva algo más que la marca (%)', v_nuevo;
  end if;

  -- Alguien ajeno al espacio no se puede marcar.
  perform public.s90_as('d9000000-0000-0000-0000-000000000001');
  v_bloqueado := false;
  begin
    perform public.set_member_can_support_reservations(
      'd9000000-0000-0000-0000-000000000010', 'd9000000-0000-0000-0000-000000000008', true);
  exception when others then v_bloqueado := true;
  end;
  reset role;
  if not v_bloqueado then
    raise exception 'RN-APP-04 FALLIDO: se marca como soporte a alguien que no es del espacio';
  end if;

  -- Ahora 02 está marcado: con su sesión abierta y aal2, lee las reservas de A.
  perform public.s90_as('d9000000-0000-0000-0000-000000000002', 'aal2');
  if public.s90_count('select 1 from public.reservations where establishment_id = ''d9000000-0000-0000-0000-000000000020''') <> 2 then
    raise exception 'RN-RES-12 FALLIDO: tras marcarlo como soporte, con su sesión abierta y aal2 debería leer las reservas';
  end if;
  reset role;
end $$;

-- ------------------------------------------------------------
-- RN-APP-04 · "Gestionar Reservas" se guarda por edición y por invitación
-- ------------------------------------------------------------
do $$
declare
  v_permisos record;
  v_inv uuid;
  v_token uuid;
  v_nuevo uuid := 'd9000000-0000-0000-0000-0000000000e1';
  v_mid uuid;
begin
  -- 1. El Propietario de A da el permiso al otro Editor.
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  perform public.set_establishment_permissions(
    'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000006',
    '{"create_requests": true, "manage_reservations": true}'::jsonb);
  if public.reservations_my_role('d9000000-0000-0000-0000-000000000020') <> 'owner' then
    raise exception 'RN-APP-04 FALLIDO: el Propietario no es owner en Reservas';
  end if;
  select * into v_permisos from public.establishment_panel_users('d9000000-0000-0000-0000-000000000020')
  where user_id = 'd9000000-0000-0000-0000-000000000006';
  if v_permisos.manage_reservations is distinct from true then
    raise exception 'RN-APP-04 FALLIDO: establishment_panel_users no devuelve "Gestionar Reservas" guardado';
  end if;
  -- El Propietario siempre lo lleva por su rol.
  select * into v_permisos from public.establishment_panel_users('d9000000-0000-0000-0000-000000000020')
  where user_id = 'd9000000-0000-0000-0000-000000000004';
  if v_permisos.manage_reservations is distinct from true then
    raise exception 'RN-APP-04 FALLIDO: el Propietario no tiene "Gestionar Reservas" por su rol';
  end if;
  reset role;

  perform public.s90_as('d9000000-0000-0000-0000-000000000006');
  if public.reservations_my_role('d9000000-0000-0000-0000-000000000020') <> 'manager' then
    raise exception 'RN-APP-04 FALLIDO: el permiso guardado no hace Encargado al Editor';
  end if;
  reset role;

  -- 2. Guardar los otros permisos SIN mandar la clave conserva "Gestionar Reservas".
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  perform public.set_establishment_permissions(
    'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000006',
    '{"create_requests": false, "edit_menus": true}'::jsonb);
  reset role;
  if not exists (select 1 from public.establishment_permissions
                 where establishment_membership_id = 'd9000000-0000-0000-0000-000000000042'
                   and manage_reservations and edit_menus and not create_requests) then
    raise exception 'RN-APP-04 FALLIDO: guardar los otros permisos sin la clave quitó "Gestionar Reservas" (o no guardó los demás)';
  end if;

  -- 3. Y mandándola en falso, se quita.
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  perform public.set_establishment_permissions(
    'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000006',
    '{"manage_reservations": false}'::jsonb);
  reset role;
  if exists (select 1 from public.establishment_permissions
             where establishment_membership_id = 'd9000000-0000-0000-0000-000000000042' and manage_reservations) then
    raise exception 'RN-APP-04 FALLIDO: no se puede quitar "Gestionar Reservas"';
  end if;

  -- 3 bis. Un Editor con «Usuarios y accesos» NO puede darse a sí mismo (ni dar) «Gestionar Reservas»:
  -- se ascendería a Encargado y leería los datos de los comensales (PRD §3.2: el Encargado no añade Encargados).
  update public.establishment_permissions set manage_users = true
  where establishment_membership_id = 'd9000000-0000-0000-0000-000000000042';
  perform public.s90_as('d9000000-0000-0000-0000-000000000006');
  begin
    perform public.set_establishment_permissions(
      'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000006',
      '{"manage_reservations": true}'::jsonb);
    reset role;
    raise exception 'RN-APP-04 FALLIDO: un Editor con manage_users se dio «Gestionar Reservas»';
  exception when others then
    reset role;
    if sqlerrm like 'RN-APP-04 FALLIDO%' then raise; end if;
  end;
  perform public.s90_as('d9000000-0000-0000-0000-000000000006');
  if public.s90_count('select 1 from public.reservations') <> 0 then
    raise exception 'RN-APP-04 FALLIDO: el Editor leyó reservas tras intentar ascenderse';
  end if;
  -- Ni invitando a otro con el permiso.
  begin
    perform public.invite_to_establishment_panel(
      'd9000000-0000-0000-0000-000000000020', 'ascenso@suite90.test', 'editor', false, false, null, true);
    reset role;
    raise exception 'RN-APP-04 FALLIDO: un Editor con manage_users invitó con «Gestionar Reservas»';
  exception when others then
    reset role;
    if sqlerrm like 'RN-APP-04 FALLIDO%' then raise; end if;
  end;
  -- Lo que sí puede: cambiar los otros permisos mandando la casilla de Reservas sin cambiarla.
  perform public.s90_as('d9000000-0000-0000-0000-000000000004');
  perform public.set_establishment_permissions(
    'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000006',
    '{"create_requests": true, "manage_users": true, "manage_reservations": false}'::jsonb);
  reset role;
  perform public.s90_as('d9000000-0000-0000-0000-000000000006');
  perform public.set_establishment_permissions(
    'd9000000-0000-0000-0000-000000000020', 'd9000000-0000-0000-0000-000000000005',
    '{"edit_menus": true, "manage_reservations": true}'::jsonb);
  reset role;
  if not exists (select 1 from public.establishment_permissions
                 where establishment_membership_id = 'd9000000-0000-0000-0000-000000000041'
                   and edit_menus and manage_reservations) then
    raise exception 'RN-APP-04 FALLIDO: el Editor con manage_users no puede cambiar otro permiso mandando la casilla de Reservas sin tocarla';
  end if;

  -- 4. Invitar a alguien sin cuenta con "Gestionar Reservas": la invitación lo lleva y, al aceptarla, el permiso.
  perform public.s90_as('d9000000-0000-0000-0000-000000000001');
  v_inv := public.invite_to_establishment_panel(
    'd9000000-0000-0000-0000-000000000020', 'nuevo-encargado@suite90.test', 'editor',
    false, false, 'idem-suite90-1', true);
  reset role;
  if v_inv is null or not exists (select 1 from public.establishment_invitations
                                  where id = v_inv and manage_reservations and status = 'approved') then
    raise exception 'RN-APP-04 FALLIDO: la invitación no guarda "Gestionar Reservas" (o no nació aprobada)';
  end if;
  -- La misma petición otra vez es la misma invitación (CA-17).
  perform public.s90_as('d9000000-0000-0000-0000-000000000001');
  if public.invite_to_establishment_panel('d9000000-0000-0000-0000-000000000020', 'nuevo-encargado@suite90.test',
                                          'editor', false, false, 'idem-suite90-1', true) <> v_inv then
    raise exception 'RN-APP-04 FALLIDO: invitar dos veces con la misma clave crea dos invitaciones';
  end if;
  reset role;

  select token into v_token from public.establishment_invitations where id = v_inv;
  insert into auth.users (id, email, role, aud) values (v_nuevo, 'nuevo-encargado@suite90.test', 'authenticated', 'authenticated');
  insert into public.profiles (id, email, full_name) values (v_nuevo, 'nuevo-encargado@suite90.test', 'Nuevo Encargado')
  on conflict (id) do nothing;
  set local role service_role;
  v_mid := public.consume_establishment_invitation(v_token, v_nuevo);
  reset role;
  if not exists (select 1 from public.establishment_permissions
                 where establishment_membership_id = v_mid and manage_reservations) then
    raise exception 'RN-APP-04 FALLIDO: aceptar la invitación no copia "Gestionar Reservas" a los permisos';
  end if;
  perform public.s90_as(v_nuevo);
  if public.reservations_my_role('d9000000-0000-0000-0000-000000000020') <> 'manager' then
    raise exception 'RN-APP-04 FALLIDO: quien aceptó la invitación con "Gestionar Reservas" no es Encargado';
  end if;
  reset role;

  -- 5. Invitar a quien YA tiene cuenta con el permiso: se concede al momento.
  perform public.s90_as('d9000000-0000-0000-0000-000000000001');
  perform public.invite_to_establishment_panel(
    'd9000000-0000-0000-0000-000000000021', 'extrano@suite90.test', 'editor', false, false, null, true);
  reset role;
  if not exists (select 1
                 from public.establishment_memberships em
                 join public.establishment_permissions ep on ep.establishment_membership_id = em.id
                 where em.establishment_id = 'd9000000-0000-0000-0000-000000000021'
                   and em.user_id = 'd9000000-0000-0000-0000-000000000008' and ep.manage_reservations) then
    raise exception 'RN-APP-04 FALLIDO: invitar a una cuenta existente no le concede "Gestionar Reservas"';
  end if;
  -- Un Propietario invitado no necesita la casilla: la lleva por su rol.
  perform public.s90_as('d9000000-0000-0000-0000-000000000001');
  v_inv := public.invite_to_establishment_panel(
    'd9000000-0000-0000-0000-000000000021', 'otro-dueno@suite90.test', 'local_owner', false, false, null, true);
  reset role;
  if exists (select 1 from public.establishment_invitations where id = v_inv and manage_reservations) then
    raise exception 'RN-APP-04 FALLIDO: la invitación de un Propietario guarda manage_reservations (solo cuenta para un Editor)';
  end if;
end $$;

-- ------------------------------------------------------------
-- La auditoría de esta fase no lleva datos personales de comensales
-- ------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  select count(*) into v_n
  from public.audit_log
  where space_id = 'd9000000-0000-0000-0000-000000000010'
    and (coalesce(old_value::text, '') || coalesce(new_value::text, ''))
        ~* '"(customer_name|phone_e164|caller_e164|summary|notes)"[[:space:]]*:';
  if v_n <> 0 then
    raise exception 'RN-RES-12 FALLIDO: % apunte(s) de auditoría llevan datos personales de comensales', v_n;
  end if;
end $$;

-- ------------------------------------------------------------
-- Funciones: lo interno cerrado a RPC, lo que sale en políticas abierto solo a `authenticated`
-- ------------------------------------------------------------
do $$
begin
  if has_function_privilege('authenticated', 'public.consume_establishment_invitation(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.consume_establishment_invitation(uuid, uuid)', 'execute') then
    raise exception 'CLAUDE.md MUST FALLIDO: consume_establishment_invitation está abierta por RPC';
  end if;
  if not has_function_privilege('service_role', 'public.consume_establishment_invitation(uuid, uuid)', 'execute') then
    raise exception 'CLAUDE.md MUST FALLIDO: el servidor ya no puede ejecutar consume_establishment_invitation';
  end if;

  -- Las que están en políticas: abiertas a `authenticated`, cerradas a `anon`.
  if not has_function_privilege('authenticated', 'public.reservations_can_read(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.reservations_can_read_diner_data(uuid)', 'execute') then
    raise exception 'CLAUDE.md MUST FALLIDO: las funciones de las políticas de Reservas no tienen EXECUTE para authenticated; la tabla devolvería permission denied';
  end if;
  if has_function_privilege('anon', 'public.reservations_can_read(uuid)', 'execute')
     or has_function_privilege('anon', 'public.reservations_can_read_diner_data(uuid)', 'execute') then
    raise exception 'CLAUDE.md MUST FALLIDO: anon puede ejecutar las funciones de las políticas de Reservas';
  end if;

  -- Las RPC nuevas: abiertas a quien tiene sesión, no a anon.
  if has_function_privilege('anon', 'public.set_member_can_support_reservations(uuid, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.agent_balance(uuid)', 'execute')
     or has_function_privilege('anon', 'public.agent_balance_cents(uuid)', 'execute')
     or has_function_privilege('anon', 'public.invite_to_establishment_panel(uuid, text, text, boolean, boolean, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.establishment_panel_users(uuid)', 'execute') then
    raise exception 'CLAUDE.md MUST FALLIDO: anon puede ejecutar una RPC de Reservas';
  end if;

  -- La firma antigua de la invitación ya no existe: no hay dos versiones de la misma RPC.
  if exists (select 1 from pg_proc where proname = 'invite_to_establishment_panel'
             and pronargs = 6 and pronamespace = 'public'::regnamespace) then
    raise exception 'CLAUDE.md MUST FALLIDO: queda la firma antigua de invite_to_establishment_panel';
  end if;
end $$;

-- ------------------------------------------------------------
-- Los avisos nuevos (PRD de agents §9.4): el CHECK los admite y el canal web_push también
-- ------------------------------------------------------------
do $$
declare
  v_def text;
  v_t text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conname = 'notifications_event_type_check' and conrelid = 'public.notifications'::regclass;
  foreach v_t in array array[
    'reservation_new', 'reservation_group_pending', 'reservation_group_pending_reminder',
    'agent_balance_low', 'agent_balance_empty', 'agent_off_long', 'reservations_payment_due',
    'reservations_past_due', 'reservations_paused', 'reservations_activated', 'reservations_ending',
    'reservations_closed_purge_soon', 'platform_connection_error', 'reservation_service_approved',
    'reservation_service_rejected', 'agent_topup_receipt', 'reservation_service_request',
    'reservation_service_received'
  ] loop
    if v_def not like '%''' || v_t || '''%' then
      raise exception 'PRD agents §9.4 FALLIDO: el CHECK de notifications no admite el aviso %', v_t;
    end if;
  end loop;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conname = 'notification_deliveries_channel_check' and conrelid = 'public.notification_deliveries'::regclass;
  if v_def not like '%web_push%' then
    raise exception 'PRD agents §9.4 FALLIDO: notification_deliveries no admite el canal web_push';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conname = 'notifications_entity_type_check' and conrelid = 'public.notifications'::regclass;
  if v_def not like '%''reservation''%' then
    raise exception 'PRD agents §9.4 FALLIDO: notifications no admite el tipo de entidad reservation';
  end if;
end $$;

rollback;

select 'reservas_cimientos: OK';
