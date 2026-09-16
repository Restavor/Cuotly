-- Fase 4 · Hito 22 · la app móvil y el push (migración 94; PRD §35,
-- RN-MOV-04, 05, 06 y 10; §70, §144 y §176 de la maestra).
--
-- Casi todo el hito vive en el teléfono y se prueba allí: los once flujos
-- de §176 llaman a las mismas funciones que la web, con la sesión de quien
-- mira, y esas funciones ya tienen sus suites. Lo que sí es del servidor,
-- y lo que esta suite comprueba, es lo que la 94 añade:
--
--   · RN-MOV-05: un teléfono es de una persona; el token pasa a quien
--     entra; se da de baja al cerrar sesión; solo el proceso de la cola
--     cierra un token que el proveedor da por inexistente; cada uno ve
--     los suyos y nadie más; todo con auditoría.
--   · RN-MOV-06: la preferencia `push` por evento, activada por omisión,
--     y los obligatorios de RN-NOT-03 no se apagan tampoco por push.
--   · RN-MOV-04: el push es una entrega más de la cola de §18, solo si hay
--     un teléfono vigente, una por notificación y canal, y el reclamo
--     devuelve el canal y los tokens del momento.
--   · RN-MOV-10: nunca se duplica una acción desde un teléfono que ha
--     estado horas sin conexión: la clave de idempotencia de `post_message`
--     y el estado de `submit_request`.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/app_movil_y_push.sql

