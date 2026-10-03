# PRD · Agente Menú Diario (Restavor web → LandingSite)

| | |
|---|---|
| Producto | Agente Menú Diario de Restavor |
| Propietario | Bosco Núñez (Restavor) |
| Versión | 1.1 · 1 de octubre de 2026 |
| Destinatario | Claude Code (constructor) y Bosco (revisor) |
| Estado | Fase 0 cerrada. **Fase 1 en curso** (plan en `docs/PLAN-FASE-1.md`). Este PRD recoge los cambios de las decisiones 151 a 158 de `docs/DECISIONES.md`; donde una decisión y el texto no coinciden, manda la decisión |

---

## 0. Cómo usar este documento

**Para Claude Code:** este documento es la fuente de verdad del agente. Trabaja **una fase cada vez** (sección 14). No empieces la siguiente hasta que Bosco haya validado los criterios de aceptación de la anterior.

- Si algo de aquí choca con el `CLAUDE.md` de Restavor web en **convenciones de código**, manda el `CLAUDE.md`.
- Si choca en **comportamiento del producto**, para y pregunta.
- Si te falta un dato, no lo inventes: pregunta o apúntalo en "Preguntas abiertas".

**Para Bosco:** en el apéndice B están los mensajes exactos que hay que pegar en Claude Code para cada fase.

---

## 1. Resumen en lenguaje sencillo

Cuando un restaurante envía su menú del día desde Restavor web, el agente hace esto:

1. Se queda con el menú como si fuera un trabajador más, pero solo en los restaurantes que Bosco ha activado.
2. Prepara la imagen del menú y, mientras dura la prueba, manda a Bosco un email con la imagen y un botón "Aprobar".
3. Si el menú es para **hoy**, lo sube en cuanto llega. Si es para **otro día**, espera y lo sube a las **07:00 del día del menú** (decisión 156).
4. Entra en LandingSite, sustituye la imagen del menú en la web de ese restaurante y publica.
5. Abre la web pública y comprueba que se ve **exactamente** la imagen nueva.
6. Marca el menú como **Publicado** en Restavor web.

Si algo falla, lo marca como **Error de publicación**, dice el motivo y avisa por email.

En el día a día es un robot con pasos fijos y no gasta IA. Solo recurre a la IA de Claude si LandingSite cambia su pantalla y los pasos fijos dejan de funcionar.

---

## 2. Objetivo y métricas de éxito

**Objetivo:** que nadie del equipo tenga que subir a mano el menú diario a LandingSite, con el menor coste posible y sin publicar nunca algo incorrecto.

| Métrica | Objetivo |
|---|---|
| Menús publicados sin intervención humana, tras el periodo de prueba (4 semanas) | ≥ 95 % |
| Tiempo desde que toca publicar (fecha alcanzada y, si procede, aprobado) hasta que se ve en la web | ≤ 30 min |
| Menús publicados en el restaurante equivocado o con la imagen de otro día | 0 |
| Menús que se quedan sin publicar y sin aviso | 0 |
| Coste de IA en una publicación normal | 0 € |
| Coste de IA de rescate al mes | ≤ 5 € (límite configurable) |
| Publicaciones con prueba guardada (captura + comparación de imagen) | 100 % |

---

## 3. Contexto: el Menú Diario en Restavor web

Restavor web es la app de mantenimiento de Restavor. En el código y en Supabase todavía aparece como **Cuotly**. El circuito del Menú Diario **ya existe** y el agente se engancha a él **sin cambiar cómo funciona para las personas**.

### 3.1 Entornos

| Entorno | Proyecto Supabase | Ref |
|---|---|---|
| Pruebas | "Restavor pruebas" | `bnucqykimngjwcrlpmsm` |
| Producción | "Cuotly" | `mcajbfxhkxtdhjoyrqha` |

**Todo el desarrollo y todas las pruebas se hacen en "Restavor pruebas"**, contra una web de pruebas de LandingSite. Producción solo se toca en la Fase 7.

### 3.2 Estados de un menú (`menus.state`)

`draft` → `prepared` → `publication_requested` → `pending_assignment` → `assigned` → (`reviewing`) → `ready_to_publish` → `published`

También existen `needs_information`, `publication_error` y `cancelled`.

Tipos (`menus.kind`): `daily`, `christmas`, `kids`, `groups`, `special_event`. **En la v1 el agente solo se ocupa de `daily`.**

### 3.3 Datos que usa el agente

- `menus`: `id`, `space_id`, `establishment_id`, `name`, `kind`, `target_date`, `template_id`, `state`, `current_version_id`, `published_version_id`.
- `menu_versions`: `starters[]`, `mains[]`, `desserts[]`, `drink`, `price_cents`, `note`, `allergens`, `allergen_note`. Son inmutables: cada vez que se guarda, se crea una versión nueva.
- `menu_publications`: la publicación viva es la que tiene `published_at is null and cancelled_at is null`. Campos clave: `assigned_to`, `assignment_mode` (`auto` | `manual`), `requested_version_id`.
- `menu_templates`: `layout` (`classic` | `board` | `elegant`), colores, cabecera, pie, `show_prices` y `purpose` (`publish` | `print`).
- `establishments`: `name`, `web_platform` (`landing_site` | `other` | null), `website_url`, `status`.
- `spaces.timezone`: zona horaria para calcular fechas (Restavor: Europe/Madrid).

### 3.4 Funciones RPC existentes que usa el robot (no se modifican)

Todas usan `auth.uid()`. **Solo las llama el robot, conectado como el usuario agente.** Nunca el despachador, porque con `service_role` no hay `auth.uid()`.

| Función | Para qué | Estados de origen admitidos |
|---|---|---|
| `team_menu_queue(p_space_id)` | Cola de menús vivos | — (hay que ser miembro del espacio) |
| `register_menu_download(p_menu_id, 'png', false)` | Registra la descarga del PNG. Si la hace el trabajador asignado, pasa el menú a `ready_to_publish` (§61, paso 4) | `assigned`, `reviewing` (para el cambio de estado) |
| `mark_menu_published(p_menu_id)` | Marca publicado. Es idempotente y avisa al cliente | `assigned`, `reviewing`, `ready_to_publish`, `publication_error` |
| `report_menu_publication_error(p_menu_id, p_reason)` | Error con motivo. Avisa a propietario y administradores | `assigned`, `reviewing`, `ready_to_publish` (**no** desde `publication_error`) |

`mark_menu_published` falla si el restaurante tiene el servicio detenido (`assert_establishment_service_running`).

### 3.5 Asignación: cómo es hoy y cómo encaja el agente

Así funciona hoy:

