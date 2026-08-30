-- Verificación de HU-10 a HU-15 del Hito 4 (Solicitudes y clasificación),
-- más el criterio explícito del ROADMAP "la IA caída no bloquea el
-- flujo" (a nivel de base de datos: aquí se comprueba con el motor de
-- reglas — la resiliencia de la propia llamada de red está probada en
-- apps/web/src/services/ai-classifier.test.ts, que es donde vive esa
-- lógica). Mismo patrón que supabase/tests/hito2_permisos.sql: bloques
-- `do $$ ... end $$` que lanzan una excepción real si algo no es lo
-- esperado, para que el script entero falle con código de salida
-- distinto de cero en CI (job "rls-tests", ver .github/workflows/ci.yml).
--
-- A diferencia de hito2_permisos.sql, aquí se cambia de identidad con
-- `set role authenticated` (sin LOCAL) seguido de `reset role`: fuera de
-- un bloque de transacción explícito, `set local role` no tiene ningún
-- efecto (PostgreSQL lo advierte y lo ignora) — con `psql -f` cada
-- sentencia de nivel superior es su propia transacción implícita, así
-- que un `set local role` en una sentencia no sobrevive a la siguiente.
-- `set role` (sin LOCAL) sí persiste para el resto de la sesión hasta el
-- siguiente `reset role`, y es lo único que de verdad activa RLS aquí
-- (quien ejecuta este archivo con `psql` normalmente lo hace como
-- superusuario, que sin este cambio de rol saltaría RLS por completo y
-- las comprobaciones de acceso denegado pasarían por casualidad, no por
-- estar bien implementadas).
--
-- Además, algunos bloques usan `set role service_role;` — record_classification()
-- solo la puede ejecutar ese rol desde la auditoría posterior al Hito 4
-- (supabase/migrations/20260830000018_hito4_audit_fixes.sql, hallazgo 1):
-- el código de servidor de confianza que ya invocó de verdad a Anthropic,
-- nunca el cliente por RPC directa.
--
-- Cómo ejecutarlo: igual que hito2_permisos.sql — automáticamente en CI,
-- o a mano con
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/hito4_solicitudes.sql

-- ============================================================
-- Preparación: un espacio ("Espacio H4") con propietario, administrador y
-- trabajador; dos grupos de cliente con dos establecimientos cada uno
-- (para HU-15: copiar dentro del mismo grupo debe funcionar, entre
-- grupos distintos debe fallar). Un Editor y un Consulta en el primer
-- establecimiento, para probar los límites de can_write_establishment.
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('f0000000-0000-0000-0000-000000000001', 'h4-owner@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000002', 'h4-admin@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000003', 'h4-worker@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000004', 'h4-local-owner@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000005', 'h4-editor@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000006', 'h4-consulta@example.com', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-000000000007', 'h4-other-group-owner@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, created_by) values
  ('f1000000-0000-0000-0000-000000000001', 'Espacio H4', 'espacio-h4-test', 'f0000000-0000-0000-0000-000000000001'),
  -- Solo para el hallazgo 3 (space_id ajeno en request_attachments): un
  -- segundo espacio real al que referenciar, para distinguir un rechazo
  -- por RLS de un simple error de clave foránea inexistente.
  ('f1000000-0000-0000-0000-000000000002', 'Espacio H4 (solo FK, sin miembros)', 'espacio-h4-ajeno-test', 'f0000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'worker', 'active');

insert into public.groups (id, space_id, name) values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Grupo H4'),
  ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'Grupo H4 (otro)');

