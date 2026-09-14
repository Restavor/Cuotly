-- Fase 3 · Hito 14 · la revocación remota del token, hecha por el proceso
-- de la cola (migración 82; RN-INT-06 y RN-INT-08; §119 y §163).
--
--   · RN-INT-06: desconectar deja la revocación remota pendiente y la
--     cola la ve; una clave API no tiene nada que revocar en Google.
--   · RN-INT-06: el token ya revocado en la base tiene una puerta, solo
--     mientras la revocación siga pendiente, y solo para service_role.
--   · RN-INT-08: correcta, cerrada; el primer fallo transitorio queda
--     pendiente; el segundo cierra con el motivo en la auditoría; un fallo
--     sin motivo no se anota; cerrar dos veces no hace nada más (CA-17).
--   · Las tres funciones están cerradas por RPC y la columna nueva no la
--     lee nadie con sesión.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/integraciones_revocacion_remota.sql

insert into auth.users (id, email, role, aud) values
  ('de000000-0000-0000-0000-000000000001', 'rv-owner@example.com', 'authenticated', 'authenticated'),
  ('de000000-0000-0000-0000-000000000005', 'rv-local@example.com', 'authenticated', 'authenticated');

insert into public.spaces (id, name, slug, timezone, created_by) values
  ('de100000-0000-0000-0000-000000000001', 'Espacio Revocación', 'espacio-revocacion-test', 'Europe/Madrid',
   'de000000-0000-0000-0000-000000000001');

insert into public.space_memberships (space_id, user_id, role, status) values
  ('de100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', 'owner', 'active');

insert into public.groups (id, space_id, name) values
  ('de300000-0000-0000-0000-000000000001', 'de100000-0000-0000-0000-000000000001', 'Grupo R');

insert into public.establishments (id, space_id, group_id, code, name, status) values
  ('de400000-0000-0000-0000-000000000001', 'de100000-0000-0000-0000-000000000001',
   'de300000-0000-0000-0000-000000000001', 'RV-0001', 'Casa Revocada', 'active');

insert into public.establishment_memberships (establishment_id, user_id, role) values
  ('de400000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000005', 'local_owner');

create temp table rv_ids (k text primary key, v uuid);
grant select, insert, update on rv_ids to authenticated, service_role;

-- ============================================================
-- Fixture: GA4 conectada por OAuth y Clarity por clave, las dos
-- desconectadas después por el propietario del espacio.
-- ============================================================
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000001', false);
set role authenticated;
insert into rv_ids values
  ('ga4', public.begin_integration_connection('de400000-0000-0000-0000-000000000001', 'ga4')),
  ('clarity', public.begin_integration_connection('de400000-0000-0000-0000-000000000001', 'clarity'));
reset role;

set role service_role;
select public.store_integration_credential((select v from rv_ids where k = 'ga4'),
  'de000000-0000-0000-0000-000000000005', 'oauth_refresh_token', 'cv1.1.iv.tag.token-cifrado', 1,
  null, 'cuenta@gmail.com', 'properties/123');
select public.store_integration_credential((select v from rv_ids where k = 'clarity'),
  'de000000-0000-0000-0000-000000000001', 'api_key', 'cv1.1.iv.tag.clave-cifrada', 1);
reset role;