- `request_menu_publication` asigna sola la publicación (`assignment_mode = 'auto'`) **solo si hay un único candidato**.
- Si no, el menú queda en `pending_assignment` y se avisa a propietario y administradores.
- Los candidatos salen de `menu_candidate_ids`: miembros activos que no son propietarios, con la especialidad `general` o `daily_menu`, autorizados en el restaurante y disponibles.
- Esta lógica no distingue el tipo de menú.

Decisión: **el usuario agente NO tiene ninguna especialidad**, así que nunca es candidato **de menús**: el reparto de menús no cambia en ningún restaurante ni para ningún tipo de menú. **Ojo (RECONOCIMIENTO §2.8, decisión 153):** sin especialidades sigue entrando en el reparto de **trabajos y tareas** y, por estar autorizado en un restaurante, ve sus finanzas e informes; se cierra con la marca que se propone en la Fase 2 (hasta entonces, en la Fase 1, se le marca «no disponible» como puente, que cierra trabajos y menús pero no tareas). El agente solo recibe menús a través de la función nueva `agente_menu_asignar` (sección 7.2) y solo en los restaurantes activados.

### 3.6 Plazos (informativos)

- Corte: 21:00 del día anterior (`menu_cutoff_at`).
- Objetivo: publicado antes de las 08:00 del día del menú (`menu_publish_by_at`).

Desde la regla RN-CRE-24 ya no generan avisos. El agente los usa como referencia para escalar los problemas.

---

## 4. Decisiones tomadas (no reabrir sin hablar con Bosco)

| # | Decisión |
|---|---|
| D1 | En la web, el menú es **una imagen PNG generada por Restavor web** con la plantilla de publicar del restaurante. El agente sustituye esa imagen. |
| D2 | Todas las webs están en **una sola cuenta de LandingSite de Restavor**. Es una **cuenta propia del agente**, con correo y contraseña (decisiones 152 y 155); Google no sirve para el robot, porque bloquea los navegadores controlados por programa. |
| D3 | El robot entra con **correo y contraseña** (decisión 155; la cuenta admite «Set password»). La sesión guardada sirve para no iniciar sesión en cada ejecución. Si LandingSite pide un código por correo o un desafío al entrar desde GitHub Actions, Bosco inicia sesión una vez en su navegador y el robot reutiliza esa sesión y avisa cuando caduque (la Fase 1 lo mide). |
| D4 | **Robot con pasos fijos** (Playwright) + **IA de Claude solo como rescate**. |
| D5 | Se publica en cuanto se pueda sin tapar el menú de un día anterior (regla 7.1). |
| D6 | **Modo prueba con aprobación** las primeras semanas, configurable por restaurante. Después, automático. |
| D7 | Se aprueba por **email (Resend) con la imagen y un botón "Aprobar"**. |
| D8 | El robot se ejecuta en **GitHub Actions** y se lanza con `workflow_dispatch`. |
| D9 | El agente tiene **su propio usuario trabajador sin especialidades** en Restavor web. Así no entra en el reparto de menús (en el de trabajos y tareas sí, hasta la decisión 153) y la auditoría deja constancia de quién publicó. |
| D10 | El código vive **en el repositorio de Restavor web**, en `agents/menu-diario/`, para reutilizar su generador de PNG, sus tipos y sus migraciones. |

---

## 5. Arquitectura

```
Cliente pide publicar (Restavor web)
        │
        ▼
Supabase ── webhooks de BD + cron cada 5–10 min ──► Despachador (Edge Function, service_role)
                                                     │ asigna/devuelve, crea y programa tareas
                                                     │ solo si hay trabajo: workflow_dispatch
                                                     ▼
                                          GitHub Actions → Robot (Node + TS + Playwright)
                                            conectado como "Agente Menú Diario":
                                            ├─ PNG (= descarga del equipo) → ready_to_publish
                                            ├─ modo prueba: email de aprobación (Resend)
                                            ├─ comprobaciones previas + guarda de sitio
                                            ├─ LandingSite: sustituye la imagen y publica
                                            ├─ verifica la web pública (comparación estricta)
                                            └─ mark_menu_published / report_menu_publication_error

Bosco ── /agente-menu/aprobar (Restavor web, sesión owner/admin) ──► tarea aprobada ──► webhook ──► despachador
```

### 5.1 Componentes

1. **Datos del agente.**
   - Tablas en el esquema `agente_menu`, que no se expone.
   - Se accede **solo** por funciones del esquema `public` con el prefijo `agente_menu_`, por ejemplo `agente_menu_asignar`. Si el repositorio sigue otra convención para exponer funciones, se aplica esa.
   - Todo se crea con migraciones nuevas, sin modificar tablas, funciones ni políticas existentes.
2. **Despachador** (Supabase Edge Function con `service_role`).
   - **Puede:** llamar a las funciones `agente_menu_*` de despachador, crear, actualizar y programar tareas, y lanzar el robot con la API `workflow_dispatch` de GitHub.
   - **No puede:** llamar a ninguna RPC de 3.4.
   - **Se dispara por:**
     - webhooks de base de datos: `menu_publications` (insert/update), `menus` (update, que incluye cambios de `state` y de `current_version_id`) y las tareas del agente (aprobar o reintentar);
     - un cron cada 5–10 minutos, como red de seguridad y para los momentos programados (llega `publicar_desde`, vence el plazo de aprobación, vence el plazo de una tarea bloqueada).
   - Los webhooks necesitan `pg_net` y el cron necesita `pg_cron`; hoy ninguna de las dos está activa en "Restavor pruebas". En la Fase 0, comprueba cómo se dispara `src/services/queue-runner.ts`: si ese mecanismo sirve para el cron, reutilízalo.
   - **No uses el `schedule` de GitHub Actions como reloj.** En repositorios privados del plan gratuito puede retrasarse o no llegar a ejecutarse.
3. **Robot.**
   - Workflow de GitHub Actions (`workflow_dispatch`) con `concurrency: { group: agente-menu, cancel-in-progress: false }`, para que nunca haya dos navegadores editando LandingSite a la vez.
   - En cada ejecución procesa en orden todas las tareas que toquen (regla 7.1).
   - **Sabe siempre qué día y hora es** (decisión 158, RA-08): al empezar lee la hora del ordenador en UTC, la pasa a la zona del espacio y la escribe en su registro y en cada decisión («Hoy es sábado 3 de octubre de 2026, 18:42, hora de Madrid»). La contrasta con la hora que devuelve Supabase en cada respuesta y, **si difieren más de 5 minutos, se para y avisa**. La IA no decide la fecha: en el rescate se le pasa en el mensaje.
   - Es el **único** que llama a las RPC de 3.4, conectado con email y contraseña como el usuario agente.
