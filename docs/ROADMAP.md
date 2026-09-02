# ROADMAP — Cuotly

La Fase 1 se construye por **hitos**. Cada hito termina con `pnpm typecheck && pnpm lint && pnpm test`
en verde, y con una parada para que Bosco lo revise antes de empezar el siguiente.

El orden no es negociable: cada hito se apoya en el anterior. **El hito 2 es la referencia de calidad
de todo el proyecto** — es la rebanada vertical que el resto del código imita.

---

## Estado de los hitos

Actualizado el 31/08/2026.

| Hito | Estado | Nota |
|---|---|---|
| 1 · Cimientos | Cerrado | |
| 2 · Identidad, espacios y permisos | Cerrado | Rebanada vertical de referencia. |
| 3 · Motor de tiempo | Cerrado | |
| 4 · Solicitudes y clasificación | Cerrado | |
| 5 · Consumos y aceptación | Cerrado | Servidor y dominio; sin pantallas. |
| 6 · Trabajos, tareas, asignación y carga | Cerrado | Servidor y dominio; sin pantallas. |
| 7 · Mensajes, archivos y finanzas | Cerrado el 31/08/2026 | Ver salvedades abajo. |
| 8 · Inicio por rol, búsqueda, notificaciones y cierre | Servidor, dominio y armazón | Ver salvedades abajo. |

### Salvedades del Hito 7, dichas en claro

Se cierra a petición de Bosco. Tres cosas que conviene tener presentes y que
no son un fallo, sino alcance:

1. **Entrega servidor y dominio, no pantallas.** Igual que los hitos 5 y 6.
   Las reglas de RN-MSG, RN-ARC, RN-FIN y RN-COR-08 están implementadas y
   verificadas en el servidor (funciones, RLS, libro de apuntes) y en
   `src/core/`, pero el "Panel financiero operativo" que pide este hito y
   las HU-24 a HU-28 redactadas como "quiero ver…" todavía no tienen
   interfaz. Las pantallas de los tres hitos se construyen juntas.

2. **Seis revisiones adversariales; la sexta, sin bloqueantes.** La cuarta
   encontró tres bloqueantes, la quinta uno más y ocho importantes (entre
   ellos que dos comprobaciones de la cuarta eran **vacuas**), y la sexta
   —dirigida a atacar los tests de la quinta, no solo el código— encontró
   cuatro importantes y dos menores, **ninguno de ellos una puerta abierta
   al exterior**. Todo corregido y verificado con mutación. La curva baja,
   pero cada pasada sigue encontrando algo, así que el hito se da por
   cerrado sin fingir que está probado del todo.

   Lo que la sexta cambió de fondo: los tests ya no comprueban solo las
   tablas y funciones que uno se acuerda de mirar. Hay tres barridos en
   falso-cerrado —identidad del equipo, funciones internas abiertas por
   RPC, e invariantes de RLS y `space_id`— que fallan ante cualquier tabla
   o función NUEVA que incumpla la regla, hasta que alguien la clasifique
   con su motivo. Dos fallos que llevaban meses en el árbol
   (`request_versions` sin `space_id`, `space_sequences` con RLS y cero
   políticas) se encontraron precisamente por no tener ese barrido.

3. **La base de datos real va por detrás del repositorio.** El proyecto de
   Supabase está en la migración 24; las migraciones 25 a 33 (el Hito 7
   entero) siguen sin desplegar. Los arreglos de seguridad que tocaban
   objetos del Hito 6 ya vivos se aplican a mano: el primero (migraciones
   27, 29 y 30) el 31/08/2026, verificado; el segundo (migración 32, con la
   función que `anon` podía usar para escribir sin sesión) queda pendiente
   de aplicar.

### Salvedades del Hito 8, dichas en claro

