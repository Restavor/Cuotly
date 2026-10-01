-- ============================================================
-- Suite 89 · Restavor app, la puerta común
--            (Fase A de agents; migraciones 156 a 158; decisiones 88 a 99)
-- ============================================================
--
-- Lo que esta suite vigila:
--
--   · RN-APP-03 · una suscripción a Reservas solo la crea la aprobación de la
--     solicitud: ni `create_service_subscription()`, ni el INSERT directo que la
--     política de `subscriptions` deja hacer. Reservas no crea `plan_commitments`.
--   · RN-APP-03 · pedir Reservas: solo el Propietario del restaurante, solo en
--     un espacio que las ofrece, con las condiciones vigentes; crea la solicitud
--     con la aceptación, los apuntes, la auditoría y los dos avisos, y NADA más
--     (ni suscripción, ni cobro, ni compromiso). Una sola `requested` por
--     restaurante; la misma petición dos veces es una solicitud.
--   · RN-APP-03 · el equipo la crea en nombre del restaurante, sin aceptación.
--   · RN-APP-01 · `my_products()`: qué abre y qué puede contratar cada persona.
--     Un restaurante solo con Reservas no da panel de Restavor web.
--   · RN-APP-03 · "¿Qué te interesa?" al pedir acceso.
--   · P7 / CLAUDE.md · ninguna columna con la identidad de alguien del equipo
--     la lee un cliente; RLS en las tres tablas, sin escrituras directas;
--     funciones internas cerradas a RPC.
--   · Decisión 99 · los dos avisos nuevos existen (el CHECK no se los traga).
--
-- Prefijo de esta suite: d8900000-.

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
  ('d8900000-0000-0000-0000-000000000001', 'duena@suite89.test', 'authenticated', 'authenticated'),
  ('d8900000-0000-0000-0000-000000000002', 'admin@suite89.test', 'authenticated', 'authenticated'),
  ('d8900000-0000-0000-0000-000000000003', 'trabajador@suite89.test', 'authenticated', 'authenticated'),
  ('d8900000-0000-0000-0000-000000000004', 'cliente-a@suite89.test', 'authenticated', 'authenticated'),
  ('d8900000-0000-0000-0000-000000000005', 'editor-a@suite89.test', 'authenticated', 'authenticated'),
  ('d8900000-0000-0000-0000-000000000006', 'cliente-b@suite89.test', 'authenticated', 'authenticated'),
  ('d8900000-0000-0000-0000-000000000007', 'extrano@suite89.test', 'authenticated', 'authenticated');

insert into public.profiles (id, email, full_name) values
  ('d8900000-0000-0000-0000-000000000001', 'duena@suite89.test', 'Dueña 89'),
  ('d8900000-0000-0000-0000-000000000002', 'admin@suite89.test', 'Admin 89'),
  ('d8900000-0000-0000-0000-000000000003', 'trabajador@suite89.test', 'Trabajador 89'),
  ('d8900000-0000-0000-0000-000000000004', 'cliente-a@suite89.test', 'Cliente A 89'),
  ('d8900000-0000-0000-0000-000000000005', 'editor-a@suite89.test', 'Editor A 89'),
  ('d8900000-0000-0000-0000-000000000006', 'cliente-b@suite89.test', 'Cliente B 89'),
  ('d8900000-0000-0000-0000-000000000007', 'extrano@suite89.test', 'Extraño 89')
on conflict (id) do nothing;

-- Dos espacios: uno que ofrece Reservas y otro que no.
insert into public.spaces (id, name, slug, timezone, created_by, reservations_enabled) values
  ('d8900000-0000-0000-0000-000000000010', 'Espacio 89', 'espacio-89', 'Europe/Madrid',
   'd8900000-0000-0000-0000-000000000001', false),
  ('d8900000-0000-0000-0000-000000000011', 'Espacio 89 sin Reservas', 'espacio-89-sin', 'Europe/Madrid',
   'd8900000-0000-0000-0000-000000000001', false);