-- Antes de desconectar, la cola no tiene nada que revocar.
set role service_role;
do $$
begin
  if (select count(*) from public.pending_integration_revocations(10)
      where establishment_id = 'de400000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'RN-INT-06 FALLIDO: una integración conectada aparece como pendiente de revocar' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.disconnect_integration((select v from rv_ids where k = 'ga4'), 'Cambio de cuenta');
select public.disconnect_integration((select v from rv_ids where k = 'clarity'), 'Ya no se usa');
reset role;

-- ============================================================
-- RN-INT-06 · desconectar deja la revocación pendiente, solo con OAuth
-- ============================================================
set role service_role;
do $$
declare
  v_ga4 uuid := (select v from rv_ids where k = 'ga4');
  v_clarity uuid := (select v from rv_ids where k = 'clarity');
  v_n integer;
  v_ct text;
begin
  select count(*) into v_n from public.pending_integration_revocations(10)
  where establishment_id = 'de400000-0000-0000-0000-000000000001';
  if v_n <> 1 then
    raise exception 'RN-INT-06 FALLIDO: tras desconectar GA4 (OAuth) y Clarity (clave) hay % pendientes de revocar; debería haber 1', v_n using errcode = 'assert_failure';
  end if;
  if not exists (select 1 from public.pending_integration_revocations(10) where integration_id = v_ga4 and attempts = 0) then
    raise exception 'RN-INT-06 FALLIDO: la pendiente no es la de GA4, o no empieza con cero intentos' using errcode = 'assert_failure';
  end if;

  -- La puerta al token revocado: devuelve el texto cifrado que se guardó.
  select ciphertext into v_ct from public.read_revoked_integration_token(v_ga4);
  if v_ct is distinct from 'cv1.1.iv.tag.token-cifrado' then
    raise exception 'RN-INT-06 FALLIDO: la cola no puede leer el token revocado que tiene que revocar en Google (leyó %)', v_ct using errcode = 'assert_failure';
  end if;
  -- Y `read_integration_credential()` sigue sin devolverlo: ya no está vigente.
  if exists (select 1 from public.read_integration_credential(v_ga4)) then
    raise exception 'RN-INT-06 FALLIDO: una credencial revocada sigue apareciendo como vigente' using errcode = 'assert_failure';
  end if;
  -- Clarity no tiene token que revocar.
  if exists (select 1 from public.read_revoked_integration_token(v_clarity)) then
    raise exception 'RN-INT-06 FALLIDO: una clave API aparece como token revocable en Google' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- RN-INT-08 · el resultado de los intentos
-- ============================================================
set role service_role;
do $$
declare
  v_ga4 uuid := (select v from rv_ids where k = 'ga4');
  v_done boolean;
  v_pending boolean;
  v_attempts integer;
  v_n integer;
begin
  -- Un fallo sin motivo no se anota.
  begin
    perform public.record_integration_revocation_attempt(v_ga4, false, null);
    raise exception 'RN-INT-08 FALLIDO: se anotó un fallo de revocación sin motivo' using errcode = 'assert_failure';
  exception when others then
    if sqlerrm not like '%necesita su motivo%' then raise; end if;
  end;

  -- Primer fallo transitorio: sigue pendiente, con un intento contado.
  v_done := public.record_integration_revocation_attempt(v_ga4, false, 'Google respondió 503');
  select external_revocation_pending, external_revocation_attempts into v_pending, v_attempts
  from public.integrations where id = v_ga4;
  if v_done or not v_pending or v_attempts <> 1 then
    raise exception 'RN-INT-08 FALLIDO: el primer fallo debía dejar la revocación pendiente con 1 intento (done=%, pending=%, attempts=%)', v_done, v_pending, v_attempts using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'integration' and entity_id = v_ga4 and action = 'integration.revocation_failed'
      and (new_value->>'gave_up')::boolean = false
      and new_value->>'error' = 'Google respondió 503'
  ) then
    raise exception 'RN-INT-06 FALLIDO: el fallo de revocación no quedó auditado con su motivo (§119)' using errcode = 'assert_failure';
  end if;
  -- El token sigue teniendo puerta mientras esté pendiente.
  if not exists (select 1 from public.read_revoked_integration_token(v_ga4)) then
    raise exception 'RN-INT-08 FALLIDO: tras el primer fallo la cola ya no puede leer el token para reintentar' using errcode = 'assert_failure';
  end if;

  -- Segundo fallo: "una vez" (RN-INT-08). Se cierra y se dice que se dejó.
  v_done := public.record_integration_revocation_attempt(v_ga4, false, 'Google respondió 503 otra vez');
  select external_revocation_pending, external_revocation_attempts into v_pending, v_attempts
  from public.integrations where id = v_ga4;
  if not v_done or v_pending or v_attempts <> 2 then
    raise exception 'RN-INT-08 FALLIDO: el segundo fallo debía cerrar la pendiente (done=%, pending=%, attempts=%)', v_done, v_pending, v_attempts using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'integration' and entity_id = v_ga4 and action = 'integration.revocation_failed'
      and (new_value->>'gave_up')::boolean = true
  ) then
    raise exception 'RN-INT-08 FALLIDO: dejar de intentarlo no quedó dicho en la auditoría' using errcode = 'assert_failure';
  end if;
  -- Cerrada, el token ya no tiene puerta y la cola no la vuelve a ver.
  if exists (select 1 from public.read_revoked_integration_token(v_ga4)) then
    raise exception 'RN-INT-06 FALLIDO: cerrada la revocación, el token revocado sigue teniendo puerta' using errcode = 'assert_failure';
  end if;
  if exists (select 1 from public.pending_integration_revocations(10) where integration_id = v_ga4) then
    raise exception 'RN-INT-08 FALLIDO: una revocación cerrada sigue en la lista de pendientes' using errcode = 'assert_failure';
  end if;

  -- CA-17: anotar sobre una cerrada no hace nada más.
  select count(*) into v_n from public.audit_log where entity_type = 'integration' and entity_id = v_ga4 and action like 'integration.revocation_%';
  if public.record_integration_revocation_attempt(v_ga4, true, null) then
    raise exception 'CA-17 FALLIDO: anotar sobre una revocación cerrada devolvió true' using errcode = 'assert_failure';
  end if;
  if (select count(*) from public.audit_log where entity_type = 'integration' and entity_id = v_ga4 and action like 'integration.revocation_%') <> v_n then
    raise exception 'CA-17 FALLIDO: anotar sobre una revocación cerrada escribió auditoría' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Reconectar y desconectar otra vez: la revocación correcta cierra a la primera.
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.begin_integration_connection('de400000-0000-0000-0000-000000000001', 'ga4');
reset role;
set role service_role;
select public.store_integration_credential((select v from rv_ids where k = 'ga4'),
  'de000000-0000-0000-0000-000000000005', 'oauth_refresh_token', 'cv1.1.iv.tag.token-nuevo', 1,
  null, 'cuenta@gmail.com', 'properties/123');
