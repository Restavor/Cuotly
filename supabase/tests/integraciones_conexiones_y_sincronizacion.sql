-- Fase 3 · Hito 13 · integraciones analíticas: conexiones, credenciales
-- cifradas, estados y la sincronización programada (migración 81; PRD §27,
-- RN-INT-01 a 09; §115 a §122, §126, §94, §163, §178; P7; §18; §21.2).
--
--   · RN-INT-01: cinco fuentes, una fila por restaurante y fuente; una
--     sexta fuente no existe.
--   · RN-INT-02: OAuth para GA4, clave para Clarity; la credencial llega
--     cifrada o no llega; nadie lee `ciphertext` por SELECT; la
--     comprobación es una ejecución `check` que no importa datos.
--   · RN-INT-03: los siete estados y lo que §117 manda enseñar, para las
--     cinco fuentes aunque no tengan fila.
--   · RN-INT-04: frecuencias, espera creciente, "desactualizado", aviso al
--     equipo una vez por racha y al restaurante solo para volver a
--     autorizar.
--   · RN-INT-05: quién conecta, quién guarda claves, quién solo mira.
--   · RN-INT-06: desconectar revoca; archivar desconecta; los datos quedan.
--   · RN-INT-07: los puntos se conservan y llevan su antigüedad.
--   · RN-INT-08: el error se guarda recortado.
--   · RN-INT-09: reclamar no se pisa, cerrar dos veces no hace nada más, un
--     restaurante suspendido no se sincroniza.
--   · Las internas están cerradas por RPC y las columnas con identidad,
--     tapadas al restaurante.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/integraciones_conexiones_y_sincronizacion.sql

insert into auth.users (id, email, role, aud) values
  ('dd000000-0000-0000-0000-000000000001', 'it-owner@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000002', 'it-admin@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000003', 'it-ana@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000004', 'it-luis@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000005', 'it-local@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000006', 'it-editor@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000007', 'it-consulta@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000008', 'it-otro@example.com', 'authenticated', 'authenticated'),
  ('dd000000-0000-0000-0000-000000000010', 'it-global@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('dd100000-0000-0000-0000-000000000001', 'Espacio Integraciones', 'espacio-integraciones-test', 'Europe/Madrid',
   'dd000000-0000-0000-0000-000000000001'),
  ('dd100000-0000-0000-0000-000000000002', 'Espacio Ajeno I', 'espacio-ajeno-integraciones-test', 'Europe/Madrid',
   'dd000000-0000-0000-0000-000000000008');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000003', 'worker', 'active'),
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000004', 'worker', 'active'),
  ('dd100000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000008', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('dd300000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001', 'Grupo I');

insert into public.group_memberships (group_id, user_id) values
  ('dd300000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000010');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('dd400000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000001',
   'dd300000-0000-0000-0000-000000000001', 'INT-0001', 'Casa Analítica', 'active'),
  ('dd400000-0000-0000-0000-000000000002', 'dd100000-0000-0000-0000-000000000001',
   'dd300000-0000-0000-0000-000000000001', 'INT-0002', 'Casa Archivo', 'active'),
  ('dd400000-0000-0000-0000-000000000003', 'dd100000-0000-0000-0000-000000000001',
   'dd300000-0000-0000-0000-000000000001', 'INT-0003', 'Casa Suspendida', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000005', 'local_owner'),
  ('dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000006', 'editor'),
  ('dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000007', 'consulta');

-- Ana: analítica, autorizada en Casa Analítica. Luis: sin autorizar.
insert into public.worker_specialties (space_id, user_id, specialty, created_by) values
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000003', 'analytics', 'dd000000-0000-0000-0000-000000000001');
insert into public.worker_establishments (space_id, user_id, establishment_id, created_by) values
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000003', 'dd400000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001');

create temp table it_ids (k text primary key, v uuid);
grant select, insert, update on it_ids to authenticated, service_role;

-- ============================================================
-- RN-INT-04 · las tres cuentas compartidas con src/core/integrations.ts
-- ============================================================
do $$
begin
  if public.integration_sync_frequency('ga4') <> interval '1 day'
     or public.integration_sync_frequency('search_console') <> interval '1 day'
     or public.integration_sync_frequency('business_profile') <> interval '1 day'
     or public.integration_sync_frequency('clarity') <> interval '1 day'
     or public.integration_sync_frequency('pagespeed') <> interval '7 days' then
    raise exception 'RN-INT-04 FALLIDO: las frecuencias no son las de §118 (diaria salvo PageSpeed semanal)' using errcode = 'assert_failure';
  end if;
  if public.integration_sync_frequency('reservations') is not null then
    raise exception 'RN-INT-01 FALLIDO: una plataforma de reservas tiene frecuencia de sincronización' using errcode = 'assert_failure';
  end if;

  if public.integration_retry_delay(1) <> interval '1 hour'
     or public.integration_retry_delay(2) <> interval '4 hours'
     or public.integration_retry_delay(3) <> interval '16 hours'
     or public.integration_retry_delay(4) <> interval '24 hours'
     or public.integration_retry_delay(9) <> interval '24 hours'
     or public.integration_retry_delay(0) <> interval '1 hour' then
    raise exception 'RN-INT-04 FALLIDO: la espera entre reintentos no es 1 h, 4 h, 16 h y 24 h como máximo' using errcode = 'assert_failure';
  end if;

  -- `is distinct from true` y no `not f()`: un booleano que devuelva NULL
  -- no salta ni con `if f()` ni con `if not f()`, y la revisión del
  -- 14/09/2026 lo demostró mutando la función para que devolviera NULL en
  -- este caso sin que la suite se enterara.
  if public.integration_data_is_stale('ga4', null, now()) is distinct from true then
    raise exception 'RN-INT-07 FALLIDO: sin ninguna sincronización correcta el dato cuenta como actual' using errcode = 'assert_failure';
  end if;
  if public.integration_data_is_stale('ga4', now() - interval '1 day', now()) is distinct from false then
    raise exception 'RN-INT-07 FALLIDO: un dato de ayer de una fuente diaria cuenta como desactualizado' using errcode = 'assert_failure';
  end if;
  if public.integration_data_is_stale('ga4', now() - interval '3 days', now()) is distinct from true then
    raise exception 'RN-INT-07 FALLIDO: tres días sin éxito en una fuente diaria no cuentan como desactualizado' using errcode = 'assert_failure';
  end if;
  if public.integration_data_is_stale('pagespeed', now() - interval '10 days', now()) is distinct from false then
    raise exception 'RN-INT-07 FALLIDO: diez días en una fuente semanal cuentan como desactualizado' using errcode = 'assert_failure';
  end if;
  if public.integration_data_is_stale('pagespeed', now() - interval '15 days', now()) is distinct from true then
    raise exception 'RN-INT-07 FALLIDO: quince días en una fuente semanal cuentan como actual' using errcode = 'assert_failure';
  end if;

  if public.integration_auth_kind('ga4') <> 'oauth' or public.integration_auth_kind('search_console') <> 'oauth'
     or public.integration_auth_kind('business_profile') <> 'oauth'
     or public.integration_auth_kind('clarity') <> 'api_key' or public.integration_auth_kind('pagespeed') <> 'api_key' then
    raise exception 'RN-INT-02 FALLIDO: OAuth cuando exista (GA4, Search Console, Business Profile) y clave solo cuando sea necesaria (Clarity, PageSpeed)' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-INT-05 · quién empieza una conexión
-- ============================================================
-- Ana, trabajadora autorizada: consulta, no conecta.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'ga4');
    raise exception 'RN-INT-05 FALLIDO: una trabajadora autorizada empezó una conexión' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;

-- El Editor y Consulta tampoco (§4.3: quien acepta por el restaurante es el propietario).
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000006', false);
set role authenticated;
do $$
begin
  begin
    perform public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'ga4');
    raise exception 'RN-INT-05 FALLIDO: el Editor empezó una conexión' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  begin
    perform public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'ga4');
    raise exception 'RN-INT-05 FALLIDO: Consulta empezó una conexión' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;