insert into public.space_memberships (space_id, user_id, role, status) values
  ('d8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('d8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('d8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('d8900000-0000-0000-0000-000000000011', 'd8900000-0000-0000-0000-000000000001', 'owner', 'active');

-- Restaurantes: A (solo pedirá Reservas), B (con plan), C (en el espacio que no las ofrece), D (para pedir en su nombre).
insert into public.groups (id, space_id, name) values
  ('d8900000-0000-0000-0000-000000000015', 'd8900000-0000-0000-0000-000000000010', 'Grupo 89'),
  ('d8900000-0000-0000-0000-000000000016', 'd8900000-0000-0000-0000-000000000011', 'Grupo 89 sin');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('d8900000-0000-0000-0000-000000000020', 'd8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000015', 'R89A', 'Taberna A 89', 'active'),
  ('d8900000-0000-0000-0000-000000000021', 'd8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000015', 'R89B', 'Bar B 89', 'active'),
  ('d8900000-0000-0000-0000-000000000022', 'd8900000-0000-0000-0000-000000000011', 'd8900000-0000-0000-0000-000000000016', 'R89C', 'Casa C 89', 'active'),
  ('d8900000-0000-0000-0000-000000000023', 'd8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000015', 'R89D', 'Local D 89', 'active');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('d8900000-0000-0000-0000-000000000040', 'd8900000-0000-0000-0000-000000000020', 'd8900000-0000-0000-0000-000000000004', 'local_owner'),
  ('d8900000-0000-0000-0000-000000000041', 'd8900000-0000-0000-0000-000000000020', 'd8900000-0000-0000-0000-000000000005', 'editor'),
  ('d8900000-0000-0000-0000-000000000042', 'd8900000-0000-0000-0000-000000000021', 'd8900000-0000-0000-0000-000000000006', 'local_owner'),
  ('d8900000-0000-0000-0000-000000000043', 'd8900000-0000-0000-0000-000000000022', 'd8900000-0000-0000-0000-000000000006', 'local_owner');

insert into public.establishment_permissions (establishment_membership_id)
values ('d8900000-0000-0000-0000-000000000041');

-- B tiene un plan de mantenimiento (es el cliente "con web").
insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours)
values ('d8900000-0000-0000-0000-000000000050', 'd8900000-0000-0000-0000-000000000010', 'Plan 89', 9900, 0, 0, 0, 0, 24);
insert into public.subscriptions (id, space_id, establishment_id, kind, plan_id, status, created_by)
values ('d8900000-0000-0000-0000-000000000051', 'd8900000-0000-0000-0000-000000000010',
        'd8900000-0000-0000-0000-000000000021', 'plan', 'd8900000-0000-0000-0000-000000000050',
        'active', 'd8900000-0000-0000-0000-000000000001');

-- El catálogo de Reservas del espacio que las ofrece, por la función de la 156.
select public.ensure_reservations_service_internal('d8900000-0000-0000-0000-000000000010',
                                                   'd8900000-0000-0000-0000-000000000001');
update public.spaces set reservations_enabled = true where id = 'd8900000-0000-0000-0000-000000000010';

create temp table s89 (k text primary key, v uuid);
grant select, insert, update on s89 to authenticated, service_role;

-- ------------------------------------------------------------
-- RN-APP-03 · el servicio Reservas y quién puede suscribir a él
-- ------------------------------------------------------------
do $$
declare
  v_svc public.services;
  v_n integer;
begin
  select * into v_svc from public.services
  where space_id = 'd8900000-0000-0000-0000-000000000010' and kind = 'reservations';
  if v_svc.id is null then
    raise exception 'RN-APP-03 FALLIDO: el espacio no tiene el servicio Reservas';
  end if;
  if v_svc.price_cents <> 4800 then
    raise exception 'RN-APP-03 FALLIDO: Reservas cuesta 48 € al mes (4800 céntimos) y está en %', v_svc.price_cents;
  end if;
  if not exists (select 1 from public.service_versions where service_id = v_svc.lineage_id and version = 1) then
    raise exception 'RN-APP-03 FALLIDO: Reservas no tiene la versión 1 de sus condiciones';
  end if;

  -- Idempotente: pedirlo otra vez devuelve el mismo servicio.
  if public.ensure_reservations_service_internal('d8900000-0000-0000-0000-000000000010',
                                                 'd8900000-0000-0000-0000-000000000001') <> v_svc.id then
    raise exception 'RN-APP-03 FALLIDO: ensure_reservations_service_internal no es idempotente';
  end if;
  select count(*) into v_n from public.services
  where space_id = 'd8900000-0000-0000-0000-000000000010' and kind = 'reservations';
  if v_n <> 1 then
    raise exception 'RN-APP-03 FALLIDO: hay % servicios Reservas en el espacio', v_n;
  end if;

  insert into s89 values ('svc', v_svc.id);
end $$;

-- La propietaria del espacio (con manage_clients) NO puede suscribir a un restaurante a Reservas.
set local role authenticated;
set local "request.jwt.claim.sub" = 'd8900000-0000-0000-0000-000000000001';

do $$
declare
  v_svc uuid := (select v from s89 where k = 'svc');
  v_failed boolean := false;
begin
  begin
    perform public.create_service_subscription('d8900000-0000-0000-0000-000000000023', v_svc);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: create_service_subscription() creó una suscripción a Reservas';
  end if;

  -- Y el INSERT directo que `subscriptions_insert` deja hacer a quien tiene `manage_clients`.
  v_failed := false;
  begin
    insert into public.subscriptions (space_id, establishment_id, kind, service_id, created_by)
    values ('d8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000023',
            'service', v_svc, auth.uid());
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: un INSERT directo creó una suscripción a Reservas';
  end if;
end $$;

set local role postgres;

-- Solo con el ajuste de la aprobación entra (se prueba aquí, en un restaurante aparte).
do $$
declare
  v_svc uuid := (select v from s89 where k = 'svc');
  v_sub uuid;
begin
  perform set_config('restavor.reservations_approval', 'on', true);
  insert into public.subscriptions (space_id, establishment_id, kind, service_id, created_by)
  values ('d8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000023',
          'service', v_svc, 'd8900000-0000-0000-0000-000000000001')
  returning id into v_sub;
  perform set_config('restavor.reservations_approval', 'off', true);

  if exists (select 1 from public.plan_commitments where subscription_id = v_sub) then
    raise exception 'RN-APP-03 FALLIDO: Reservas creó un plan_commitments (decisión 95)';
  end if;

  delete from public.subscriptions where id = v_sub;
end $$;

-- ------------------------------------------------------------
-- RN-APP-03 · pedir Reservas
-- ------------------------------------------------------------
-- Un Editor sin permiso, un extraño y el equipo (no es el restaurante) reciben un "no" del servidor.
set local role authenticated;
set local "request.jwt.claim.sub" = 'd8900000-0000-0000-0000-000000000004';

do $$
declare
  v_t record;
begin
  select * into v_t from public.reservation_service_terms('d8900000-0000-0000-0000-000000000020');
  if v_t.service_version_id is null or v_t.version <> 1 or v_t.price_cents <> 4800 then
    raise exception 'RN-APP-03 FALLIDO: el Propietario no lee las condiciones de Reservas que se le ofrecen';
  end if;
  insert into s89 values ('version', v_t.service_version_id);
end $$;

-- Con una versión que no es la vigente, no.
do $$
declare
  v_failed boolean := false;
begin
  begin
    perform public.request_reservations('d8900000-0000-0000-0000-000000000020',
                                        'd8900000-0000-0000-0000-0000000000ff', null);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: se aceptó una versión de condiciones que no es la vigente';
  end if;
end $$;

-- Pedir de verdad, con clave de idempotencia.
do $$
declare
  v_version uuid := (select v from s89 where k = 'version');
  v_id uuid;
  v_id2 uuid;
begin
  v_id := public.request_reservations('d8900000-0000-0000-0000-000000000020', v_version, 'suite89-clave-1');
  v_id2 := public.request_reservations('d8900000-0000-0000-0000-000000000020', v_version, 'suite89-clave-1');
  if v_id is null or v_id2 is distinct from v_id then
    raise exception 'RN-APP-03 FALLIDO: pulsar dos veces no devolvió la misma solicitud (CA-17)';
  end if;
  insert into s89 values ('req', v_id);
end $$;

-- La segunda, sin clave, ya es "ya tiene una solicitud en marcha".
do $$
declare
  v_version uuid := (select v from s89 where k = 'version');
  v_failed boolean := false;
begin
  begin
    perform public.request_reservations('d8900000-0000-0000-0000-000000000020', v_version, null);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: dos solicitudes abiertas del mismo restaurante';
  end if;
end $$;

-- El Editor sin permiso, el extraño y el restaurante de un espacio sin Reservas: no.
set local "request.jwt.claim.sub" = 'd8900000-0000-0000-0000-000000000005';
do $$
declare
  v_version uuid := (select v from s89 where k = 'version');
  v_failed boolean := false;
begin
  begin
    perform public.request_reservations('d8900000-0000-0000-0000-000000000020', v_version, null);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: un Editor pidió Reservas por RPC';
  end if;
end $$;

set local "request.jwt.claim.sub" = 'd8900000-0000-0000-0000-000000000007';
do $$
declare
  v_version uuid := (select v from s89 where k = 'version');
  v_failed boolean := false;
begin
  begin
    perform public.request_reservations('d8900000-0000-0000-0000-000000000020', v_version, null);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: un extraño pidió Reservas por RPC';
  end if;
  if exists (select 1 from public.reservation_service_terms('d8900000-0000-0000-0000-000000000020')) then
    raise exception 'RN-APP-03 FALLIDO: un extraño lee las condiciones de Reservas de otro restaurante';
  end if;
end $$;

set local "request.jwt.claim.sub" = 'd8900000-0000-0000-0000-000000000006';
do $$
declare
  v_version uuid := (select v from s89 where k = 'version');
  v_failed boolean := false;
begin
  begin
    perform public.request_reservations('d8900000-0000-0000-0000-000000000022', v_version, null);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: se pidió Reservas en un espacio que no las ofrece';
  end if;
end $$;

-- Lo que dejó la solicitud, y lo que NO.
set local role postgres;
do $$
declare
  v_req public.reservation_service_requests;
  v_n integer;
begin
  select * into v_req from public.reservation_service_requests where id = (select v from s89 where k = 'req');
  if v_req.status <> 'requested' or v_req.requested_by <> 'd8900000-0000-0000-0000-000000000004'
     or v_req.terms_accepted_by <> 'd8900000-0000-0000-0000-000000000004'
     or v_req.terms_accepted_at is null
     or v_req.service_version_id <> (select v from s89 where k = 'version') then
    raise exception 'RN-APP-03 FALLIDO: la solicitud no guardó quién pidió ni la aceptación de las condiciones';
  end if;

  select count(*) into v_n from public.reservation_service_events where request_id = v_req.id;
  if v_n <> 2 then
    raise exception 'RN-APP-03 FALLIDO: se esperaban los apuntes requested y terms_accepted y hay %', v_n;
  end if;
  if not exists (select 1 from public.audit_log where entity_id = v_req.establishment_id
                 and action = 'reservations.requested' and actor_id = 'd8900000-0000-0000-0000-000000000004') then
    raise exception 'RN-APP-03 FALLIDO: la solicitud no dejó auditoría con su actor';
  end if;

  -- Los dos avisos (decisión 99): el CHECK no se los traga.
  select count(*) into v_n from public.notifications
  where event_type = 'reservation_service_request' and audience = 'staff'
    and deep_link = '/espacios/espacio-89/reservas'
    and recipient_id in ('d8900000-0000-0000-0000-000000000001', 'd8900000-0000-0000-0000-000000000002');
  if v_n <> 2 then
    raise exception 'RN-APP-03 FALLIDO: el aviso al equipo llegó a % de 2 (propietaria y administrador)', v_n;
  end if;
  if exists (select 1 from public.notifications where event_type = 'reservation_service_request'
             and recipient_id = 'd8900000-0000-0000-0000-000000000003') then
    raise exception 'RN-APP-03 FALLIDO: un trabajador recibió el aviso de las solicitudes de Reservas';
  end if;
  if not exists (select 1 from public.notifications
                 where event_type = 'reservation_service_received' and audience = 'client'
                   and recipient_id = 'd8900000-0000-0000-0000-000000000004' and deep_link = '/') then
    raise exception 'RN-APP-03 FALLIDO: el restaurante no recibió el aviso "Hemos recibido tu solicitud"';
  end if;

  -- Y NADA más.
  if exists (select 1 from public.subscriptions where establishment_id = v_req.establishment_id and kind = 'service') then
    raise exception 'RN-APP-03 FALLIDO: pedir Reservas creó una suscripción';
  end if;
  if exists (select 1 from public.plan_commitments where establishment_id = v_req.establishment_id)
     or exists (select 1 from public.charges where establishment_id = v_req.establishment_id)
     or exists (select 1 from public.reservation_settings where establishment_id = v_req.establishment_id) then
    raise exception 'RN-APP-03 FALLIDO: pedir Reservas creó un compromiso, un cobro o unos ajustes';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-APP-03 · el equipo la crea en nombre del restaurante
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd8900000-0000-0000-0000-000000000003';
do $$
declare
  v_failed boolean := false;
begin
  begin
    perform public.create_reservation_request_on_behalf('d8900000-0000-0000-0000-000000000023', null);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: un trabajador creó una solicitud de Reservas';
  end if;
end $$;

set local "request.jwt.claim.sub" = 'd8900000-0000-0000-0000-000000000002';
do $$
declare
  v_id uuid;
  v_id2 uuid;
begin
  v_id := public.create_reservation_request_on_behalf('d8900000-0000-0000-0000-000000000023', 'suite89-bh-1');
  v_id2 := public.create_reservation_request_on_behalf('d8900000-0000-0000-0000-000000000023', 'suite89-bh-1');
  if v_id is null or v_id2 is distinct from v_id then
    raise exception 'RN-APP-03 FALLIDO: la solicitud en nombre del restaurante no es idempotente';
  end if;
  insert into s89 values ('behalf', v_id);
end $$;

set local role postgres;
do $$
declare
  v_r public.reservation_service_requests;
begin
  select * into v_r from public.reservation_service_requests where id = (select v from s89 where k = 'behalf');
  if v_r.status <> 'requested' or v_r.requested_by is not null
     or v_r.created_on_behalf_by <> 'd8900000-0000-0000-0000-000000000002'
     or v_r.terms_accepted_at is not null then
    raise exception 'RN-APP-03 FALLIDO: la solicitud en nombre del restaurante no quedó sin aceptación y con quién la creó';
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-APP-01 · my_products()
-- ------------------------------------------------------------
create or replace function pg_temp.prod(p_user uuid)
returns text language plpgsql as $$
declare
  v_out text;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select coalesce(string_agg(kind || ':' || coalesce(establishment_name, '-') || ':' || coalesce(detail, '-'), ' | ' order by kind, establishment_name), '')
  into v_out from public.my_products();
  return v_out;
end $$;
grant execute on function pg_temp.prod(uuid) to authenticated;

set local role authenticated;

do $$
declare
  v text;
begin
  -- El equipo: Restavor web, y nada de agents.
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000001');
  if v not like 'web:-:team%' or v like '%agents%' then
    raise exception 'RN-APP-01 FALLIDO: el equipo debía abrir solo Restavor web y vio [%]', v;
  end if;

  -- Un trabajador del espacio: solo web.
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000003');
  if v <> 'web:-:team' then
    raise exception 'RN-APP-01 FALLIDO: un trabajador debía abrir solo Restavor web y vio [%]', v;
  end if;

  -- El cliente de A: pidió Reservas y no tiene plan → no hay panel de web, hay solicitud enviada.
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000004');
  if v <> 'agents_requests:Taberna A 89:requested' then
    raise exception 'RN-APP-01 FALLIDO: quien solo ha pedido Reservas debía ver su solicitud y nada más, y vio [%]', v;
  end if;

  -- El cliente de B: tiene plan (web) y se le ofrece Reservas.
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000006');
  if v not like '%agents_offer:Bar B 89%' or v not like '%web:Bar B 89:panel%' then
    raise exception 'RN-APP-01 FALLIDO: quien tiene plan debía ver web y la oferta de Reservas, y vio [%]', v;
  end if;
  -- ...pero no en el espacio que no las ofrece (su restaurante C).
  if v like '%Casa C 89%' and v like '%agents_offer:Casa C 89%' then
    raise exception 'RN-APP-01 FALLIDO: se ofrece Reservas en un espacio que no las ofrece';
  end if;

  -- Un extraño: nada.
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000007');
  if v <> '' then
    raise exception 'RN-APP-01 FALLIDO: un extraño no debía abrir nada y vio [%]', v;
  end if;

  -- Sin sesión: nada.
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.my_products()) then
    raise exception 'RN-APP-01 FALLIDO: sin sesión my_products() contestó';
  end if;
