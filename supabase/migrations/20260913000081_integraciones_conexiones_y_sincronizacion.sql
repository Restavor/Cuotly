-- Fase 3 · Hito 13 · Integraciones analíticas: conexiones, credenciales
-- cifradas, estados y la sincronización programada (PRD §27, RN-INT-01 a
-- 09; §115 a §122, §126, §94, §163 y §178 de la maestra).
--
-- Primer hito de la Fase 3, con el mismo corte que los hitos 5, 6 y 9:
-- **servidor y dominio, sin pantallas**. Lo que hay aquí es todo lo que
-- las pantallas del Hito 14 (Ajustes › Integraciones, el bloque de la
-- ficha, "Informes y datos") y los cinco adaptadores van a llamar.
--
-- Cuatro tablas:
--
--   · `integrations` — una fila por restaurante y fuente (RN-INT-01), con
--     los siete estados de §117 (RN-INT-03) y lo que §117 manda enseñar:
--     cuenta, última sincronización, siguiente intento y error. Sin
--     política de escritura: todo pasa por funciones que auditan.
--   · `integration_credentials` — el texto CIFRADO de cada credencial
--     (RN-INT-02, §135). La base nunca ve la clave de cifrado: cifra el
--     servidor de la aplicación (`src/services/credential-vault.ts`) y
--     aquí llega el resultado. La columna `ciphertext` no tiene `select`
--     para nadie; solo `read_integration_credential()`, reservada a
--     `service_role`, la devuelve al proceso de la cola.
--   · `sync_runs` — cada ejecución de sincronización o de comprobación,
--     con estado, inicio, fin, motivo del fallo y puntos escritos
--     (RN-INT-09). Es el registro de lo que pasó; no se edita después de
--     terminar.
--   · `metric_points` — las series de métricas importadas (§92, §94). Se
--     guardan por clave natural (integración, métrica, dimensión,
--     periodo) y una pasada posterior SUSTITUYE el valor del mismo
--     periodo, porque GA4 y Search Console revisan los últimos días y el
--     dato bueno es el último. No es un libro inmutable a propósito: la
--     regla del libro (CLAUDE.md) es para consumos y dinero, y esto son
--     datos importados; lo inmutable aquí es `sync_runs`, que dice cuándo
--     y con qué resultado se importó cada cosa. `fetched_at` es la marca
--     de antigüedad de RN-INT-07 y RN-INT-08.
--
-- Lo que decide el servidor y no la pantalla:
--
--   · Quién conecta y desconecta (RN-INT-05): `manage_clients` (propietario
--     y administradores) y el propietario del restaurante (local o global
--     del grupo, `client_can_accept_terms()`, la misma lista que acepta
--     las condiciones). Un trabajador consulta y no toca. Una clave API la
--     guarda solo el propietario del espacio (`manage_space`, §126); una
--     autorización OAuth, el propietario del espacio o el del restaurante.
--   · Las frecuencias (RN-INT-04): `integration_sync_frequency()`. Los
--     reintentos: `integration_retry_delay()` (1 h, 4 h, 16 h, 24 h como
--     máximo). "Desactualizado": `integration_data_is_stale()` (sin éxito
--     en el doble de la frecuencia). Las tres son la misma cuenta que
--     `src/core/integrations.ts`, y `listas-compartidas.test.ts` vigila
--     que las listas no se separen.
--   · Al ARCHIVAR un restaurante se desconectan sus integraciones, se
--     revocan las credenciales y queda pendiente la revocación remota del
--     token, que hace el proceso de la cola (RN-INT-06, pendiente 13). Los
--     puntos importados no se tocan (RN-INT-07). Suspendido o archivado,
--     `claim_integration_runs()` no le programa nada.
--   · Dos avisos nuevos (§18): `integration_sync_failed` al propietario y
--     administradores, una vez por racha; `integration_reauthorization_required`
--     también a los propietarios del restaurante, que son quienes pueden
--     volver a autorizar (RN-INT-04).
--   · Nueve acciones de auditoría, familia `integration`, visible con
--     `manage_clients` como la del establecimiento (RN-INT-06, §21.2).
--
-- Lo que este archivo NO hace, dicho en claro:
--
--   · No habla con Google, Clarity ni PageSpeed. Los adaptadores viven en
--     `src/services/` (Hito 14); aquí está la cola que los llama
--     (`claim_integration_runs()` / `finish_integration_run()`).
--   · No existe "Sincronizar ahora" (RN-INT-03). La comprobación de §116
--     es una ejecución de tipo `check` que verifica la credencial y no
--     importa datos.
--   · No fija qué métricas guarda cada fuente más allá de aceptar el
--     nombre: §92 las nombra para GA4 y Search Console y calla para las
--     otras tres; su catálogo va con el adaptador (Hito 14).
--   · No toca oportunidades ni informes (hitos 15 y 16).
--
-- Se comprueba con `supabase/tests/integraciones_conexiones_y_sincronizacion.sql`.

-- ============================================================
-- 1 · Las cuentas que comparten SQL y `src/core/integrations.ts`
-- ============================================================

-- RN-INT-02: OAuth cuando exista, clave API solo cuando sea necesaria.
create or replace function public.integration_auth_kind(p_provider text)
returns text
language sql
immutable
as $$
  select case p_provider
    when 'ga4' then 'oauth'
    when 'search_console' then 'oauth'
    when 'business_profile' then 'oauth'
    when 'clarity' then 'api_key'
    when 'pagespeed' then 'api_key'
    else null
  end;
$$;

comment on function public.integration_auth_kind(text) is
  'RN-INT-02 · cómo se conecta cada fuente: OAuth con Google para GA4,
   Search Console y Business Profile; clave para Clarity y PageSpeed.
   NULL para una fuente que no existe.';

-- RN-INT-04: GA4 y Search Console a diario, PageSpeed semanal; Business
-- Profile y Clarity a diario (lectura de "frecuencia adaptada", pendiente
-- 13 de DECISIONES).
create or replace function public.integration_sync_frequency(p_provider text)
returns interval
language sql
immutable
as $$
  select case p_provider
    when 'ga4' then interval '1 day'
    when 'search_console' then interval '1 day'
    when 'business_profile' then interval '1 day'
    when 'clarity' then interval '1 day'
    when 'pagespeed' then interval '7 days'
    else null
  end;
$$;

comment on function public.integration_sync_frequency(text) is
  'RN-INT-04 (§118) · cada cuánto se sincroniza cada fuente.';