-- Otro espacio: ni ve el restaurante.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000008', false);
set role authenticated;
do $$
begin
  begin
    perform public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'ga4');
    raise exception 'CA-02 FALLIDO: una identidad ajena empezó una conexión' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
  begin
    perform public.establishment_integrations('dd400000-0000-0000-0000-000000000001');
    raise exception 'CA-02 FALLIDO: una identidad ajena leyó las integraciones de un restaurante' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes acceso%' then raise; end if;
  end;
end $$;
reset role;

-- ============================================================
-- RN-INT-01/02 · el propietario local empieza GA4 (OAuth); la fuente
-- inventada no existe; empezar dos veces es una sola.
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_a uuid; v_b uuid; v_kind text; v_status text;
begin
  begin
    perform public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'reservations');
    raise exception 'RN-INT-01 FALLIDO: una plataforma de reservas se conectó como integración' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Fuente desconocida%' then raise; end if;
  end;

  v_a := public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'ga4');
  v_b := public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'ga4');
  if v_a <> v_b then
    raise exception 'CA-17 FALLIDO: empezar dos veces creó dos conexiones' using errcode = 'assert_failure';
  end if;
  insert into it_ids values ('ga4', v_a);

  select auth_kind, status into v_kind, v_status from public.integrations where id = v_a;
  if v_kind <> 'oauth' or v_status <> 'pending_authorization' then
    raise exception 'RN-INT-02/03 FALLIDO: GA4 recién empezada debía ser oauth y pendiente de autorización, y es % / %', v_kind, v_status using errcode = 'assert_failure';
  end if;

  -- P7: la fila es suya, la columna de quién la conectó no.
  begin
    perform connected_by from public.integrations where id = v_a;
    raise exception 'P7 FALLIDO: el restaurante lee connected_by' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- El propietario del espacio empieza Clarity (clave); el administrador,
-- Search Console (OAuth) en Casa Analítica y PageSpeed en Casa Archivo.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'clarity');
  insert into it_ids values ('clarity', v_id);
  if (select auth_kind from public.integrations where id = v_id) <> 'api_key' then
    raise exception 'RN-INT-02 FALLIDO: Clarity no se conecta por clave' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_id uuid;
begin
  v_id := public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'search_console');
  insert into it_ids values ('gsc', v_id);
  v_id := public.begin_integration_connection('dd400000-0000-0000-0000-000000000002', 'pagespeed');
  insert into it_ids values ('psi', v_id);
  v_id := public.begin_integration_connection('dd400000-0000-0000-0000-000000000003', 'ga4');
  insert into it_ids values ('ga4_susp', v_id);

  -- Una conexión pendiente se puede dejar (vuelve a "No conectada") y
  -- volver a empezar.
  perform public.cancel_integration_connection((select v from it_ids where k = 'gsc'));
  if (select status from public.integrations where id = (select v from it_ids where k = 'gsc')) <> 'not_connected' then
    raise exception 'RN-INT-03 FALLIDO: cancelar una autorización pendiente no la deja en not_connected' using errcode = 'assert_failure';
  end if;
  perform public.cancel_integration_connection((select v from it_ids where k = 'gsc')); -- CA-17
  if public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'search_console') <> (select v from it_ids where k = 'gsc') then
    raise exception 'RN-INT-01 FALLIDO: volver a empezar creó una segunda fila para la misma fuente' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-INT-02/05 · la credencial: cifrada, y la guarda quien puede
-- ============================================================
-- Estas las llama el servidor con service_role (aquí, postgres).
do $$
declare v_ga4 uuid := (select v from it_ids where k = 'ga4');
        v_clarity uuid := (select v from it_ids where k = 'clarity');
        v_cred uuid; v_n integer;