end $$;

-- A tiene Reservas contratada: Propietario y Encargado la abren; el Editor sin permiso, no.
set local role postgres;
insert into public.reservation_settings (space_id, establishment_id, service_status)
values ('d8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000020', 'active');
update public.reservation_service_requests set status = 'approved' where id = (select v from s89 where k = 'req');

set local role authenticated;
do $$
declare
  v text;
begin
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000004');
  if v <> 'agents:Taberna A 89:active' then
    raise exception 'RN-APP-01 FALLIDO: el Propietario con Reservas activa debía abrir solo agents y vio [%]', v;
  end if;
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000005');
  if v <> '' then
    raise exception 'RN-APP-01 FALLIDO: un Editor sin manage_reservations no debía ver Reservas y vio [%]', v;
  end if;
end $$;

set local role postgres;
update public.establishment_permissions set manage_reservations = true
where establishment_membership_id = 'd8900000-0000-0000-0000-000000000041';

set local role authenticated;
do $$
declare
  v text;
begin
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000005');
  if v <> 'agents:Taberna A 89:active' then
    raise exception 'RN-APP-01 FALLIDO: el Encargado (Editor con manage_reservations) debía abrir agents y vio [%]', v;
  end if;
end $$;

-- Cerrada: el Propietario entra 30 días a descargar; el Encargado, no.
set local role postgres;
update public.reservation_settings set service_status = 'closed', closed_at = now() - interval '10 days'
where establishment_id = 'd8900000-0000-0000-0000-000000000020';