4. **Página de aprobación** en Restavor web (ruta Next.js `/agente-menu/aprobar?t=<token>`).
   - Exige iniciar sesión como propietario o administrador del espacio.
   - Muestra la imagen (URL firmada que genera el servidor), el restaurante, la fecha y la versión.
   - El botón **Aprobar** envía con POST, nunca con GET, para que los antivirus de correo que abren enlaces no aprueben solos.
   - Igual para **Reintentar**.
   - Se hace en Next.js porque las Edge Functions en el dominio por defecto de Supabase no sirven HTML de forma fiable. Compruébalo en la Fase 0.
5. **IA de rescate.** API de Claude directa con Claude Haiku 4.5 por defecto (comprueba el identificador exacto en la documentación de modelos) y configurable. Ver la sección 10.
6. **Correo.** Resend, con la cuenta y el dominio verificado que ya usa Restavor web.
7. **Almacenamiento.** Bucket privado `agente-menu` para PNG, capturas y sesión cifrada. Políticas en `storage.objects`:
   - el agente lee y escribe;
   - propietario y administradores solo leen;
   - nadie más tiene acceso.

### 5.2 Tecnología

- Node LTS + TypeScript, con la misma versión, el mismo lint y los mismos tests que Restavor web.
- Playwright con Chromium, con los navegadores cacheados en Actions. Objetivo: menos de 5 minutos por ejecución.
- `@supabase/supabase-js` con anon key + sesión del usuario agente. **El robot nunca tiene la `service_role`.**
- Sin frameworks de agentes: la forma más sencilla que funcione.
- El robot debe poder ejecutarse en cualquier máquina Linux sin cambios. Solo el workflow está atado a GitHub.

---

## 6. Flujo detallado

### 6.1 Estados de una tarea del agente (`agente_menu.tareas.estado`)

| Estado | Significa | Sale hacia |
|---|---|---|
| `preparando` | Falta el PNG de la versión vigente | `esperando` |
| `esperando` | PNG listo. Faltan una o las dos condiciones de 6.2-5 | `lista`, `preparando` (si cambia la versión) |
| `lista` | Se cumplen las condiciones. Toca publicar | `publicando` |
| `publicando` | En LandingSite | `verificando`, `error`, `bloqueada_sesion` |
| `verificando` | Comprobando la web pública | `publicada`, `error` |
| `publicada` | Hecho y marcado en Restavor web | — |
| `error` | Fallo definitivo, ya reportado | `lista` (Reintentar) |
| `bloqueada_sesion` | La sesión de LandingSite ha caducado y no hay contraseña | `lista` (tras `agente:login`), `error` (plazo vencido) |
| `cancelada` | El cliente canceló, el restaurante está suspendido, etc. No se toca la web | — |
| `devuelta` | El agente devolvió el menú al equipo | — |

La fecha y la aprobación son **condiciones independientes**, no pasos en orden.

### 6.2 Paso a paso

1. **Detección y asignación (despachador).**
   - Ve una publicación viva de un menú `daily` en un restaurante activado en `agente_menu.restaurantes`.
   - Llama a `agente_menu_asignar` (7.2) y crea la tarea en `preparando`. La tarea es idempotente: una por `publication_id`.
   - Calcula `publicar_desde` (7.1).
   - Si la fecha ya ha pasado, deja la tarea con `accion_pendiente = 'reportar_error'` y el motivo. El robot hará el reporte.
2. **Robot: PNG.**
   - Obtiene el PNG **idéntico** al que descargaría un trabajador con la plantilla de publicar. En la Fase 0 se averigua cómo lo genera Restavor web:
     - si lo genera en el servidor, se reutiliza ese código;
     - si lo genera en el navegador, el robot entra en Restavor web con Playwright y pulsa "Descargar PNG" igual que una persona.
   - Llama a `register_menu_download(menu, 'png', false)` si no lo ha hecho la descarga por la interfaz. El menú pasa a `ready_to_publish`.
   - Sube el PNG al bucket y guarda su ruta y su huella en la tarea.
3. **Robot: email de aprobación** (solo en modo `aprobacion`). Se envía nada más tener el PNG a `AVISOS_EMAIL`, con:
   - restaurante, fecha, versión y hora prevista de publicación;
   - la imagen;
   - el botón "Aprobar", con un token de un solo uso válido hasta `menu_publish_by_at` de ese menú.

   La aprobación vale **solo para esa versión** (`aprobada_version_id`).
4. **Cambios de versión.** Si `current_version_id` cambia antes de publicar, la tarea vuelve a `preparando`: PNG nuevo y, en modo prueba, aprobación nueva.
5. **Espera.** La tarea pasa a `lista` cuando se cumplen **las dos** condiciones:
   - **a.** `now() >= publicar_desde`;
   - **b.** el modo es `automatico`, o `aprobada_version_id = version_id`.

   Si al llegar `publicar_desde` falta la aprobación, se envía un recordatorio.
6. **Comprobaciones previas**, en código y antes de tocar LandingSite. Se vuelven a leer el menú y la publicación, y se exige:
   - menú en `assigned`, `reviewing`, `ready_to_publish` o `publication_error`;
   - la publicación viva con `assigned_to` = agente;
   - el restaurante sigue activado en `agente_menu.restaurantes` y tiene el servicio en marcha, con la misma lógica que `assert_establishment_service_running` (revisar en la Fase 0);
   - la versión vigente es la del PNG y, en modo prueba, la aprobada;
   - se cumple la regla de orden de 7.1.

   Si falla:
   - **cancelado** → `cancelada`;
   - **reasignado a una persona** → `cancelada` sin devolver nada;
   - **servicio detenido o restaurante desactivado** → `cancelada` + `agente_menu_devolver` + aviso;
   - **orden** → 7.1.

   En ningún caso se toca la web.
7. **Publicación en LandingSite** (sección 9):
   - entrar o reutilizar la sesión;
   - abrir el editor **por la URL estable del sitio** de ese restaurante;
   - **guarda de sitio** (9.5);
   - huella de la imagen pública actual (`imagen_antes`);
   - sustituir la imagen;
   - guarda de sitio otra vez;
   - publicar;
   - registrar el evento `subida_hecha`.
8. **Verificación (comparación estricta).**
   - Abre `url_publica` con un parámetro anticaché, localiza la imagen del menú (9.3-7) y la descarga.
   - Exige que la imagen **haya cambiado** respecto a `imagen_antes`.
   - Exige que **coincida** con el PNG subido: misma proporción y, tras normalizar el tamaño, diferencia de píxeles o SSIM dentro de un umbral fijo, calibrado en la Fase 5.
   - Si se puede editar el texto alternativo, exige además que contenga la `target_date`.
   - Reintenta durante un máximo de 3 minutos, por si la publicación tarda en propagarse.
   - Guarda una captura como prueba: artefacto de Actions y bucket.

   Un hash perceptual tolerante **no basta**: dos menús con la misma plantilla que solo cambian de fecha o de platos se parecen demasiado.