begin
  -- Un token de Google sin cifrar no entra.
  begin
    perform public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000005', 'oauth_refresh_token',
              '1//0abcdefRefreshTokenSinCifrar', 1, null, 'cuenta@gmail.com', 'properties/123');
    raise exception 'RN-INT-02 FALLIDO: se guardó un token sin cifrar' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%sin cifrar%' then raise; end if;
  end;
  begin
    perform public.store_integration_credential(v_clarity, 'dd000000-0000-0000-0000-000000000001', 'api_key',
              'AIzaSyClaveDeGoogleSinCifrar000000000000', 1);
    raise exception 'RN-INT-02 FALLIDO: se guardó una clave sin cifrar' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%sin cifrar%' then raise; end if;
  end;

  -- El tipo de credencial tiene que ser el de la fuente.
  begin
    perform public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000005', 'api_key', 'enc:xxx', 1);
    raise exception 'RN-INT-02 FALLIDO: GA4 aceptó una clave API' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%se conecta por%' then raise; end if;
  end;

  -- §126: una clave la guarda solo el propietario del espacio. El
  -- administrador no; el propietario del restaurante tampoco.
  begin
    perform public.store_integration_credential(v_clarity, 'dd000000-0000-0000-0000-000000000002', 'api_key', 'enc:clarity', 1);
    raise exception 'RN-INT-05 FALLIDO: un administrador guardó una clave API' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el propietario del espacio introduce%' then raise; end if;
  end;
  begin
    perform public.store_integration_credential(v_clarity, 'dd000000-0000-0000-0000-000000000005', 'api_key', 'enc:clarity', 1);
    raise exception 'RN-INT-05 FALLIDO: el propietario del restaurante guardó una clave API' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el propietario del espacio introduce%' then raise; end if;
  end;

  -- Una autorización OAuth: el propietario del restaurante sí; una
  -- trabajadora, el Editor y un administrador no.
  begin
    perform public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000003', 'oauth_refresh_token', 'enc:tok', 1);
    raise exception 'RN-INT-05 FALLIDO: una trabajadora autorizó una cuenta de Google' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el propietario del espacio o el del restaurante%' then raise; end if;
  end;
  begin
    perform public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000006', 'oauth_refresh_token', 'enc:tok', 1);
    raise exception 'RN-INT-05 FALLIDO: el Editor autorizó una cuenta de Google' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el propietario del espacio o el del restaurante%' then raise; end if;
  end;
  begin
    perform public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000002', 'oauth_refresh_token', 'enc:tok', 1);
    raise exception 'RN-INT-05 FALLIDO: un administrador autorizó una cuenta de Google ajena' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo el propietario del espacio o el del restaurante%' then raise; end if;
  end;

  -- Sin actor no hay auditoría posible (§21.2).
  begin
    perform public.store_integration_credential(v_ga4, null, 'oauth_refresh_token', 'enc:tok', 1);
    raise exception '§21.2 FALLIDO: se guardó una credencial sin actor' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%quién la autorizó%' then raise; end if;
  end;

  -- Las buenas: el propietario local autoriza GA4; el propietario del
  -- espacio pega la clave de Clarity.
  v_cred := public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000005', 'oauth_refresh_token',
              'enc:v1:ga4-refresh', 1, null, 'casa.analitica@gmail.com', 'properties/123456');
  insert into it_ids values ('cred_ga4_1', v_cred);
  v_cred := public.store_integration_credential(v_clarity, 'dd000000-0000-0000-0000-000000000001', 'api_key',
              'enc:v1:clarity-key', 1, null, 'Proyecto Casa Analítica', 'abc123');

  select count(*) into v_n from public.integrations
  where id in (v_ga4, v_clarity) and status = 'connected' and connected_at is not null and next_attempt_at <= now();
  if v_n <> 2 then
    raise exception 'RN-INT-03 FALLIDO: guardar la credencial no deja la integración conectada y con siguiente intento inmediato (% de 2)', v_n using errcode = 'assert_failure';
  end if;
  if (select connected_by from public.integrations where id = v_ga4) <> 'dd000000-0000-0000-0000-000000000005' then
    raise exception '§21.2 FALLIDO: la conexión no recuerda quién autorizó' using errcode = 'assert_failure';
  end if;
  if (select account_label from public.integrations where id = v_ga4) <> 'casa.analitica@gmail.com' then
    raise exception 'RN-INT-03 FALLIDO: no se guardó la cuenta que §117 manda enseñar' using errcode = 'assert_failure';
  end if;

  select count(*) into v_n from public.audit_log
  where action = 'integration.connected' and entity_id in (v_ga4, v_clarity);
  if v_n <> 2 then
    raise exception 'RN-INT-06 FALLIDO: conectar no dejó su apunte de auditoría (% de 2)', v_n using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.audit_log where action like 'integration.%' and new_value::text like '%enc:v1%') then
    raise exception 'RN-INT-02 FALLIDO: el texto de la credencial acabó en la auditoría' using errcode = 'assert_failure';
  end if;

  -- Una credencial sobre una conexión no empezada, no.
  begin
    perform public.store_integration_credential((select v from it_ids where k = 'psi'), 'dd000000-0000-0000-0000-000000000001',
              'api_key', 'enc:psi', 1);
    -- PageSpeed en Casa Archivo está pendiente: esta SÍ entra. La que no
    -- entra es la de una desconectada, comprobada más abajo.
  end;
end $$;

-- Nadie lee el texto cifrado por SELECT (RN-INT-02), ni siquiera el
-- propietario del espacio, que sí ve que la credencial existe (§126).
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.integration_credentials
  where integration_id = (select v from it_ids where k = 'ga4') and replaced_at is null;
  if v_n <> 1 then
    raise exception '§126 FALLIDO: el propietario del espacio no ve que existe la credencial (ve %)', v_n using errcode = 'assert_failure';
  end if;
  begin
    perform ciphertext from public.integration_credentials limit 1;
    raise exception 'RN-INT-02 FALLIDO: el propietario del espacio lee ciphertext por SELECT' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.read_integration_credential((select v from it_ids where k = 'ga4'));
    raise exception 'RN-INT-02 FALLIDO: read_integration_credential está abierta a authenticated' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- El administrador ni ve la fila (§126: solo el propietario gestiona
-- credenciales); la trabajadora tampoco.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.integration_credentials) <> 0 then
    raise exception '§126 FALLIDO: un administrador ve credenciales' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.integration_credentials) <> 0 then
    raise exception 'RN-INT-05 FALLIDO: una trabajadora ve credenciales' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Y el proceso de la cola sí la lee, cifrada.
do $$
declare v_kind text; v_ct text;
begin
  select kind, ciphertext into v_kind, v_ct from public.read_integration_credential((select v from it_ids where k = 'ga4'));
  if v_kind <> 'oauth_refresh_token' or v_ct <> 'enc:v1:ga4-refresh' then
    raise exception 'RN-INT-02 FALLIDO: read_integration_credential no devuelve la credencial vigente' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-INT-03 · lo que §117 manda enseñar, para las cinco fuentes
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000005', false);
set role authenticated;
do $$
declare v_n integer; v_providers text; v_row record;
begin
  select count(*), string_agg(provider, ',' order by ordinality) into v_n, v_providers
  from public.establishment_integrations('dd400000-0000-0000-0000-000000000001') with ordinality;
  if v_n <> 5 or v_providers <> 'ga4,search_console,business_profile,clarity,pagespeed' then
    raise exception 'RN-INT-03 FALLIDO: la ficha debía listar las cinco fuentes en el orden de §115 y lista "%"', v_providers using errcode = 'assert_failure';
  end if;

  select * into v_row from public.establishment_integrations('dd400000-0000-0000-0000-000000000001') where provider = 'business_profile';
  if v_row.integration_id is not null or v_row.status <> 'not_connected' or v_row.auth_kind <> 'oauth' or v_row.is_stale then
    raise exception 'RN-INT-03 FALLIDO: una fuente sin fila debía salir como not_connected, oauth y sin marca de desactualizado' using errcode = 'assert_failure';
  end if;

  select * into v_row from public.establishment_integrations('dd400000-0000-0000-0000-000000000001') where provider = 'ga4';
  if v_row.status <> 'connected' or v_row.account_label <> 'casa.analitica@gmail.com' or v_row.last_success_at is not null
     or not v_row.is_stale or v_row.sync_frequency <> interval '1 day' then
    raise exception 'RN-INT-03 FALLIDO: GA4 conectada y sin sincronizar debía decir conectada, con su cuenta, sin última sincronización y con el dato desactualizado' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Consulta lee el estado (§4.3: solo lectura, pero lectura). Ana también.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.establishment_integrations('dd400000-0000-0000-0000-000000000001')) <> 5 then
    raise exception 'RN-INT-03 FALLIDO: Consulta no lee el estado de las integraciones' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.establishment_integrations('dd400000-0000-0000-0000-000000000001')) <> 5 then
    raise exception 'RN-INT-05 FALLIDO: una trabajadora autorizada no consulta el estado' using errcode = 'assert_failure';
  end if;
  -- Pero la organización interna de las ejecuciones no es suya.
  if (select count(*) from public.sync_runs) <> 0 then
    raise exception 'P7 FALLIDO: una trabajadora ve las ejecuciones de sincronización' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-INT-09 · reclamar: las dos conectadas, una vez, y quedan "Sincronizando"