-- RN-INT-04: "reintenta". Espera creciente y con techo, para que una
-- fuente caída no se consulte cada minuto ni se olvide un día entero.
create or replace function public.integration_retry_delay(p_consecutive_failures integer)
returns interval
language sql
immutable
as $$
  select make_interval(hours => least(24, power(4, greatest(coalesce(p_consecutive_failures, 1), 1) - 1))::integer);
$$;

comment on function public.integration_retry_delay(integer) is
  'RN-INT-04 · cuánto espera el siguiente intento tras N fallos seguidos:
   1 h, 4 h, 16 h y 24 h como máximo (pendiente 13).';

-- RN-INT-07 / §94: "nunca se presenta información desactualizada como
-- actual". Desactualizado es no tener una sincronización correcta en el
-- doble de la frecuencia: una pasada perdida, no un retraso de minutos.
create or replace function public.integration_data_is_stale(
  p_provider text,
  p_last_success_at timestamptz,
  p_now timestamptz default now()
)
returns boolean
language sql
immutable
as $$
  select p_last_success_at is null
      or p_now - p_last_success_at > 2 * public.integration_sync_frequency(p_provider);
$$;

comment on function public.integration_data_is_stale(text, timestamptz, timestamptz) is
  'RN-INT-07 · si el último dato válido es demasiado viejo para
   presentarse como actual: sin éxito nunca, o hace más del doble de la
   frecuencia de la fuente.';

-- Las tres son cuentas puras y las lee cualquier pantalla: abiertas a
-- authenticated, cerradas a anon.
revoke all on function public.integration_auth_kind(text) from public, anon;
grant execute on function public.integration_auth_kind(text) to authenticated;
revoke all on function public.integration_sync_frequency(text) from public, anon;
grant execute on function public.integration_sync_frequency(text) to authenticated;
revoke all on function public.integration_retry_delay(integer) from public, anon;
grant execute on function public.integration_retry_delay(integer) to authenticated;
revoke all on function public.integration_data_is_stale(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.integration_data_is_stale(text, timestamptz, timestamptz) to authenticated;

-- ============================================================
-- 2 · Las tablas
-- ============================================================

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  -- RN-INT-01: las cinco fuentes de §115, y ninguna más. Reservas, delivery
  -- y LandingSite no son integraciones (§120, §121).
  provider text not null
    check (provider in ('ga4', 'search_console', 'business_profile', 'clarity', 'pagespeed')),
  -- RN-INT-03: los siete estados de §117, en su orden.
  status text not null default 'pending_authorization'
    check (status in ('not_connected', 'pending_authorization', 'connected', 'syncing', 'needs_attention', 'error', 'disconnected')),
  auth_kind text not null check (auth_kind in ('oauth', 'api_key')),
  -- §117: "se muestra cuenta". Es un nombre para reconocerla (el correo de
  -- la cuenta de Google, el nombre de la propiedad), nunca una credencial.
  account_label text,
  -- La propiedad de GA4, el sitio de Search Console, la ubicación de
  -- Business Profile, el proyecto de Clarity o la URL de PageSpeed.
  external_property_id text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  next_attempt_at timestamptz,
  -- RN-INT-08: el error, ya pasado por el filtro de secretos del proceso
  -- de la cola y recortado aquí a 500 caracteres.
  last_error text,
  last_failure_kind text
    check (last_failure_kind is null or last_failure_kind in ('transient', 'authorization', 'configuration')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  -- RN-INT-06: la revocación remota del token la hace el proceso de la
  -- cola; hasta entonces queda dicho que está pendiente.
  external_revocation_pending boolean not null default false,
  connected_at timestamptz,
  connected_by uuid references public.profiles (id),
  disconnected_at timestamptz,
  disconnected_by uuid references public.profiles (id),
  disconnect_reason text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id, provider)
);

comment on table public.integrations is
  'RN-INT-01/03 · una conexión por restaurante y fuente, con su estado de
   §117 y lo que §117 manda enseñar. Sin política de escritura: se
   conecta, comprueba y desconecta por función, y la cola la actualiza.';

alter table public.integrations enable row level security;

create index integrations_establishment_idx on public.integrations (establishment_id);
create index integrations_due_idx on public.integrations (next_attempt_at)
  where status in ('connected', 'error') and next_attempt_at is not null;

-- Quien lee el restaurante lee el estado de sus integraciones: el equipo,
-- el trabajador autorizado (§119: "consultan lo necesario") y el propio
-- restaurante. Ninguna escritura directa.
create policy integrations_select on public.integrations
for select
using (public.can_read_establishment(establishment_id));

-- P7 / CLAUDE.md: la fila es del restaurante, las columnas con identidad
-- del equipo no. Quien conectó puede ser el propio propietario del
-- restaurante, pero se tapa igual: la regla es por columna, no por caso.
revoke select on public.integrations from anon, authenticated;
grant select (id, space_id, establishment_id, provider, status, auth_kind, account_label,
              external_property_id, last_sync_at, last_success_at, next_attempt_at, last_error,
              last_failure_kind, consecutive_failures, external_revocation_pending, connected_at,
              disconnected_at, disconnect_reason, created_at, updated_at)
  on public.integrations to authenticated;

create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  kind text not null check (kind in ('oauth_refresh_token', 'api_key')),
  -- RN-INT-02 / §135: lo que la base guarda es el resultado de cifrar en
  -- el servidor de la aplicación (AES-256-GCM, `credential-vault.ts`).
  -- `key_version` dice con qué versión de la clave, para poder rotarla.
  ciphertext text not null check (length(ciphertext) > 0),
  key_version integer not null check (key_version > 0),
  expires_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Una credencial nueva sustituye a la anterior (`replaced_at`); una
  -- desconexión la revoca (`revoked_at`). Ninguna se borra: RN-DAT-06.
  replaced_at timestamptz,
  revoked_at timestamptz
);

comment on table public.integration_credentials is
  'RN-INT-02 · el texto cifrado de cada credencial. La columna ciphertext
   no la lee nadie por SELECT: solo read_integration_credential(),
   reservada a service_role. El propietario del espacio ve que existe,
   de qué tipo es y cuándo caduca, nunca su valor (§126).';

alter table public.integration_credentials enable row level security;

create index integration_credentials_integration_idx
  on public.integration_credentials (integration_id) where replaced_at is null and revoked_at is null;

-- §126: "Solo propietario introduce, sustituye o elimina credenciales
-- sensibles. Trabajadores nunca las ven." Y el propietario ve los
-- metadatos, no el valor: la columna del valor está revocada abajo.
create policy integration_credentials_select on public.integration_credentials
for select
using (public.has_capability(space_id, 'manage_space'));

