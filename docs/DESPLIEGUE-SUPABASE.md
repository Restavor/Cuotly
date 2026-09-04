# Estado del despliegue en Supabase

Este archivo dice **qué migraciones del repositorio están aplicadas en el
proyecto real de Supabase** (`Cuotly`, `mcajbfxhkxtdhjoyrqha`, eu-west-1).
Existe porque el repositorio y el proyecto pueden ir desacompasados, y
adivinarlo mirando el esquema es justo la clase de suposición que ha
costado caro en este proyecto.

Actualizado el 04/09/2026.

## Aplicadas

**Las 48 primeras migraciones del repositorio están aplicadas. La 49 no.**
El repositorio va una por delante del proyecto; el apartado "La 49, sin
aplicar" de más abajo dice qué falta, qué se comprobó antes y cómo se
deshace si hiciera falta.

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
- La **44** (`retry_request_analysis`) el 02/09/2026, también desde el MCP:
  le da al equipo con `manage_requests` el permiso para reintentar el
  análisis de una solicitud cuando el automático falló. Comprobada en vivo
  con las tres identidades sembradas: la trabajadora rechazada, la
  propietaria aceptada, y el camino automático del cliente intacto.
- La **45** (`storage_bucket_files`) el 03/09/2026, desde el MCP: crea el
  bucket privado `files`, que era lo único que faltaba para que la
  interfaz de archivos funcionara. Ver el apartado "El bucket de
  archivos" más abajo.

  Un detalle del que conviene acordarse: el archivo del repositorio
  termina comprobando que `storage.objects` tiene RLS activado en vez de
  activarlo. Activarlo desde una migración da `must be owner of table
  objects` —esa tabla es de Supabase, no del proyecto—, así que la
  migración se para con un mensaje claro si alguna vez apareciera
  desactivado.
- La **46** (`consumption_threshold_client_only`) el 03/09/2026: el aviso
  de consumo de bolsa (§18, 80 % y 100 %) pasa a emitirse **solo al
  restaurante**. Cambia a quién se avisa, nada más; los avisos ya emitidos
  al equipo no se tocan.
- La **47** (`task_assignment`) el 03/09/2026: `assign_task()` y
  `list_task_candidates()`, sin las cuales la mitad "y repartirlas" de
  HU-21 no funcionaba.
- La **48** (`hu07_service_subscriptions`) el 03/09/2026, en dos partes:
  contratar un servicio adicional (`create_service_subscription()`, con su
  permanencia de 3 meses de RN-COM-09), deshacer un cambio de plan
  programado (`cancel_scheduled_plan_change()`) y enseñar el prorrateo
  antes de cobrarlo (`plan_change_preview()`). Incluye el relleno que abre
  el ciclo de consumo de los planes que ya estaban de alta sin uno.

  Comprobadas en vivo con las identidades sembradas, con rollback: la
  trabajadora no contrata servicios ni ve el prorrateo; el propietario sí,
  y contratar dos veces devuelve la misma suscripción (CA-17); la
  permanencia del servicio sale a 3 meses; anular un cambio programado lo
  deja en `cancelled` en vez de borrarlo y libera el índice para programar
  otro, y anularlo dos veces devuelve `false` sin error.

## La 49, sin aplicar

La **49** (`hu36_ajustes_auditoria`) está en el repositorio y **no** en el
proyecto. No es solo aditiva, y por eso no se aplicó junto a las demás:

- **Retira `spaces_update_owner`.** En cuanto se aplique, `spaces` se queda
  sin ninguna política de UPDATE, que en RLS significa "nadie": ni siquiera
  el propietario cambia una fila por PostgREST. El nombre (§124) y la zona
  horaria (§125) pasan a `set_space_name()` y `set_space_timezone()`, que
  dejan rastro en `audit_log`. Comprobado en el código antes de decidirlo:
  no hay **ni un solo** `.update(` sobre `spaces` en `apps/web/src`, así que
  no rompe ninguna pantalla.
- **Estrecha `audit_log_select`.** La política vigente (migración 42) deja
  ver a cualquier miembro activo todo el espacio salvo lo financiero;
  la nueva reparte por capacidad como manda §21.2. Trabajadores y Editores
  dejan de ver la configuración del espacio y la composición del equipo.
  Es el efecto buscado.

### Lo que se comprobó antes de aplicarla (04/09/2026)

1. **Las 49 migraciones aplican desde cero** sobre un PostgreSQL 16 local
   con `supabase/tests/bootstrap-postgres-local.sql`, sin Docker y sin CLI
   —lo que la versión anterior de este documento daba por imposible— y
   **las diez suites de `supabase/tests/` pasan**, más los dos scripts de
   concurrencia real de CI (`hito5-concurrency-test.mjs` y
   `hito7-concurrency-test.mjs`).