9. **Cierre.**
   - Si la verificación es correcta: `mark_menu_published(menu)` → la tarea pasa a `publicada`.
   - Si no, se aplica la regla 7.5.

---

## 7. Reglas de negocio

### 7.1 Cuándo publicar y en qué orden (RA-01)

> **Regla cambiada por Bosco el 03/10/2026 (decisión 156).** Antes: un menú de otro día se publicaba a las 17:00 de la víspera (`HORA_VISPERA`). Ahora no se publica nada antes de su día.

Todo en la zona horaria del espacio. `hoy` es la fecha local **en el instante en que se hace el cálculo** (no la hora a la que el cliente pidió publicar).

| Caso | Acción |
|---|---|
| `target_date < hoy` | No publicar. El robot reporta el error "La fecha del menú ya ha pasado". |
| `target_date = hoy` | `publicar_desde = ahora`: se sube **en cuanto llega la solicitud**, cada vez. Si el restaurante manda otro menú para hoy, el agente sube el nuevo y sustituye al anterior (uno a las 8:00 y otro a las 9:00 → a las 9:00 sube el nuevo). |
| `target_date > hoy` | `publicar_desde` = **las 07:00 del día del menú** (configurable), con la última versión enviada hasta entonces. Si llega ya pasada esa hora del día del menú, ese día es «hoy» y se publica al llegar. |

«En el mismo instante» significa que el agente se pone a trabajar al instante; la web cambia unos minutos después (estimación de 3 a 5 minutos; el objetivo del PRD sigue siendo ≤ 30).

**Orden (red de seguridad).** La web tiene un solo hueco para la imagen, así que:

- en cada ejecución las tareas se procesan por `target_date` ascendente;
- se vuelve a comprobar la fecha pasada cada vez que el robot decide, no solo al crear la tarea;
- **una tarea no se publica si el mismo restaurante tiene otra tarea con `target_date` posterior ya publicada o en curso** (`publishing`, `verifying`, `published`). En ese caso, el robot reporta el error "Ya hay publicado un menú de un día posterior" y no toca la web. La misma fecha no bloquea (así se publica una republicación del mismo día).

Con la decisión 156 esta regla casi no se usa, porque ya no se publica nada antes de su día. Se conserva por si un menú de otro día se publica por otra vía. Dos casos **abiertos**, que decide Bosco en las Fases 2 y 5 (`docs/reglas.md`): una tarea atascada en `publishing` o `verifying` tras un corte, y una tarea en `error` después de haber subido la imagen.

**Tests unitarios con reloj fijo**, como mínimo:

- menú para hoy (y uno a las 8:00 y otro a las 9:00);
- menú para mañana pedido a las 10:00 y a las 18:00 (los dos salen mañana a las 07:00);
- menú para dentro de 3 días;
- menú para ayer;
- menú pedido a las 23:59;
- cambio de hora de octubre y de marzo;
- regla de orden: el de hoy llega después de que el de mañana ya se publicó;
- dos tareas del mismo restaurante en la misma ejecución.

La lista completa, con valores UTC contrastados con PostgreSQL, está en `src/core/publish-from.test.ts` y `src/core/order-and-filter.test.ts`.

### 7.2 Asignación al agente (RA-02)

`agente_menu_asignar(p_menu_id)`: `SECURITY DEFINER`, solo para `service_role` (despachador). No usa `menu_candidate_ids`. Comprueba que:

- el restaurante está activado en `agente_menu.restaurantes`;
- el menú es `daily`;
- hay una publicación viva;
- el agente es miembro activo con rol `worker` y está autorizado en ese restaurante (`worker_establishments`).

Después actúa según el caso:

| Situación de la publicación viva | Acción |
|---|---|
| Sin asignar (`pending_assignment`) | Asignar al agente (`assignment_mode = 'auto'`) |
| Asignada **automáticamente** a una persona y el menú sigue en `assigned` (nadie ha empezado) | Reasignar al agente |
| Asignada **manualmente** a una persona, o con trabajo empezado (`reviewing`, `ready_to_publish`, `needs_information`) | **No tocar.** Lo ha cogido una persona a propósito |
| Ya asignada al agente | Solo asegurar que existe la tarea |

Cada asignación o reasignación:

- registra el evento de menú correspondiente con el motivo "Asignación al Agente Menú Diario";
- escribe en `audit_log` (`menu.assigned` o `menu.reassigned`);
- llama a `notify_menu_event(..., 'menu_assigned')`, igual que la asignación existente.

`agente_menu_devolver(p_menu_id, p_motivo)`: `SECURITY DEFINER`, solo para `service_role`.

- Quita la asignación del agente y devuelve el menú a `pending_assignment`, con evento, auditoría y aviso `menu_publication_requested` a propietario y administradores.
- Se usa cuando se desactiva un restaurante, en la parada de emergencia y cuando falla la comprobación previa por servicio detenido.
- **En la Fase 0, comprueba que `record_menu_event` admite `assigned → pending_assignment`.** Si no, propón la alternativa más cercana al flujo existente y pregunta.

### 7.3 Modo por restaurante (RA-03)

`agente_menu.restaurantes.modo` puede ser `aprobacion` (por defecto al dar de alta) o `automatico`. Lo cambia Bosco. En la v1 se hace en el editor de tablas de Supabase, sin pantalla.

### 7.4 Republicaciones (RA-04)

Si el cliente vuelve a mandar un menú ya publicado, se crea una publicación nueva y, con ella, una tarea nueva, sujeta a las mismas reglas.

### 7.5 Errores, reintentos y plazos (RA-05)

- **Errores pasajeros** (red, tiempo agotado, página que no carga): 2 reintentos con 5 minutos de separación.
- **Error definitivo**:
  - si el menú está en `assigned`, `reviewing` o `ready_to_publish`, el robot llama a `report_menu_publication_error(menu, motivo)`;
  - si ya está en `publication_error`, por ejemplo tras un Reintentar que vuelve a fallar, **no** se llama y solo se actualiza la tarea;
  - en ambos casos: tarea en `error` + email a `AVISOS_EMAIL` con el motivo, la captura y el botón **Reintentar**.
- **Sesión caducada sin contraseña**:
  - tarea en `bloqueada_sesion` + email con las instrucciones del apéndice C;
  - todavía no se marca error en Restavor web.
  - Si se llega a `menu_publish_by_at − 60 min`, el despachador deja `accion_pendiente = 'reportar_error'` y el robot hace el reporte para que el equipo actúe.
  - `pnpm agente:login` devuelve a `lista` las tareas bloqueadas y lanza el despachador.