insert into auth.users (id, email, role, aud) values
  ('e2000000-0000-0000-0000-000000000001', 'h22-owner@example.com', 'authenticated', 'authenticated'),
  ('e2000000-0000-0000-0000-000000000002', 'h22-admin@example.com', 'authenticated', 'authenticated'),
  ('e2000000-0000-0000-0000-000000000003', 'h22-ana@example.com', 'authenticated', 'authenticated'),
  ('e2000000-0000-0000-0000-000000000005', 'h22-client@example.com', 'authenticated', 'authenticated'),
  ('e2000000-0000-0000-0000-000000000099', 'h22-ajeno@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('e2100000-0000-0000-0000-000000000001', 'Espacio H22', 'espacio-h22-test', 'e2000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('e2100000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('e2100000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('e2100000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('e2300000-0000-0000-0000-000000000001', 'e2100000-0000-0000-0000-000000000001', 'Grupo H22');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('e2400000-0000-0000-0000-000000000001', 'e2100000-0000-0000-0000-000000000001', 'e2300000-0000-0000-0000-000000000001', 'EST-H22', 'Restaurante Veintidós');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('e2400000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000005', 'local_owner');

create temp table h22_ids (k text primary key, v uuid);
grant select, insert, update on h22_ids to authenticated, service_role;

-- ============================================================
-- RN-MOV-05 · registrar el teléfono: cada uno ve el suyo y nadie más
-- ============================================================
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_id uuid;
  v_again uuid;
begin
  v_id := public.register_push_device('ExponentPushToken[h22-ana-1]', 'ios', 'iPhone de Ana', '1.0.0');
  if v_id is null then
    raise exception 'RN-MOV-05 FALLIDO: registrar el teléfono no devuelve id' using errcode = 'assert_failure';
  end if;
  insert into h22_ids values ('ana-dev', v_id);

  if (select count(*) from public.push_devices) <> 1 then
    raise exception 'RN-MOV-05 FALLIDO: la trabajadora no ve su propio teléfono' using errcode = 'assert_failure';
  end if;
  if (select revoked_at from public.push_devices where id = v_id) is not null then
    raise exception 'RN-MOV-05 FALLIDO: un teléfono recién registrado nace dado de baja' using errcode = 'assert_failure';
  end if;

  -- El mismo teléfono de la misma persona: la misma fila, no otra.
  v_again := public.register_push_device('ExponentPushToken[h22-ana-1]', 'ios', 'iPhone de Ana', '1.0.1');
  if v_again <> v_id or (select count(*) from public.push_devices) <> 1 then
    raise exception 'RN-MOV-05 FALLIDO: registrar dos veces el mismo teléfono crea dos filas' using errcode = 'assert_failure';
  end if;
  if (select app_version from public.push_devices where id = v_id) <> '1.0.1' then
    raise exception 'RN-MOV-05 FALLIDO: volver a registrar no refresca la versión de la app' using errcode = 'assert_failure';
  end if;

  -- Auditoría sin espacio, que ve el interesado (RN-MOV-05).
  if not exists (
    select 1 from public.audit_log
    where action = 'push_device.registered' and entity_type = 'push_device' and entity_id = v_id
      and space_id is null and actor_id = auth.uid()
  ) then
    raise exception 'RN-MOV-05 FALLIDO: registrar el teléfono no deja apunte de auditoría visible al interesado' using errcode = 'assert_failure';
  end if;

  -- Una plataforma que no existe se rechaza (§145: iOS y Android).
  begin
    perform public.register_push_device('ExponentPushToken[h22-ana-web]', 'web', null, null);
    raise exception 'RN-MOV-05 FALLIDO: se registra un teléfono de plataforma desconocida' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-MOV%' then raise; end if;
  end;

  -- Sin política de escritura: por PostgREST no se toca la tabla.
  begin
    insert into public.push_devices (user_id, expo_push_token, platform)
    values (auth.uid(), 'ExponentPushToken[h22-directo]', 'ios');
    raise exception 'RN-MOV-05 FALLIDO: se inserta en push_devices sin pasar por la función' using errcode = 'assert_failure';
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
  end;
  begin
    update public.push_devices set revoked_at = now() where id = v_id;
    if (select revoked_at from public.push_devices where id = v_id) is not null then
      raise exception 'RN-MOV-05 FALLIDO: se actualiza push_devices sin pasar por la función' using errcode = 'assert_failure';
    end if;
  exception
    when insufficient_privilege then null;
    when sqlstate '42501' then null;
  end;
end $$;
reset role;

-- La administradora no ve el teléfono de Ana, ni su apunte de auditoría.
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.push_devices) <> 0 then
    raise exception 'RN-MOV-05 FALLIDO: una administradora ve el teléfono de otra persona' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.audit_log where action like 'push_device.%') then
    raise exception 'RN-MOV-05 FALLIDO: una administradora ve la auditoría del teléfono de otra persona' using errcode = 'assert_failure';
  end if;
  -- Y no puede dar de baja lo que no es suyo: false, sin decir si existe.
  if public.unregister_push_device('ExponentPushToken[h22-ana-1]') then
    raise exception 'RN-MOV-05 FALLIDO: una persona da de baja el teléfono de otra' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Sin sesión no hay teléfono: las dos están cerradas a `anon`, y la de
-- cierre por el proveedor, a todo el que tenga sesión.
do $$
begin
  if has_function_privilege('anon', 'public.register_push_device(text, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.unregister_push_device(text)', 'execute') then
    raise exception 'RN-MOV-05 FALLIDO: registrar o dar de baja un teléfono está abierto a anon' using errcode = 'assert_failure';
  end if;
  if has_function_privilege('authenticated', 'public.revoke_push_token(text, text)', 'execute')
     or has_function_privilege('anon', 'public.revoke_push_token(text, text)', 'execute') then
    raise exception 'RN-MOV-05 FALLIDO: revoke_push_token está abierta por RPC a quien tiene sesión' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'push_devices' and c.relrowsecurity
  ) then
    raise exception 'RN-MOV-05 FALLIDO: push_devices sin RLS' using errcode = 'assert_failure';
  end if;
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'push_devices' and p.polcmd <> 'r'
  ) then
    raise exception 'RN-MOV-05 FALLIDO: push_devices tiene una política de escritura' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MOV-05 · el token pasa a quien entra en el mismo teléfono
