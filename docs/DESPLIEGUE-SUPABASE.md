# Estado del despliegue en Supabase

Este archivo dice **qué migraciones del repositorio están aplicadas en el
proyecto real de Supabase** (`Cuotly`, `mcajbfxhkxtdhjoyrqha`, eu-west-1).
Existe porque el repositorio y el proyecto pueden ir desacompasados, y
adivinarlo mirando el esquema es justo la clase de suposición que ha
costado caro en este proyecto.

Actualizado el 02/09/2026.

## Aplicadas

**Las 43 migraciones del repositorio están aplicadas.** No queda ninguna
pendiente.

- Las 01–24 se aplicaron el 30/08/2026.
- Las 25 y 26 (Hito 7: mensajes, archivos y finanzas, más sus arreglos de
  revisión) el 01/09/2026 — la 25 en seis partes, porque el archivo son
  111 KB y no cabe en una sola llamada.
- Las **27–42** el 01/09/2026, en la misma sesión.
- La **43** (`client_request_job`) el 02/09/2026, desde el conector MCP: la
  destapó el recorrido de CA-19 en un teléfono. El restaurante no podía
  pedir su corrección gratuita porque la pantalla leía la tabla `jobs`,
  que el cliente no puede leer a propósito (P7 y CA-04); ahora se lo
  pregunta a una función que solo contesta el estado del trabajo y si le
  queda corrección, sin ninguna identidad.

Los archivos grandes se trocearon por sentencias completas, respetando los
cuerpos entre `$$`. Los nombres con los que aparecen en el proyecto:

| # | Archivo del repositorio | Nombre(s) en el proyecto |
|---|---|---|
| 27 | `fix_updatable_client_views` | `fix_updatable_client_views` |
| 28 | `hito7_review_fixes_2` | `hito7_review_fixes_2` |
| 29 | `corrections_identity` | `corrections_identity` |
| 30 | `review4_fixes` | `review4_fixes` |
| 31 | `payment_methods` | `payment_methods` |
| 32 | `review5_fixes` | `review5_fixes` |
| 33 | `service_stops_at_24h` | `service_stops_at_24h_p1`, `_p2` |
| 34 | `review6_fixes` | `review6_fixes` |
| 35 | `hito8_inicio_busqueda_notificaciones` | `hito8_inicio_busqueda_notificaciones` |
| 36 | `hito8_ausencias_busqueda_calendario` | `hito8_ausencias_busqueda_calendario_p1`, `_p2` |
| 37 | `fase1_review_fixes` | `fase1_review_fixes_p1`, `_p2` |
| 38 | `fase1_review_fixes_2` | `fase1_review_fixes_2_p1`, `_p2` |
| 39 | `fase1_review_fixes_3` | `fase1_review_fixes_3` |
| 40 | `plan_change` | `plan_change_p1`, `_p2` |
| 41 | `queue_and_sweeps` | `queue_and_sweeps_p1`, `_p2` |
| 42 | `hu05_sessions` | `hu05_sessions` |
| 43 | `client_request_job` | `client_request_job` |

La numeración del proyecto no coincide con la del repositorio porque el
proyecto sella cada migración con la hora a la que se aplicó; lo que manda
es el orden, y el orden es el mismo.

## Cómo quedó el esquema

|  | Antes (hasta la 26) | Después (hasta la 42) |
|---|---|---|
| Tablas | 50 | **57** |
| Tablas con RLS | 50 | **57** (todas) |
| Funciones | 136 | **176** |
| Políticas | — | **96** |

Las siete tablas nuevas son `absences`, `notifications`,
`notification_preferences`, `notification_deliveries`, `scheduled_jobs`,
`plan_commitments` y `scheduled_plan_changes`.

## Lo que se comprobó después de aplicarlas

No se pudo hacer la comparación contra una base reconstruida desde cero
que sugería la versión anterior de este documento: en el contenedor de
desarrollo no hay demonio de Docker ni CLI de Supabase, así que `supabase
start` no se puede levantar. En su lugar se comprobó, contra el proyecto:

- que existen **las 7 tablas, las 12 políticas y las 41 funciones** que
  declaran las migraciones 27–42, y las 4 columnas nuevas
  (`requests.accepted_start_sla_hours`, `request_versions.space_id`,
  `establishment_memberships.revoked_at`, `group_memberships.revoked_at`);
- que **`assert_establishment_not_suspended` ya no existe** — la migración
  33 la renombra a `assert_establishment_service_running` y borra la
  anterior a propósito, para que no quede un nombre que miente;
- que las 57 tablas tienen RLS activado, sin excepciones;
- y, ya con el espacio de demostración sembrado, que el recorrido completo
  (solicitud → clasificación → validación → aceptación → asignación →
  comienzo → publicación → cobro → pago) deja los libros coherentes: 2
  apuntes de consumo, 12 eventos de contador, 20 filas de auditoría, 16
  avisos y 14 correos en cola, todos generados por las funciones reales.
  Eso último es la comprobación de que el cableado de avisos de las
  migraciones 37 y 38 funciona de punta a punta, no solo de que compila.