- **Sin aprobación**: si a `menu_publish_by_at − 60 min` sigue sin aprobar, se reporta el error "Pendiente de aprobación" + email. (Con la decisión 156 ese límite, las 07:00, coincide con la hora de publicar los menús de otro día: se revisa en la Fase 4.)

Ningún menú puede quedarse asignado al agente sin publicarse y sin aviso.

### 7.6 Idempotencia (RA-06)

- Una tarea por `publication_id`.
- Si el menú ya está `published` con esa versión, no se hace nada.
- **Atajo tras un corte.** Si la ejecución se cortó después de publicar y antes de marcar, se salta la subida **solo si** existe el evento `subida_hecha` de esa tarea **y** la verificación estricta de 6.2-8 pasa. Si no, se repite la subida.

### 7.7 Lo que el agente no toca (RA-07)

- Los restaurantes no activados, los que no tienen `web_platform = 'landing_site'` y los menús que no son `daily` siguen el flujo humano **exactamente como hoy**. El agente no es candidato de menús, así que el reparto de menús no cambia (el de trabajos y tareas se cierra con la decisión 153).
- Un restaurante con el servicio detenido: tarea `cancelada`, menú devuelto al equipo, aviso por email y la web sin tocar.

---

## 8. Datos nuevos (esquema `agente_menu`)

Es una propuesta: adapta los nombres a las convenciones del repositorio.

- RLS activado en todas las tablas y sin políticas para `anon` ni `authenticated`.
- Todo acceso pasa por funciones `public.agente_menu_*` con `SECURITY DEFINER`.

**Tablas**

- **`config`** (una sola fila): `space_id`, `agente_user_id`, `hora_publicacion_otro_dia` (07:00; en el código, `otherDayHour`), `max_reintentos` (2), `coste_max_rescate_mes_eur` (5), `coste_max_rescate_ejecucion_eur` (0,50), `modelo_rescate`, `avisos_email`.
- **`restaurantes`**: `establishment_id` (PK), `activo`, `modo`, `landingsite_editor_url` (URL estable del editor del sitio), `landingsite_sitio_id` (identificador que debe aparecer en la URL; ver 9.5), `url_publica` (su dominio debe coincidir con `establishments.website_url`), `selector_imagen`, `notas`, `updated_at`.
- **`tareas`**: `id`, `publication_id` (único), `menu_id`, `establishment_id`, `target_date`, `version_id`, `estado`, `publicar_desde`, `accion_pendiente`, `motivo_pendiente`, `aprobada_version_id`, `aprobada_at`, `aprobada_por`, `recordatorio_enviado_at`, `intentos`, `ultimo_error`, `png_path`, `imagen_antes_huella`, `evidencia_path`, `run_url`, `created_at`, `updated_at`.
- **`eventos`** (libro inmutable): `tarea_id`, `tipo` (incluye `subida_hecha` y `uso_ia`), `detalle jsonb`, `at`.
- **`tokens`**: `hash` (nunca el token en claro), `tarea_id`, `tipo` (`aprobar` | `reintentar`), `version_id`, `expira_at`, `usado_at`, `usado_por`.

**Funciones, según quién las llama**

| Quién | Funciones (comprobación) |
|---|---|
| Despachador (`service_role`) | `agente_menu_asignar`, `agente_menu_devolver`, crear y actualizar tareas, listar trabajo pendiente |
| Robot (`auth.uid() = config.agente_user_id`) | leer las tareas que tocan, cambiar el estado de una tarea, registrar eventos, crear tokens |
| Propietario o administrador (`has_capability(space, 'manage_requests')`) | `agente_menu_ver_token(token)`, `agente_menu_aprobar(token)`, `agente_menu_reintentar(token)` |

---

## 9. LandingSite

### 9.1 Lo que sabemos

- No hemos encontrado API pública ni webhooks. Se edita haciendo clic sobre textos e imágenes o con su chat de IA.
- Los planes limitan las **ediciones con IA**: Basic, 100 al mes; Pro, 300 al mes.

### 9.2 Prohibido

- Usar el chat de IA de LandingSite para cualquier cosa que no sea **subir el menú**. Subir el menú (adjuntar la imagen y pedir que sustituya la del menú) es la **única** acción para la que se permite el chat de IA (decisión de Bosco, 03/10/2026, tras la Fase 0: sin el chat no hay forma de cambiar la imagen).
- Tocar cualquier cosa que no sea la imagen del menú y su texto alternativo.
- Cambiar ajustes del sitio o de la cuenta.
- Comprar nada.
- Abrir o publicar otro sitio que no sea el de la tarea.
- Borrar nada.

### 9.3 Lo que hay que averiguar en la Fase 0, con Bosco delante y en la web de pruebas

1. Si la cuenta creada con Google admite añadir contraseña.
2. Qué cookies y orígenes hacen falta para mantener la sesión. Comprueba que basta con las de `landingsite.ai`, **sin cookies de Google**.
3. La URL estable del editor de cada sitio y qué identificador del sitio aparece en ella.
4. Cómo se sustituye una imagen y si hacerlo a mano gasta ediciones de IA (no debería).
5. Si se puede editar el texto alternativo. Si se puede, se escribe `Menú del día <fecha> – <restaurante>`.
6. Cómo se publica, cómo se sabe que la publicación ha terminado y **si "Publicar" publica la web entera**, incluidos los cambios a medias que haya dejado otra persona. También, si el editor indica de alguna forma que la web tiene cambios sin publicar.
7. Cómo encontrar con seguridad la imagen del menú en el editor y en la web pública. Propuesta: un marcador estable que Bosco pone una vez, por ejemplo un texto alternativo que empiece por "Menú del día", guardado en `selector_imagen`.
8. Si las condiciones de uso de LandingSite permiten automatizar. Si lo prohíben, **para y avisa a Bosco**.

Guarda las respuestas en `agents/menu-diario/docs/RECONOCIMIENTO.md`, con capturas y selectores. La duración de la sesión entre ejecuciones de Actions se mide en la Fase 1.

### 9.4 Sesión

- Se guarda como `storageState` de Playwright, **filtrado solo a los orígenes y cookies de `landingsite.ai`**.
- Se cifra con AES-256-GCM (clave en `SESION_CLAVE`) y se guarda en el bucket `agente-menu`. En cada ejecución se descarga y, al terminar, se sube la versión renovada.
- `pnpm agente:login` es para el ordenador de Bosco. Lee un `.env.local` que nunca se sube al repositorio, con la URL y la anon key de Supabase, el email y la contraseña del agente y `SESION_CLAVE`. Hace lo siguiente:
  1. abre un navegador visible y Bosco entra;
  2. filtra, cifra y sube la sesión;
  3. reactiva las tareas en `bloqueada_sesion`.