-- ============================================================
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid;
begin
  v_id := public.register_push_device('ExponentPushToken[h22-ana-1]', 'ios', 'iPhone compartido', '1.0.1');
  if v_id <> (select v from h22_ids where k = 'ana-dev') then
    raise exception 'RN-MOV-05 FALLIDO: el mismo token en otra persona crea una fila nueva en vez de pasar la existente' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.push_devices where user_id = auth.uid() and revoked_at is null) <> 1 then
    raise exception 'RN-MOV-05 FALLIDO: la administradora no ve el teléfono que acaba de pasar a ser suyo' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where action = 'push_device.registered' and entity_id = v_id and actor_id = auth.uid()
  ) then
    raise exception 'RN-MOV-05 FALLIDO: el cambio de dueño del teléfono no deja apunte para quien entra' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Ana ya no lo tiene: no lo ve, y en su auditoría queda la baja con motivo.
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.push_devices) <> 0 then
    raise exception 'RN-MOV-05 FALLIDO: la trabajadora sigue viendo un teléfono que pasó a otra persona' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where action = 'push_device.revoked' and entity_id = (select v from h22_ids where k = 'ana-dev')
      and actor_id = auth.uid() and reason = 'replaced'
  ) then
    raise exception 'RN-MOV-05 FALLIDO: quien pierde el teléfono no tiene apunte de baja con motivo "replaced"' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-MOV-05 · dar de baja al cerrar sesión, y volver
-- ============================================================
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare
  v_id uuid := (select v from h22_ids where k = 'ana-dev');
begin
  if not public.unregister_push_device('ExponentPushToken[h22-ana-1]') then
    raise exception 'RN-MOV-05 FALLIDO: dar de baja el propio teléfono devuelve false' using errcode = 'assert_failure';
  end if;
  if (select revoked_reason from public.push_devices where id = v_id) is distinct from 'signed_out'
     or (select revoked_at from public.push_devices where id = v_id) is null then
    raise exception 'RN-MOV-05 FALLIDO: cerrar sesión no deja el teléfono dado de baja con motivo signed_out' using errcode = 'assert_failure';
  end if;
  -- CA-17: la segunda baja no hace nada, y lo dice.
  if public.unregister_push_device('ExponentPushToken[h22-ana-1]') then
    raise exception 'RN-MOV-05 FALLIDO: dar de baja dos veces devuelve true la segunda' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where action = 'push_device.revoked' and entity_id = v_id and actor_id = auth.uid() and reason = 'signed_out'
  ) then
    raise exception 'RN-MOV-05 FALLIDO: la baja al cerrar sesión no deja apunte' using errcode = 'assert_failure';
  end if;
  -- Nunca se borra (CLAUDE.md): la fila sigue, cerrada.
  if (select count(*) from public.push_devices where id = v_id) <> 1 then
    raise exception 'RN-MOV-05 FALLIDO: dar de baja borra la fila' using errcode = 'assert_failure';
  end if;

  -- Vuelve a entrar en el mismo teléfono: la misma fila, vigente otra vez.
  if public.register_push_device('ExponentPushToken[h22-ana-1]', 'ios', 'iPhone compartido', '1.0.2') <> v_id then
    raise exception 'RN-MOV-05 FALLIDO: volver a entrar crea otra fila para el mismo teléfono' using errcode = 'assert_failure';
  end if;
  if (select revoked_at from public.push_devices where id = v_id) is not null then
    raise exception 'RN-MOV-05 FALLIDO: volver a entrar no deja el teléfono vigente' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-MOV-05 · el proveedor dice que el token no existe: lo cierra la cola
-- ============================================================
do $$
declare
  v_id uuid := (select v from h22_ids where k = 'ana-dev');