1. **CA-19 no está cumplido del todo, y no puede estarlo todavía.** El
   criterio pide que *cada flujo principal* —solicitar, aceptar, asignar,
   comenzar, bloquear, publicar, corregir, pagar, consultar, gestionar
   equipo— pueda completarse íntegramente en móvil. Esos flujos existen y
   están probados en el servidor, pero sus PANTALLAS no se construyeron:
   los hitos 4 a 7 entregaron servidor y dominio. Lo que este hito entrega
   es el armazón por el que pasarán —menú, barra de móvil de 5 destinos,
   búsqueda, avisos, botón Crear— y lo prueba con la anchura de un
   teléfono. Cada pantalla que llegue añade su recorrido al mismo archivo
   de tests.

   **Al día 01/09/2026**: las pantallas ya existen (solicitudes, trabajos y
   finanzas del equipo; ficha, solicitud y facturación del restaurante) y
   el armazón las envuelve. Lo que sigue sin poder comprobarse es el
   recorrido completo en un navegador: la suite de Playwright corre contra
   el servidor de desarrollo **sin sesión y sin base de datos sembrada**,
   así que sigue midiendo el armazón en `/armazon` y no el producto. Eso
   necesita el proyecto de Supabase al día (salvedad 12) y un espacio de
   prueba sembrado. Hasta entonces CA-19 no está cumplido, y decir otra
   cosa sería mentir sobre la única parte que no se ha visto funcionar.

   **Al día 02/09/2026**: el bloqueo desapareció. El proyecto tiene las 42
   migraciones, hay un espacio sembrado y nueve tests entran con sesión de
   verdad y recorren las pantallas (salvedad 12).

   Pero **CA-19 sigue sin cumplirse**, y por dos razones que conviene no
   confundir con la anterior:

   - Esos nueve **navegan y leen**; no *completan* ningún flujo desde la
     interfaz. Nadie crea una solicitud, la acepta, la asigna, la comienza
     y la publica pulsando botones. Los flujos están probados en el
     servidor desde los hitos 4 a 7, y ahora también las pantallas que los
     enseñan, pero no el recorrido de punta a punta que pide el criterio.
   - Y corren con el viewport de escritorio. CA-19 dice **en móvil**. Lo
     que hoy se prueba con anchura de teléfono es el armazón en
     `/armazon`, no estas pantallas.

   Lo que falta para cerrarlo es concreto y ya no está bloqueado: recorrer
   cada flujo principal, pulsando, con viewport de teléfono, sobre el
   espacio sembrado.

2. **CA-22 destapó un problema real de la paleta.** Tres de los cuatro
   colores semánticos del PRD §20.6 no llegan a 4,5:1 contra blanco en
   ninguna de las dos direcciones: `success` 4,29:1, `info` 4,45:1 —a
   0,05 del umbral— y `warning` bastante menos. No se ha cambiado la
   paleta, que es identidad de marca: se ha fijado su USO (iconos, bordes,
   medidores y texto grande, donde AA pide 3:1 y los tres pasan) y queda
   comprobado con un test que falla si alguien los usa para texto normal.
   Si se quiere poder usarlos como texto, hace falta una variante más
   oscura, y esa es una decisión de Bosco.

3. **La cola de envío está montada pero no envía.** `notification_deliveries`
   guarda estado, intentos y espera creciente, y `emit_notification()`
   encola en la misma transacción que la operación de negocio (que es lo
   que hace cierto CA-18). El proceso que llama a Resend y consume la cola
   necesita la clave del proveedor y despliegue, así que queda para cuando
   haya entorno donde ejecutarlo.

   Corrección de la revisión de cierre: esta salvedad decía que solo
   faltaba "el proceso que llama a Resend", y era falso. Faltaba también
   que las operaciones de negocio EMITIERAN avisos — nadie llamaba a
   `emit_notification()` salvo las ausencias.

   Segunda corrección, tras la segunda pasada de la revisión: la anterior
   daba por hecho el §18 entero con la migración 37, y tampoco era cierto.
   Dos de aquellos siete emisores estaban DETRÁS del `return` de su
   función, que en PL/pgSQL no se ejecuta nunca, y de las siete filas del
   §18 solo se cubrían dos y media. Con la migración 38, del §18 emiten
   hoy:

   | Fila del §18 | Estado |
   |---|---|
   | Nueva solicitud sin asignar → propietario y administradores | Emite |
   | Asignación de un trabajo → el responsable | Emite, también al aprobar una reasignación |
   | Inicio → visible dentro de Cuotly para el cliente, sin correo | Emite; sin correo al cliente, con correo al equipo (decisión 13) |
   | Publicación → cliente y supervisión | Emite |
   | Corrección pedida → el responsable | Emite |
   | Consumo de bolsa al 80 % y al 100 % | **No emite** |
   | Umbrales de T2 y T3 | **No emite** |

   **Tercera corrección (migración 41): la cola ya existe.** Las dos filas
   que faltaban emiten hoy. Los avisos de consumo al 80 % y al 100 % los
   emite `run_consumption_thresholds()`, y los umbrales de T2 y T3 los
   calcula `src/services/queue-runner.ts` con el reloj laboral de
   `src/core/`, porque duplicar ese cálculo en SQL es justo lo que
   CLAUDE.md prohíbe. La tabla queda así:

   | Fila del §18 | Estado |
   |---|---|
   | Nueva solicitud sin asignar → propietario y administradores | Emite |
   | Asignación de un trabajo → el responsable | Emite, también al aprobar una reasignación |
   | Inicio → visible dentro de Cuotly para el cliente, sin correo | Emite; sin correo al cliente, con correo al equipo (decisión 13) |
   | Publicación → cliente y supervisión | Emite |
   | Corrección pedida → el responsable | Emite |
   | Consumo de bolsa al 80 % y al 100 % | Emite |
   | Umbrales de T2 y T3 | Emite |

   Con ella se disparan solos, además, la mensualidad (RN-FIN-01), el ciclo
   de impago (RN-FIN-10 y RN-FIN-11), el final de servicio por baja
   (RN-EST-09 y RN-EST-10) y el cambio de plan programado a renovación
   (§6.4). Los cuatro existían y esperaban a que alguien los llamara.

   **Un matiz que no me inventé y conviene que Bosco confirme:** la fila del
   §18 sobre el consumo de bolsa no dice a quién se avisa —su segunda
   columna describe los umbrales, no a los destinatarios—. Se aplica lo que
   sí está escrito: la bolsa es del cliente, así que se le avisa a él, y
   RN-NOT-02 ("los propietarios reciben todo por defecto") añade al
   propietario y a los administradores.

   Lo que sigue sin existir: **el cron que llama a la cola** y **la clave de
   Resend**. La ruta `POST /api/cola` está hecha y protegida con un secreto
   compartido; falta el entorno donde ejecutarla y programarla. Sin clave de
   Resend los avisos no se pierden — se quedan encolados con espera
   creciente y salen en cuanto se configure, nunca se marcan como enviados
   sin haberlo sido.