revoke select on public.integration_credentials from anon, authenticated;
grant select (id, space_id, integration_id, kind, key_version, expires_at, created_at, replaced_at, revoked_at)
  on public.integration_credentials to authenticated;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  -- RN-INT-02: la comprobación (`check`) verifica la credencial y no
  -- importa datos; la sincronización (`sync`) importa.
  kind text not null check (kind in ('sync', 'check')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  requested_by uuid references public.profiles (id),
  period_start date,
  period_end date,
  started_at timestamptz,
  finished_at timestamptz,
  failure_kind text
    check (failure_kind is null or failure_kind in ('transient', 'authorization', 'configuration')),
  error text,
  points_written integer not null default 0 check (points_written >= 0),
  created_at timestamptz not null default now()
);

comment on table public.sync_runs is
  'RN-INT-09 · cada ejecución de sincronización o comprobación, con su
   resultado. La reclama y la cierra el proceso de la cola con
   service_role; una persona solo pide una comprobación. Terminada, no se
   edita.';

alter table public.sync_runs enable row level security;

create index sync_runs_integration_idx on public.sync_runs (integration_id, created_at desc);
create index sync_runs_pending_checks_idx on public.sync_runs (created_at)
  where kind = 'check' and status = 'pending';

-- La organización interna de las ejecuciones es del equipo que gestiona
-- la cartera. El restaurante ve el resumen (última sincronización, error)
-- en `integrations`, no la lista de intentos.
create policy sync_runs_select on public.sync_runs
for select
using (public.has_capability(space_id, 'manage_clients'));

revoke select on public.sync_runs from anon, authenticated;
grant select (id, space_id, establishment_id, integration_id, kind, status, period_start, period_end,
              started_at, finished_at, failure_kind, error, points_written, created_at)
  on public.sync_runs to authenticated;