begin
  -- Motivo desconocido: se rechaza.
  begin
    perform public.revoke_push_token('ExponentPushToken[h22-ana-1]', 'lost');
    raise exception 'RN-MOV-05 FALLIDO: revoke_push_token admite un motivo que no existe' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-MOV%' then raise; end if;
  end;

  if not public.revoke_push_token('ExponentPushToken[h22-ana-1]', 'provider_rejected') then
    raise exception 'RN-MOV-05 FALLIDO: la cola no cierra un token vigente' using errcode = 'assert_failure';
  end if;
  if (select revoked_reason from public.push_devices where id = v_id) is distinct from 'provider_rejected' then
    raise exception 'RN-MOV-05 FALLIDO: el cierre por el proveedor no queda con su motivo' using errcode = 'assert_failure';
  end if;
  -- El apunte va a nombre de quien tenía el teléfono, no del proceso.
  if not exists (
    select 1 from public.audit_log
    where action = 'push_device.revoked' and entity_id = v_id
      and actor_id = 'e2000000-0000-0000-0000-000000000002' and reason = 'provider_rejected'
  ) then
    raise exception 'RN-MOV-05 FALLIDO: el cierre por el proveedor no deja apunte a nombre del dueño' using errcode = 'assert_failure';
  end if;
  -- CA-17.
  if public.revoke_push_token('ExponentPushToken[h22-ana-1]', 'provider_rejected') then
    raise exception 'RN-MOV-05 FALLIDO: cerrar dos veces devuelve true la segunda' using errcode = 'assert_failure';
  end if;
  if public.revoke_push_token('ExponentPushToken[h22-no-existe]', 'provider_rejected') then
    raise exception 'RN-MOV-05 FALLIDO: cerrar un token inexistente devuelve true' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MOV-06 · la preferencia de push por evento
-- ============================================================
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare
  v_space uuid := 'e2100000-0000-0000-0000-000000000001';
begin
  -- Activada por omisión (RN-NOT-02): la fila nace con push = true.
  perform public.set_notification_preference(v_space, 'job_assigned', true, false);
  if (select push from public.notification_preferences
      where space_id = v_space and profile_id = auth.uid() and event_type = 'job_assigned') is not true then
    raise exception 'RN-MOV-06 FALLIDO: la preferencia de push no nace activada' using errcode = 'assert_failure';
  end if;

  -- Apagarla apaga solo el push.
  perform public.set_notification_preference(v_space, 'job_assigned', true, false, false);
  if (select push from public.notification_preferences
      where space_id = v_space and profile_id = auth.uid() and event_type = 'job_assigned') is not false then
    raise exception 'RN-MOV-06 FALLIDO: apagar el push no lo apaga' using errcode = 'assert_failure';
  end if;
  if (select in_app from public.notification_preferences
      where space_id = v_space and profile_id = auth.uid() and event_type = 'job_assigned') is not true then
    raise exception 'RN-MOV-06 FALLIDO: apagar el push toca el aviso dentro de Cuotly' using errcode = 'assert_failure';
  end if;

  -- La web de escritorio guarda los dos canales de siempre (cuatro
  -- argumentos) y deja el del teléfono como estuviera.
  perform public.set_notification_preference(v_space, 'job_assigned', true, true);
  if (select push from public.notification_preferences
      where space_id = v_space and profile_id = auth.uid() and event_type = 'job_assigned') is not false then
    raise exception 'RN-MOV-06 FALLIDO: guardar desde la web sin el push lo vuelve a encender' using errcode = 'assert_failure';
  end if;
  if (select email from public.notification_preferences
      where space_id = v_space and profile_id = auth.uid() and event_type = 'job_assigned') is not true then
    raise exception 'RN-MOV-06 FALLIDO: guardar desde la web no actualiza el correo' using errcode = 'assert_failure';
  end if;

  -- RN-NOT-03 · un aviso obligatorio no se apaga tampoco por push.
  begin
    perform public.set_notification_preference(v_space, 't3_threshold_100', true, true, false);
    raise exception 'RN-MOV-06 FALLIDO: un aviso obligatorio se apaga por push' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-MOV%' then raise; end if;
  end;
  -- Con el push explícitamente encendido, el obligatorio se guarda.
  perform public.set_notification_preference(v_space, 't3_threshold_100', true, true, true);
end $$;
reset role;