set local role authenticated;
do $$
declare
  v text;
begin
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000004');
  -- Entra a descargar sus datos y, cerrada, también se le ofrece volver a contratar.
  if v <> 'agents:Taberna A 89:closed | agents_offer:Taberna A 89:-' then
    raise exception 'RN-APP-01 FALLIDO: el Propietario debía poder entrar a una Reservas cerrada hace 10 días y vio [%]', v;
  end if;
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000005');
  if v <> '' then
    raise exception 'RN-APP-01 FALLIDO: el Encargado no debía entrar a una Reservas cerrada y vio [%]', v;
  end if;
end $$;

set local role postgres;
update public.reservation_settings set closed_at = now() - interval '40 days'
where establishment_id = 'd8900000-0000-0000-0000-000000000020';

set local role authenticated;
do $$
declare
  v text;
begin
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000004');
  if v like '%agents:%' then
    raise exception 'RN-APP-01 FALLIDO: pasados los 30 días de descarga no debía abrir agents y vio [%]', v;
  end if;
end $$;

-- B, con plan, contrata Reservas: conserva web y gana agents.
set local role postgres;
insert into public.reservation_settings (space_id, establishment_id, service_status)
values ('d8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000021', 'active');

set local role authenticated;
do $$
declare
  v text;
begin
  v := pg_temp.prod('d8900000-0000-0000-0000-000000000006');
  if v not like '%agents:Bar B 89:active%' or v not like '%web:Bar B 89:panel%' then
    raise exception 'RN-APP-01 FALLIDO: quien tiene plan y Reservas debía abrir los dos y vio [%]', v;
  end if;