-- ============================================================
do $$
declare v_n integer; v_row record; v_today date := (now() at time zone 'Europe/Madrid')::date;
begin
  -- PageSpeed en Casa Archivo también está conectada (clave guardada arriba).
  create temp table it_claim as select * from public.claim_integration_runs(10);
  select count(*) into v_n from it_claim;
  if v_n <> 3 then
    raise exception 'RN-INT-09 FALLIDO: había tres integraciones con intento vencido y se reclamaron %', v_n using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.integrations where status = 'syncing') <> 3 then
    raise exception 'RN-INT-03 FALLIDO: reclamar no deja la integración en "Sincronizando"' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.claim_integration_runs(10)) <> 0 then
    raise exception 'RN-INT-09 FALLIDO: una segunda reclamación volvió a tomar lo mismo' using errcode = 'assert_failure';
  end if;

  select * into v_row from it_claim where integration_id = (select v from it_ids where k = 'ga4');
  if v_row.kind <> 'sync' or v_row.period_end <> v_today - 1 or v_row.period_start <> v_today - 90
     or v_row.external_property_id <> 'properties/123456' then
    raise exception 'RN-INT-09 FALLIDO: la primera sincronización debía cubrir 90 días hasta ayer (% a %)', v_row.period_start, v_row.period_end using errcode = 'assert_failure';
  end if;
  insert into it_ids select 'run_ga4_1', run_id from it_claim where integration_id = (select v from it_ids where k = 'ga4');
  insert into it_ids select 'run_clarity_1', run_id from it_claim where integration_id = (select v from it_ids where k = 'clarity');
  insert into it_ids select 'run_psi_1', run_id from it_claim where integration_id = (select v from it_ids where k = 'psi');
  drop table it_claim;
end $$;

-- ============================================================
-- RN-INT-04/07 · una sincronización correcta: puntos, conectada, siguiente
-- intento dentro de un día; cerrar dos veces no hace nada más.
-- ============================================================
do $$
declare v_run uuid := (select v from it_ids where k = 'run_ga4_1');
        v_ga4 uuid := (select v from it_ids where k = 'ga4');
        v_n integer; v_next timestamptz; v_value numeric; v_fetched timestamptz; v_run2 uuid;
begin
  v_n := public.finish_integration_run(v_run, 'succeeded', null, null, jsonb_build_array(
           jsonb_build_object('metric', 'sessions', 'period_start', '2026-09-10', 'period_end', '2026-09-10', 'value', 120),
           jsonb_build_object('metric', 'sessions', 'period_start', '2026-09-11', 'period_end', '2026-09-11', 'value', 98),
           jsonb_build_object('metric', 'page_views', 'dimension', '/carta', 'period_start', '2026-09-11', 'period_end', '2026-09-11', 'value', 40, 'unit', 'views')
         ));
  if v_n <> 3 then
    raise exception 'RN-INT-07 FALLIDO: se escribieron % puntos de 3', v_n using errcode = 'assert_failure';
  end if;
  select next_attempt_at into v_next from public.integrations where id = v_ga4;
  if (select status from public.integrations where id = v_ga4) <> 'connected'
     or (select last_success_at from public.integrations where id = v_ga4) is null
     or v_next < now() + interval '23 hours' or v_next > now() + interval '25 hours' then
    raise exception 'RN-INT-04 FALLIDO: tras sincronizar GA4 debía quedar conectada con el siguiente intento dentro de un día' using errcode = 'assert_failure';
  end if;
  if (select status from public.sync_runs where id = v_run) <> 'succeeded'
     or (select points_written from public.sync_runs where id = v_run) <> 3
     or (select finished_at from public.sync_runs where id = v_run) is null then
    raise exception 'RN-INT-09 FALLIDO: la ejecución no quedó como correcta con sus 3 puntos' using errcode = 'assert_failure';
  end if;

  -- CA-17: cerrar la misma ejecución otra vez devuelve lo mismo y no escribe.
  v_n := public.finish_integration_run(v_run, 'succeeded', null, null, jsonb_build_array(
           jsonb_build_object('metric', 'sessions', 'period_start', '2026-09-12', 'period_end', '2026-09-12', 'value', 1)));
  if v_n <> 3 or (select count(*) from public.metric_points where integration_id = v_ga4) <> 3 then
    raise exception 'CA-17 FALLIDO: cerrar dos veces la misma ejecución volvió a escribir puntos' using errcode = 'assert_failure';
  end if;

  -- Ya no está vencida: no se reclama.
  if exists (select 1 from public.claim_integration_runs(10) where integration_id = v_ga4) then
    raise exception 'RN-INT-04 FALLIDO: se volvió a reclamar una integración recién sincronizada' using errcode = 'assert_failure';
  end if;

  -- RN-INT-07: una pasada posterior revisa el mismo día y el dato bueno es
  -- el último, con su marca de antigüedad nueva.
  select fetched_at into v_fetched from public.metric_points
  where integration_id = v_ga4 and metric = 'sessions' and period_start = '2026-09-11';
  update public.integrations set next_attempt_at = now() where id = v_ga4;
  select run_id into v_run2 from public.claim_integration_runs(10) where integration_id = v_ga4;
  perform public.finish_integration_run(v_run2, 'succeeded', null, null, jsonb_build_array(
      jsonb_build_object('metric', 'sessions', 'period_start', '2026-09-11', 'period_end', '2026-09-11', 'value', 101)));
  select value into v_value from public.metric_points
  where integration_id = v_ga4 and metric = 'sessions' and period_start = '2026-09-11';
  if v_value <> 101 or (select count(*) from public.metric_points where integration_id = v_ga4) <> 3 then
    raise exception 'RN-INT-07 FALLIDO: la revisión de un día ya importado debía sustituir el valor (es %) sin duplicar la fila', v_value using errcode = 'assert_failure';
  end if;
  -- La marca de antigüedad es la de la pasada nueva (dentro de esta misma
  -- transacción now() no avanza, así que se mira la ejecución que la puso).
  if (select sync_run_id from public.metric_points where integration_id = v_ga4 and metric = 'sessions' and period_start = '2026-09-11') <> v_run2
     or (select fetched_at from public.metric_points where integration_id = v_ga4 and metric = 'sessions' and period_start = '2026-09-11') < v_fetched then
    raise exception 'RN-INT-08 FALLIDO: el punto revisado no renovó su marca de antigüedad' using errcode = 'assert_failure';
  end if;

  -- Y la segunda pasada empieza tres días antes del último éxito, no 90.
  update public.integrations set next_attempt_at = now() where id = v_ga4;
  if (select period_start from public.claim_integration_runs(10) where integration_id = v_ga4)
     <> (now() at time zone 'Europe/Madrid')::date - 3 then
    raise exception 'RN-INT-09 FALLIDO: la pasada siguiente no solapa tres días con el último éxito' using errcode = 'assert_failure';
  end if;
  perform public.finish_integration_run((select id from public.sync_runs where integration_id = v_ga4 and status = 'running'), 'succeeded');
