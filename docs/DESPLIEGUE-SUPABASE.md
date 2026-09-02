# Estado del despliegue en Supabase

Este archivo dice **qué migraciones del repositorio están aplicadas en el
proyecto real de Supabase** (`Cuotly`, `mcajbfxhkxtdhjoyrqha`, eu-west-1).
Existe porque el repositorio y el proyecto pueden ir desacompasados, y
adivinarlo mirando el esquema es justo la clase de suposición que ha
costado caro en este proyecto.

Actualizado el 01/09/2026.

## Aplicadas

**Las 42 migraciones del repositorio están aplicadas.** No queda ninguna
pendiente.

- Las 01–24 se aplicaron el 30/08/2026.
- Las 25 y 26 (Hito 7: mensajes, archivos y finanzas, más sus arreglos de
  revisión) el 01/09/2026 — la 25 en seis partes, porque el archivo son
  111 KB y no cabe en una sola llamada.
- Las **27–42** el 01/09/2026, en la misma sesión.

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

Antes de lanzarlo: `apps/web/.env.local` apuntando al proyecto y el
sembrado aplicado.

## Lo que NO se pudo probar desde el contenedor de desarrollo

Esos nueve tests **no se han ejecutado en verde ni una vez**, y conviene
saberlo antes de fiarse de ellos. La política de salida a internet del
contenedor de Claude Code bloquea el dominio del proyecto:

```
$ curl https://mcajbfxhkxtdhjoyrqha.supabase.co/rest/v1/
connect_rejected — gateway answered 403 to CONNECT
```

El conector MCP de Supabase sí llega (va por otra ruta, permitida), y por
eso se han podido aplicar las migraciones y sembrar los datos; lo que no
llega es la aplicación Next.js que levanta Playwright.

Lo que sí quedó comprobado del archivo, ejecutándolo:

- compila (`typecheck`) y pasa `lint`;
- con la señal quitada, se salta con su motivo y los otros 14 tests siguen
  en verde — o sea que el archivo carga y no rompe la suite;
- con `E2E_DATOS=1`, el recorrido **se ejecuta**: los selectores del login
  resuelven, el formulario se rellena y se envía, y la server action
  corre. Falla en el único sitio donde puede fallar aquí, con la página
  mostrando "Correo o contraseña incorrectos." — que es lo que devuelve
  `signIn` cuando `signInWithPassword` no puede hablar con Supabase.

Es decir: la cadena está probada hasta el borde de red, y lo que queda por
verificar son las aserciones posteriores al login. Cada selector que usan
está anclado a lo que renderiza el código (`app/page.tsx`,
`espacios/[slug]/solicitudes/page.tsx`, `.../trabajos/page.tsx`,
`.../restaurantes/[id]/page.tsx`) y a las etiquetas de `src/i18n/es.ts`,
no inventado — pero anclado no es lo mismo que ejecutado.

Para cerrarlos hace falta una máquina con salida al dominio del proyecto,
o una base local con `supabase start` (que necesita Docker, y en este
contenedor no hay demonio).