reset role;
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000001', false);
set role authenticated;
select public.disconnect_integration((select v from rv_ids where k = 'ga4'), 'Otra vez');
reset role;

set role service_role;
do $$
declare
  v_ga4 uuid := (select v from rv_ids where k = 'ga4');
  v_ct text;
  v_pending boolean;
  v_attempts integer;
begin
  select external_revocation_pending, external_revocation_attempts into v_pending, v_attempts
  from public.integrations where id = v_ga4;
  if not v_pending then
    raise exception 'RN-INT-06 FALLIDO: la segunda desconexión no dejó la revocación pendiente' using errcode = 'assert_failure';
  end if;
  -- Es el token NUEVO el que hay que revocar, no el de la primera conexión.
  select ciphertext into v_ct from public.read_revoked_integration_token(v_ga4);
  if v_ct is distinct from 'cv1.1.iv.tag.token-nuevo' then
    raise exception 'RN-INT-06 FALLIDO: la cola leería el token viejo (%) en vez del último revocado', v_ct using errcode = 'assert_failure';
  end if;

  if not public.record_integration_revocation_attempt(v_ga4, true, null) then
    raise exception 'RN-INT-08 FALLIDO: una revocación correcta no cerró la pendiente' using errcode = 'assert_failure';
  end if;
  if not exists (
    select 1 from public.audit_log
    where entity_type = 'integration' and entity_id = v_ga4 and action = 'integration.revocation_done'
  ) then
    raise exception 'RN-INT-06 FALLIDO: la revocación hecha no quedó auditada (§119)' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- ============================================================
-- Cerradas por RPC y la columna tapada
-- ============================================================
select set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $$
declare
  v_ga4 uuid := (select v from rv_ids where k = 'ga4');
  v_ok boolean;
  v_fn text;
begin
  foreach v_fn in array array['pending_integration_revocations(integer)', 'read_revoked_integration_token(uuid)',
                              'record_integration_revocation_attempt(uuid, boolean, text)'] loop
    if has_function_privilege('authenticated', 'public.' || v_fn, 'execute')
       or has_function_privilege('anon', 'public.' || v_fn, 'execute') then
      raise exception 'CLAUDE.md MUST FALLIDO: % está abierta por RPC', v_fn using errcode = 'assert_failure';
    end if;
  end loop;

  v_ok := false;
  begin
    perform external_revocation_attempts from public.integrations where id = v_ga4;
    v_ok := true;
  exception when insufficient_privilege then null;
  end;
  if v_ok then
    raise exception 'CLAUDE.md MUST FALLIDO: una sesión lee integrations.external_revocation_attempts' using errcode = 'assert_failure';
  end if;
end $$;
reset role;

-- Limpieza.
delete from public.audit_log where space_id = 'de100000-0000-0000-0000-000000000001';
delete from public.spaces where id = 'de100000-0000-0000-0000-000000000001';
delete from auth.users where id in ('de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000005');
drop table rv_ids;

do $$ begin raise notice 'integraciones_revocacion_remota: OK'; end $$;