-- Sin pertenecer al espacio, nada (como siempre).
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000099', false);
set role authenticated;
do $$
begin
  begin
    perform public.set_notification_preference('e2100000-0000-0000-0000-000000000001', 'job_assigned', true, true, false);
    raise exception 'RN-MOV-06 FALLIDO: alguien ajeno guarda una preferencia en un espacio que no es suyo' using errcode = 'assert_failure';
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'RN-MOV%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-MOV-04 · el push es una entrega más de la cola de §18
-- ============================================================
-- Ana tiene el push de job_assigned apagado y ningún teléfono vigente.
do $$
declare
  v_space uuid := 'e2100000-0000-0000-0000-000000000001';
  v_ana uuid := 'e2000000-0000-0000-0000-000000000003';
  v_n uuid;
begin
  -- Sin teléfono vigente: correo sí, push no (una entrega push sin
  -- destino moriría en la cola tras cinco reintentos).
  v_n := public.emit_notification(v_space, v_ana, 'job_published', 'staff', 'job', gen_random_uuid(),
                                  '/espacios/espacio-h22-test/trabajos', 'h22:sin-telefono');
  if v_n is null then
    raise exception 'RN-MOV-04 FALLIDO: la notificación de prueba no se creó' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.notification_deliveries where notification_id = v_n and channel = 'email') <> 1 then
    raise exception 'RN-MOV-04 FALLIDO: sin teléfono, el correo deja de encolarse' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notification_deliveries where notification_id = v_n and channel = 'push') then
    raise exception 'RN-MOV-04 FALLIDO: se encola un push para quien no tiene ningún teléfono vigente' using errcode = 'assert_failure';
  end if;
  insert into h22_ids values ('n-sin-telefono', v_n);
end $$;

-- Ana registra un teléfono nuevo.
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000003', false);
set role authenticated;
select public.register_push_device('ExponentPushToken[h22-ana-2]', 'android', 'Pixel de Ana', '1.0.2');
reset role;

do $$
declare
  v_space uuid := 'e2100000-0000-0000-0000-000000000001';
  v_ana uuid := 'e2000000-0000-0000-0000-000000000003';
  v_n uuid;
  v_dup uuid;
begin
  -- Con teléfono: una entrega por canal, y solo una.
  v_n := public.emit_notification(v_space, v_ana, 'job_published', 'staff', 'job', gen_random_uuid(),
                                  '/espacios/espacio-h22-test/trabajos', 'h22:con-telefono');
  if (select count(*) from public.notification_deliveries where notification_id = v_n and channel = 'push') <> 1
     or (select count(*) from public.notification_deliveries where notification_id = v_n and channel = 'email') <> 1 then
    raise exception 'RN-MOV-04 FALLIDO: con teléfono no hay exactamente una entrega de correo y una de push' using errcode = 'assert_failure';
  end if;
  insert into h22_ids values ('n-push', v_n);

  -- RN-NOT-05 · la misma clave de deduplicación no crea nada más.
  v_dup := public.emit_notification(v_space, v_ana, 'job_published', 'staff', 'job', gen_random_uuid(),
                                    '/espacios/espacio-h22-test/trabajos', 'h22:con-telefono');
  if v_dup is not null
     or (select count(*) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
         where n.dedupe_key = 'h22:con-telefono') <> 2 then
    raise exception 'RN-MOV-04 FALLIDO: la misma clave de deduplicación encola más entregas' using errcode = 'assert_failure';
  end if;

  -- RN-MOV-06 · la preferencia manda: job_assigned tiene el push apagado.
  v_n := public.emit_notification(v_space, v_ana, 'job_assigned', 'staff', 'job', gen_random_uuid(),
                                  '/espacios/espacio-h22-test/trabajos', 'h22:push-apagado');
  if exists (select 1 from public.notification_deliveries where notification_id = v_n and channel = 'push') then
    raise exception 'RN-MOV-06 FALLIDO: se encola un push con la preferencia apagada' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.notification_deliveries where notification_id = v_n and channel = 'email') then
    raise exception 'RN-MOV-06 FALLIDO: la preferencia de push apaga también el correo' using errcode = 'assert_failure';
  end if;

  -- RN-NOT-03 · un obligatorio va por push aunque la preferencia diga
  -- que no (aquí se fuerza la fila a false por debajo, que es lo único que
  -- la función no deja hacer).
  update public.notification_preferences set push = false
  where space_id = v_space and profile_id = v_ana and event_type = 't3_threshold_100';
  v_n := public.emit_notification(v_space, v_ana, 't3_threshold_100', 'staff', 'job', gen_random_uuid(),
                                  '/espacios/espacio-h22-test/trabajos', 'h22:obligatorio', null, 100);
  if not exists (select 1 from public.notification_deliveries where notification_id = v_n and channel = 'push') then
    raise exception 'RN-MOV-06 FALLIDO: un aviso obligatorio no sale por push' using errcode = 'assert_failure';
  end if;

  -- §18 · "visible dentro de Cuotly, sin correo ni push": lo uno y lo
  -- otro van juntos.
  v_n := public.emit_notification(v_space, v_ana, 'job_published', 'staff', 'job', gen_random_uuid(),
                                  '/espacios/espacio-h22-test/trabajos', 'h22:solo-dentro', null, null, null, false);
  if exists (select 1 from public.notification_deliveries where notification_id = v_n) then
    raise exception 'RN-MOV-04 FALLIDO: un aviso "solo dentro de Cuotly" encola correo o push' using errcode = 'assert_failure';
  end if;
