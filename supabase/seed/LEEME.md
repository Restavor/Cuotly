# Sembrados

Los archivos `.sql` de esta carpeta **no son migraciones**: solo meten datos de demostración y se ejecutan a mano o por el
proceso `.github/workflows/pruebas-supabase.yml`, únicamente contra el proyecto "Restavor pruebas". No se ejecutan nunca
contra producción (decisión 84: el proyecto real no lleva datos de prueba).

- `espacio-demo.sql`: el espacio `demo` con sus cuentas `@cuotly.test`. Idempotente.
- `reservas-demo.sql` (llega en la Fase B, PRD §16): Casa Pepe, Taberna Sol y demás datos de Reservas.

Cambiar cualquier archivo de esta carpeta y subirlo a la rama `agents` reconstruye el sembrado en Restavor pruebas.