create table public.metric_points (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  establishment_id uuid not null references public.establishments (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  provider text not null
    check (provider in ('ga4', 'search_console', 'business_profile', 'clarity', 'pagespeed')),
  -- El nombre de la métrica lo fija el adaptador de cada fuente (§92 para
  -- GA4 y Search Console). Aquí solo se exige que exista.
  metric text not null check (length(metric) > 0),
  -- La dimensión de un desglose (la página, la fuente de tráfico, la
  -- búsqueda); vacía para un total. Forma parte de la clave natural.
  dimension text not null default '',
  period_start date not null,
  period_end date not null,
  value numeric not null,
  unit text,
  sync_run_id uuid references public.sync_runs (id) on delete set null,
  -- RN-INT-07/08: la marca de antigüedad. Es lo que dice la pantalla
  -- cuando el dato no es de hoy.
  fetched_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (integration_id, metric, dimension, period_start, period_end)
);

comment on table public.metric_points is
  'RN-INT-07 · las series de métricas importadas (§92). Por clave natural:
   una pasada posterior sustituye el valor del mismo periodo, porque las
   fuentes revisan los últimos días. Se conservan aunque se desconecte la
   fuente o cambie el plan (§94). Lo inmutable es sync_runs.';

alter table public.metric_points enable row level security;

create index metric_points_lookup_idx
  on public.metric_points (establishment_id, provider, metric, period_start);

-- Quien lee el restaurante lee sus datos: el equipo, el trabajador
-- autorizado y el propio restaurante (§89). Aquí no hay ninguna columna
-- con identidad del equipo.
create policy metric_points_select on public.metric_points
for select
using (public.can_read_establishment(establishment_id));

-- ============================================================
-- 3 · Quién puede (RN-INT-05)
-- ============================================================

-- El propietario del restaurante, por parámetro: la versión con
-- `auth.uid()` es `client_can_accept_terms()`. Esta la necesita
-- `store_integration_credential()`, que la llama el servidor con
-- service_role y el actor por parámetro. Interna: abierta por RPC sería
-- una forma de preguntar por los permisos de cualquiera.
create or replace function public.integration_client_owner_as(p_establishment_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.establishment_memberships em
      where em.establishment_id = p_establishment_id
        and em.user_id = p_user_id
        and em.revoked_at is null
        and em.role = 'local_owner'
    )
    or exists (
      select 1 from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = p_establishment_id
        and gm.user_id = p_user_id
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    );
$$;

revoke all on function public.integration_client_owner_as(uuid, uuid) from public, anon, authenticated;

-- RN-INT-05 · quién gestiona las conexiones de un restaurante: el equipo
-- con `manage_clients` y el propietario del restaurante. Un trabajador,
-- el Editor y Consulta, no. Lanza con el motivo; no devuelve false.
create or replace function public.assert_can_manage_integrations(p_space_id uuid, p_establishment_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.has_capability(p_space_id, 'manage_clients') then
    return;
  end if;
  if public.client_can_accept_terms(p_establishment_id) then
    return;
  end if;
  raise exception 'No tienes permiso para gestionar las integraciones de este restaurante (RN-INT-05)';
end;
$$;

revoke all on function public.assert_can_manage_integrations(uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- 4 · Los avisos (§18, RN-INT-04)
-- ============================================================

alter table public.notifications
  drop constraint notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check check (event_type in (
    'request_submitted',
    'job_unassigned',
    'job_assigned',
    'job_started',
    'job_published',
    'correction_requested',
    'job_reassignment_requested',
    'task_reassignment_requested',
    'terms_version_published',
    'menu_publication_requested',
    'menu_assigned',
    'menu_needs_information',
    'menu_published',
    'menu_publication_error',
    'menu_not_prepared_reminder',
    'menu_publication_overdue',
    'quote_sent',
    'quote_accepted',
    'quote_rejected',
    'integration_sync_failed',
    'integration_reauthorization_required',
    'consumption_threshold_80',
    'consumption_threshold_100',
    't2_threshold_50',
    't2_threshold_80',
    't2_threshold_100',
    't2_critical_alert',
    't2_reassignment_suggestion',
    't3_threshold_75',
    't3_threshold_90',
    't3_threshold_100',
    'establishment_paused_nonpayment',
    'establishment_suspended_nonpayment',
    'establishment_reactivated',
    'absence_requested',
    'absence_decided',
    'absence_uncovered_jobs'
  ));

alter table public.notifications
  drop constraint notifications_entity_type_check;

alter table public.notifications
  add constraint notifications_entity_type_check check (entity_type in (
    'request', 'job', 'task', 'establishment', 'charge', 'absence', 'menu', 'quote', 'integration'
  ));

-- §118: "Propietario y administradores reciben aviso; el propietario del
-- restaurante solo si debe autorizar de nuevo." RN-NOT-01: ningún
-- trabajador. El enlace abre el bloque de integraciones de la ficha.
create or replace function public.notify_integration_event(
  p_integration_id uuid,
  p_event_type text,
  p_run_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_int public.integrations;
  v_slug text;
  v_link text;
  v_key text;
  v_recipient uuid;
  v_sent integer := 0;
begin
  select * into v_int from public.integrations where id = p_integration_id;
  if v_int.id is null then
    raise exception 'Integración no encontrada';
  end if;

  if p_event_type not in ('integration_sync_failed', 'integration_reauthorization_required') then
    raise exception 'Evento de integración desconocido: %', p_event_type;
  end if;

  v_slug := public.space_slug(v_int.space_id);
  v_link := '/espacios/' || v_slug || '/restaurantes/' || v_int.establishment_id::text
            || '?vista=gestion&bloque=integraciones';
  -- CA-17: la misma ejecución no avisa dos veces.
  v_key := p_event_type || ':' || v_int.id::text || ':' || coalesce(p_run_id::text, '-');

  for v_recipient in
    select sm.user_id
    from public.space_memberships sm
    where sm.space_id = v_int.space_id
      and sm.status = 'active'
      and sm.role in ('owner', 'admin')
  loop
    if public.emit_notification(
         v_int.space_id, v_recipient, p_event_type, 'staff',
         'integration', v_int.id, v_link, v_key, v_int.establishment_id) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  if p_event_type = 'integration_reauthorization_required' then
    for v_recipient in
      select em.user_id
      from public.establishment_memberships em
      where em.establishment_id = v_int.establishment_id
        and em.revoked_at is null
        and em.role = 'local_owner'
      union
      select gm.user_id
      from public.group_memberships gm
      join public.establishments e on e.group_id = gm.group_id
      where e.id = v_int.establishment_id
        and gm.revoked_at is null
        and gm.role = 'global_owner'
    loop
      if public.emit_notification(
           v_int.space_id, v_recipient, p_event_type, 'client',
           'integration', v_int.id, v_link, v_key, v_int.establishment_id) is not null then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end if;

  return v_sent;
end;
$$;

revoke all on function public.notify_integration_event(uuid, text, uuid) from public, anon, authenticated;

-- ============================================================
-- 5 · Conectar, cancelar, comprobar y desconectar (personas)
-- ============================================================

-- RN-INT-02 · empezar una conexión: deja la fila en "Pendiente de
-- autorización". Lo que sigue depende de la fuente: con OAuth, el
-- servidor manda a Google y guarda el token al volver; con clave, el
-- propietario la pega y el servidor la cifra. Las dos acaban en
-- `store_integration_credential()`.
create or replace function public.begin_integration_connection(
  p_establishment_id uuid,
  p_provider text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_status text;
  v_auth_kind text;
  v_int public.integrations;
begin
  select space_id, status into v_space_id, v_status
  from public.establishments where id = p_establishment_id;
  if v_space_id is null then
    raise exception 'Establecimiento no encontrado';
  end if;

  perform public.assert_can_manage_integrations(v_space_id, p_establishment_id);

  v_auth_kind := public.integration_auth_kind(p_provider);
  if v_auth_kind is null then
    raise exception 'Fuente desconocida: % (RN-INT-01: GA4, Search Console, Business Profile, Clarity o PageSpeed)', p_provider;
  end if;

  if v_status = 'archived' then
    raise exception 'Un restaurante archivado no conecta integraciones (RN-INT-06)';
  end if;

  select * into v_int from public.integrations
  where establishment_id = p_establishment_id and provider = p_provider
  for update;

  if v_int.id is not null then
    -- CA-17: empezar dos veces es una sola conexión pendiente. Y una que
    -- ya está conectada (o fallando, o esperando atención) no vuelve a
    -- "pendiente": la credencial nueva la sustituye directamente, sin
    -- tapar el estado que tenía.
    if v_int.status not in ('not_connected', 'disconnected') then
      return v_int.id;
    end if;

    update public.integrations
    set status = 'pending_authorization',
        auth_kind = v_auth_kind,
        disconnected_at = null,
        disconnected_by = null,
        disconnect_reason = null,
        last_error = null,
        last_failure_kind = null,
        consecutive_failures = 0,
        next_attempt_at = null,
        updated_at = now()
    where id = v_int.id;
  else
    insert into public.integrations (space_id, establishment_id, provider, status, auth_kind, created_by)
    values (v_space_id, p_establishment_id, p_provider, 'pending_authorization', v_auth_kind, auth.uid())
    returning * into v_int;
  end if;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_space_id, auth.uid(), 'integration.connection_started', 'integration', v_int.id,
          jsonb_build_object('establishment_id', p_establishment_id, 'provider', p_provider,
                             'auth_kind', v_auth_kind));

  return v_int.id;
end;
$$;

revoke all on function public.begin_integration_connection(uuid, text) from public, anon;
grant execute on function public.begin_integration_connection(uuid, text) to authenticated;

-- Una autorización empezada y no terminada se puede dejar: vuelve a "No
-- conectada". No hay nada que revocar porque nunca hubo credencial.
create or replace function public.cancel_integration_connection(p_integration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_int public.integrations;
begin
  select * into v_int from public.integrations where id = p_integration_id for update;
  if v_int.id is null then
    raise exception 'Integración no encontrada';
  end if;

  perform public.assert_can_manage_integrations(v_int.space_id, v_int.establishment_id);

  if v_int.status = 'not_connected' then
    return; -- CA-17
  end if;
  if v_int.status <> 'pending_authorization' then
    raise exception 'Solo se cancela una conexión pendiente de autorización; una conectada se desconecta';
  end if;

  update public.integrations
  set status = 'not_connected', updated_at = now()
  where id = p_integration_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_int.space_id, auth.uid(), 'integration.connection_cancelled', 'integration', p_integration_id,
          jsonb_build_object('status', 'pending_authorization'), jsonb_build_object('status', 'not_connected'));
end;
$$;

revoke all on function public.cancel_integration_connection(uuid) from public, anon;
grant execute on function public.cancel_integration_connection(uuid) to authenticated;

-- RN-INT-06 · el cuerpo de desconectar, sin comprobación de permiso: lo
-- llaman `disconnect_integration()` (que sí la hace) y el disparador de
-- archivado. Revoca las credenciales, deja pendiente la revocación
-- remota si hubo token, cierra las comprobaciones que esperaban y no toca
-- ni un punto importado (RN-INT-07).
create or replace function public.disconnect_integration_internal(
  p_integration_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_int public.integrations;
  v_had_token boolean;
begin
  select * into v_int from public.integrations where id = p_integration_id for update;
  if v_int.id is null then
    raise exception 'Integración no encontrada';
  end if;

  if v_int.status in ('not_connected', 'disconnected') then
    return false; -- CA-17: desconectar dos veces es una desconexión.
  end if;

  select exists (
    select 1 from public.integration_credentials
    where integration_id = p_integration_id and kind = 'oauth_refresh_token'
      and replaced_at is null and revoked_at is null
  ) into v_had_token;

  update public.integration_credentials
  set revoked_at = now()
  where integration_id = p_integration_id and revoked_at is null;

  update public.sync_runs
  set status = 'failed', finished_at = now(), failure_kind = 'configuration',
      error = 'Integración desconectada antes de ejecutarse'
  where integration_id = p_integration_id and status = 'pending';

  update public.integrations
  set status = 'disconnected',
      disconnected_at = now(),
      disconnected_by = p_actor_id,
      disconnect_reason = p_reason,
      next_attempt_at = null,
      external_revocation_pending = v_had_token,
      updated_at = now()
  where id = p_integration_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  values (v_int.space_id, p_actor_id, 'integration.disconnected', 'integration', p_integration_id,
          jsonb_build_object('status', v_int.status),
          jsonb_build_object('status', 'disconnected', 'provider', v_int.provider,
                             'establishment_id', v_int.establishment_id,
                             'external_revocation_pending', v_had_token),
          p_reason);

  return true;
end;
$$;

revoke all on function public.disconnect_integration_internal(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.disconnect_integration(
  p_integration_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_establishment_id uuid;
begin
  select space_id, establishment_id into v_space_id, v_establishment_id
  from public.integrations where id = p_integration_id;
  if v_space_id is null then
    raise exception 'Integración no encontrada';
  end if;

  perform public.assert_can_manage_integrations(v_space_id, v_establishment_id);
  perform public.disconnect_integration_internal(p_integration_id, auth.uid(), p_reason);
end;
$$;

revoke all on function public.disconnect_integration(uuid, text) from public, anon;
grant execute on function public.disconnect_integration(uuid, text) to authenticated;

-- RN-INT-02 · el botón de comprobación (§116). Pide una ejecución de tipo
-- `check`: el proceso de la cola verifica la credencial contra la fuente
-- y vuelve por `finish_integration_run()`. NO importa datos y NO es
-- "Sincronizar ahora" (RN-INT-03).
create or replace function public.request_integration_check(p_integration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_int public.integrations;
  v_run_id uuid;
begin
  select * into v_int from public.integrations where id = p_integration_id for update;
  if v_int.id is null then
    raise exception 'Integración no encontrada';
  end if;

  perform public.assert_can_manage_integrations(v_int.space_id, v_int.establishment_id);

  if v_int.status not in ('connected', 'error', 'needs_attention') then
    raise exception 'Solo se comprueba una integración conectada (o que ha fallado); esta está en "%"', v_int.status;
  end if;

  -- CA-17: una comprobación que ya espera no se duplica.
  select id into v_run_id from public.sync_runs
  where integration_id = p_integration_id and kind = 'check' and status in ('pending', 'running')
  order by created_at limit 1;
  if v_run_id is not null then
    return v_run_id;
  end if;

  insert into public.sync_runs (space_id, establishment_id, integration_id, kind, status, requested_by)
  values (v_int.space_id, v_int.establishment_id, p_integration_id, 'check', 'pending', auth.uid())
  returning id into v_run_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
  values (v_int.space_id, auth.uid(), 'integration.check_requested', 'integration', p_integration_id,
          jsonb_build_object('run_id', v_run_id, 'provider', v_int.provider));

  return v_run_id;
end;
$$;

revoke all on function public.request_integration_check(uuid) from public, anon;
grant execute on function public.request_integration_check(uuid) to authenticated;

-- RN-INT-03 · lo que §117 manda enseñar, para las cinco fuentes aunque no
-- tengan fila: la que no tiene fila está "No conectada". Es lo que la
-- pantalla del Hito 14 va a pintar, y lo que hoy puede leer cualquiera
-- con acceso al restaurante para saber por qué no hay dato (§178).
create or replace function public.establishment_integrations(p_establishment_id uuid)
returns table (
  provider text,
  integration_id uuid,
  status text,
  auth_kind text,
  account_label text,
  external_property_id text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  last_failure_kind text,
  is_stale boolean,
  sync_frequency interval,
  check_pending boolean,
  external_revocation_pending boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.establishments e where e.id = p_establishment_id) then
    raise exception 'Establecimiento no encontrado';
  end if;

  if not public.can_read_establishment(p_establishment_id) then
    raise exception 'No tienes acceso a este restaurante';
  end if;

  return query
  select
    p.provider,
    i.id,
    coalesce(i.status, 'not_connected'),
    coalesce(i.auth_kind, public.integration_auth_kind(p.provider)),
    i.account_label,
    i.external_property_id,
    i.last_sync_at,
    i.last_success_at,
    i.next_attempt_at,
    i.last_error,
    i.last_failure_kind,
    -- Solo tiene sentido hablar de "desactualizado" cuando llegó a haber
    -- conexión; antes, el motivo es "no conectada".
    case
      when i.id is null or i.status in ('not_connected', 'pending_authorization') then false
      else public.integration_data_is_stale(p.provider, i.last_success_at, now())
    end,
    public.integration_sync_frequency(p.provider),
    exists (
      select 1 from public.sync_runs r
      where r.integration_id = i.id and r.kind = 'check' and r.status in ('pending', 'running')
    ),
    coalesce(i.external_revocation_pending, false)
  from unnest(array['ga4', 'search_console', 'business_profile', 'clarity', 'pagespeed']) as p(provider)
  left join public.integrations i
    on i.establishment_id = p_establishment_id and i.provider = p.provider
  order by array_position(array['ga4', 'search_console', 'business_profile', 'clarity', 'pagespeed'], p.provider);
end;
$$;

revoke all on function public.establishment_integrations(uuid) from public, anon;
grant execute on function public.establishment_integrations(uuid) to authenticated;

-- ============================================================
-- 6 · La credencial (servidor de la aplicación, con service_role)
-- ============================================================

-- RN-INT-02/05 · guardar una credencial ya cifrada. La llama el servidor
-- de la aplicación después de cifrar (nunca una pantalla), con el actor
-- por parámetro porque la sesión de la persona no puede ejecutarla: si
-- pudiera, cualquiera podría meter una credencial sin que el servidor la
-- cifrase. Comprueba quién es el actor igual que si fuera él:
--
--   · una clave API la guarda solo el propietario del espacio (§126);
--   · una autorización OAuth, el propietario del espacio o el del
--     restaurante ("puede autorizar una cuenta que le pertenezca", §116).
--
-- Rechaza lo que parezca una credencial de Google sin cifrar: el texto
-- cifrado nunca empieza como un token.
create or replace function public.store_integration_credential(
  p_integration_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_ciphertext text,
  p_key_version integer,
  p_expires_at timestamptz default null,
  p_account_label text default null,
  p_external_property_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_int public.integrations;
  v_credential_id uuid;
  v_first_connection boolean;
begin
  select * into v_int from public.integrations where id = p_integration_id for update;
  if v_int.id is null then
    raise exception 'Integración no encontrada';
  end if;

  if p_actor_id is null then
    raise exception 'Guardar una credencial necesita saber quién la autorizó (§21.2)';
  end if;

  if p_kind not in ('oauth_refresh_token', 'api_key') then
    raise exception 'Tipo de credencial desconocido: %', p_kind;
  end if;
  if (p_kind = 'api_key') <> (v_int.auth_kind = 'api_key') then
    raise exception 'La fuente % se conecta por %, no con una credencial de tipo %', v_int.provider, v_int.auth_kind, p_kind;
  end if;

  if p_kind = 'api_key' then
    if not public.has_capability_as(v_int.space_id, p_actor_id, 'manage_space') then
      raise exception 'Solo el propietario del espacio introduce o sustituye una clave (§126, RN-INT-05)';
    end if;
  else
    if not public.has_capability_as(v_int.space_id, p_actor_id, 'manage_space')
       and not public.integration_client_owner_as(v_int.establishment_id, p_actor_id) then
      raise exception 'Solo el propietario del espacio o el del restaurante autorizan esta cuenta (RN-INT-05)';
    end if;
  end if;

  if v_int.status in ('not_connected', 'disconnected') then
    raise exception 'Empieza la conexión antes de guardar la credencial (begin_integration_connection)';
  end if;

  if p_ciphertext is null or length(p_ciphertext) = 0 then
    raise exception 'La credencial llega vacía';
  end if;
  if p_ciphertext like 'ya29.%' or p_ciphertext like '1//%' or p_ciphertext like 'AIza%' then
    raise exception 'La credencial llega sin cifrar: el servidor tiene que cifrarla antes (RN-INT-02)';
  end if;
  if p_key_version is null or p_key_version < 1 then
    raise exception 'La credencial necesita la versión de la clave con la que se cifró';
  end if;

  -- La anterior del mismo tipo queda sustituida, no borrada (RN-DAT-06).
  update public.integration_credentials
  set replaced_at = now()
  where integration_id = p_integration_id and kind = p_kind
    and replaced_at is null and revoked_at is null;

  insert into public.integration_credentials
    (space_id, integration_id, kind, ciphertext, key_version, expires_at, created_by)
  values
    (v_int.space_id, p_integration_id, p_kind, p_ciphertext, p_key_version, p_expires_at, p_actor_id)
  returning id into v_credential_id;

  v_first_connection := v_int.status = 'pending_authorization';

  update public.integrations
  set status = case when status = 'syncing' then 'syncing' else 'connected' end,
      account_label = coalesce(p_account_label, account_label),
      external_property_id = coalesce(p_external_property_id, external_property_id),
      connected_at = case when v_first_connection then now() else connected_at end,
      connected_by = case when v_first_connection then p_actor_id else connected_by end,
      -- Con credencial nueva se vuelve a intentar cuanto antes: es lo que
      -- la persona espera después de autorizar.
      next_attempt_at = now(),
      consecutive_failures = 0,
      last_error = null,
      last_failure_kind = null,
      external_revocation_pending = false,
      updated_at = now()
  where id = p_integration_id;

  insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  values (v_int.space_id, p_actor_id,
          case when v_first_connection then 'integration.connected' else 'integration.credential_replaced' end,
          'integration', p_integration_id,
          jsonb_build_object('status', v_int.status),
          jsonb_build_object('status', 'connected', 'provider', v_int.provider,
                             'establishment_id', v_int.establishment_id, 'kind', p_kind,
                             'key_version', p_key_version, 'account_label', p_account_label));

  return v_credential_id;
end;
$$;

comment on function public.store_integration_credential(uuid, uuid, text, text, integer, timestamptz, text, text) is
  'RN-INT-02 · guarda el texto cifrado de una credencial y deja la
   integración conectada. Reservada a service_role: la llama el servidor
   de la aplicación tras cifrar, con el actor por parámetro, y comprueba
   su permiso como si fuera él (§126).';

revoke all on function public.store_integration_credential(uuid, uuid, text, text, integer, timestamptz, text, text)
  from public, anon, authenticated;

-- La credencial vigente, cifrada, para el proceso de la cola. Es la única
-- puerta a `ciphertext`.
create or replace function public.read_integration_credential(p_integration_id uuid)
returns table (kind text, ciphertext text, key_version integer, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.kind, c.ciphertext, c.key_version, c.expires_at
  from public.integration_credentials c
  where c.integration_id = p_integration_id
    and c.replaced_at is null and c.revoked_at is null
  order by c.created_at desc
  limit 1;
$$;

revoke all on function public.read_integration_credential(uuid) from public, anon, authenticated;

-- ============================================================
-- 7 · La cola (proceso con service_role)
-- ============================================================

-- RN-INT-09 · reclamar lo que toca: primero las comprobaciones que esperan
-- (las pidió una persona), después las sincronizaciones vencidas. Con
-- `for update skip locked`, dos procesos a la vez no se pisan. Un
-- restaurante suspendido o archivado no se sincroniza (RN-INT-06).
--
-- El periodo de una sincronización: hasta ayer en la zona del espacio (el
-- día de hoy está a medias), desde tres días antes del último éxito para
-- recoger las revisiones tardías de GA4 y Search Console, y 90 días hacia
-- atrás la primera vez (pendiente 13). Semanal o diaria, la ventana la
-- pone el último éxito, no la frecuencia.
create or replace function public.claim_integration_runs(p_limit integer default 10)
returns table (
  run_id uuid,
  integration_id uuid,
  space_id uuid,
  establishment_id uuid,
  provider text,
  kind text,
  external_property_id text,
  period_start date,
  period_end date,
  last_success_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run record;
  v_int record;
  v_left integer := greatest(coalesce(p_limit, 10), 0);
  v_today date;
  v_end date;
  v_start date;
  v_run_id uuid;
begin
  for v_run in
    select r.id, r.integration_id
    from public.sync_runs r
    where r.kind = 'check' and r.status = 'pending'
    order by r.created_at
    limit v_left
    for update skip locked
  loop
    update public.sync_runs set status = 'running', started_at = now() where id = v_run.id;
    v_left := v_left - 1;
    return query
      select v_run.id, i.id, i.space_id, i.establishment_id, i.provider, 'check'::text,
             i.external_property_id, null::date, null::date, i.last_success_at
      from public.integrations i where i.id = v_run.integration_id;
  end loop;

  if v_left <= 0 then
    return;
  end if;

  for v_int in
    select i.id, i.space_id, i.establishment_id, i.provider, i.external_property_id, i.last_success_at,
           s.timezone
    from public.integrations i
    join public.spaces s on s.id = i.space_id
    join public.establishments e on e.id = i.establishment_id
    where i.status in ('connected', 'error')
      and i.next_attempt_at is not null
      and i.next_attempt_at <= now()
      and e.status not in ('suspended', 'archived')
    order by i.next_attempt_at
    limit v_left
    for update of i skip locked
  loop
    v_today := (now() at time zone v_int.timezone)::date;
    v_end := v_today - 1;
    v_start := greatest(v_end - 89, coalesce(v_int.last_success_at::date - 3, v_end - 89));

    insert into public.sync_runs
      (space_id, establishment_id, integration_id, kind, status, period_start, period_end, started_at)
    values
      (v_int.space_id, v_int.establishment_id, v_int.id, 'sync', 'running', v_start, v_end, now())
    returning id into v_run_id;

    update public.integrations
    set status = 'syncing', updated_at = now()
    where id = v_int.id;

    return query
      select v_run_id, v_int.id, v_int.space_id, v_int.establishment_id, v_int.provider, 'sync'::text,
             v_int.external_property_id, v_start, v_end, v_int.last_success_at;
  end loop;
end;
$$;

revoke all on function public.claim_integration_runs(integer) from public, anon, authenticated;

-- RN-INT-04/08/09 · cerrar una ejecución. Lo que decide el resultado:
--
--   · correcta: los puntos entran por clave natural, la integración vuelve
--     a "Conectada" y el siguiente intento es dentro de una frecuencia;
--   · fallo transitorio: "Error", siguiente intento con espera creciente,
--     y aviso al equipo solo en el PRIMER fallo de la racha;
--   · fallo de autorización: "Requiere atención", sin siguiente intento
--     hasta que alguien vuelva a autorizar, y aviso también a los
--     propietarios del restaurante, que son quienes pueden hacerlo;
--   · fallo de configuración (la propiedad ya no existe, la fuente no
--     tiene adaptador): "Requiere atención" y aviso al equipo.
--
-- Una comprobación no importa datos: correcta, saca a la integración de
-- "Error" o "Requiere atención" si estaba ahí; fallida, la deja donde
-- diga el motivo. Cerrar dos veces la misma ejecución no hace nada más
-- (CA-17). El error se recorta a 500 caracteres; el filtro de secretos
-- es del proceso (`sanitizeSyncError()`), aquí no se puede saber qué es
-- un token.
create or replace function public.finish_integration_run(
  p_run_id uuid,
  p_outcome text,
  p_failure_kind text default null,
  p_error text default null,
  p_points jsonb default '[]'::jsonb,
  p_account_label text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.sync_runs;
  v_int public.integrations;
  v_points integer := 0;
  v_failures integer;
  v_error text := left(p_error, 500);
  v_new_status text;
  v_event text;
begin
  select * into v_run from public.sync_runs where id = p_run_id for update;
  if v_run.id is null then
    raise exception 'Ejecución no encontrada';
  end if;
  if v_run.status in ('succeeded', 'failed') then
    return v_run.points_written; -- CA-17
  end if;
  if v_run.status <> 'running' then
    raise exception 'La ejecución no está en curso (está "%"): hay que reclamarla antes', v_run.status;
  end if;

  if p_outcome not in ('succeeded', 'failed') then
    raise exception 'Resultado desconocido: %', p_outcome;
  end if;
  if p_outcome = 'failed' and (p_failure_kind is null or p_failure_kind not in ('transient', 'authorization', 'configuration')) then
    raise exception 'Un fallo necesita su motivo: transient, authorization o configuration (RN-INT-08)';
  end if;

  select * into v_int from public.integrations where id = v_run.integration_id for update;

  if p_outcome = 'succeeded' then
    if v_run.kind = 'sync' then
      if jsonb_typeof(coalesce(p_points, '[]'::jsonb)) <> 'array' then
        raise exception 'Los puntos llegan como lista';
      end if;

      insert into public.metric_points
        (space_id, establishment_id, integration_id, provider, metric, dimension,
         period_start, period_end, value, unit, sync_run_id, fetched_at)
      select v_int.space_id, v_int.establishment_id, v_int.id, v_int.provider,
             pt->>'metric', coalesce(pt->>'dimension', ''),
             (pt->>'period_start')::date, (pt->>'period_end')::date,
             (pt->>'value')::numeric, pt->>'unit', p_run_id, now()
      from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) as pt
      on conflict (integration_id, metric, dimension, period_start, period_end) do update
        set value = excluded.value,
            unit = excluded.unit,
            sync_run_id = excluded.sync_run_id,
            fetched_at = excluded.fetched_at;
      get diagnostics v_points = row_count;

      -- Desconectada mientras corría: se guarda lo importado (§94) y el
      -- estado no se toca.
      if v_int.status <> 'disconnected' then
        update public.integrations
        set status = 'connected',
            last_sync_at = now(),
            last_success_at = now(),
            next_attempt_at = now() + public.integration_sync_frequency(provider),
            consecutive_failures = 0,
            last_error = null,
            last_failure_kind = null,
            account_label = coalesce(p_account_label, account_label),
            updated_at = now()
        where id = v_int.id;
      end if;
    else
      if v_int.status in ('error', 'needs_attention') then
        update public.integrations
        set status = 'connected',
            next_attempt_at = now(),
            consecutive_failures = 0,
            last_error = null,
            last_failure_kind = null,
            account_label = coalesce(p_account_label, account_label),
            updated_at = now()
        where id = v_int.id;
      elsif v_int.status <> 'disconnected' then
        update public.integrations
        set account_label = coalesce(p_account_label, account_label), updated_at = now()
        where id = v_int.id;
      end if;

      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
      values (v_int.space_id, v_run.requested_by, 'integration.checked', 'integration', v_int.id,
              jsonb_build_object('run_id', p_run_id, 'ok', true, 'provider', v_int.provider));
    end if;

    update public.sync_runs
    set status = 'succeeded', finished_at = now(), points_written = v_points
    where id = p_run_id;

    return v_points;
  end if;

  -- Fallo.
  v_failures := v_int.consecutive_failures + 1;
  v_new_status := case p_failure_kind when 'transient' then 'error' else 'needs_attention' end;

  if v_int.status <> 'disconnected' then
    if v_run.kind = 'sync' or p_failure_kind <> 'transient' then
      update public.integrations
      set status = v_new_status,
          last_sync_at = case when v_run.kind = 'sync' then now() else last_sync_at end,
          consecutive_failures = v_failures,
          next_attempt_at = case
            when p_failure_kind = 'transient' then now() + public.integration_retry_delay(v_failures)
            else null
          end,
          last_error = v_error,
          last_failure_kind = p_failure_kind,
          updated_at = now()
      where id = v_int.id;
    end if;
  end if;

  update public.sync_runs
  set status = 'failed', finished_at = now(), failure_kind = p_failure_kind, error = v_error
  where id = p_run_id;

  if v_run.kind = 'check' then
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, new_value)
    values (v_int.space_id, v_run.requested_by, 'integration.checked', 'integration', v_int.id,
            jsonb_build_object('run_id', p_run_id, 'ok', false, 'failure_kind', p_failure_kind,
                               'error', v_error, 'provider', v_int.provider));
  end if;

  if v_int.status = 'disconnected' then
    return 0;
  end if;

  if p_failure_kind = 'authorization' then
    v_event := 'integration_reauthorization_required';
    insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
    values (v_int.space_id, null, 'integration.reauthorization_required', 'integration', v_int.id,
            jsonb_build_object('status', v_int.status),
            jsonb_build_object('status', 'needs_attention', 'run_id', p_run_id, 'error', v_error,
                               'provider', v_int.provider, 'establishment_id', v_int.establishment_id));
    perform public.notify_integration_event(v_int.id, v_event, p_run_id);
  else
    if v_run.kind = 'sync' or p_failure_kind <> 'transient' then
      insert into public.audit_log (space_id, actor_id, action, entity_type, entity_id, old_value, new_value)
      values (v_int.space_id, null, 'integration.sync_failed', 'integration', v_int.id,
              jsonb_build_object('status', v_int.status),
              jsonb_build_object('status', v_new_status, 'run_id', p_run_id, 'failure_kind', p_failure_kind,
                                 'error', v_error, 'consecutive_failures', v_failures,
                                 'provider', v_int.provider, 'establishment_id', v_int.establishment_id));
    end if;
    -- Una vez por racha (RN-INT-04): el primer fallo avisa; los reintentos
    -- que siguen fallando, no. Un fallo de configuración deja la
    -- integración sin siguiente intento, así que solo avisa esa vez.
    if p_failure_kind = 'configuration' or (v_run.kind = 'sync' and v_failures = 1) then
      perform public.notify_integration_event(v_int.id, 'integration_sync_failed', p_run_id);
    end if;
  end if;

  return 0;
end;
$$;

revoke all on function public.finish_integration_run(uuid, text, text, text, jsonb, text)
  from public, anon, authenticated;

-- RN-INT-06 · la revocación remota del token, hecha: el proceso de la cola
-- lo cuenta cuando Google contesta. Idempotente.
create or replace function public.mark_integration_revocation_done(p_integration_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.integrations
  set external_revocation_pending = false, updated_at = now()
  where id = p_integration_id and external_revocation_pending;
$$;

revoke all on function public.mark_integration_revocation_done(uuid) from public, anon, authenticated;

-- ============================================================
-- 8 · Archivar revoca (RN-INT-06)
-- ============================================================

-- Disparador y no una copia de `set_establishment_status()`: esa función
-- ya tiene su guarda y su auditoría, y duplicarla aquí para añadir una
-- línea es la clase de copia que se separa en silencio. `after update`
-- para que la fila ya diga "archivado" cuando se desconecte.
create or replace function public.revoke_integrations_on_archive()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    for v_id in
      select i.id from public.integrations i
      where i.establishment_id = new.id and i.status not in ('not_connected', 'disconnected')
    loop
      perform public.disconnect_integration_internal(v_id, auth.uid(), 'Restaurante archivado (RN-INT-06)');
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.revoke_integrations_on_archive() from public, anon, authenticated;

create trigger establishments_revoke_integrations_on_archive
  after update of status on public.establishments
  for each row execute function public.revoke_integrations_on_archive();

-- ============================================================
-- 9 · Auditoría (§21.2): la familia `integration` es de la cartera
-- ============================================================
create or replace function public.audit_action_capability(p_action text)
returns text
language sql
immutable
as $$
  select case split_part(coalesce(p_action, ''), '.', 1)
    when 'space' then 'manage_space'
    when 'membership' then 'manage_space'
    when 'supervision' then 'manage_space'
    when 'plan' then 'manage_space'
    when 'service' then 'manage_space'
    when 'invitation' then 'invite_member'
    when 'charge' then 'manage_finance'
    when 'payment' then 'manage_finance'
    when 'subscription' then 'manage_finance'
    when 'financial' then 'manage_finance'
    when 'establishment' then 'manage_clients'
    when 'establishment_access' then 'manage_clients'
    when 'establishment_note' then 'manage_clients'
    when 'group' then 'manage_clients'
    when 'group_access' then 'manage_clients'
    when 'holiday' then 'manage_holidays'
    when 'menu_template' then 'manage_clients'
    -- Las integraciones (RN-INT-06, §119): "toda conexión, desconexión y
    -- error queda auditado", y quién lo ve es quien gestiona la cartera,
    -- como el establecimiento.
    when 'integration' then 'manage_clients'
    else null
  end;
$$;

revoke all on function public.audit_action_capability(text) from public, anon;
grant execute on function public.audit_action_capability(text) to authenticated;