- Si existe `LANDINGSITE_PASSWORD`, el robot entra solo con email y contraseña cuando la sesión no vale.

### 9.5 Guarda de sitio (obligatoria, en código)

- Se entra al editor **siempre** por `landingsite_editor_url`. Nunca se busca el sitio por su nombre en el panel.
- **Justo antes de subir la imagen y justo antes de pulsar Publicar**, el código comprueba que la URL actual contiene `landingsite_sitio_id`. Si no, aborta con error y no publica. La IA no puede saltarse esta comprobación.
- Antes de usar `url_publica`, se comprueba que su dominio coincide con el de `establishments.website_url`.

### 9.6 Cambios a medias de otras personas

Si "Publicar" publica la web entera, el robot podría sacar a la luz cambios que alguien del equipo ha dejado a medias en la web de un cliente.

- Si en la Fase 0 se ve que el editor indica que hay cambios sin publicar, el robot lo comprueba **al abrir el editor y antes de tocar nada**. Si la web ya tenía cambios pendientes, no publica: deja la tarea en `error` con el motivo "La web tiene cambios a medias de otra persona" y avisa.
- Si el editor no lo indica, la norma es del equipo: **no dejar cambios sin publicar en las webs que tengan el agente activado**. Esta norma se añade a `docs/RUNBOOK.md`.

---

## 10. IA de rescate

**Cuándo se usa.** Solo cuando falla un paso fijo de LandingSite: falta un selector o la pantalla no es la esperada.

**Cómo funciona.**

- Se envía a Claude la captura, el árbol de accesibilidad reducido, el objetivo del paso y las acciones permitidas.
- Claude devuelve **una** acción: clic en un elemento, subir el archivo, desplazarse, pulsar publicar o rendirse.
- Se repite hasta un máximo de **10 pasos** por ejecución.

**Límites que aplica el código, no la IA:**

- la navegación solo puede ir a `landingsite_editor_url` (y sus páginas internas con el mismo `landingsite_sitio_id`) y a `url_publica`;
- la guarda de sitio de 9.5 se aplica igual;
- no se puede escribir texto, salvo en el campo de texto alternativo y en el mensaje al chat de IA de LandingSite para subir el menú (9.2);
- el chat de IA de LandingSite solo se puede usar para subir el menú (9.2);
- no se puede hacer nada de lo prohibido en 9.2.

**Coste.** Máximo 0,50 € por ejecución y 5 € al mes. Si se superan, se para y se trata como error.

**Al terminar:**

- la verificación de 6.2-8 es igual de estricta;
- se envía el email "He tenido que usar el rescate" con los pasos;
- se guarda en `eventos` una propuesta de selector nuevo para actualizar los pasos fijos.

---

## 11. Seguridad y secretos

| Dónde | Secreto | Para qué |
|---|---|---|
| GitHub Actions | `RESTAVOR_SUPABASE_URL`, `RESTAVOR_SUPABASE_ANON_KEY`, `RESTAVOR_WEB_URL` | Restavor web, por entorno |
| GitHub Actions | `AGENTE_EMAIL`, `AGENTE_PASSWORD` | Usuario trabajador "Agente Menú Diario" |
| GitHub Actions | `LANDINGSITE_EMAIL`, `LANDINGSITE_PASSWORD` (opcional) | Entrar en LandingSite |
| GitHub Actions | `SESION_CLAVE` | Cifrar la sesión |
| GitHub Actions | `RESEND_API_KEY`, `AVISOS_EMAIL` | Emails |
| GitHub Actions | `ANTHROPIC_API_KEY` | Rescate, con límite de gasto en la consola de Anthropic |
| Supabase (Edge Function) | `GITHUB_WORKFLOW_TOKEN` | Token fine-grained **solo para este repositorio** y **solo con `Actions: write`**, para `workflow_dispatch`. **Sin acceso al código.** |
| Ordenador de Bosco | `.env.local` (en `.gitignore`) | `agente:login` |

Reglas:

- El robot no tiene la `service_role`.
- El agente es trabajador sin especialidades, no administrador.
- La sesión guardada no contiene cookies de Google.
- Nunca hay secretos en logs, capturas ni artefactos. Antes de capturar, se ocultan los campos de contraseña.
- Los tokens de aprobación se guardan con hash, son de un solo uso, caducan, solo se pueden usar con sesión de propietario o administrador y solo se canjean por POST.
- Los artefactos de Actions se guardan 14 días como máximo.

---

## 12. Fuera de alcance en v1 (no lo construyas)

- Menús que no sean `daily`.
- Correcciones de un menú ya publicado (`menu_corrections`): las sigue haciendo el equipo a mano.
- Retirar de la web un menú cancelado **después** de publicarlo.
- Webs que no estén en LandingSite.
- Pantallas nuevas en Restavor web, salvo la página de aprobación y reintento.
- Pedir información al cliente o editar el contenido del menú.
- Cambiar plantillas o generar imágenes con IA.
- Modificar funciones, tablas o políticas existentes de Restavor web.
- Notificaciones por WhatsApp, Telegram o push.

---

## 13. Requisitos previos (los prepara Bosco)

| # | Qué | Fase |
|---|---|---|
| R1 | Una **web de pruebas en LandingSite publicada**, con una imagen de menú y su marcador (el plan gratuito no publica). Puede ser una página oculta de una web de Restavor. **Nunca la web de un cliente.** | 0 |
| R2 | El repositorio de Restavor web en **GitHub, privado**, con Actions activado. **Hoy es público:** Bosco lo pasa a privado antes de crear ningún workflow con credenciales (decisión 157) | 1 |
| R3 | En "Restavor pruebas", un restaurante de pruebas que apunte a la web R1 y tenga Menú Diario | 1 |
| R4 | Un email para el usuario agente, por ejemplo `agente-menu@restavor.com` | 1 |
| R5 | Una copia de Restavor web desplegada que use "Restavor pruebas" (por ejemplo, un entorno de vista previa en Vercel), con un usuario propietario de pruebas | 4 |
| R6 | Acceso a Resend y a su dominio verificado | 4 |
| R7 | Clave de la API de Anthropic con **límite de gasto mensual** (por ejemplo, 10 €) | 6 |

---

## 14. Fases y criterios de aceptación

Cada fase termina en algo que funciona. **Claude Code demuestra cada criterio con pruebas**: salida de tests, consultas SQL, capturas o enlaces a ejecuciones.

### Fase 0 · Reconocimiento