end $$;

-- ============================================================
-- RN-INT-04/08 · un fallo transitorio: "Error", espera creciente, aviso al
-- equipo una sola vez por racha, error recortado.
-- ============================================================
do $$
declare v_clarity uuid := (select v from it_ids where k = 'clarity');
        v_run uuid := (select v from it_ids where k = 'run_clarity_1');
        v_next timestamptz; v_n integer; v_long text := repeat('x', 700);
begin
  perform public.finish_integration_run(v_run, 'failed', 'transient', 'timeout ' || v_long);

  if (select status from public.integrations where id = v_clarity) <> 'error'
     or (select consecutive_failures from public.integrations where id = v_clarity) <> 1
     or (select last_failure_kind from public.integrations where id = v_clarity) <> 'transient' then
    raise exception 'RN-INT-03/04 FALLIDO: un fallo transitorio debía dejar "Error" con un fallo contado' using errcode = 'assert_failure';
  end if;
  select next_attempt_at into v_next from public.integrations where id = v_clarity;
  if v_next < now() + interval '55 minutes' or v_next > now() + interval '65 minutes' then
    raise exception 'RN-INT-04 FALLIDO: el primer reintento debía esperar 1 h' using errcode = 'assert_failure';
  end if;
  if length((select last_error from public.integrations where id = v_clarity)) <> 500
     or length((select error from public.sync_runs where id = v_run)) <> 500 then
    raise exception 'RN-INT-08 FALLIDO: el error no se recortó a 500 caracteres' using errcode = 'assert_failure';
  end if;

  -- §118: propietario y administradores; ni Ana ni el restaurante.
  select count(*) into v_n from public.notifications
  where event_type = 'integration_sync_failed' and entity_id = v_clarity
    and recipient_id in ('dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002');
  if v_n <> 2 then
    raise exception 'RN-INT-04 FALLIDO: el fallo debía avisar al propietario y al administrador (avisó a %)', v_n using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'integration_sync_failed' and entity_id = v_clarity
             and recipient_id not in ('dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002')) then
    raise exception 'RN-NOT-01 / §118 FALLIDO: un fallo transitorio avisó a alguien que no es propietario ni administrador' using errcode = 'assert_failure';
  end if;
  if (select deep_link from public.notifications where event_type = 'integration_sync_failed' and entity_id = v_clarity limit 1)
     <> '/espacios/espacio-integraciones-test/restaurantes/dd400000-0000-0000-0000-000000000001?vista=gestion&bloque=integraciones' then
    raise exception 'RN-NOT-04 FALLIDO: el enlace del aviso no abre el bloque de integraciones de la ficha' using errcode = 'assert_failure';
  end if;

  -- Segundo fallo de la racha: espera 4 h y NO vuelve a avisar.
  update public.integrations set next_attempt_at = now() where id = v_clarity;
  perform public.finish_integration_run(
    (select run_id from public.claim_integration_runs(10) where integration_id = v_clarity),
    'failed', 'transient', 'timeout otra vez');
  select next_attempt_at into v_next from public.integrations where id = v_clarity;
  if (select consecutive_failures from public.integrations where id = v_clarity) <> 2
     or v_next < now() + interval '3 hours 55 minutes' or v_next > now() + interval '4 hours 5 minutes' then
    raise exception 'RN-INT-04 FALLIDO: el segundo reintento debía esperar 4 h' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.notifications where event_type = 'integration_sync_failed' and entity_id = v_clarity) <> 2 then
    raise exception 'RN-INT-04 FALLIDO: el segundo fallo de la misma racha volvió a avisar' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action = 'integration.sync_failed' and entity_id = v_clarity) <> 2 then
    raise exception 'RN-INT-06 FALLIDO: cada fallo deja su apunte (hay %)', (select count(*) from public.audit_log where action = 'integration.sync_failed' and entity_id = v_clarity) using errcode = 'assert_failure';
  end if;

  -- El último dato válido sigue: PageSpeed en Casa Archivo termina bien y
  -- después falla; su punto y su última sincronización correcta quedan.
  perform public.finish_integration_run((select v from it_ids where k = 'run_psi_1'), 'succeeded', null, null,
    jsonb_build_array(jsonb_build_object('metric', 'performance_score', 'dimension', 'mobile',
                                         'period_start', current_date - 1, 'period_end', current_date - 1, 'value', 71)));
  update public.integrations set next_attempt_at = now() where id = (select v from it_ids where k = 'psi');
  perform public.finish_integration_run(
    (select run_id from public.claim_integration_runs(10) where integration_id = (select v from it_ids where k = 'psi')),
    'failed', 'transient', 'HTTP 503');
  if (select last_success_at from public.integrations where id = (select v from it_ids where k = 'psi')) is null
     or (select count(*) from public.metric_points where integration_id = (select v from it_ids where k = 'psi')) <> 1 then
    raise exception 'RN-INT-04/07 FALLIDO: un fallo borró el último dato válido o su fecha' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-INT-04 · hace falta volver a autorizar: "Requiere atención", sin
