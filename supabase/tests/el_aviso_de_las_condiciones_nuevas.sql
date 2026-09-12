-- El aviso de una versión nueva de las condiciones (migración 76).
--
-- Decisión de Bosco (12/09/2026): "El equipo de mantenimiento pulsará un
-- botón cuando lo haya publicado y le llegará un push al restaurante".
--
-- Lo que se comprueba, y por qué cada cosa:
--
--   · **Llega a quien puede aceptar**, por cada restaurante con
--     suscripción ACTIVA al plan publicado: el propietario local y el
--     propietario global de su grupo. Hasta la 76 no llegaba a nadie.
--   · **NO llega** al Editor (no firma por el restaurante), a quien se le
--     retiró el acceso (RN-EST-05), a un restaurante con OTRO plan, a uno
--     con la suscripción cancelada, ni a nadie del equipo (es quien
--     publica).
--   · **Es del cliente y apunta a su ficha** (RN-NOT-04), que es donde
--     está el botón de aceptar. Y sale por correo (§18: Fase 1 son centro
--     y correo; el push llega con la app móvil).
--   · **Cada versión avisa; la misma versión no avisa dos veces** al mismo
--     restaurante (CA-17): la clave lleva la versión y el restaurante.
--   · **El servicio avisa igual que el plan**, y solo a quien lo tiene.
--   · **El restaurante lo lee** desde su centro de avisos: un aviso que no
--     se puede leer es lo mismo que no avisar.
--   · **La función interna está cerrada por RPC** (CLAUDE.md): avisar de
--     una versión no la publica nadie suelto.
--
-- Cómo ejecutarlo: automáticamente en CI (.github/workflows/ci.yml, job
-- "rls-tests"), o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/el_aviso_de_las_condiciones_nuevas.sql