2. **Ensayo en vivo contra el proyecto, dentro de `begin` … `rollback`.**
   El archivo entero entra de una sola llamada (14 KB, no hay que trocearlo):
   al final de la transacción había 0 políticas de UPDATE sobre `spaces`,
   las 4 funciones creadas y el índice `audit_log_space_created_idx`. Tras
   el rollback se verificó que la base quedó intacta.
3. **La suite HU-36 no es un adorno**, comprobado con cuatro mutaciones,
   cada una sobre una base reconstruida desde cero (una sola base ensuciada
   da falsos positivos: el fixture no se limpia cuando la suite aborta):

   | Mutación | La suite falla con |
   |---|---|
   | `audit_entity_is_visible()` devuelve siempre `true` | "la trabajadora del restaurante A ve 2 asignaciones de trabajo (debería ver 1)" |
   | Volver a la política permisiva de la migración 42 | "un administrador ve la configuración del espacio y del equipo" |
   | Devolverle a `spaces` su política de UPDATE | "el propietario puede cambiar el espacio por UPDATE directo, sin auditoría" |
   | `set_space_timezone()` sin versionar ni exigir motivo | "se cambió la zona horaria sin motivo" |

4. **Las firmas coinciden con lo que llama la pantalla**: `set_space_name`
   (`p_space_id`, `p_name`) y `set_space_timezone` (`p_space_id`,
   `p_timezone`, `p_reason`). Un desajuste aquí sería un `PGRST202` en
   producción con la migración ya aplicada.
5. **Los datos vivos no activan el falso-cerrado.** Las 95 filas de
   `audit_log` son de cinco familias —`request`, `job`, `payment`, `charge`,
   `correction`— y las cinco están clasificadas: ninguna cae en el "solo lo
   ven el propietario y quien lo hizo" de lo desconocido.
6. **El índice nuevo no bloquea nada**: `audit_log` son 95 filas y 112 kB.
7. **`space_working_hours` está vacía** y nadie más que la pantalla de
   ajustes la lee: el motor del reloj usa `spaces.timezone`. Las versiones
   que inserta `set_space_timezone()` son historia (RN-CLK-10), no cambian
   ningún plazo vivo. La pantalla ya dice "sin versión registrada" en vez
   de inventarse una.
8. **Base de avisos antes de aplicar: 239** (`get_advisors`, seguridad).
   Eran 232 cuando se escribió el apartado de más abajo; los 7 de más son
   funciones nuevas de las migraciones 43–48, de la misma clase ya
   explicada. Tras aplicar la 49 deberían ser 241: `set_space_name` y
   `set_space_timezone` son `SECURITY DEFINER` concedidas a
   `authenticated`, y comprueban `manage_space` ellas mismas.
9. `pnpm typecheck`, `pnpm lint` y `pnpm test` (490 tests) en verde.

### Cómo se deshace

No hace falta ninguna migración inversa para volver al estado de la 48: se
recrean las dos políticas con su definición exacta de hoy, capturada del
proyecto antes de tocarlo. Las funciones nuevas pueden quedarse (nadie las
llamaría) o retirarse después.

```sql
-- Volver al estado anterior a la 49.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (
    is_platform_owner()
    or ((space_id is null) and (actor_id = auth.uid()))
    or ((space_id is not null) and is_space_member(space_id)
        and (((action !~~ 'charge.%') and (action !~~ 'payment.%')
              and (action !~~ 'subscription.%') and (action !~~ 'financial%'))
             or has_capability(space_id, 'manage_finance')))
  );

create policy spaces_update_owner on public.spaces
  for update using (has_capability(id, 'manage_space'))
  with check (has_capability(id, 'manage_space'));

drop index if exists public.audit_log_space_created_idx;
drop function if exists public.set_space_name(uuid, text);
drop function if exists public.set_space_timezone(uuid, text, text);
-- `audit_action_capability` y `audit_entity_is_visible` no existían antes
-- de la 49: al retirarlas hay que haber recreado ya la política de arriba,
-- que es quien las usaba.
drop function if exists public.audit_action_capability(text);
drop function if exists public.audit_entity_is_visible(text, uuid);
```

### Al aplicarla, y después

- El **orden importa**: la base va primero. El código de `/ajustes` ya llama
  a `set_space_name` y `set_space_timezone`; si esa rama se despliega antes,
  la pantalla contesta `PGRST202` al guardar.
- Si tras aplicarla una RPC nueva diera `PGRST202`, es la caché de esquema
  de PostgREST: `notify pgrst, 'reload schema'`.