end $$;

-- El reclamo de la cola devuelve el canal y los tokens del momento.
do $$
declare
  v_push record;
  v_mail record;
  v_ana uuid := 'e2000000-0000-0000-0000-000000000003';
begin
  -- Con un límite alto: en CI las suites anteriores dejan entregas pendientes
  -- más antiguas que las de aquí, y el reclamo va por vencimiento.
  create temp table h22_claimed as select * from public.claim_notification_deliveries(10000);

  select * into v_push from h22_claimed where notification_id = (select v from h22_ids where k = 'n-push') and channel = 'push';
  if v_push.delivery_id is null then
    raise exception 'RN-MOV-04 FALLIDO: el reclamo no devuelve la entrega push' using errcode = 'assert_failure';
  end if;
  if v_push.push_tokens is null or v_push.push_tokens <> array['ExponentPushToken[h22-ana-2]'] then
    raise exception 'RN-MOV-04 FALLIDO: el reclamo no devuelve solo los tokens vigentes del destinatario (devuelve %)', v_push.push_tokens using errcode = 'assert_failure';
  end if;
  if v_push.recipient_email <> 'h22-ana@example.com' or v_push.event_type <> 'job_published' or v_push.space_name <> 'Espacio H22' then
    raise exception 'RN-MOV-04 FALLIDO: el reclamo de un push pierde el resto de columnas' using errcode = 'assert_failure';
  end if;

  select * into v_mail from h22_claimed where notification_id = (select v from h22_ids where k = 'n-push') and channel = 'email';
  if v_mail.delivery_id is null or v_mail.push_tokens is not null then
    raise exception 'RN-MOV-04 FALLIDO: la entrega de correo lleva tokens, o no se reclama' using errcode = 'assert_failure';
  end if;

  -- Reclamar cuenta el intento en las dos, como siempre (RN-NOT-05).
  if (select attempts from public.notification_deliveries where id = v_push.delivery_id) <> 1 then
    raise exception 'RN-MOV-04 FALLIDO: reclamar un push no cuenta el intento' using errcode = 'assert_failure';
  end if;

  -- Un teléfono dado de baja entre el encolado y el envío ya no aparece.
  perform public.revoke_push_token('ExponentPushToken[h22-ana-2]', 'provider_rejected');
  perform public.mark_delivery_failed(v_push.delivery_id, 'reintento de prueba', now() - interval '1 minute', false);
  if (select push_tokens from public.claim_notification_deliveries(10000) where delivery_id = v_push.delivery_id) <> '{}'::text[] then
    raise exception 'RN-MOV-05 FALLIDO: el reclamo devuelve un token ya dado de baja' using errcode = 'assert_failure';
  end if;
  drop table h22_claimed;