-- ============================================================
-- Fixture
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('ce000000-0000-0000-0000-000000000001', 'cn-owner@example.com', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-000000000002', 'cn-admin@example.com', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-000000000003', 'cn-local-a@example.com', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-000000000004', 'cn-editor-a@example.com', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-000000000005', 'cn-global-g2@example.com', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-000000000006', 'cn-local-c@example.com', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-000000000007', 'cn-local-d@example.com', 'authenticated', 'authenticated'),
  ('ce000000-0000-0000-0000-000000000008', 'cn-retirado-a@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('ce100000-0000-0000-0000-000000000001', 'Espacio Aviso Condiciones', 'espacio-aviso-cond-test',
   'ce000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('ce100000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('ce100000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000002', 'admin', 'active');

insert into public.plans
  (id, space_id, name, price_cents, included_small, included_photo, included_medium,
   included_large, start_sla_hours) values
  ('ce200000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001',
   'Plan A', 39900, 16, 12, 3, 0, 24),
  ('ce200000-0000-0000-0000-000000000002', 'ce100000-0000-0000-0000-000000000001',
   'Plan B', 9900, 0, 0, 0, 0, 48);

insert into public.services (id, space_id, name, price_cents) values
  ('ce250000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'Servicio S', 22900);

insert into public.groups (id, space_id, name) values
  ('ce300000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001', 'Grupo 1'),
  ('ce300000-0000-0000-0000-000000000002', 'ce100000-0000-0000-0000-000000000001', 'Grupo 2');

-- A, C y D en el grupo 1; B en el grupo 2, cuyo propietario global es 05.
insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('ce400000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001',
   'ce300000-0000-0000-0000-000000000001', 'EST-CN-A', 'Restaurante A', 'active'),
  ('ce400000-0000-0000-0000-000000000002', 'ce100000-0000-0000-0000-000000000001',
   'ce300000-0000-0000-0000-000000000002', 'EST-CN-B', 'Restaurante B', 'active'),
  ('ce400000-0000-0000-0000-000000000003', 'ce100000-0000-0000-0000-000000000001',
   'ce300000-0000-0000-0000-000000000001', 'EST-CN-C', 'Restaurante C', 'active'),
  ('ce400000-0000-0000-0000-000000000004', 'ce100000-0000-0000-0000-000000000001',
   'ce300000-0000-0000-0000-000000000001', 'EST-CN-D', 'Restaurante D', 'active');

-- A: plan A y servicio S. B: plan A. C: plan B. D: plan A, pero cancelado.
insert into public.subscriptions (id, space_id, establishment_id, kind, plan_id, service_id, status) values
  ('ce600000-0000-0000-0000-000000000001', 'ce100000-0000-0000-0000-000000000001',
   'ce400000-0000-0000-0000-000000000001', 'plan', 'ce200000-0000-0000-0000-000000000001', null, 'active'),
  ('ce600000-0000-0000-0000-000000000002', 'ce100000-0000-0000-0000-000000000001',
   'ce400000-0000-0000-0000-000000000001', 'service', null, 'ce250000-0000-0000-0000-000000000001', 'active'),
  ('ce600000-0000-0000-0000-000000000003', 'ce100000-0000-0000-0000-000000000001',
   'ce400000-0000-0000-0000-000000000002', 'plan', 'ce200000-0000-0000-0000-000000000001', null, 'active'),
  ('ce600000-0000-0000-0000-000000000004', 'ce100000-0000-0000-0000-000000000001',
   'ce400000-0000-0000-0000-000000000003', 'plan', 'ce200000-0000-0000-0000-000000000002', null, 'active'),
  ('ce600000-0000-0000-0000-000000000005', 'ce100000-0000-0000-0000-000000000001',
   'ce400000-0000-0000-0000-000000000004', 'plan', 'ce200000-0000-0000-0000-000000000001', null, 'cancelled');

insert into public.establishment_memberships (establishment_id, user_id, role, revoked_at) values
  ('ce400000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000003', 'local_owner', null),
  ('ce400000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000004', 'editor', null),
  ('ce400000-0000-0000-0000-000000000001', 'ce000000-0000-0000-0000-000000000008', 'local_owner', now()),
  ('ce400000-0000-0000-0000-000000000003', 'ce000000-0000-0000-0000-000000000006', 'local_owner', null),
  ('ce400000-0000-0000-0000-000000000004', 'ce000000-0000-0000-0000-000000000007', 'local_owner', null);

insert into public.group_memberships (group_id, user_id, role) values
  ('ce300000-0000-0000-0000-000000000002', 'ce000000-0000-0000-0000-000000000005', 'global_owner');

create temporary table cn_ctx (key text primary key, value text);
grant select, insert, update on cn_ctx to authenticated, service_role;

-- ============================================================
-- La función interna está cerrada por RPC.
-- ============================================================
do $$
begin
  if has_function_privilege('anon', 'public.notify_terms_version_published(uuid, text, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.notify_terms_version_published(uuid, text, uuid, uuid)', 'execute') then
    raise exception 'FALLIDO: notify_terms_version_published() está abierta por RPC'
      using errcode = 'assert_failure';
  end if;

  -- Y las de publicar siguen como en la 75: abiertas al equipo, no a anon.
  if has_function_privilege('anon', 'public.publish_plan_conditions(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.publish_service_conditions(uuid, text)', 'execute') then
    raise exception 'FALLIDO: publicar condiciones está abierto sin sesión' using errcode = 'assert_failure';
  end if;
  if not has_function_privilege('authenticated', 'public.publish_plan_conditions(uuid, text)', 'execute') then
    raise exception 'FALLIDO: la 76 ha cerrado publish_plan_conditions() al equipo' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- La propietaria publica la v1 del plan A.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ce000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare v_v1 uuid;
begin
  v_v1 := public.publish_plan_conditions('ce200000-0000-0000-0000-000000000001', 'Condiciones del plan A, v1.');
  insert into cn_ctx (key, value) values ('plan_v1', v_v1::text);
end $$;

reset role;

-- Las comprobaciones van como superusuario: la política de
-- `notifications` deja ver a cada uno solo lo suyo, y lo que se cuenta
-- aquí es lo que ha recibido TODO el mundo.
do $$
declare
  v_v1 uuid := (select value::uuid from cn_ctx where key = 'plan_v1');
  v_avisos integer;
  v_fila record;
begin
  -- Quien puede aceptar: 03 por A (propietario local) y 05 por B
  -- (propietario global del grupo 2). Uno cada uno.
  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'terms_version_published'
    and ((n.recipient_id = 'ce000000-0000-0000-0000-000000000003'
          and n.establishment_id = 'ce400000-0000-0000-0000-000000000001')
      or (n.recipient_id = 'ce000000-0000-0000-0000-000000000005'
          and n.establishment_id = 'ce400000-0000-0000-0000-000000000002'));

  if v_avisos <> 2 then
    raise exception 'FALLIDO: quien puede aceptar la v1 ha recibido % avisos, se esperaban 2', v_avisos
      using errcode = 'assert_failure';
  end if;

  -- Y nadie más.
  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'terms_version_published'
    and n.recipient_id not in ('ce000000-0000-0000-0000-000000000003',
                               'ce000000-0000-0000-0000-000000000005');

  if v_avisos <> 0 then
    raise exception 'FALLIDO: el aviso de condiciones nuevas ha llegado a quien no puede aceptarlas (% avisos: equipo, Editor, acceso retirado, otro plan o suscripción cancelada)', v_avisos
      using errcode = 'assert_failure';
  end if;

  -- Del cliente, apunta a su ficha, y sale por correo.
  select n.* into v_fila
  from public.notifications n
  where n.event_type = 'terms_version_published'
    and n.recipient_id = 'ce000000-0000-0000-0000-000000000003';

  if v_fila.audience <> 'client' or v_fila.entity_type <> 'establishment'
     or v_fila.entity_id <> 'ce400000-0000-0000-0000-000000000001' then
    raise exception 'FALLIDO: el aviso no es del cliente o no apunta a su restaurante (audiencia %, elemento % %)',
      v_fila.audience, v_fila.entity_type, v_fila.entity_id using errcode = 'assert_failure';
  end if;

  if v_fila.deep_link <> '/espacios/espacio-aviso-cond-test/restaurantes/ce400000-0000-0000-0000-000000000001' then
    raise exception 'RN-NOT-04 FALLIDO: el enlace del aviso es "%"', v_fila.deep_link using errcode = 'assert_failure';
  end if;

  if v_fila.dedupe_key <> 'terms_version_published:' || v_v1::text || ':ce400000-0000-0000-0000-000000000001' then
    raise exception 'FALLIDO: la clave de deduplicación no lleva la versión y el restaurante: "%"', v_fila.dedupe_key
      using errcode = 'assert_failure';
  end if;

  if not exists (
    select 1 from public.notification_deliveries d
    where d.notification_id = v_fila.id and d.channel = 'email' and d.status = 'pending'
  ) then
    raise exception '§18 FALLIDO: el aviso de condiciones nuevas no ha entrado en la cola de correo'
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- La v2 avisa otra vez; la misma versión, no.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ce000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.publish_plan_conditions('ce200000-0000-0000-0000-000000000001', 'Condiciones del plan A, v2.');
end $$;

reset role;

do $$
declare v_avisos integer; v_sent integer;
begin
  select count(*) into v_avisos from public.notifications n where n.event_type = 'terms_version_published';
  if v_avisos <> 4 then
    raise exception 'FALLIDO: tras publicar la v2 hay % avisos, se esperaban 4 (dos por versión)', v_avisos
      using errcode = 'assert_failure';
  end if;

  -- CA-17 desde dentro: la función interna con la MISMA versión no duplica.
  v_sent := public.notify_terms_version_published(
    'ce100000-0000-0000-0000-000000000001', 'plan',
    'ce200000-0000-0000-0000-000000000001', (select value::uuid from cn_ctx where key = 'plan_v1'));

  select count(*) into v_avisos from public.notifications n where n.event_type = 'terms_version_published';
  if v_sent <> 0 or v_avisos <> 4 then
    raise exception 'CA-17 FALLIDO: avisar dos veces de la misma versión ha dejado % avisos (% nuevos)', v_avisos, v_sent
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El servicio: solo a quien lo tiene contratado (A → 03).
-- ============================================================
select set_config('request.jwt.claim.sub', 'ce000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
begin
  perform public.publish_service_conditions('ce250000-0000-0000-0000-000000000001', 'Condiciones del servicio S.');
end $$;

reset role;

do $$
declare v_avisos integer;
begin
  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'terms_version_published'
    and n.establishment_id = 'ce400000-0000-0000-0000-000000000001'
    and n.recipient_id = 'ce000000-0000-0000-0000-000000000003';
  if v_avisos <> 3 then
    raise exception 'FALLIDO: el propietario de A tiene % avisos, se esperaban 3 (v1, v2 y el servicio)', v_avisos
      using errcode = 'assert_failure';
  end if;

  select count(*) into v_avisos from public.notifications n where n.event_type = 'terms_version_published';
  if v_avisos <> 5 then
    raise exception 'FALLIDO: publicar el servicio ha dejado % avisos en total, se esperaban 5', v_avisos
      using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- El restaurante lo lee desde su centro de avisos.
-- ============================================================
select set_config('request.jwt.claim.sub', 'ce000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare v_avisos integer;
begin
  select count(*) into v_avisos
  from public.notifications n
  where n.event_type = 'terms_version_published';
  if v_avisos <> 3 then
    raise exception 'FALLIDO: el propietario del restaurante lee % avisos de condiciones, se esperaban 3', v_avisos
      using errcode = 'assert_failure';
  end if;

  -- Y solo los suyos: el de B (05) no.
  if exists (
    select 1 from public.notifications n
    where n.event_type = 'terms_version_published' and n.recipient_id <> auth.uid()
  ) then
    raise exception 'FALLIDO: un restaurante lee avisos de otro' using errcode = 'assert_failure';
  end if;
end $$;

reset role;

-- ============================================================
-- Limpieza del fixture.
-- ============================================================
delete from public.notifications where space_id = 'ce100000-0000-0000-0000-000000000001';
delete from public.audit_log where space_id = 'ce100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'ce100000-0000-0000-0000-000000000001';
delete from auth.users where id::text like 'ce000000-%';

select 'el_aviso_de_las_condiciones_nuevas: OK' as resultado;