-- reintento, aviso también a los propietarios del restaurante; la
-- credencial nueva la rescata.
-- ============================================================
do $$
declare v_ga4 uuid := (select v from it_ids where k = 'ga4'); v_n integer; v_cred uuid;
begin
  update public.integrations set next_attempt_at = now() where id = v_ga4;
  perform public.finish_integration_run(
    (select run_id from public.claim_integration_runs(10) where integration_id = v_ga4),
    'failed', 'authorization', 'invalid_grant: Token has been expired or revoked.');

  if (select status from public.integrations where id = v_ga4) <> 'needs_attention'
     or (select next_attempt_at from public.integrations where id = v_ga4) is not null then
    raise exception 'RN-INT-03/04 FALLIDO: un fallo de autorización debía dejar "Requiere atención" sin siguiente intento' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.claim_integration_runs(10) where integration_id = v_ga4) then
    raise exception 'RN-INT-04 FALLIDO: una integración que requiere atención se volvió a reclamar' using errcode = 'assert_failure';
  end if;

  -- Propietario, administrador, propietario local y propietario global.
  select count(*) into v_n from public.notifications
  where event_type = 'integration_reauthorization_required' and entity_id = v_ga4;
  if v_n <> 4 then
    raise exception 'RN-INT-04 FALLIDO: volver a autorizar debía avisar a 4 (equipo y propietarios del restaurante) y avisó a %', v_n using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.notifications where event_type = 'integration_reauthorization_required' and entity_id = v_ga4
             and recipient_id in ('dd000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000006', 'dd000000-0000-0000-0000-000000000007')) then
    raise exception 'RN-INT-04 FALLIDO: se avisó a la trabajadora, al Editor o a Consulta de volver a autorizar' using errcode = 'assert_failure';
  end if;
  if (select audience from public.notifications where event_type = 'integration_reauthorization_required' and entity_id = v_ga4
      and recipient_id = 'dd000000-0000-0000-0000-000000000005') <> 'client' then
    raise exception 'RN-INT-04 FALLIDO: el aviso al restaurante no va con audiencia de cliente' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action = 'integration.reauthorization_required' and entity_id = v_ga4) <> 1 then
    raise exception 'RN-INT-06 FALLIDO: el fallo de autorización no dejó su apunte' using errcode = 'assert_failure';
  end if;

  -- El propietario local vuelve a autorizar: la anterior queda sustituida
  -- y la integración vuelve a "Conectada" con intento inmediato.
  v_cred := public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000005', 'oauth_refresh_token',
              'enc:v1:ga4-refresh-2', 1, null, 'casa.analitica@gmail.com');
  if (select status from public.integrations where id = v_ga4) <> 'connected'
     or (select next_attempt_at from public.integrations where id = v_ga4) > now()
     or (select consecutive_failures from public.integrations where id = v_ga4) <> 0 then
    raise exception 'RN-INT-04 FALLIDO: volver a autorizar no rescata la integración' using errcode = 'assert_failure';
  end if;
  if (select replaced_at from public.integration_credentials where id = (select v from it_ids where k = 'cred_ga4_1')) is null then
    raise exception 'RN-DAT-06 FALLIDO: la credencial anterior no quedó marcada como sustituida' using errcode = 'assert_failure';
  end if;
  if (select ciphertext from public.read_integration_credential(v_ga4)) <> 'enc:v1:ga4-refresh-2' then
    raise exception 'RN-INT-02 FALLIDO: la cola no lee la credencial nueva' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action = 'integration.credential_replaced' and entity_id = v_ga4) <> 1 then
    raise exception 'RN-INT-06 FALLIDO: sustituir la credencial no dejó su apunte' using errcode = 'assert_failure';
  end if;
  -- El fallo de configuración también deja "Requiere atención" y avisa solo al equipo.
  update public.integrations set next_attempt_at = now() where id = v_ga4;
  perform public.finish_integration_run(
    (select run_id from public.claim_integration_runs(10) where integration_id = v_ga4),
    'failed', 'configuration', 'La propiedad properties/123456 ya no existe');
  if (select status from public.integrations where id = v_ga4) <> 'needs_attention' then
    raise exception 'RN-INT-03 FALLIDO: un fallo de configuración no deja "Requiere atención"' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.notifications where event_type = 'integration_sync_failed' and entity_id = v_ga4 and audience = 'staff') <> 2
     or exists (select 1 from public.notifications where event_type = 'integration_sync_failed' and entity_id = v_ga4 and audience = 'client') then
    raise exception 'RN-INT-04 FALLIDO: un fallo de configuración debía avisar solo al equipo' using errcode = 'assert_failure';
  end if;
  perform public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000005', 'oauth_refresh_token',
            'enc:v1:ga4-refresh-3', 1, null, null, 'properties/654321');
end $$;

-- ============================================================
-- RN-INT-02 · la comprobación: la pide quien gestiona, una vez, va la
-- primera y no importa datos. No existe "Sincronizar ahora".
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.request_integration_check((select v from it_ids where k = 'ga4'));
    raise exception 'RN-INT-05 FALLIDO: una trabajadora pidió una comprobación' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_a uuid; v_b uuid;
begin
  v_a := public.request_integration_check((select v from it_ids where k = 'ga4'));
  v_b := public.request_integration_check((select v from it_ids where k = 'ga4'));
  if v_a <> v_b then
    raise exception 'CA-17 FALLIDO: pedir dos veces la comprobación creó dos ejecuciones' using errcode = 'assert_failure';
  end if;
  insert into it_ids values ('check_1', v_a);
  begin
    perform public.request_integration_check((select v from it_ids where k = 'gsc'));
    raise exception 'RN-INT-02 FALLIDO: se comprobó una integración pendiente de autorización' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Solo se comprueba%' then raise; end if;
  end;
  -- El administrador sí ve las ejecuciones, sin la columna de quién las pidió.
  if (select count(*) from public.sync_runs where integration_id = (select v from it_ids where k = 'ga4')) < 4 then
    raise exception 'RN-INT-09 FALLIDO: el administrador no ve las ejecuciones' using errcode = 'assert_failure';
  end if;
  begin
    perform requested_by from public.sync_runs limit 1;
    raise exception 'P7 FALLIDO: requested_by se lee por SELECT' using errcode = 'assert_failure';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare v_row record; v_ga4 uuid := (select v from it_ids where k = 'ga4'); v_before integer;
begin
  select count(*) into v_before from public.metric_points where integration_id = v_ga4;
  -- GA4 está conectada con intento inmediato Y tiene una comprobación
  -- pendiente: con límite 1 sale la comprobación, que va primero.
  select * into v_row from public.claim_integration_runs(1);
  if v_row.run_id <> (select v from it_ids where k = 'check_1') or v_row.kind <> 'check' or v_row.period_start is not null then
    raise exception 'RN-INT-02 FALLIDO: la comprobación pedida no fue lo primero que se reclamó' using errcode = 'assert_failure';
  end if;
  if (select status from public.integrations where id = v_ga4) <> 'connected' then
    raise exception 'RN-INT-03 FALLIDO: reclamar una comprobación cambió el estado de la integración' using errcode = 'assert_failure';
  end if;
  perform public.finish_integration_run(v_row.run_id, 'succeeded', null, null, '[]'::jsonb, 'casa.analitica@gmail.com');
  if (select status from public.sync_runs where id = v_row.run_id) <> 'succeeded'
     or (select count(*) from public.metric_points where integration_id = v_ga4) <> v_before then
    raise exception 'RN-INT-02 FALLIDO: la comprobación importó datos o no quedó cerrada' using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.audit_log where action = 'integration.checked' and entity_id = v_ga4
                 and actor_id = 'dd000000-0000-0000-0000-000000000002' and (new_value->>'ok')::boolean) then
    raise exception 'RN-INT-06 FALLIDO: la comprobación no dejó apunte con quien la pidió' using errcode = 'assert_failure';
  end if;

  -- Una comprobación que falla por autorización deja "Requiere atención";
  -- una correcta la saca de ahí.
  update public.integrations set status = 'needs_attention', next_attempt_at = null, last_failure_kind = 'authorization' where id = v_ga4;
  insert into public.sync_runs (space_id, establishment_id, integration_id, kind, status, requested_by)
  values ('dd100000-0000-0000-0000-000000000001', 'dd400000-0000-0000-0000-000000000001', v_ga4, 'check', 'pending',
          'dd000000-0000-0000-0000-000000000001');
  perform public.finish_integration_run((select run_id from public.claim_integration_runs(1) where kind = 'check'), 'succeeded');
  if (select status from public.integrations where id = v_ga4) <> 'connected'
     or (select next_attempt_at from public.integrations where id = v_ga4) is null then
    raise exception 'RN-INT-02 FALLIDO: una comprobación correcta no saca a la integración de "Requiere atención"' using errcode = 'assert_failure';
  end if;

  -- No existe ninguna función de "sincronizar ahora" abierta a una persona.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname ~ 'sync_now|sync_integration_now|run_integration_sync'
  ) then
    raise exception 'RN-INT-03 FALLIDO: existe una función de "Sincronizar ahora"' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-INT-06/07 · desconectar: revoca la credencial, deja pendiente la
