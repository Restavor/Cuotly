# Sembrados

Los archivos `.sql` de esta carpeta **no son migraciones**: solo meten datos de demostración y se ejecutan a mano o por el
proceso `.github/workflows/pruebas-supabase.yml`, únicamente contra el proyecto "Restavor pruebas". No se ejecutan nunca
contra producción (decisión 84: el proyecto real no lleva datos de prueba).

- `espacio-demo.sql`: el espacio `demo` con sus cuentas `@cuotly.test`. Idempotente.
- `reservas-demo.sql` (Fase B, PRD de agents §16): Reservas en el espacio `demo`: Casa Pepe, Casa Pepe Centro, Taberna Sol, Bar La Plaza,
  un restaurante por cada estado del servicio y dos solicitudes. Va después de `espacio-demo.sql` (que ya trae el espacio y el servicio) y es
  idempotente. Sus cuentas están en la cabecera del archivo y en `docs/agents/PRUEBAS.md`. Lleva sus propias comprobaciones: si algo no cuadra
  (un saldo, una cifra, quién ve qué), se para con un error en vez de sembrar a medias.

Cambiar cualquier archivo de esta carpeta (este también) y subirlo a la rama `agents` reconstruye el sembrado en Restavor pruebas.
Las migraciones se cargan solas al subir; el sembrado, solo en ese caso o al lanzar el proceso a mano con `sembrar`.

Sembrado y resumen usan `.github/scripts/conexion-pruebas.sh`, que admite `@` dentro de la contraseña.