### Salvedades de la tercera pasada de la revisión

4. **`read_only` y `archived` no detenían el servicio, y ahora sí.** La
   revisión encontró que el arreglo de la segunda pasada cerró
   `suspended → ending` y dejó `suspended → archived` abierto: como
   `assert_establishment_service_running()` solo paraba en `paused` y
   `suspended`, un restaurante archivado con deuda viva seguía admitiendo
   solicitudes y arrancando contadores. De paso, `read_only` —las 24 h de
   solo lectura de RN-EST-09 y RN-EST-10— no lo hacía cumplir nadie:
   estaba en el CHECK de la tabla y en los nombres, en ninguna guarda.
   `ending` sigue fuera de la lista a propósito: RN-EST-09 mantiene el
   servicio hasta el final del periodo pagado.

5. **RN-EST-05 y RN-EST-04 no estaban implementadas.** No había forma de
   retirar el acceso de un cliente a un restaurante (ninguna columna de
   revocación, y borrar la fila lo prohíbe CLAUDE.md), así que el acceso
   era permanente; y `group_memberships` tenía `check (role =
   'global_owner')`, de modo que "un Editor puede asignarse a todos los
   actuales **y futuros**" no se podía expresar. Las dos están hechas en la
   migración 39, con revocación auditada y sin borrado físico.

6. **§6.4, el cambio de plan, ya existe (migración 40).** Estaba sin dueño:
   la migración 20 lo dejó fuera del alcance del Hito 5 y ningún hito
   posterior lo recogió, ni figuraba aquí. Se ha implementado con la
   fórmula que el PRD da cerrada (RN-COM-18), la permanencia de 3 meses que
   tampoco existía en el esquema (RN-COM-04 y RN-COM-05) y el plazo de
   inicio congelado al aceptar, que es lo que impide que un cambio de plan
   reescriba hacia atrás las condiciones de lo ya aceptado (RN-COM-15 y
   RN-COM-17).

   Lo que sigue sin existir, dicho sin adornos: **el cambio programado a
   renovación no se dispara solo**. Hay que llamar a
   `apply_scheduled_plan_change()`, igual que a `generate_monthly_charge()`
   y a `evaluate_establishment_dunning()`. Es la misma cola que falta.