end $$;

-- ------------------------------------------------------------
-- RN-APP-01 · my_contexts(): lo solo-Reservas no es un panel de Restavor web
-- ------------------------------------------------------------
do $$
declare
  v_n integer;
  v_definer boolean;
begin
  perform set_config('request.jwt.claim.sub', 'd8900000-0000-0000-0000-000000000004', true);
  select count(*) into v_n from public.my_contexts() where kind = 'establishment';
  if v_n <> 0 then
    raise exception 'RN-APP-01 FALLIDO: un restaurante solo con Reservas sigue dando panel de Restavor web (% contextos)', v_n;
  end if;

  perform set_config('request.jwt.claim.sub', 'd8900000-0000-0000-0000-000000000006', true);
  select count(*) into v_n from public.my_contexts() where kind = 'establishment' and establishment_name = 'Bar B 89';
  if v_n <> 1 then
    raise exception 'RN-APP-01 FALLIDO: quien tiene plan perdió su panel de Restavor web';
  end if;

  select p.prosecdef into v_definer from pg_proc p where p.oid = 'public.my_contexts()'::regprocedure;
  if v_definer then
    raise exception 'RN-GLO-01 FALLIDO: my_contexts() pasó a SECURITY DEFINER';
  end if;
end $$;

-- ------------------------------------------------------------
-- P7 · identidad del equipo y escrituras directas
-- ------------------------------------------------------------
do $$
declare
  v_failed boolean;
  v_n integer;