## Avisos del analizador de Supabase

`get_advisors` devuelve 232 avisos. Ninguno es una regresión; conviene
saber qué son antes de que alguien los descubra y crea que son nuevos:

- **226 `WARN` de funciones `SECURITY DEFINER` ejecutables por `anon` o
  `authenticated`.** El analizador no distingue una función interna de una
  que comprueba permisos por su cuenta. Las internas ya están revocadas
  (migraciones 24, 30, 32, 41); las que quedan abiertas lo están a
  propósito, porque las llama la aplicación y comprueban `auth.uid()`
  ellas mismas, o porque una política de RLS las evalúa con los
  privilegios de quien consulta y revocarlas rompería la política
  (CLAUDE.md lo explica y la migración 32 enumera las ocho). Quien manda
  aquí es el barrido de `supabase/tests/hito7_mensajes_archivos_finanzas.sql`,
  no este analizador.
- **2 `ERROR` de `security_definer_view`**, sobre `client_jobs` y
  `client_establishment_status_events`. Son las dos vistas barrera: NO
  llevan `security_invoker` a propósito, porque existen justamente para
  tapar columnas de identidad del equipo. Las migraciones 27 y 28 les
  revocan toda escritura y les conceden solo `select`.
- **3 `WARN` de `search_path` mutable** en `job_load_points`,
  `task_load_points` y `task_weight_for_minutes`. Son funciones de cálculo
  puro, sin acceso a tablas. Vale la pena fijarles el `search_path` en una
  migración futura por higiene, pero no hay fuga.
- **1 `INFO`**: `space_sequences` tiene RLS y ninguna política. Es
  deliberado y está documentado en la migración 34: la tabla no la toca
  nadie salvo `next_space_sequence()`, y se le quitaron los privilegios a
  `anon` y `authenticated` en vez de añadirle una política que no hace
  falta.

## El espacio de demostración

`supabase/seed/espacio-demo.sql` siembra un espacio completo para recorrer
los flujos. Es idempotente y NO es una migración (por eso vive fuera de
`supabase/migrations/`: si estuviera ahí, `supabase db reset` metería
datos de prueba en el historial del esquema).

Está sembrado en el proyecto ahora mismo. Tres identidades, todas con la
contraseña `Cuotly-demo-2026`:

| Correo | Papel |
|---|---|
| `owner@cuotly.test` | Propietaria del espacio (equipo) |
| `trabajadora@cuotly.test` | Trabajadora que ejecuta los trabajos |
| `restaurante@cuotly.test` | Propietario local del restaurante (cliente) |

Espacio `demo` ("Demo Cuotly", Europe/Madrid, IVA 21 %), restaurante
`EST-0001` ("Bar Demo") con plan Impulso, y cuatro solicitudes dejadas a
propósito en cuatro estados distintos para que ninguna pantalla se quede
sin caso que enseñar:

| Solicitud | Estado | Trabajo |
|---|---|---|
| SOL-0001 | Borrador | — |
| SOL-0002 | Recibida (T1 corriendo) | — |
| SOL-0003 | En curso | TRB-0001, en curso (T3 corriendo) |
| SOL-0004 | Publicada | TRB-0002, publicado, con ventana de corrección abierta |

Más un cobro de Impulso (399 € + 21 % = 482,79 €) emitido y pagado por
transferencia, para que Finanzas no esté vacía.

## Recorrer los flujos con Playwright

`apps/web/e2e/flujos-espacio-demo.spec.ts` entra con los tres usuarios y
recorre las pantallas sobre los datos de arriba. Nueve tests, en cuatro
grupos: dónde aterriza cada papel (HU-02, los dos lados), que el equipo NO
ve el borrador del cliente y el cliente SÍ, que la bolsa del plan refleja
lo consumido de verdad (14 de 16 pequeños), y que el cliente no ve el
nombre de nadie del equipo (CA-04).

Se ejecuta **aparte de la suite normal**, con una señal explícita:

```bash
cd apps/web
pnpm test:e2e         # los 14 de siempre; los de datos se saltan con motivo
pnpm test:e2e:datos   # E2E_DATOS=1 · los 9 que necesitan base de datos
```

El script pasa por `cross-env`. No es adorno: `E2E_DATOS=1 playwright test` a
secas es sintaxis POSIX y en Windows revienta antes de arrancar, con
`"E2E_DATOS" no se reconoce como un comando interno o externo`. Con
`cross-env` la variable se pone igual en bash, en cmd y en PowerShell.

Si prefieres no usar el script, el equivalente a mano en PowerShell es
`$env:E2E_DATOS="1"; npx playwright test flujos-espacio-demo`.