-- revocación remota, conserva los datos; dos veces, una desconexión.
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  begin
    perform public.disconnect_integration((select v from it_ids where k = 'ga4'), 'Probando');
    raise exception 'RN-INT-05 FALLIDO: una trabajadora desconectó una integración' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%No tienes permiso%' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
declare v_ga4 uuid := (select v from it_ids where k = 'ga4'); v_row record;
begin
  perform public.disconnect_integration(v_ga4, 'Cambio de agencia');
  perform public.disconnect_integration(v_ga4, 'Cambio de agencia'); -- CA-17

  select * into v_row from public.establishment_integrations('dd400000-0000-0000-0000-000000000001') where provider = 'ga4';
  if v_row.status <> 'disconnected' or not v_row.external_revocation_pending or v_row.next_attempt_at is not null then
    raise exception 'RN-INT-06 FALLIDO: desconectar una OAuth debía dejar disconnected, con la revocación remota pendiente y sin siguiente intento' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where action = 'integration.disconnected' and entity_id = v_ga4) <> 1 then
    raise exception 'RN-INT-06 / CA-17 FALLIDO: desconectar dos veces dejó % apuntes', (select count(*) from public.audit_log where action = 'integration.disconnected' and entity_id = v_ga4) using errcode = 'assert_failure';
  end if;
  if (select reason from public.audit_log where action = 'integration.disconnected' and entity_id = v_ga4) <> 'Cambio de agencia' then
    raise exception '§21.2 FALLIDO: la desconexión no guardó el motivo' using errcode = 'assert_failure';
  end if;
  -- RN-INT-07: los datos se conservan.
  if (select count(*) from public.metric_points where integration_id = v_ga4) <> 3 then
    raise exception 'RN-INT-07 FALLIDO: desconectar borró puntos importados' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

do $$
declare v_ga4 uuid := (select v from it_ids where k = 'ga4');
begin
  if exists (select 1 from public.integration_credentials where integration_id = v_ga4 and revoked_at is null and replaced_at is null) then
    raise exception 'RN-INT-06 FALLIDO: desconectar no revocó la credencial vigente' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.read_integration_credential(v_ga4)) then
    raise exception 'RN-INT-06 FALLIDO: la cola sigue leyendo una credencial revocada' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.claim_integration_runs(10) where integration_id = v_ga4) then
    raise exception 'RN-INT-06 FALLIDO: una integración desconectada se reclamó' using errcode = 'assert_failure';
  end if;
  -- Sobre una desconectada no se guarda credencial sin volver a empezar.
  begin
    perform public.store_integration_credential(v_ga4, 'dd000000-0000-0000-0000-000000000005', 'oauth_refresh_token', 'enc:v1:x', 1);
    raise exception 'RN-INT-02 FALLIDO: se guardó una credencial sobre una integración desconectada' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%Empieza la conexión%' then raise; end if;
  end;
  -- La revocación remota, hecha por la cola.
  perform public.mark_integration_revocation_done(v_ga4);
  if (select external_revocation_pending from public.integrations where id = v_ga4) then
    raise exception 'RN-INT-06 FALLIDO: la revocación remota no se da por hecha' using errcode = 'assert_failure';
  end if;
end $$;

-- Volver a empezar tras desconectar: la misma fila, pendiente otra vez, y
-- el restaurante la ve así.
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000010', false);
set role authenticated;
do $$
begin
  if public.begin_integration_connection('dd400000-0000-0000-0000-000000000001', 'ga4') <> (select v from it_ids where k = 'ga4') then
    raise exception 'RN-INT-01 FALLIDO: reconectar creó otra fila' using errcode = 'assert_failure';
  end if;
  if (select status from public.establishment_integrations('dd400000-0000-0000-0000-000000000001') where provider = 'ga4') <> 'pending_authorization' then
    raise exception 'RN-INT-03 FALLIDO: reconectar no vuelve a "Pendiente de autorización"' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-INT-06 · archivar el restaurante desconecta y revoca; los datos quedan.
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_psi uuid := (select v from it_ids where k = 'psi');
begin
  perform public.set_establishment_status('dd400000-0000-0000-0000-000000000002', 'archived', 'Cierre del negocio');
  if (select status from public.integrations where id = v_psi) <> 'disconnected' then
    raise exception 'RN-INT-06 FALLIDO: archivar el restaurante no desconectó su integración' using errcode = 'assert_failure';
  end if;
  if (select reason from public.audit_log where action = 'integration.disconnected' and entity_id = v_psi) not like 'Restaurante archivado%' then
    raise exception 'RN-INT-06 FALLIDO: la desconexión por archivado no dice su motivo' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.metric_points where integration_id = v_psi) <> 1 then
    raise exception 'RN-INT-07 FALLIDO: archivar borró los datos importados' using errcode = 'assert_failure';
  end if;
  begin
    perform public.begin_integration_connection('dd400000-0000-0000-0000-000000000002', 'ga4');
    raise exception 'RN-INT-06 FALLIDO: un restaurante archivado empezó una conexión' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%archivado%' then raise; end if;
  end;
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.integration_credentials where integration_id = (select v from it_ids where k = 'psi') and revoked_at is null) then
    raise exception 'RN-INT-06 FALLIDO: archivar no revocó la clave' using errcode = 'assert_failure';
  end if;
  -- Una clave no es un token: no hay revocación remota pendiente.
  if (select external_revocation_pending from public.integrations where id = (select v from it_ids where k = 'psi')) then
    raise exception 'RN-INT-06 FALLIDO: una clave API quedó con revocación remota pendiente' using errcode = 'assert_failure';
  end if;
end $$;