**Cambios permitidos:** solo en la web de pruebas R1 y una Edge Function desechable en "Restavor pruebas", que se borra al terminar. Nada más.

En el código de Restavor web, averigua:

- cómo se genera el PNG del menú (busca dónde se llama a `register_menu_download`);
- cómo se dispara `src/services/queue-runner.ts`;
- cómo se envían los emails con Resend;
- cómo se comprueban la sesión y el rol en las rutas de Next.js;
- qué convención se sigue para exponer funciones;
- la lógica de `assert_establishment_service_running`;
- si `record_menu_event` admite `assigned → pending_assignment`;
- **qué efectos tiene dar de alta un miembro nuevo**: límites o cobro de plazas del plan, listados del equipo, reparto de trabajos normales, avisos.

En Supabase, comprueba si una Edge Function sirve HTML en el dominio por defecto.

En LandingSite, con Bosco delante, responde a las 8 preguntas de 9.3. Usa Playwright con el navegador visible y `codegen`.

**Aceptación:**

- `docs/RECONOCIMIENTO.md` responde a todo lo anterior, con capturas y selectores.
- Fuera de lo permitido no ha cambiado nada.
- Bosco da el visto bueno.

### Fase 1 · Esqueleto, usuario agente, regla de tiempo y prueba en seco

- Carpeta `agents/menu-diario/` con lint, tests y el `CLAUDE.md` del apéndice A.
- Alta del usuario agente en pruebas: trabajador **sin especialidades**, autorizado en el restaurante de pruebas.
- Funciones puras `calcularPublicarDesde()` y `ordenarYFiltrar()` con todos los tests de 7.1.
- `pnpm agente:seco`: entra como el agente, lee la cola y muestra para cada menú qué haría y cuándo. **No escribe nada.**
- Workflow mínimo en Actions que, durante 2 días, comprueba cada pocas horas que la sesión filtrada de LandingSite sigue valiendo. Solo comprueba, no edita.

**Aceptación:**

- Los tests pasan.
- La prueba en seco es correcta.
- `audit_log` tiene el mismo número de filas antes y después de la prueba en seco.
- El agente **no** aparece en `menu_candidate_ids` de ningún menú. (Insuficiente por sí solo: con Bar Demo vacío sale cierto sin comprobar nada. Se mide también con `job_candidate_ids` y `list_task_candidates`, y se anota el límite conocido: hasta la marca de la Fase 2 el agente **sí** sale en el reparto de tareas.)
- Hay un informe de cuánto dura la sesión.

### Fase 2 · Lado Restavor web: datos, asignación y despachador

- Activar `pg_net` y `pg_cron` (o reutilizar el mecanismo de `queue-runner`).
- Migraciones del esquema y las funciones de la sección 8, el bucket y sus políticas.
- Despachador con webhooks y cron. Al principio lanza un workflow de prueba que solo escribe lo que recibe.

**Aceptación (en pruebas):**

- Un menú `daily` del restaurante de pruebas sin asignar queda en `assigned` al agente en menos de 1 minuto, con su tarea, el `publicar_desde` correcto y la URL de la ejecución guardada.
- Si estaba asignado **automáticamente** a una persona y sin empezar, pasa al agente. Si estaba asignado **manualmente**, no se toca.
- Un menú no `daily`, o de un restaurante no activado, se reparte exactamente igual que antes.
- Dos disparos a la vez crean **una** sola tarea.
- Al desactivar el restaurante, sus menús vuelven a `pending_assignment` con aviso.
- Guardar una versión nueva devuelve la tarea a `preparando`.
- Los tests existentes de Restavor web siguen pasando.

### Fase 3 · Imagen PNG

**Aceptación:**

- Para 3 menús, el PNG del robot es **idéntico** al que se descarga a mano (diferencia de píxeles 0; si no, explicar por qué).
- El menú queda en `ready_to_publish`.
- El PNG está en el bucket.

### Fase 4 · Aprobación y reintento por email

**Aceptación:**

- El email llega con la imagen y el botón.
- La página exige sesión de propietario o administrador.
- Abrir el enlace (GET) **no** aprueba.
- El token es de un solo uso y caduca en `menu_publish_by_at`.
- Una versión nueva invalida la aprobación y manda otro email.
- Al aprobar, se lanza el robot en menos de 1 minuto.
- El recordatorio y el escalado "sin aprobación" funcionan con reloj simulado.
- Hay tests de toda la lógica de tokens.

### Fase 5 · Publicación en LandingSite (web de pruebas)

**Aceptación:**

- **10 publicaciones seguidas** correctas en la web de pruebas, cada una con su captura y su comparación.
- **Dos PNG que solo cambian en la fecha:** la verificación los distingue y rechaza el anterior.
- La verificación detecta que la imagen **no** ha cambiado (fallo provocado a propósito).
- El texto visible de la web pública es igual antes y después, salvo el texto alternativo.
- **Guarda de sitio:** con un `landingsite_sitio_id` distinto al de la URL, el robot aborta **antes** de subir y no publica nada.
- Contraseña mala o selector roto sin rescate → `publication_error` con un motivo claro + email. Un segundo fallo desde `publication_error` no rompe nada: la tarea queda en `error` y llega el email.
- Restaurante suspendido → `cancelada`, menú devuelto y la web sin tocar.
- Un corte entre publicar y marcar no duplica nada (7.6).
- Sesión caducada sin contraseña → `bloqueada_sesion` + email. `agente:login` la reactiva.
- La regla de orden de 7.1 se cumple en una prueba real con dos menús.

### Fase 6 · IA de rescate

**Aceptación:**

- Con un selector roto a propósito, el rescate publica en 10 pasos o menos, con el coste registrado y el email enviado.
- En una situación imposible, se rinde sin hacer ninguna acción prohibida (se revisa el registro de acciones).
- Si intenta salir del sitio, el código lo bloquea.
- Se detiene al llegar a un límite de coste bajo de prueba.

### Fase 7 · Puesta en marcha

Con el OK de Bosco:

- activar `pg_net` y `pg_cron` en producción;
- migraciones;
- secretos;
- página de aprobación desplegada;
- usuario agente (trabajador sin especialidades) autorizado en **un** restaurante real, activado en modo `aprobacion`;
- `docs/RUNBOOK.md` en lenguaje sencillo, partiendo del apéndice C.

**Aceptación:**

- `pnpm agente:e2e` pasa.
- El primer menú real se publica tras la aprobación de Bosco.
- Con al menos 10 publicaciones correctas, Bosco decide si ese restaurante pasa a `automatico`.

---

## 15. Verificación final de extremo a extremo

`pnpm agente:e2e` (solo en pruebas):

