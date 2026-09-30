# Se carga con `. .github/scripts/conexion-pruebas.sh` y necesita DB_URL en el entorno.
# Parte la dirección por la ÚLTIMA `@`, para que la contraseña pueda llevar `@`,
# y deja la conexión en variables PG* (psql no necesita la dirección entera).
rest="${DB_URL#*://}"
userinfo="${rest%@*}"
hostpart="${rest##*@}"
export PGUSER="${userinfo%%:*}"
export PGPASSWORD="${userinfo#*:}"
hostport="${hostpart%%/*}"
export PGHOST="${hostport%%:*}"
export PGPORT="${hostport##*:}"
db="${hostpart#*/}"
export PGDATABASE="${db%%\?*}"
export PGSSLMODE=require