7. **HU-05 y el otro lado de HU-02, hechos (migración 42).** HU-05 ("ver y
   cerrar mis sesiones activas") existe: `my_active_sessions()` y
   `revoke_my_session()` leen y borran sobre `auth.sessions` filtrando por
   `auth.uid()` —ese esquema no admite RLS, así que el filtro de la función
   ES la barrera— con pantalla en `/cuenta/sesiones` y tests de que nadie ve
   ni cierra las sesiones de otro.

   Y el selector de contexto tenía solo un lado: miraba `space_memberships`,
   así que un **cliente** —que no pertenece a ningún espacio— caía en la
   pantalla de "todavía no tienes espacio". Ahora, si no hay espacio de
   mantenimiento, se ofrecen sus restaurantes, que es lo que HU-02 llama sus
   contextos.

8. **La app móvil (`apps/mobile`) es un adelanto consciente, no alcance
   colado.** El PRD §24.1 sitúa "app móvil nativa y push" en la Fase 4, y
   la revisión la señaló como fuera de alcance. Se construyó en el Hito 1
   porque así se aprobó al empezar (web y móvil en paralelo) y hoy contiene
   solo HU-01: registro y login contra Supabase. El push, que es lo que el
   PRD aplaza de verdad, sigue sin existir. Queda dicho para que nadie lo
   confunda con la Fase 4 hecha a medias.

9. **El área de cliente arranca, y no está terminada.** La primera pantalla
   con datos reales del producto: `/espacios/<espacio>/restaurantes/<id>`,
   con el estado del servicio, la bolsa del ciclo, la lista de solicitudes
   con su estado, el formulario para pedir un cambio (HU-10) y el botón de
   aceptar (HU-14). Todo lo que muestra lo filtra RLS; no hay ni una
   comprobación de permisos escrita en la pantalla, a propósito.

   Lo que NO tiene todavía: mensajes, archivos, finanzas del cliente, ni el
   detalle de una solicitud. Y **no tiene pruebas de extremo a extremo**: la
   suite de Playwright corre contra el servidor de desarrollo sin base de
   datos sembrada ni sesión, así que solo cubre lo que se puede ver sin
   entrar. Cubrirla de verdad pide un entorno de pruebas con Supabase
   sembrado; queda dicho en vez de fingir un recorrido.

10. **`database.types.ts` se quedó en el Hito 2.** El archivo lo genera la
    CLI de Supabase contra el proyecto real, y el esquema va ya por la
    migración 42. Cada función que una pantalla nueva llama hay que añadirla
    a mano —van marcadas con "(a mano)"— hasta que se pueda regenerar
    entero. No afecta a lo que hay hecho; sí conviene arreglarlo antes de
    que las pantallas crezcan.

11. **El lado del equipo tiene ya sus pantallas de operación.** Bandeja de
    solicitudes y detalle (empezar el análisis, validar la clasificación,
    pedir información, rechazar), tablero de trabajos y detalle (asignar
    con los candidatos que calcula el servidor, comenzar, bloquear,
    desbloquear, publicar) y panel financiero (previsión, cobros, registrar
    un pago, restaurantes con impago).

    Ninguna de esas pantallas autoriza nada: cada botón llama a la función
    del servidor que hace cumplir su regla, y cuando el estado no la admite
    se enseña el error que devuelve. La ventana de corrección al publicar
    se calcula con el reloj laborable de `src/core/`, no en SQL.

    Lo que falta del lado del equipo: archivos, tareas, calendario,
    informes, planes y ajustes, y la conversación interna de un trabajo
    (§66.2), que es otra distinta de la de la solicitud. Y el armazón de
    §20.2 —menú lateral, barra de móvil, búsqueda, avisos— **ya envuelve
    estas rutas**: un layout en `/espacios/[slug]` las mete todas dentro,
    con el rol sacado de la membresía real y la búsqueda global resuelta
    en el servidor.

    Al hacerlo apareció un fallo mío: las diez pantallas traían su propio
    `<main>` de cuando vivían sueltas, y el armazón pone el suyo. Dos
    regiones principales anidadas es HTML inválido y deja el atajo "Saltar
    al contenido" apuntando a la de fuera. Corregido, y con un test que lo
    impide de vuelta.

    Y una segunda cosa que la navegación tenía mal desde el Hito 8: los
    destinos del **cliente** apuntaban a rutas del equipo
    (`/espacios/<espacio>/solicitudes`), donde un restaurante solo vería un
    404. Ahora cuelgan de su propio restaurante, y cuando tiene más de uno
    lo llevan al selector de contexto.

13. **El lado del cliente, completado con lo que le tocaba.** El detalle de
    su solicitud —lo que pidió, lo que el equipo le propone, el motivo si
    se la rechazan— con las acciones que son suyas: responder cuando le
    piden información, aceptar o no seguir adelante, volver a aceptar
    cuando el equipo cambia el alcance (RN-SLA-08) y pedir la corrección
    mínima gratuita dentro de su ventana. Y su facturación: sus cobros con
    el estado que deriva el servidor, y el libro de consumos de HU-25.

    La conversación (§66, HU-35) es un componente compartido por los dos
    lados. Quién aparece como autor no lo decide la pantalla: al equipo el
    servidor le devuelve la persona; al restaurante, "Equipo de
    mantenimiento", y la columna `sender_id` ni siquiera es legible con un
    `select` normal.

    Lo que falta del lado del cliente: adjuntar archivos a un mensaje y
    subir el justificante de un pago. Las dos cosas las admite ya el
    servidor y las dos necesitan la subida real de ficheros a Storage, que
    no está conectada. La pantalla de facturación lo dice en claro en vez
    de enseñar un botón que no funciona.

12. ~~**Estado del despliegue: el proyecto de Supabase va por la migración
    26 de 42.**~~ **Resuelto el 01/09/2026: las 42 están aplicadas.**
    Detalle en `docs/DESPLIEGUE-SUPABASE.md`. El esquema pasa a 57 tablas
    (todas con RLS) y 176 funciones, y `database.types.ts` está regenerado
    entero — ya no hay nada añadido "a mano", así que la salvedad 10
    también decae.

    Con el proyecto al día se sembró un espacio de prueba
    (`supabase/seed/espacio-demo.sql`) y se escribió el primer recorrido de
    Playwright con sesión y datos reales
    (`apps/web/e2e/flujos-espacio-demo.spec.ts`, `pnpm test:e2e:datos`).
    **Los nueve pasan** (Windows, 02/09/2026).

    Lo que encontró esa primera ejecución conviene tenerlo escrito, porque
    es el argumento para seguir por ahí: de cinco fallos, **tres eran de la
    aplicación**, no de los tests —usuarios sembrados que no autenticaban
    contra GoTrue, un espacio con dos personas que nunca redirigía porque
    la consulta se apoyaba en RLS para algo que RLS no hace, y el cliente
    sin acceso al slug de su espacio, que dejaba su pantalla de contexto
    vacía—. Los tres llevaban ahí sin verse porque el proyecto no tenía
    datos.

### Cosas aplazadas que este hito NO inventó

`generate_monthly_charge()` y `evaluate_establishment_dunning()` existían y
funcionaban, pero **no se disparaban solas**: alguien del equipo tenía que
llamarlas. RN-FIN-01 y RN-FIN-10/11 hablan de que ocurra "automáticamente"
en la fecha de renovación y a las +24 h / +72 h.

**Resuelto en la migración 41**: `run_monthly_charges()` y
`run_dunning_sweep()` lo hacen, y la cola los despacha. Queda dicho aquí
porque durante tres hitos esta línea decía lo contrario.

---

## FASE 1 — Operación real de Restavor

### Hito 1 · Cimientos
- Next.js 15 + TypeScript estricto + Tailwind, App Router.
- Supabase local con migraciones versionadas.
- Sistema visual Emerald Control como tokens (`src/styles/tokens.css`) y componentes base: botón, campo, selector, tabla, tarjeta, badge de estado, modal, toast, estados vacío/carga/error/sin permisos.
- i18n español (`src/i18n/es.ts`). Ningún literal de UI en los componentes.
- Vitest y Playwright configurados con un test de humo que pase.
- `src/core/` creado y vacío de dependencias externas.

**Se verifica con:** `pnpm dev` levanta, `pnpm test` pasa, la página de estilos muestra todos los componentes base.

### Hito 2 · Identidad, espacios y permisos *(rebanada vertical de referencia)*
- Esquema de `users`, `profiles`, `spaces`, `space_memberships`, `groups`, `establishments`, membresías y permisos.
- **RLS en todas las tablas**, con helpers SQL (`current_space_id()`, `has_capability()`).
- Registro, verificación de correo, login con contraseña y con Google, recuperación, gestión de sesiones.
- Selector de contexto y acción "Cambiar de espacio".
- Invitaciones con caducidad de 7 días y flujo de "usuario ya registrado".
- Matriz de capacidades completa en servidor + tabla de auditoría.
- Semilla: el espacio Restavor, sus tres planes, el servicio Menú Diario, Bosco como propietario de plataforma vía `CUOTLY_OWNER_EMAIL`.

**Se verifica con:** CA-01, CA-02, CA-16. Test que intenta leer datos de otro espacio con identidad ajena y falla.

### Hito 3 · Motor de tiempo
- `src/core/business-clock.ts` con los tres calendarios (contractual, Menú Diario, soporte) y calendarios versionados.
- `holidays` y `space_working_hours` con interfaz de configuración.
- `timer_events` y recálculo de contadores desde eventos.

**Se verifica con:** CA-10 y CA-11. Este hito es lógica pura: debe tener la batería de tests más densa del proyecto.

### Hito 4 · Solicitudes y clasificación
- `requests`, `request_versions`, `classifications`, conversaciones de solicitud.
- Flujo completo de estados con sus transiciones válidas.
- Clasificación con la API de Anthropic desde el servidor + fallback por reglas + registro en `ai_usage`.
- Validación humana obligatoria antes de mostrar nada al cliente.
- Copiar y pegar solicitud dentro del grupo.
- T1 en marcha con sus avisos.

**Se verifica con:** HU-10 a HU-15. Test de que la IA caída no bloquea el flujo.

### Hito 5 · Consumos y aceptación
- `consumption_cycles`, `consumption_entries`, `acceptances`.
- Libro inmutable, saldos calculados, créditos compensatorios, devoluciones.
- Aceptación del cliente con transacción, bloqueo de fila e idempotencia.
- Creación del trabajo a partir de la aceptación.

**Se verifica con:** CA-05 a CA-09, CA-17.

### Hito 6 · Trabajos, tareas, asignación y carga
- `jobs`, `tasks`, `assignments`, `supervisions`, `blocks`, `corrections`, `state_events`.
- Asignación automática con candidato único y recomendación determinista con varios.
- Comenzar, bloquear, pausar, publicar, corregir, reasignar.
- T2 y T3 con todos sus avisos. "Fuera de plazo" calculado.
- Puntos de carga y niveles, con el reparto por tareas.
- Columna "Finalizados" con la regla de 30 días.

**Se verifica con:** HU-16 a HU-23, CA-12 a CA-14.

### Hito 7 · Mensajes, archivos y finanzas
- Los tres tipos de conversación, notas internas separadas, edición de 10 minutos, sin eliminación.
- Archivos con versiones, marca interno/compartido, límite de 25 MB, tipos permitidos.
- `charges`, `payments`, confirmación manual, justificantes, ciclo de impago 24 h / 72 h y reactivación.
- Panel financiero operativo.

**Se verifica con:** HU-24 a HU-28, HU-35, RN-FIN-13.

### Hito 8 · Inicio por rol, búsqueda, notificaciones y cierre
- Inicio distinto para propietario, administrador, trabajador y propietario global.
- Búsqueda global con `Ctrl/Cmd + K`, filtrada en servidor.
- Botón Crear contextual.
- Centro de notificaciones + correo con Resend, por cola, con reintentos e idempotencia.
- Calendario operativo básico con eventos automáticos y ausencias.
- Entrada "Agente Cuotly · Próximamente".
- Repaso completo de los criterios CA-19 a CA-22.

**Se verifica con:** revisión adversarial de toda la Fase 1 por un subagente contra este ROADMAP y el PRD.

---

## FASE 2 — Menú Diario
Menús con sus tipos, versiones y estados · tres plantillas · generación de PNG y PDF · solicitud de
publicación y consumo de actualizaciones · flujo manual de publicación en LandingSite con "Marcar como
publicado" · garantía de las 21:00 y recordatorio de las 20:00 · calendario de todos los días del año ·
corrección mínima con la salvedad de las 21:00 · calendario operativo completo · presupuestos adicionales.

## FASE 3 — Datos e informes
Integraciones GA4, Search Console, Business Profile, Clarity y PageSpeed con OAuth y credenciales
cifradas · sincronización programada con estados y sin botón "Sincronizar ahora" · series de métricas ·
oportunidades **por reglas deterministas** con su ciclo de estados · informes de operación, finanzas y
rendimiento digital con flujo de aprobación, versiones, PDF, CSV y envío programado.

## FASE 4 — Plataforma y móvil
App React Native + Expo reutilizando la misma API y el mismo dominio · push con Expo sobre FCM y APNs ·
panel de Administración de Cuotly · solicitudes de creación de espacio y su aprobación · onboarding de
espacio nuevo · suscripciones Pro y Agency con su ciclo de pago manual, impago y archivado · prueba
gratuita de 7 días · Modo soporte · centro de ayuda y página de estado · exportación y conservación.

---

## Antes de lanzar
El bloque legal y fiscal (§170.1 de la especificación maestra) **debe revisarlo un profesional
cualificado**. No se lanza sin eso.
