#!/usr/bin/env bash
# La web de Cuotly con datos, sin salida a Supabase.
#
# Para qué. El contenedor de desarrollo no llega al proyecto real (la
# política de salida contesta 403) y Docker Hub limita las descargas, así que
# `supabase start` no arranca. Esto monta lo mínimo para ver las pantallas
# con datos de verdad —las del espacio de demostración— y compararlas con el
# diseño a 390 px (docs/diseno/PLAN-MOVIL.md):
#
#   PostgreSQL 16 local  ← bootstrap + las migraciones + supabase/seed/espacio-demo.sql
#   PostgREST (Docker)   ← puerto 3001
#   pasarela.mjs         ← puerto 54321: /rest/v1 → PostgREST, /auth/v1 con
#                          las contraseñas de auth.users y JWT firmados aquí
#   next dev             ← puerto 3999, apuntando a la pasarela
#
# Lo que NO hay: Storage (las fotos y descargas contestan 400 y las
# pantallas dicen que no hay), correo ni tiempo real. Es para mirar, no un
# sustituto de Supabase: lo que manda sigue siendo CI con `supabase start`.
#
# Uso, desde la raíz del repositorio y como root:
#   bash scripts/supabase-local/arrancar.sh
# Después se entra con cualquiera de las identidades de espacio-demo.sql
# (contraseña Cuotly-demo-2026) en http://localhost:3999/login.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BIN=/usr/lib/postgresql/16/bin
BASE=/var/lib/postgresql/cuotly-local
DB="postgresql://postgres@127.0.0.1:5433/cuotly"
SECRETO="cuotly-local-secreto-de-prueba-de-32-caracteres-o-mas"
LOGS="${TMPDIR:-/tmp}/cuotly-local"
mkdir -p "$LOGS"

echo "· PostgreSQL"
if ! "$BIN/pg_isready" -h 127.0.0.1 -p 5433 >/dev/null 2>&1; then
  mkdir -p "$BASE/run" && chown -R postgres:postgres "$BASE"
  [ -d "$BASE/pgdata" ] || su postgres -c "$BIN/initdb -D $BASE/pgdata -U postgres --auth=trust" >/dev/null
  su postgres -c "$BIN/pg_ctl -D $BASE/pgdata -o '-p 5433 -k $BASE/run -c listen_addresses=127.0.0.1' -l $BASE/pg.log start" >/dev/null
  sleep 2
fi

if ! psql "$DB" -Atc "select 1 from public.spaces where slug = 'demo'" 2>/dev/null | grep -q 1; then
  echo "· Base nueva: bootstrap, migraciones y sembrado"
  psql "postgresql://postgres@127.0.0.1:5433/postgres" -qc "drop database if exists cuotly" -c "create database cuotly"
  psql "$DB" -q -v ON_ERROR_STOP=1 -f "$RAIZ/supabase/tests/bootstrap-postgres-local.sql" >/dev/null
  for f in "$RAIZ"/supabase/migrations/*.sql; do psql "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
  psql "$DB" -q -v ON_ERROR_STOP=1 -f "$RAIZ/supabase/seed/espacio-demo.sql" >/dev/null 2>&1
  # El rol con el que entra PostgREST y cambia al de cada petición.
  psql "$DB" -q -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if; end \$\$" \
    -c "grant anon, authenticated, service_role to authenticator"
fi

echo "· PostgREST"
if ! docker info >/dev/null 2>&1; then (dockerd >"$LOGS/dockerd.log" 2>&1 &); sleep 6; fi
docker rm -f cuotly-postgrest >/dev/null 2>&1 || true
docker run -d --name cuotly-postgrest --network host \
  -e PGRST_DB_URI="postgres://authenticator@127.0.0.1:5433/cuotly" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$SECRETO" -e PGRST_SERVER_PORT=3001 \
  postgrest/postgrest:v12.2.12 >/dev/null

echo "· Pasarela"
pkill -f "supabase-local/pasarela.mjs" 2>/dev/null || true
nohup node "$RAIZ/scripts/supabase-local/pasarela.mjs" >"$LOGS/pasarela.log" 2>&1 &
echo $! >"$LOGS/pasarela.pid"

# Las dos claves: JWT con rol `anon` y `service_role` firmados con el mismo
# secreto. La de servicio la usan las pantallas que calculan cifras del
# espacio entero (Informes) y la cola; sin ella dicen que no pudieron.
clave() {
  node -e '
const c=require("crypto"),b=x=>Buffer.from(x).toString("base64url");
const h=b(JSON.stringify({alg:"HS256",typ:"JWT"})),p=b(JSON.stringify({role:process.argv[2],iss:"supabase",iat:1700000000,exp:2000000000}));
console.log(h+"."+p+"."+c.createHmac("sha256",process.argv[1]).update(h+"."+p).digest("base64url"))' "$SECRETO" "$1"
}
ANON=$(clave anon)
SERVICIO=$(clave service_role)

echo "· next dev en http://localhost:3999"
# Por el puerto y no por el pid: `npx` deja vivo al servidor de Next si solo
# se cierra él, y el nuevo no podría escuchar en el 3999.
pkill -f "next dev -p 3999" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1
cd "$RAIZ/apps/web"
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICIO" \
NEXT_PUBLIC_SITE_URL=http://localhost:3999 \
  nohup npx next dev -p 3999 >"$LOGS/next.log" 2>&1 &
echo $! >"$LOGS/next.pid"
echo "Listo. Registros en $LOGS"
