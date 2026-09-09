-- Emulación mínima de un proyecto de Supabase sobre un PostgreSQL desnudo.
--
-- Para qué. Las suites de `supabase/tests/*.sql` se ejecutan en CI contra
-- una Supabase de verdad levantada con Docker (`supabase start`), y eso es
-- lo que manda. Pero en una máquina sin Docker —o sin el CLI— no había
-- forma de ejecutarlas, así que durante varios hitos se comprobaron "a
-- ojo" o contra el proyecto real con rollback. Este archivo crea a mano lo
-- que las migraciones dan por hecho, y con él las suites corren contra
-- cualquier PostgreSQL 16 local.
--
-- Cómo se usa, desde la raíz del repositorio:
--
--   createdb cuotly_test
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap-postgres-local.sql
--   for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
--   for f in supabase/tests/hito*.sql supabase/tests/hu*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
--
-- En un contenedor donde se trabaja como `root` no hay PostgreSQL en
-- marcha y `initdb` se niega a correr como root. La receta completa, que
-- funciona en el contenedor de desarrollo de este proyecto:
--
--   export PATH=/usr/lib/postgresql/16/bin:$PATH
--   BASE=/var/lib/postgresql/m49            # un directorio que `postgres` pueda atravesar
--   mkdir -p $BASE/pgdata $BASE/run && chown -R postgres:postgres $BASE
--   su postgres -c "initdb -D $BASE/pgdata -U postgres --auth=trust"
--   su postgres -c "pg_ctl -D $BASE/pgdata -o '-p 5433 -k $BASE/run -c listen_addresses=' -l $BASE/pg.log start"
--   export DATABASE_URL="postgresql://postgres@localhost:5433/cuotly_test?host=$BASE/run"
--
-- Un aviso que cuesta media hora si no se sabe: cuando una suite falla, se
-- queda a medias y NO limpia su fixture, así que la siguiente ejecución
-- muere con `duplicate key ... users_pkey` y parece otro fallo. Para
-- probar mutaciones hay que rehacer la base entera entre una y otra
-- (`dropdb`/`createdb` + bootstrap + migraciones), no reutilizarla.
--
-- Lo que NO es. No es un sustituto de Supabase: no hay PostgREST, ni
-- GoTrue, ni Storage de verdad. Lo que se comprueba aquí son las
-- migraciones, las políticas de RLS, los privilegios y las funciones, que
-- es justo lo que las suites miran. Un fallo que dependa del comportamiento
-- de PostgREST o de la subida real de bytes NO aparece aquí: para eso están
-- `pnpm comprobar:storage` y los recorridos de Playwright.
--
-- La pieza que más importa de todas las de abajo es la última: el
-- `alter default privileges ... grant execute on functions to anon,
-- authenticated`. Sin ella, un PostgreSQL desnudo NO concede EXECUTE a
-- nadie sobre las funciones nuevas, así que todas las comprobaciones de
-- "esta función interna no puede estar abierta por RPC" pasarían solas y
-- serían vacuas — que es exactamente el fallo que CLAUDE.md documenta tras
-- encontrar nueve funciones abiertas el 30/08/2026.

-- Los tres roles que Supabase crea de fábrica. Los roles son del CLÚSTER,
-- no de la base de datos, así que esto se salta lo que ya exista: en un
-- clúster donde ya se probó otra base, volver a crearlos fallaría.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- `bypassrls` es lo que hace que la clave de servicio se salte RLS, igual
  -- que en el proyecto real.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
-- Para poder hacer `set role authenticated` desde `postgres` en los tests.
grant anon, authenticated, service_role to postgres;

-- ------------------------------------------------------------
-- Esquema `extensions`
--
-- En un proyecto de Supabase las extensiones no viven en `public`: viven
-- aquí, y por eso el sembrado escribe `extensions.crypt(...)` y
-- `extensions.gen_salt(...)` para cifrar las contraseñas. Se instala en el
-- mismo sitio en vez de crear un atajo en `public`, para que lo que se
-- ejecuta en local sea literalmente el mismo SQL que en el proyecto.
-- ------------------------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- Esquema `auth` (GoTrue)
-- ------------------------------------------------------------
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Solo las columnas que tocan las migraciones o las suites. `role` y `aud`
-- las escriben los fixtures; `raw_user_meta_data` la lee handle_new_user()
-- en el proyecto real.
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  role text default 'authenticated',
  aud text default 'authenticated',
  encrypted_password text,
  instance_id uuid,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz not null default now(),
  -- Las seis de abajo no las toca ninguna migración: las escribe el
  -- sembrado (`supabase/seed/espacio-demo.sql`), y sin ellas no se puede
  -- ejecutar aquí. Los cuatro campos de texto van a cadena vacía y nunca a
  -- NULL por el motivo que explica la cabecera de aquel archivo: GoTrue
  -- los lee como `string` de Go y un NULL revienta el escaneo de la fila.
  -- Aquí no hay GoTrue, pero la columna existe para que el sembrado sea el
  -- MISMO en local y en el proyecto real; un sembrado que hay que retocar
  -- para probarlo no prueba el que se ejecuta.
  email_confirmed_at timestamptz,
  confirmation_token text,
  recovery_token text,
  email_change text,
  email_change_token_new text,
  updated_at timestamptz not null default now()
);

-- GoTrue resuelve el login por aquí, no por `auth.users` a secas. Las
-- migraciones no la tocan; el sembrado sí, y comprobar que cada usuario
-- tiene la suya es parte de su verificación final.
create table auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, provider_id)
);

-- HU-05 lee de aquí las sesiones abiertas de cada persona.
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refreshed_at timestamptz,
  user_agent text,
  ip inet,
  not_after timestamptz
);

-- La identidad de quien consulta. En Supabase sale del JWT; aquí, del
-- mismo ajuste de sesión que usan los fixtures
-- (`set_config('request.jwt.claim.sub', …)`), que es como lo hace también
-- el proyecto real por debajo.
-- Se leen las DOS formas de poner la identidad, y no una:
--
--   · `request.jwt.claims`, el JSON entero, que es lo que usa Supabase de
--     verdad y lo que usa el sembrado;
--   · `request.jwt.claim.sub`, el ajuste suelto, que es lo que usan las
--     suites de `supabase/tests/`.
--
-- Antes solo valía la segunda, y la consecuencia era que el sembrado no se
-- podía ejecutar aquí: ponía la identidad en la primera, `auth.uid()`
-- devolvía null y la primera función que comprueba permisos lo paraba con
-- "No perteneces a este espacio". El JSON va primero porque es el que usa
-- el proyecto real.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'authenticated');
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Esquema `storage`
-- ------------------------------------------------------------
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Con RLS activado y cero políticas, `storage.objects` no la lee ni la
-- escribe nadie salvo `service_role`. Es exactamente el estado que la
-- migración 45 comprueba y da por bueno, y los GRANT de tabla se conceden
-- aquí a propósito: son los de fábrica de Supabase, y sin ellos esa
-- comprobación sería vacua.
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;

-- ------------------------------------------------------------
-- Privilegios por defecto de un proyecto de Supabase
-- ------------------------------------------------------------
-- Esto es lo que hace que "revocar solo a PUBLIC" no cierre nada: toda
-- función nueva nace con EXECUTE para `anon` y `authenticated`. Replicarlo
-- es imprescindible para que los barridos de funciones internas de
-- `hito7_mensajes_archivos_finanzas.sql` y `hu36_ajustes_auditoria.sql`
-- comprueben algo de verdad.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