begin
  perform set_config('request.jwt.claim.sub', 'd8900000-0000-0000-0000-000000000004', true);

  -- `select *` da 403, como en las demás tablas con privilegios de columna.
  v_failed := false;
  begin
    perform * from public.reservation_service_requests;
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'P7 FALLIDO: select * sobre reservation_service_requests no dio 403';
  end if;

  -- Lo suyo, sí, por columnas.
  select count(*) into v_n from public.reservation_service_requests
  where establishment_id = 'd8900000-0000-0000-0000-000000000020';
  if v_n <> 1 then
    raise exception 'RN-APP-03 FALLIDO: el Propietario no lee su propia solicitud (%)', v_n;
  end if;
end $$;

do $$
declare
  c text;
  v_failed boolean;
  v_n integer;
begin
  perform set_config('request.jwt.claim.sub', 'd8900000-0000-0000-0000-000000000004', true);
  foreach c in array array['reviewed_by', 'created_on_behalf_by', 'idempotency_key'] loop
    v_failed := false;
    begin
      execute format('select %I from public.reservation_service_requests limit 1', c);
    exception when insufficient_privilege then
      v_failed := true;
    end;
    if not v_failed then
      raise exception 'P7 FALLIDO: reservation_service_requests.% es legible por un cliente', c;
    end if;
  end loop;

  v_failed := false;
  begin
    perform actor_id from public.reservation_service_events limit 1;
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'P7 FALLIDO: reservation_service_events.actor_id es legible por un cliente';
  end if;

  -- Un extraño no ve ninguna fila de las tres.
  perform set_config('request.jwt.claim.sub', 'd8900000-0000-0000-0000-000000000007', true);
  if exists (select 1 from public.reservation_service_requests)
     or exists (select 1 from public.reservation_service_events)
     or exists (select 1 from public.reservation_settings) then
    raise exception 'P7 FALLIDO: un extraño lee filas del ciclo de vida de Reservas de otro restaurante';
  end if;

  -- Otro restaurante (B) no ve la solicitud de A.
  perform set_config('request.jwt.claim.sub', 'd8900000-0000-0000-0000-000000000006', true);
  if exists (select 1 from public.reservation_service_requests where establishment_id = 'd8900000-0000-0000-0000-000000000020') then
    raise exception 'P7 FALLIDO: un restaurante lee la solicitud de otro';
  end if;

  -- Sin escrituras directas, ni siquiera el equipo.
  perform set_config('request.jwt.claim.sub', 'd8900000-0000-0000-0000-000000000001', true);
  v_failed := false;
  begin
    insert into public.reservation_service_requests (space_id, establishment_id, status)
    values ('d8900000-0000-0000-0000-000000000010', 'd8900000-0000-0000-0000-000000000023', 'requested');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'CLAUDE.md FALLIDO: se pudo insertar directamente en reservation_service_requests';
  end if;
  -- Sin privilegio de UPDATE (solo escriben las RPC): la API no toca ninguna fila.
  v_failed := false;
  begin
    update public.reservation_settings set service_status = 'paused';
    get diagnostics v_n = row_count;
    v_failed := v_n = 0;
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'CLAUDE.md FALLIDO: se pudo actualizar reservation_settings por la API';
  end if;