insert into public.establishments (id, space_id, group_id, code, name) values
  ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'EST-H4-A', 'Restaurante H4 A'),
  ('f3000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'EST-H4-B', 'Restaurante H4 B (mismo grupo)'),
  ('f3000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002', 'EST-H4-C', 'Restaurante H4 C (otro grupo)');

insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('f4000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004', 'local_owner'),
  ('f4000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', 'editor'),
  ('f4000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006', 'consulta');

-- El Propietario local también es dueño de EST-H4-B (mismo grupo), para
-- poder pegar ahí en HU-15 sin depender de group_memberships.
insert into public.establishment_memberships (id, establishment_id, user_id, role) values
  ('f4000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 'local_owner');

insert into public.group_memberships (group_id, user_id) values
  ('f2000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000007');

-- ============================================================
-- HU-10 · "Como restaurante, quiero crear una solicitud con descripción y
-- archivos, guardarla como borrador y enviarla."
-- ============================================================
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_request_id uuid;
  v_code text;
  v_state text;
begin
  v_request_id := public.create_request_draft(
    'f3000000-0000-0000-0000-000000000001',
    'Cambiar el precio de la ensalada César a 9,50 euros.',
    'Es el plato 4 de la carta de entrantes.'
  );

  select code, state into v_code, v_state from public.requests where id = v_request_id;

  if v_code !~ '^SOL-\d{4}$' then
    raise exception 'HU-10 FALLIDO: código inesperado "%"', v_code;
  end if;
  if v_state <> 'draft' then
    raise exception 'HU-10 FALLIDO: el borrador debería nacer en draft, está en %', v_state;
  end if;
  if (select count(*) from public.request_versions where request_id = v_request_id) <> 1 then
    raise exception 'HU-10 FALLIDO: debería existir la versión 1 del borrador';
  end if;

  -- Guarda el id para los siguientes bloques del script (vía tabla temporal:
  -- un bloque DO no puede devolver un valor al script, así que se persiste aquí).
  create temporary table h4_ctx (key text primary key, value text);
  -- El resto del script lee esta tabla temporal también con `set role
  -- service_role` (para llamar a record_classification, hallazgo 1) —
  -- sin este grant, esa lectura fallaría por permisos, no por la propia
  -- comprobación que el bloque quiere hacer.
  grant select, insert on h4_ctx to authenticated, service_role;
  insert into h4_ctx values ('request_a1', v_request_id::text);
end $$;

-- HU-10 (archivos): un adjunto válido se acepta mientras el borrador sigue
-- en draft; RN-ARC-06 (25 MB, tipos permitidos) se hace cumplir con CHECK.
do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
begin
  insert into public.request_attachments (request_id, space_id, establishment_id, storage_path, file_name, mime_type, size_bytes, created_by)
  values (v_request_id, 'f1000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'requests/a1/foto.jpg', 'foto.jpg', 'image/jpeg', 1024, auth.uid());

  begin
    insert into public.request_attachments (request_id, space_id, establishment_id, storage_path, file_name, mime_type, size_bytes, created_by)
    values (v_request_id, 'f1000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'requests/a1/video.mp4', 'video.mp4', 'video/mp4', 1024, auth.uid());
    raise exception 'RN-ARC-06 FALLIDO: se aceptó un tipo de archivo prohibido (vídeo)';
  exception
    when check_violation then null; -- esperado
  end;

  begin
    insert into public.request_attachments (request_id, space_id, establishment_id, storage_path, file_name, mime_type, size_bytes, created_by)
    values (v_request_id, 'f1000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'requests/a1/grande.pdf', 'grande.pdf', 'application/pdf', 30 * 1024 * 1024, auth.uid());
    raise exception 'RN-ARC-06 FALLIDO: se aceptó un archivo de más de 25 MB';
  exception
    when check_violation then null; -- esperado
  end;

  -- Hallazgo 3 de la auditoría (corregido en 20260830000018): space_id
  -- no se comprobaba contra el espacio real de la solicitud. Un
  -- establishment_id válido con un space_id de otro espacio real debe
  -- rechazarse por RLS, no colarse.
  begin
    insert into public.request_attachments (request_id, space_id, establishment_id, storage_path, file_name, mime_type, size_bytes, created_by)
    values (v_request_id, 'f1000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000001', 'requests/a1/ajeno.jpg', 'ajeno.jpg', 'image/jpeg', 1024, auth.uid());
    raise exception 'Hallazgo 3 FALLIDO: se aceptó un adjunto con space_id distinto al real de la solicitud';
  exception
    when insufficient_privilege then null; -- esperado: la política de INSERT lo rechaza (WITH CHECK)
  end;
end $$;

-- Consulta no puede crear un borrador (RN-EST §4.3: "Consulta: solo lectura").
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000006', false);

do $$
begin
  begin
    perform public.create_request_draft('f3000000-0000-0000-0000-000000000001', 'Intento no autorizado', null);
    raise exception 'CA-01 FALLIDO: Consulta pudo crear una solicitud (RN-EST §4.3)';
  exception
    when raise_exception then null; -- esperado: can_write_establishment() lo rechaza
  end;
end $$;

-- Enviar: solo quien puede escribir el establecimiento, y arranca T1
-- (RN-SLA-01).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_state text;
begin
  perform public.submit_request(v_request_id);
  -- Pulsar enviar dos veces no duplica el efecto (RN-DAT-09).
  perform public.submit_request(v_request_id);

  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'received' then
    raise exception 'HU-10 FALLIDO: tras enviar, el estado debería ser received, es %', v_state;
  end if;
end $$;

-- `timer_events` solo lo lee el equipo (RN-SLA, tabla interna sin
-- política de SELECT para el cliente) — se comprueba con la identidad
-- del propietario, sin salir del rol `authenticated` (RLS sigue activo).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_t1_events int;
begin
  select count(*) into v_t1_events from public.timer_events
  where entity_id = v_request_id and counter_kind = 't1' and event_type = 'started';
  if v_t1_events <> 1 then
    raise exception 'RN-DAT-09/CA-17 FALLIDO: enviar dos veces generó % eventos de arranque de T1 (esperado 1)', v_t1_events;
  end if;
end $$;

-- Vuelve a la identidad del cliente para el paso automático de análisis
-- (RN-CLS-01, disparado por el mismo servidor que atendió el envío).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_state text;
begin
  perform public.begin_request_analysis(v_request_id);
  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'analyzing' then
    raise exception 'RN-CLS-01 FALLIDO: tras el paso automático debería estar analyzing, está %', v_state;
  end if;
end $$;

-- ============================================================
-- "La IA caída no bloquea el flujo" (ROADMAP, Hito 4): el análisis se
-- registra igual con una propuesta del motor de reglas, con su
-- fallback_reason, y la solicitud sigue avanzando con normalidad.
--
-- Hallazgo 1 de la auditoría (corregido en 20260830000018):
-- record_classification() ya no la puede llamar el cliente directamente
-- — solo service_role, con el actor recibido explícito en p_actor_id
-- (auth.uid() no resuelve nada bajo ese rol). Se comprueba primero que el
-- propio cliente NO puede llamarla (ni siquiera para registrar una
-- propuesta "por reglas" legítima), y luego se llama de verdad con la
-- identidad de servidor.
-- ============================================================
do $$
begin
  begin
    perform public.record_classification(
      (select value::uuid from h4_ctx where key = 'request_a1'),
      'f0000000-0000-0000-0000-000000000004'::uuid, 'ai', 'large',
      'Propuesta falsa inventada por el propio cliente, sin pasar por Anthropic',
      null, 'claude-opus-5', 999999999, 999999999, 999999999, null
    );
    raise exception 'Hallazgo 1 FALLIDO: el cliente pudo llamar a record_classification() directamente';
  exception
    when insufficient_privilege then null; -- esperado: revoke/grant restringe la función a service_role
  end;
end $$;

set role service_role;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_actor_id uuid := 'f0000000-0000-0000-0000-000000000004'::uuid;
  v_state text;
  v_classification_id uuid;
begin
  v_classification_id := public.record_classification(
    v_request_id, v_actor_id, 'rules', 'small',
    'Propuesta automática por reglas (categoría "small"), pendiente de validación.',
    array['precio'], null, null, null, null, 'anthropic_unavailable'
  );
  insert into h4_ctx values ('classification_a1', v_classification_id::text);

  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'pending_internal_validation' then
    raise exception 'RN-CLS-02 FALLIDO: la caída de la IA bloqueó el flujo, estado = %', v_state;
  end if;

  -- Idempotente: registrar el análisis dos veces no duplica la fila.
  perform public.record_classification(v_request_id, v_actor_id, 'rules', 'small', 'segundo intento', null, null, null, null, null, null);
end $$;

set role authenticated;

-- `classifications`/`ai_usage` tampoco los lee el cliente (RN-CLS-03) —
-- se verifica su contenido con la identidad del propietario.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_classification_id uuid := (select value::uuid from h4_ctx where key = 'classification_a1');
  v_fallback_reason text;
  v_count int;
begin
  select fallback_reason into v_fallback_reason from public.classifications where id = v_classification_id;
  if v_fallback_reason <> 'anthropic_unavailable' then
    raise exception 'RN-CLS-02 FALLIDO: no se registró el motivo de la caída de la IA';
  end if;

  if exists (select 1 from public.ai_usage where classification_id = v_classification_id) then
    raise exception 'RN-CLS-05 FALLIDO: una clasificación por reglas no debería generar apunte de ai_usage';
  end if;

  select count(*) into v_count from public.classifications where request_id = v_request_id;
  if v_count <> 1 then
    raise exception 'RN-DAT-09 FALLIDO: record_classification duplicó la fila al llamarse dos veces (filas = %)', v_count;
  end if;
end $$;

reset role;

-- ============================================================
-- HU-11 · "Como administrador, quiero ver la clasificación propuesta con
-- su evidencia y validarla o corregirla antes de que la vea el cliente."
-- ============================================================

-- El cliente NUNCA lee `classifications` (RN-CLS-03: validación humana
-- obligatoria antes de mostrar nada al cliente) — comprobado antes de que
-- el administrador valide nada, con la propuesta todavía sin validar.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_count int;
begin
  select count(*) into v_count from public.classifications where request_id = v_request_id;
  if v_count <> 0 then
    raise exception 'RN-CLS-03 FALLIDO: el cliente ve % fila(s) de classifications (esperado 0)', v_count;
  end if;
end $$;

reset role;

-- Un trabajador tampoco valida (RN-CLS-03: solo propietario o administrador).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
begin
  begin
    perform public.validate_classification(v_request_id, 'medium', 'Corrección de un trabajador');
    raise exception 'CA-01 FALLIDO: un Trabajador pudo validar una clasificación (RN-CLS-03)';
  exception
    when raise_exception then null; -- esperado
  end;
end $$;

reset role;

-- El administrador SÍ puede validar (y corregir la categoría propuesta).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_state text;
  v_validated_category text;
  v_decided_category text;
  v_t1_stop_events int;
begin
  perform public.validate_classification(v_request_id, 'medium', 'Corregido: es un cambio de sección de la carta, no solo de precio.');

  select state, validated_category into v_state, v_validated_category from public.requests where id = v_request_id;
  if v_state <> 'pending_client_acceptance' then
    raise exception 'HU-11 FALLIDO: tras validar, el estado debería ser pending_client_acceptance, es %', v_state;
  end if;
  if v_validated_category <> 'medium' then
    raise exception 'HU-11 FALLIDO: la corrección del administrador no se guardó (categoría = %)', v_validated_category;
  end if;

  select decided_category into v_decided_category from public.classifications where request_id = v_request_id;
  if v_decided_category <> 'medium' then
    raise exception 'RN-CLS-04 FALLIDO: no se guardó qué decidió la persona en classifications.decided_category';
  end if;

  select count(*) into v_t1_stop_events from public.timer_events
  where entity_id = v_request_id and counter_kind = 't1' and event_type = 'stopped';
  if v_t1_stop_events <> 1 then
    raise exception 'RN-SLA-03 FALLIDO: validar la clasificación debería detener T1 (eventos stopped = %)', v_t1_stop_events;
  end if;
end $$;

reset role;

-- ============================================================
-- HU-12 · "Como restaurante, quiero ver la propuesta final con categoría,
-- consumo y plazo aproximado, y aceptarla o rechazarla."
-- ============================================================

-- El Editor (no el Propietario local) también puede aceptar: es un rol
-- con acceso de escritura al establecimiento (RN-EST §4.3).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000005', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_state text;
begin
  -- El cliente ya puede leer la categoría y el resumen validados (a
  -- diferencia de classifications, requests.validated_* sí es visible).
  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'pending_client_acceptance' then
    raise exception 'HU-12 FALLIDO: precondición rota, estado = %', v_state;
  end if;

  perform public.accept_request(v_request_id);
  -- Pulsar aceptar dos veces no duplica el efecto (CA-17).
  perform public.accept_request(v_request_id);

  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'accepted' then
    raise exception 'HU-12 FALLIDO: tras aceptar, el estado debería ser accepted, es %', v_state;
  end if;
end $$;

reset role;

-- ============================================================
-- HU-12 (variante) · el restaurante puede rechazar la propuesta final, en
-- vez de aceptarla — sobre una segunda solicitud, para no interferir con
-- la ya aceptada arriba.
-- ============================================================
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_request_id uuid;
begin
  v_request_id := public.create_request_draft('f3000000-0000-0000-0000-000000000001', 'Sustituir la fotografía de portada.', null);
  insert into h4_ctx values ('request_a2', v_request_id::text);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);
end $$;

-- record_classification() es solo de service_role (hallazgo 1).
set role service_role;

do $$
begin
  perform public.record_classification(
    (select value::uuid from h4_ctx where key = 'request_a2'),
    'f0000000-0000-0000-0000-000000000004'::uuid, 'rules', 'photo', 'Propuesta automática.',
    array['fotografia'], null, null, null, null, null
  );
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a2');
begin
  perform public.validate_classification(v_request_id, 'photo', 'Sustitución de fotografía de portada.');
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a2');
  v_state text;
  v_reason text;
begin
  perform public.decline_request(v_request_id, 'Al final no hace falta, gracias.');

  select state, rejected_reason into v_state, v_reason from public.requests where id = v_request_id;
  if v_state <> 'rejected' then
    raise exception 'HU-12 FALLIDO: tras rechazar, el estado debería ser rejected, es %', v_state;
  end if;
  if v_reason is null then
    raise exception 'HU-12 FALLIDO: no se guardó el motivo del rechazo del cliente';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-13 · "Como administrador, quiero pedir información adicional y que
-- el contador se detenga mientras espero al cliente." — sobre una
-- tercera solicitud.
-- ============================================================
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_request_id uuid;
begin
  v_request_id := public.create_request_draft('f3000000-0000-0000-0000-000000000001', 'Cambiar el horario de un día concreto.', null);
  insert into h4_ctx values ('request_a3', v_request_id::text);
  perform public.submit_request(v_request_id);
  perform public.begin_request_analysis(v_request_id);
end $$;

-- record_classification() es solo de service_role (hallazgo 1).
set role service_role;

do $$
begin
  perform public.record_classification(
    (select value::uuid from h4_ctx where key = 'request_a3'),
    'f0000000-0000-0000-0000-000000000004'::uuid, 'rules', 'small', 'Propuesta automática.',
    array['un dia de horario'], null, null, null, null, null
  );
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a3');
  v_state text;
  v_pause_events int;
begin
  perform public.request_more_information(v_request_id, '¿Qué día de la semana es el que cambia, y de qué hora a qué hora?');

  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'needs_information' then
    raise exception 'HU-13 FALLIDO: tras pedir información, el estado debería ser needs_information, es %', v_state;
  end if;

  select count(*) into v_pause_events from public.timer_events
  where entity_id = v_request_id and counter_kind = 't1' and event_type = 'paused';
  if v_pause_events <> 1 then
    raise exception 'RN-SLA-03 FALLIDO: pedir información debería pausar T1 (eventos paused = %)', v_pause_events;
  end if;
end $$;

reset role;

-- El cliente lee el mensaje del equipo (nunca su identidad individual,
-- CLAUDE.md MUST NOT — comprobado por columnas: la interfaz nunca debe
-- resolver sender_id, aquí solo se comprueba que sender_role sí es legible).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a3');
  v_conversation_id uuid;
  v_body text;
  v_sender_role text;
begin
  select id into v_conversation_id from public.conversations where request_id = v_request_id;
  if v_conversation_id is null then
    raise exception 'HU-13 FALLIDO: el cliente no puede leer la conversación de su propia solicitud';
  end if;

  select body, sender_role into v_body, v_sender_role from public.messages where conversation_id = v_conversation_id order by created_at asc limit 1;
  if v_body !~ 'día de la semana' then
    raise exception 'HU-13 FALLIDO: el cliente no ve el mensaje pidiendo información';
  end if;
  if v_sender_role <> 'staff' then
    raise exception 'HU-13 FALLIDO: sender_role inesperado "%"', v_sender_role;
  end if;

  -- El cliente responde: needs_information -> pending_internal_validation, T1 se reanuda.
  perform public.provide_additional_information(v_request_id, 'Es el sábado, de 13:00 a 16:00.');
end $$;

-- RN-MSG-03 (hallazgo 2, corregido en 20260830000018): el trabajador NO
-- ve las conversaciones de solicitud — en el Hito 4 no existe todavía el
-- concepto de "trabajo autorizado" (llega en el Hito 6), así que solo
-- propietario y administrador tienen acceso (el mismo criterio que ya
-- exige validar/pedir información/rechazar).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', false);

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a3');
  v_count int;
begin
  select count(*) into v_count from public.conversations where request_id = v_request_id;
  if v_count <> 0 then
    raise exception 'RN-MSG-03 FALLIDO: un Trabajador ve la conversación de una solicitud (esperado 0 filas)';
  end if;

  select count(*) into v_count from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where c.request_id = v_request_id;
  if v_count <> 0 then
    raise exception 'RN-MSG-03 FALLIDO: un Trabajador ve % mensaje(s) de la conversación de una solicitud (esperado 0)', v_count;
  end if;
end $$;

-- El estado ya lo puede confirmar el propio cliente (requests es
-- legible), pero timer_events vuelve a necesitar la identidad del
-- equipo — se comprueba con el administrador que pidió la información.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', false);

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a3');
  v_state text;
  v_resume_events int;
begin
  select state into v_state from public.requests where id = v_request_id;
  if v_state <> 'pending_internal_validation' then
    raise exception 'HU-13 FALLIDO: tras responder, el estado debería volver a pending_internal_validation, es %', v_state;
  end if;

  select count(*) into v_resume_events from public.timer_events
  where entity_id = v_request_id and counter_kind = 't1' and event_type = 'resumed';
  if v_resume_events <> 1 then
    raise exception 'RN-SLA-03 FALLIDO: responder debería reanudar T1 (eventos resumed = %)', v_resume_events;
  end if;
end $$;

reset role;

-- ============================================================
-- HU-14 · "Como administrador, quiero rechazar una solicitud explicando
-- el motivo, sin que consuma cambios."
-- ============================================================

-- El motivo es obligatorio.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a3');
begin
  begin
    perform public.reject_request(v_request_id, '');
    raise exception 'HU-14 FALLIDO: se rechazó sin motivo';
  exception
    when raise_exception then null; -- esperado
  end;
end $$;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a3');
  v_state text;
  v_reason text;
  v_stop_events int;
begin
  perform public.reject_request(v_request_id, 'No prestamos servicio de reservas ni delivery (fuera de servicio).');

  select state, rejected_reason into v_state, v_reason from public.requests where id = v_request_id;
  if v_state <> 'rejected' then
    raise exception 'HU-14 FALLIDO: tras rechazar, el estado debería ser rejected, es %', v_state;
  end if;
  if v_reason is null or v_reason = '' then
    raise exception 'RN-REQ-03 FALLIDO: el motivo del rechazo no se guardó para que lo vea el cliente';
  end if;

  select count(*) into v_stop_events from public.timer_events
  where entity_id = v_request_id and counter_kind = 't1' and event_type = 'stopped';
  if v_stop_events <> 1 then
    raise exception 'RN-SLA-03 FALLIDO: rechazar debería detener T1 (eventos stopped = %)', v_stop_events;
  end if;
end $$;

-- CA-15 (corregido en 20260830000018): "quién, qué, cuándo, valor
-- anterior, valor nuevo, motivo cuando corresponda" — comprobado con
-- old_value/new_value reales, no solo con la existencia de la fila.
do $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  select old_value, new_value into v_old, v_new from public.audit_log
  where space_id = 'f1000000-0000-0000-0000-000000000001' and action = 'request.rejected';

  if v_old is null or v_new is null then
    raise exception 'CA-15 FALLIDO: request.rejected no registra valor anterior/nuevo en audit_log';
  end if;
  if v_old ->> 'state' <> 'pending_internal_validation' or v_new ->> 'state' <> 'rejected' then
    raise exception 'CA-15 FALLIDO: valor anterior/nuevo incorrectos en audit_log (old=%, new=%)', v_old, v_new;
  end if;
end $$;

reset role;

-- El cliente lee el motivo del rechazo (RN-REQ-03: "se explica el motivo
-- al cliente"), a través tanto de requests.rejected_reason como del
-- mensaje en la conversación.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_request_id uuid := (select value::uuid from h4_ctx where key = 'request_a3');
  v_reason text;
  v_message_count int;
begin
  select rejected_reason into v_reason from public.requests where id = v_request_id;
  if v_reason !~ 'fuera de servicio' then
    raise exception 'RN-REQ-03 FALLIDO: el cliente no ve el motivo del rechazo';
  end if;

  select count(*) into v_message_count from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where c.request_id = v_request_id and m.body ~ 'fuera de servicio';
  if v_message_count <> 1 then
    raise exception 'RN-REQ-03 FALLIDO: el motivo del rechazo no llegó a la conversación que lee el cliente';
  end if;
end $$;

reset role;

-- ============================================================
-- HU-15 · "Como restaurante, quiero copiar una solicitud y pegarla en
-- otro establecimiento del mismo grupo como borrador."
-- ============================================================
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', false);
set role authenticated;

do $$
declare
  v_source_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
  v_pasted_id uuid;
  v_state text;
  v_description text;
  v_establishment_id uuid;
  v_attachment_count int;
begin
  v_pasted_id := public.copy_paste_request(v_source_id, 'f3000000-0000-0000-0000-000000000002');

  select state, description, establishment_id into v_state, v_description, v_establishment_id
  from public.requests where id = v_pasted_id;

  if v_state <> 'draft' then
    raise exception 'HU-15 FALLIDO: el borrador pegado debería nacer en draft (sin enviarse automáticamente), está en %', v_state;
  end if;
  if v_establishment_id <> 'f3000000-0000-0000-0000-000000000002' then
    raise exception 'HU-15 FALLIDO: el borrador no se creó en el establecimiento de destino';
  end if;
  if v_description !~ 'ensalada César' then
    raise exception 'HU-15 FALLIDO: no se copió la descripción de la solicitud de origen';
  end if;

  select count(*) into v_attachment_count from public.request_attachments where request_id = v_pasted_id;
  if v_attachment_count <> 1 then
    raise exception 'RN-REQ-04 FALLIDO: los adjuntos de la solicitud de origen no se copiaron (%)', v_attachment_count;
  end if;
end $$;

-- RN-REQ-04: copiar y pegar solo funciona DENTRO del mismo grupo — pegar
-- en el establecimiento de otro grupo debe fallar, aunque el usuario
-- tenga acceso de escritura allí de otra forma... en este caso el
-- Propietario local de EST-H4-A no tiene acceso de escritura a EST-H4-C
-- en absoluto, así que primero falla por eso (control adicional de
-- can_write_establishment); se prueba el límite de grupo específicamente
-- con el Propietario global de ese otro grupo, que si tuviera acceso
-- cruzado podría pegar, y no debe poder.
do $$
declare
  v_source_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
begin
  begin
    perform public.copy_paste_request(v_source_id, 'f3000000-0000-0000-0000-000000000003');
    raise exception 'RN-REQ-04 FALLIDO: se pegó en un establecimiento sin acceso de escritura';
  exception
    when raise_exception then null; -- esperado
  end;
end $$;

reset role;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000007', false);
set role authenticated;

do $$
declare
  v_source_id uuid := (select value::uuid from h4_ctx where key = 'request_a1');
begin
  begin
    -- El propietario global del otro grupo SÍ puede leer/escribir su
    -- propio establecimiento (f3...003), pero la solicitud de origen
    -- pertenece a un establecimiento de un grupo distinto — RN-REQ-04
    -- debe bloquearlo por el grupo, no por el establecimiento de destino.
    perform public.copy_paste_request(v_source_id, 'f3000000-0000-0000-0000-000000000003');
    raise exception 'RN-REQ-04 FALLIDO: se copió entre grupos distintos';
  exception
    when raise_exception then null; -- esperado: "no tienes acceso a la solicitud de origen"
  end;
end $$;

reset role;

-- ============================================================
-- CA-02 · aislamiento entre espacios también para las tablas nuevas del
-- Hito 4 (un usuario sin relación con Espacio H4 no ve nada de él).
-- ============================================================
insert into auth.users (id, email, role, aud) values
  ('f0000000-0000-0000-0000-000000000099', 'h4-ajeno@example.com', 'authenticated', 'authenticated');

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000099', false);
set role authenticated;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.requests where space_id = 'f1000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de requests de un espacio ajeno visibles (esperado 0)', v_count;
  end if;

  select count(*) into v_count from public.classifications where space_id = 'f1000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de classifications de un espacio ajeno visibles (esperado 0)', v_count;
  end if;

  select count(*) into v_count from public.messages where space_id = 'f1000000-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'CA-02 FALLIDO: % fila(s) de messages de un espacio ajeno visibles (esperado 0)', v_count;
  end if;
end $$;

reset role;

-- ============================================================
-- CA-16 · la auditoría de las nuevas acciones no se puede editar ni
-- borrar desde la aplicación (mismo principio que hito2_permisos.sql).
-- ============================================================
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', false);
set role authenticated;

do $$
declare
  v_updated int;
  v_deleted int;
begin
  with intento_editar as (
    update public.audit_log set reason = 'manipulado' where space_id = 'f1000000-0000-0000-0000-000000000001' and action = 'request.rejected'
    returning id
  )
  select count(*) into v_updated from intento_editar;

  with intento_borrar as (
    delete from public.audit_log where space_id = 'f1000000-0000-0000-0000-000000000001' and action = 'request.rejected'
    returning id
  )
  select count(*) into v_deleted from intento_borrar;

  if v_updated <> 0 or v_deleted <> 0 then
    raise exception 'CA-16 FALLIDO: editadas=% (esperado 0), borradas=% (esperado 0)', v_updated, v_deleted;
  end if;
  if (select count(*) from public.audit_log where space_id = 'f1000000-0000-0000-0000-000000000001' and action = 'request.rejected') <> 1 then
    raise exception 'CA-16 FALLIDO: no se encuentra el registro de auditoría original del rechazo';
  end if;
end $$;

reset role;

-- ============================================================
-- Limpieza: no deja nada de esto en la base de datos real.
-- ============================================================
delete from public.audit_log where space_id in ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002');
delete from public.spaces where id in ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002');
delete from auth.users where email like 'h4-%@example.com';

do $$
declare
  v_spaces int;
  v_profiles int;
  v_users int;
begin
  select count(*) into v_spaces from public.spaces where slug in ('espacio-h4-test', 'espacio-h4-ajeno-test');
  select count(*) into v_profiles from public.profiles where email like 'h4-%@example.com';
  select count(*) into v_users from auth.users where email like 'h4-%@example.com';

  if v_spaces <> 0 or v_profiles <> 0 or v_users <> 0 then
    raise exception 'LIMPIEZA FALLIDA: spaces=%, profiles=%, auth.users=% (todo debía ser 0)', v_spaces, v_profiles, v_users;
  end if;
end $$;

select 'hito4_solicitudes.sql: HU-10 a HU-15 cumplidas, base de datos limpia' as resultado;