-- ============================================================
-- RN-INT-09 · un restaurante suspendido no se sincroniza; al reactivar, sí.
-- ============================================================
do $$
declare v_int uuid := (select v from it_ids where k = 'ga4_susp');
begin
  perform public.store_integration_credential(v_int, 'dd000000-0000-0000-0000-000000000001', 'oauth_refresh_token', 'enc:v1:susp', 1);
  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = 'suspended' where id = 'dd400000-0000-0000-0000-000000000003';
  perform set_config('cuotly.status_change', 'off', true);
  if exists (select 1 from public.claim_integration_runs(10) where integration_id = v_int) then
    raise exception 'RN-INT-06/09 FALLIDO: se sincronizó un restaurante suspendido' using errcode = 'assert_failure';
  end if;
  if (select status from public.integrations where id = v_int) <> 'connected' then
    raise exception 'RN-INT-06 FALLIDO: suspender por impago desconectó la integración (solo debía detenerla)' using errcode = 'assert_failure';
  end if;
  perform set_config('cuotly.status_change', 'on', true);
  update public.establishments set status = 'active' where id = 'dd400000-0000-0000-0000-000000000003';
  perform set_config('cuotly.status_change', 'off', true);
  if not exists (select 1 from public.claim_integration_runs(10) where integration_id = v_int) then
    raise exception 'RN-INT-09 FALLIDO: reactivado el restaurante, no se retomó la sincronización' using errcode = 'assert_failure';
  end if;
  perform public.finish_integration_run((select id from public.sync_runs where integration_id = v_int and status = 'running'), 'succeeded');

  -- Un resultado sin motivo de fallo no cierra nada (RN-INT-08).
  update public.integrations set next_attempt_at = now() where id = v_int;
  begin
    perform public.finish_integration_run((select run_id from public.claim_integration_runs(10) where integration_id = v_int), 'failed');
    raise exception 'RN-INT-08 FALLIDO: se cerró un fallo sin motivo' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%necesita su motivo%' then raise; end if;
  end;
end $$;

-- ============================================================
-- §21.2 · la auditoría de la familia `integration` la ve la cartera
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.audit_log where action like 'integration.%') <> 0 then
    raise exception '§21.2 FALLIDO: una trabajadora ve la auditoría de integraciones' using errcode = 'assert_failure';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.audit_log where action like 'integration.%') < 10 then
    raise exception '§21.2 FALLIDO: el administrador no ve la auditoría de integraciones' using errcode = 'assert_failure';
  end if;
  if public.audit_action_capability('integration.connected') <> 'manage_clients' then
    raise exception '§21.2 FALLIDO: la familia integration no es de la cartera' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- P7 · el restaurante lee sus datos y no la organización interna
-- ============================================================
select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000007', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.metric_points where establishment_id = 'dd400000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'RN-INT-07 FALLIDO: Consulta no lee los datos importados de su restaurante' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.sync_runs) <> 0 or (select count(*) from public.integration_credentials) <> 0 then
    raise exception 'P7 FALLIDO: el restaurante ve ejecuciones o credenciales' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- Privilegios: internas cerradas, públicas para authenticated y no anon;
-- sin escritura directa en ninguna de las cuatro tablas.
-- ============================================================
do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'integration_client_owner_as(uuid, uuid)', 'assert_can_manage_integrations(uuid, uuid)',
    'notify_integration_event(uuid, text, uuid)', 'disconnect_integration_internal(uuid, uuid, text)',
    'store_integration_credential(uuid, uuid, text, text, integer, timestamptz, text, text)',
    'read_integration_credential(uuid)', 'claim_integration_runs(integer)',
    'finish_integration_run(uuid, text, text, text, jsonb, text)', 'mark_integration_revocation_done(uuid)',
    'revoke_integrations_on_archive()']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute')
       or has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta por RPC', v_fn using errcode = 'assert_failure';
    end if;
  end loop;
  foreach v_fn in array array[
    'begin_integration_connection(uuid, text)', 'cancel_integration_connection(uuid)',
    'disconnect_integration(uuid, text)', 'request_integration_check(uuid)', 'establishment_integrations(uuid)',
    'integration_auth_kind(text)', 'integration_sync_frequency(text)', 'integration_retry_delay(integer)',
    'integration_data_is_stale(text, timestamptz, timestamptz)']
  loop
    if has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta a anon', v_fn using errcode = 'assert_failure';
    end if;
    if not has_function_privilege('authenticated', 'public.' || v_fn, 'execute') then
      raise exception 'FALLIDO: % no la puede llamar authenticated', v_fn using errcode = 'assert_failure';
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.integration_credentials'::regclass, 'ciphertext', 'select')
     or has_column_privilege('anon', 'public.integration_credentials'::regclass, 'ciphertext', 'select') then
    raise exception 'RN-INT-02 FALLIDO: ciphertext tiene privilegio de SELECT' using errcode = 'assert_failure';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    insert into public.integrations (space_id, establishment_id, provider, auth_kind)
    values ('dd100000-0000-0000-0000-000000000001', 'dd400000-0000-0000-0000-000000000001', 'business_profile', 'oauth');
    v_ok := true;
  exception when insufficient_privilege then null;
  end;
  if v_ok then raise exception 'CLAUDE.md MUST FALLIDO: integrations admite escritura directa' using errcode = 'assert_failure'; end if;

  v_ok := false;
  begin
    insert into public.integration_credentials (space_id, integration_id, kind, ciphertext, key_version)
    values ('dd100000-0000-0000-0000-000000000001', (select v from it_ids where k = 'clarity'), 'api_key', 'enc:x', 1);
    v_ok := true;
  exception when insufficient_privilege then null;
  end;
  if v_ok then raise exception 'CLAUDE.md MUST FALLIDO: integration_credentials admite escritura directa' using errcode = 'assert_failure'; end if;

  v_ok := false;
  begin
    insert into public.sync_runs (space_id, establishment_id, integration_id, kind)
    values ('dd100000-0000-0000-0000-000000000001', 'dd400000-0000-0000-0000-000000000001', (select v from it_ids where k = 'clarity'), 'check');
    v_ok := true;
  exception when insufficient_privilege then null;
  end;
  if v_ok then raise exception 'CLAUDE.md MUST FALLIDO: sync_runs admite escritura directa' using errcode = 'assert_failure'; end if;

  v_ok := false;
  begin
    insert into public.metric_points (space_id, establishment_id, integration_id, provider, metric, period_start, period_end, value)
    values ('dd100000-0000-0000-0000-000000000001', 'dd400000-0000-0000-0000-000000000001', (select v from it_ids where k = 'clarity'), 'clarity', 'sessions', current_date, current_date, 1);
    v_ok := true;
  exception when insufficient_privilege then null;
  end;
  if v_ok then raise exception 'CLAUDE.md MUST FALLIDO: metric_points admite escritura directa' using errcode = 'assert_failure'; end if;

  v_ok := false;
  begin
    update public.integrations set status = 'connected' where id = (select v from it_ids where k = 'ga4');
    v_ok := found;
  exception when insufficient_privilege then null;
  end;
  if v_ok then raise exception 'CLAUDE.md MUST FALLIDO: el propietario cambia el estado de una integración por UPDATE' using errcode = 'assert_failure'; end if;
end $$;
reset role;

-- Limpieza.
delete from public.audit_log where space_id in ('dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000002');
delete from public.spaces where id in ('dd100000-0000-0000-0000-000000000001', 'dd100000-0000-0000-0000-000000000002');
delete from auth.users where id in (
  'dd000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000002',
  'dd000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000004',
  'dd000000-0000-0000-0000-000000000005', 'dd000000-0000-0000-0000-000000000006',
  'dd000000-0000-0000-0000-000000000007', 'dd000000-0000-0000-0000-000000000008',
  'dd000000-0000-0000-0000-000000000010');
drop table it_ids;

do $$ begin raise notice 'integraciones_conexiones_y_sincronizacion: OK'; end $$;