end $$;

set local role postgres;
do $$
declare
  t text;
begin
  foreach t in array array['reservation_service_requests', 'reservation_service_events', 'reservation_settings'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'CLAUDE.md FALLIDO: % no tiene RLS activado', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT') then
      raise exception 'CLAUDE.md FALLIDO: % tiene una política de escritura (solo escriben las RPC)', t;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT') then
      raise exception 'CLAUDE.md FALLIDO: % no tiene política de lectura explícita', t;
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass
                   and tgname = t || '_guard_support_read_only')
       or not exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass
                      and tgname = t || '_cuotly_read_only') then
      raise exception 'RN-ADM-07 FALLIDO: % no lleva los dos disparadores de solo lectura', t;
    end if;
  end loop;
end $$;

-- Las funciones internas no se abren por RPC (CLAUDE.md: nunca solo "from public").
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.ensure_reservations_service_internal(uuid, uuid)',
    'public.reservations_notify_internal(uuid, boolean)',
    'public.guard_reservations_subscription()'
  ] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'CLAUDE.md FALLIDO: % está abierta por RPC', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.my_products()', 'execute')
     or has_function_privilege('anon', 'public.request_reservations(uuid, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.create_reservation_request_on_behalf(uuid, text)', 'execute') then
    raise exception 'CLAUDE.md FALLIDO: una función de Reservas está abierta a anon';
  end if;