La señal es `E2E_DATOS=1` y no "¿hay NEXT_PUBLIC_SUPABASE_URL?" por dos
motivos, los dos escritos en la cabecera del archivo: Playwright no lee
`apps/web/.env.local` (eso lo hace Next.js al arrancar el servidor), así
que mirar esas variables desde el proceso de Playwright daría "no
configurado" siempre y el archivo se saltaría entero pareciendo verde; y
con la señal puesta y la base caída, los tests **fallan** en vez de
saltarse, que es lo correcto cuando has pedido el recorrido con datos.

Antes de lanzarlo, tres cosas y ninguna es opcional:

1. `apps/web/.env.local` apuntando al proyecto.
2. El sembrado aplicado.
3. **`SUPABASE_SERVICE_ROLE_KEY` en ese mismo `.env.local`.** Los
   recorridos de CA-19 la necesitan: al enviarse una solicitud, el
   servidor la clasifica y graba la propuesta con
   `record_classification()`, que está reservada a `service_role` porque
   RN-CLS-01 dice que eso no puede depender de lo que afirme el cliente.
   Sin esa clave la solicitud se queda en "Recibida" y el recorrido se
   para en el segundo paso. La consola del servidor de desarrollo lo dice
   con todas las letras (`[clasificación] Falta SUPABASE_SERVICE_ROLE_KEY…`).

Para comprobar el punto 3 sin adivinar, con el servidor levantado:
`curl http://localhost:3000/api/diagnostico`. Esa ruta solo existe en
desarrollo y solo devuelve booleanos —nunca el valor de nada—, y dice qué
variables ve **el proceso que atiende**, que no siempre es lo mismo que lo
que hay escrito en el archivo. Los tests de CA-19 la consultan antes de
empezar y se paran ahí con el motivo si falta la clave.

Si la clave está en el archivo y el servidor sigue sin verla, **borra la
carpeta `apps/web/.next`**: la caché de Turbopack persiste entre arranques.

Y **cierra cualquier `pnpm dev` que tengas escuchando en el 3000** antes
de lanzar `pnpm test:e2e:datos`. Playwright ya no reutiliza un servidor
existente en la ejecución con datos, precisamente por esto: Next.js lee
`.env.local` **al arrancar**, así que un servidor levantado antes de
añadir la clave sigue sin verla y el fallo aparece donde no está la
avería. Si el puerto está ocupado, Playwright lo dirá.

## Estado: los nueve pasan

**9 passed**, en Windows, el 02/09/2026. Se cerraron desde una máquina con
salida al dominio del proyecto, no desde el contenedor de Claude Code: la
política de salida de ese entorno bloquea el dominio, así que allí la
aplicación Next.js no llega a Supabase aunque el sembrado sí esté puesto.

```
$ curl https://mcajbfxhkxtdhjoyrqha.supabase.co/rest/v1/
connect_rejected — gateway answered 403 to CONNECT
```

El conector MCP sí llega, por otra ruta permitida, y por eso desde el
contenedor se pueden aplicar migraciones y sembrar datos, pero no correr
estos tests. Quien los toque desde ahí verá los nueve fallar en el login,
con la página mostrando "Correo o contraseña incorrectos." — que es lo que
devuelve `signIn` cuando no puede hablar con Supabase, y no un problema de
credenciales.

### Lo que encontraron al ejecutarse por primera vez

Valió la pena escribirlos: de cuatro tandas en rojo, **dos fallos eran de
la aplicación**, no de los tests ni del sembrado. Ninguno se habría visto
sin datos reales y tres identidades distintas.

1. **El sembrado creaba usuarios que no podían entrar.** Insertar en
   `auth.users` a mano no basta: cuatro campos de texto quedaban a NULL y
   GoTrue no sabe leerlos, y faltaba la fila en `auth.identities`. Ver la
   cabecera de `supabase/seed/espacio-demo.sql`, que ahora lo explica y lo
   comprueba antes de dar el sembrado por bueno.

2. **Un espacio con dos personas nunca redirigía.** `app/page.tsx` contaba
   los espacios sin filtrar por usuario, apoyándose en RLS para algo que
   RLS no hace: `space_memberships_select` es `is_space_member(space_id)`,
   que deja ver a todo el equipo. Salía una fila por miembro y el selector
   pintaba el mismo espacio repetido. Se dispara con cualquier espacio
   real.

3. **El cliente nunca veía sus restaurantes.** El slug del espacio salía de
   un embed `spaces(slug)` y el cliente no puede leer `public.spaces`.
   Mismo fallo que la migración 36 documentó para la búsqueda global, misma
   solución: `space_slug()`. Y de paso, con un solo restaurante ahora se
   entra directamente, como manda el PRD §20.1.

Los otros dos fallos sí eran de los tests: un `getByText("Recibida")` que
chocaba con la cabecera de columna del mismo nombre, y un `entrar()` que
esperaba a salir de `/login` cuando entrar encadena dos redirecciones de
servidor.