1. Crea un menú `daily` para **hoy** en el restaurante de pruebas, como usuario cliente de prueba, y lo manda a publicar.
2. Lo aprueba **por el flujo real**: Playwright entra en la copia de pruebas de Restavor web como propietario de prueba y pulsa Aprobar. **No hay ningún atajo de aprobación en el código ni en las migraciones.**
3. Espera a que el menú quede `published`. Máximo 10 minutos.
4. Comprueba la web de pruebas con la verificación estricta y que `menu_events` tiene la secuencia completa.
5. Muestra la prueba: URL de la ejecución, captura y estados.

Tiene que pasar antes de la Fase 7 y después de cualquier cambio en el agente.

---

## 16. Coste estimado

| Concepto | Estimación |
|---|---|
| GitHub Actions | Unos 3–5 min por publicación. Las cuentas gratuitas tienen 2.000 min al mes en repositorios privados. 15 restaurantes × 30 días × 4 min ≈ 1.800 min: **hasta unos 15 restaurantes, gratis** si el resto del repositorio gasta poco. Por encima, Linux cuesta unos 0,002–0,006 $ por minuto (menos de 0,03 $ por publicación). |
| IA en el día a día | 0 € |
| IA de rescate | Límite de 5 € al mes (configurable) |
| Resend y Supabase | Dentro de los planes actuales |

---

## 17. Preguntas abiertas y supuestos

- **P1.** *(Resuelta, decisión 156.)* Un menú de otro día se publica a las 07:00 del día del menú; la hora se puede cambiar. Ya no hay hora de víspera.
- **P2.** `AVISOS_EMAIL` por defecto: `info@restavor.com`.
- **P3.** Si las condiciones de LandingSite prohíben automatizar, hay que decidir un plan B. La alternativa estudiada es un recuadro incrustado una sola vez que lea el menú publicado desde Restavor web.
- **P4.** Si en la Fase 1 la sesión resulta muy frágil en GitHub Actions, se pasa a un servidor pequeño (unos 5 € al mes) sin reescribir el robot.
- **P5.** En los restaurantes activados, los menús que no son `daily` siguen el reparto normal. Si no hay un único candidato humano, se quedan pendientes de asignación como hoy.

---

## Apéndice A · `agents/menu-diario/CLAUDE.md` propuesto

```markdown
# Agente Menú Diario
- Fuente de verdad: PRD.md. Haz solo la fase que se pide.
- IMPORTANT: pruebas solo en Supabase "Restavor pruebas" (bnucqykimngjwcrlpmsm) y en la web de pruebas de LandingSite. Nunca producción ni webs de clientes sin OK explícito de Bosco.
- No modificar funciones, tablas ni políticas existentes de Restavor web: solo migraciones nuevas.
- Las RPC de Restavor web que usan auth.uid() solo las llama el robot como usuario agente. El robot nunca usa service_role, y el chat de IA de LandingSite solo lo usa para subir el menú (PRD 9.2).
- La guarda de sitio (PRD 9.5) se aplica siempre en código, también en el rescate.
- Comandos (con pnpm; manda el `CLAUDE.md` de la raíz): pnpm test · pnpm agente:seco · pnpm agente:e2e · pnpm agente:login
- Antes de dar algo por terminado: tests en verde + evidencia (salida, capturas o consultas).
- Habla con Bosco en lenguaje sencillo: no es programador.
```

## Apéndice B · Mensajes para Claude Code (uno por fase)

Abre Claude Code en la carpeta del proyecto de Restavor web y guarda este documento como `agents/menu-diario/PRD.md`.

**Fase 0:**

> Lee entero `agents/menu-diario/PRD.md` y el `CLAUDE.md` del repositorio. Vamos a hacer SOLO la Fase 0 (Reconocimiento). Primero enséñame un plan y espera mi OK. Respeta los cambios permitidos de la Fase 0. Cuando necesites que inicie sesión en LandingSite, avísame y espera. Explícamelo todo en lenguaje sencillo.

**Fases 1 a 7:** antes de cada una escribe `/clear` y luego:

> Lee `agents/menu-diario/PRD.md` y `agents/menu-diario/docs/RECONOCIMIENTO.md`. Haz SOLO la Fase N. Primero un plan y espera mi OK. Al terminar, demuéstrame cada criterio de aceptación de la Fase N con pruebas (tests, consultas o capturas). Después usa un subagente para revisar el trabajo contra el PRD y dime solo los fallos que afecten a los requisitos. Si todo está bien, haz un commit con un mensaje claro.

Si Claude Code se equivoca dos veces en lo mismo, escribe `/clear` y empieza la fase de nuevo con un mensaje más concreto.

## Apéndice C · Qué hacer cuando llega un email del agente

| Email | Qué hacer |
|---|---|
| "Aprobar menú de <restaurante>" | Mira la imagen. Si está bien, pulsa **Aprobar** y confirma en la página. |
| "Recordatorio: menú sin aprobar" | Igual que el anterior. Si no apruebas antes de 1 hora del plazo, el menú pasa a Error de publicación para que el equipo lo publique a mano. |
| "Sesión de LandingSite caducada" | En tu ordenador, abre Claude Code en la carpeta del proyecto y pide *ejecuta `pnpm agente:login`*. Entra en la ventana que se abre. Listo: el agente sigue solo. |
| "Error de publicación" | Lee el motivo. Pulsa **Reintentar** o publícalo a mano como antes. |
| "He usado el rescate" | Seguramente LandingSite ha cambiado algo. Pide a Claude Code que actualice los pasos fijos con la propuesta guardada. |

- **Activar un restaurante:**
  1. autoriza al agente en ese restaurante en Restavor web;
  2. pon el marcador en la imagen del menú de su web;
  3. añade su fila en `agente_menu.restaurantes` con la URL del editor y el identificador del sitio.
- **Pasar a automático:** cambia `modo` a `automatico` en su fila.
- **Parar el agente en una emergencia:** pon `activo = false` en sus restaurantes; el despachador devolverá al equipo los menús que tuviera. Si hace falta parar ya, en GitHub ve a Actions → el workflow del agente → *Disable workflow*.

## Apéndice D · Glosario

- **Playwright:** programa que maneja un navegador como si fuera una persona.
- **GitHub Actions:** ordenadores de GitHub que ejecutan el robot cuando se les avisa.
- **Edge Function:** pequeño programa que vive dentro de Supabase.
- **Webhook:** aviso automático que manda una app a otra cuando pasa algo.
- **RPC:** "botón" de Restavor web que se puede pulsar desde un programa.
- **Sesión guardada (`storageState`):** lo que hace que no tengas que volver a iniciar sesión.
- **Guarda de sitio:** comprobación que impide publicar en la web de otro cliente.
- **Idempotente:** que si se repite por error, no pasa nada dos veces.