end $$;

-- ------------------------------------------------------------
-- spaces.reservations_enabled: solo la plataforma
-- ------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" = 'd8900000-0000-0000-0000-000000000001';
do $$
declare
  v_failed boolean := false;
begin
  begin
    perform public.set_space_reservations_enabled('d8900000-0000-0000-0000-000000000011', true);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-ADM-02 FALLIDO: el propietario de un espacio activó Reservas en su espacio';
  end if;
end $$;

set local "request.jwt.claim.sub" = 'ffb00000-0000-0000-0000-000000000001';
set local "request.jwt.claim.aal" = 'aal2';
do $$
begin
  perform public.set_space_reservations_enabled('d8900000-0000-0000-0000-000000000011', true);
  if not (select reservations_enabled from public.spaces where id = 'd8900000-0000-0000-0000-000000000011') then
    raise exception 'RN-ADM-02 FALLIDO: la plataforma no pudo activar Reservas en un espacio';
  end if;
  if not exists (select 1 from public.audit_log where action = 'space.reservations_enabled_changed'
                 and entity_id = 'd8900000-0000-0000-0000-000000000011') then
    raise exception 'RN-ADM-02 FALLIDO: activar Reservas no dejó auditoría';
  end if;
end $$;
set local "request.jwt.claim.aal" = 'aal1';

-- ------------------------------------------------------------
-- RN-APP-03 · "¿Qué te interesa?" al pedir acceso
-- ------------------------------------------------------------
set local role service_role;
do $$
declare
  v_failed boolean;
begin
  perform public.submit_access_request('Ana 89', 'Casa Ana 89', '600000089', 'ana@suite89.test',
                                       'B12345674', 'ES', 'checksum', null, null, array['reservations']);
  perform public.submit_access_request('Beto 89', 'Casa Beto 89', '600000090', 'beto@suite89.test',
                                       'B12345674', 'ES', 'checksum', null, null, null);
  perform public.submit_access_request('Cris 89', 'Casa Cris 89', '600000091', 'cris@suite89.test',
                                       'B12345674', 'ES', 'checksum', null, null, array['web', 'reservations', 'web']);

  if (select interested_in from public.access_requests where email = 'ana@suite89.test') <> array['reservations'] then
    raise exception 'RN-APP-03 FALLIDO: no se guardó "Reservas" como lo que le interesa';
  end if;
  if (select interested_in from public.access_requests where email = 'beto@suite89.test') <> array['web'] then
    raise exception 'RN-APP-03 FALLIDO: sin marcar debía quedar como Restavor web';
  end if;
  if (select interested_in from public.access_requests where email = 'cris@suite89.test') <> array['reservations', 'web']
     and (select interested_in from public.access_requests where email = 'cris@suite89.test') <> array['web', 'reservations'] then
    raise exception 'RN-APP-03 FALLIDO: las dos no se guardaron sin duplicados';
  end if;

  v_failed := false;
  begin
    perform public.submit_access_request('Dani 89', 'Casa Dani 89', '600000092', 'dani@suite89.test',
                                         'B12345674', 'ES', 'checksum', null, null, array['otra-cosa']);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'RN-APP-03 FALLIDO: se aceptó un interés que no existe';
  end if;
end $$;

-- Sigue reservada al servidor (RN-ACC-12): una sesión no la llama.
set local role authenticated;
do $$
begin
  if has_function_privilege('authenticated',
       'public.submit_access_request(text, text, text, text, text, text, text, text, text, text[])', 'execute') then
    raise exception 'RN-ACC-12 FALLIDO: submit_access_request está abierta a authenticated';
  end if;
end $$;

rollback;
select 'restavor_app_puerta_comun: OK';