end $$;

-- ============================================================
-- RN-MOV-04 · por un flujo real: la ausencia avisa por push a quien tiene teléfono
-- ============================================================
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.register_push_device('ExponentPushToken[h22-owner]', 'ios', 'iPhone del propietario', '1.0.2');
reset role;

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  insert into h22_ids values ('ausencia', public.request_absence('e2100000-0000-0000-0000-000000000001', current_date + 10, current_date + 12, 'Viaje'));
end $$;
reset role;

do $$
declare
  v_abs uuid := (select v from h22_ids where k = 'ausencia');
  v_owner uuid := 'e2000000-0000-0000-0000-000000000001';
  v_admin uuid := 'e2000000-0000-0000-0000-000000000002';
begin
  if (select count(*) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
      where n.entity_id = v_abs and n.recipient_id = v_owner and d.channel = 'push') <> 1 then
    raise exception 'RN-MOV-04 FALLIDO: la ausencia no encola un push al propietario que tiene teléfono' using errcode = 'assert_failure';
  end if;
  -- La administradora tiene su teléfono cerrado por el proveedor: correo sí, push no.
  if exists (select 1 from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
             where n.entity_id = v_abs and n.recipient_id = v_admin and d.channel = 'push') then
    raise exception 'RN-MOV-04 FALLIDO: se encola un push a quien tiene el teléfono cerrado' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
      where n.entity_id = v_abs and n.recipient_id = v_admin and d.channel = 'email') <> 1 then
    raise exception 'RN-MOV-04 FALLIDO: el correo de la ausencia deja de encolarse' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-MOV-10 · un teléfono que estuvo horas sin conexión no duplica nada
-- ============================================================
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare
  v_req uuid;
  v_conv uuid;
  v_m1 uuid;
  v_m2 uuid;
begin
  -- El borrador nace en el servidor y su id se guarda antes de enviar:
  -- el reintento envía el MISMO borrador.
  v_req := public.create_request_draft('e2400000-0000-0000-0000-000000000001', 'Cambiar la carta de otoño', 'Desde el teléfono');
  perform public.submit_request(v_req);
  -- El reintento tras el corte: el estado lo para (`submit_request` es
  -- idempotente: "ya se envió" no es un error), y sigue habiendo UNA.
  perform public.submit_request(v_req);
  if (select count(*) from public.requests where establishment_id = 'e2400000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'RN-MOV-10 FALLIDO: el reintento creó una segunda solicitud' using errcode = 'assert_failure';
  end if;
  if (select state from public.requests where id = v_req) = 'draft' then
    raise exception 'RN-MOV-10 FALLIDO: la solicitud sigue en borrador tras enviarla' using errcode = 'assert_failure';
  end if;
  insert into h22_ids values ('solicitud', v_req);

  -- El mensaje lleva la clave desde que nace el borrador: dos envíos, uno.
  v_conv := public.get_or_create_request_conversation(v_req);
  v_m1 := public.post_message(v_conv, 'Escrito sin cobertura', 'h22-borrador-1');
  v_m2 := public.post_message(v_conv, 'Escrito sin cobertura', 'h22-borrador-1');
  if v_m1 <> v_m2 or (select count(*) from public.messages where conversation_id = v_conv) <> 1 then
    raise exception 'RN-MOV-10 FALLIDO: el mismo borrador enviado dos veces produce dos mensajes' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- El reintento tampoco dejó un segundo apunte de envío (la auditoría del
-- espacio no la lee el restaurante: se mira desde fuera).
do $$
begin
  if (select count(*) from public.audit_log
      where action = 'request.submitted' and entity_id = (select v from h22_ids where k = 'solicitud')) <> 1 then
    raise exception 'RN-MOV-10 FALLIDO: el reintento dejó un segundo apunte de envío' using errcode = 'assert_failure';
  end if;
end $$;

select 'app_movil_y_push.sql: RN-MOV-04, 05, 06 y 10 cumplidos' as resultado;