- Comprobar después: que `spaces` no tiene política de UPDATE, que las
  cuatro funciones existen, que el índice está, y volver a pasar
  `get_advisors`.

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
| 44 | `retry_request_analysis` | `retry_request_analysis` |
| 45 | `storage_bucket_files` | `storage_bucket_files` |
| 46 | `consumption_threshold_client_only` | `consumption_threshold_client_only` |
| 47 | `task_assignment` | `task_assignment` |
| 48 | `hu07_service_subscriptions` | `hu07_service_subscriptions_p1`, `_p2` |

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

> **Esto dejó de ser cierto el 04/09/2026.** Con
> `supabase/tests/bootstrap-postgres-local.sql` y el PostgreSQL 16 que ya
> viene instalado en el contenedor, la base sí se reconstruye desde cero
> sin Docker y sin CLI; la cabecera de ese archivo trae la receta. Lo que
> sigue se mantiene tal cual porque es lo que se hizo entonces.

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

## El bucket de archivos

Creado el 03/09/2026 por la migración 45. Es el sitio donde viven los
bytes de todo lo que sube alguien: justificantes de cobro (HU-26),
adjuntos de los mensajes (HU-35) y el resto del catálogo de RN-ARC.

| | |
|---|---|
| Nombre | `files` |
| Público | **no** |
| Tamaño máximo por archivo | 26 214 400 bytes (25 MB, RN-ARC-06) |
| Tipos permitidos | los 11 de la lista blanca de RN-ARC-06 |
| Políticas en `storage.objects` | **ninguna**, a propósito |

Cero políticas con RLS activado significa "nadie": ni `anon` ni
`authenticated` pueden tocar un objeto, aunque Supabase les conceda de
fábrica los GRANT de tabla. Las dos únicas puertas son el `service_role`
—solo desde el servidor de la aplicación— y las URLs firmadas, que
autorizan una ruta concreta y las emite el servidor después de comprobar
el permiso en la base de datos.

Es deliberado, y es lo contrario de lo que suele hacerse: quién puede
subir y quién puede ver ya está escrito una vez, en `can_write_file()` y
`can_read_file()`, con RN-ARC-04, RN-ARC-05 y RN-FIN-07 dentro. Repetirlo
en políticas que parsean el nombre del objeto sería tenerlo en dos sitios.

### Cómo comprobar que el bucket funciona

Los permisos se comprueban con SQL; mover bytes, no. Para eso está
`pnpm comprobar:storage`, que funciona tanto en la raíz del repositorio
como en `apps/web`.

En PowerShell la variable va antes y en su propia línea — la forma
`VAR=valor comando` es de bash y en PowerShell no funciona:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<la clave secreta>"
pnpm comprobar:storage
```

En bash o zsh vale la forma de una línea:

```bash
SUPABASE_SERVICE_ROLE_KEY="<la clave secreta>" pnpm comprobar:storage
```

Recorre el camino entero —firma de subida, subida sin sesión, metadatos
del objeto guardado, enlace firmado de descarga, bytes idénticos— y
además comprueba que el bucket está cerrado: que con la clave pública no
se puede listar ni descargar por ruta, y que no hay URL pública. Al
terminar retira lo que subió.

**Ejecutado el 03/09/2026 por Bosco, con todas las comprobaciones en
verde.** Con eso el camino de los archivos está visto funcionar de punta a
punta: el bucket con su configuración, la subida sin sesión con URL
firmada, los metadatos reales del objeto, la descarga firmada devolviendo
los mismos bytes, y el bucket cerrado a la clave pública.

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

La suite con datos corre contra una **compilación de producción**, no
contra `next dev`: Playwright lanza `pnpm build && pnpm start`. La razón no
es purismo, es que tres rondas de fallos seguidos fueron todas el servidor
de desarrollo compilando y renderizando bajo demanda mientras varios tests
le pedían pantallas — `waitForURL` agotados, estados que no aparecían a
tiempo, tests muertos por el reloj, y ni uno solo era un fallo del
producto. Cuesta un `build` al principio; a cambio la ejecución deja de
depender de la suerte. `pnpm test:e2e` (la del armazón) sigue con `next
dev`.

Por eso el script pone también `E2E_DIAGNOSTICO=1`: `/api/diagnostico`
existe siempre en desarrollo, y fuera de desarrollo solo con esa variable,
que no está puesta en ningún despliegue real.

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

## Estado: los doce pasan

**12 passed**, en Windows, el 02/09/2026 — los nueve de lectura y los
tres del recorrido de CA-19 a 390 px. Se cerraron desde una máquina con
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
