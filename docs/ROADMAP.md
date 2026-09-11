# ROADMAP — Cuotly

La Fase 1 se construye por **hitos**. Cada hito termina con `pnpm typecheck && pnpm lint && pnpm test`
en verde, y con una parada para que Bosco lo revise antes de empezar el siguiente.

El orden no es negociable: cada hito se apoya en el anterior. **El hito 2 es la referencia de calidad
de todo el proyecto** — es la rebanada vertical que el resto del código imita.

---

## Estado de los hitos

Actualizado el 02/09/2026.

| Hito | Estado | Nota |
|---|---|---|
| 1 · Cimientos | Cerrado | |
| 2 · Identidad, espacios y permisos | Cerrado | Rebanada vertical de referencia. |
| 3 · Motor de tiempo | Cerrado | |
| 4 · Solicitudes y clasificación | Cerrado | |
| 5 · Consumos y aceptación | Cerrado | Servidor y dominio; sin pantallas. |
| 6 · Trabajos, tareas, asignación y carga | Cerrado | Servidor y dominio; sin pantallas. |
| 7 · Mensajes, archivos y finanzas | Cerrado el 31/08/2026 | Ver salvedades abajo. |
| 8 · Inicio por rol, búsqueda, notificaciones y cierre | Servidor, dominio, armazón y pantallas | CA-19 cumplido el 02/09/2026. Ver salvedades abajo. |

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

1. **CA-19: CUMPLIDO el 02/09/2026.** Se deja debajo el historial de cómo
   se llegó, porque cada "al día" explica por qué antes no lo estaba y qué
   faltaba; el veredicto está al final del apartado. El
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

   **Al día 02/09/2026, por la tarde**: eso es lo que hay ahora en
   `apps/web/e2e/ca19-recorridos-movil.spec.ts`, a 390 px de ancho y
   pulsando: pedir un cambio, validar la clasificación, aceptar, asignar,
   comenzar, bloquear, desbloquear, publicar, corregir, registrar un pago,
   consultar y ver el equipo. Todo lo que ESCRIBE ocurre en el segundo
   restaurante del sembrado ("Café Prueba", EST-0002) para no mover el
   suelo del otro archivo, que cuenta cosas exactas de "Bar Demo".

   **Y destapó una avería mucho mayor, que es la razón de ser de este
   recorrido**: cinco archivos de acciones exportaban una constante (el
   estado inicial del formulario) además de sus funciones. Un archivo
   `"use server"` **solo puede exportar funciones asíncronas**, así que
   Next.js tiraba el módulo entero al evaluarlo y **ninguna** de sus
   acciones funcionaba: mensajes, trabajos (asignar, comenzar, bloquear,
   publicar), solicitudes (validar, pedir información, rechazar), finanzas
   (registrar un pago) y correcciones. Casi todo lo que escribe en la
   aplicación.

   Cómo se veía: el formulario enviaba, el servidor devolvía un 500 y
   `useActionState` dejaba el estado como estaba, así que la pantalla no
   cambiaba **y tampoco daba error**. Indistinguible de "no ha pasado
   nada". No lo vio `tsc`, ni eslint, ni `next build` —el módulo compila
   sin quejarse; el fallo solo aparece al ejecutar la acción—, y por eso
   pasó por cuatro revisiones sin que nadie lo notara: hasta que no hubo un
   test que PULSA, no había forma de verlo. El barrido de
   `src/app/use-server-exports.test.ts` recorre ahora todos los archivos
   con la directiva y falla si alguno exporta otra cosa.

   Y dos más, del mismo tipo —flujos que no se podían completar y que
   ninguna revisión de código había visto porque hasta ahora nada pulsaba
   los botones—:

   - **Asignar llamaba a la función equivocada.** El botón usaba
     `apply_job_assignment()`, el ayudante interno, en vez de
     `assign_job()`, que es donde están la capacidad `assign_jobs`, la
     idempotencia de CA-17, el estado y la elegibilidad del candidato
     (RN-ASG-02). No llegó a saltarse ningún control porque el ayudante
     tiene el EXECUTE revocado y PostgREST devolvía 403; el botón
     simplemente no asignaba.
   - **El restaurante no podía pedir su corrección gratuita** (RN-COR-01).
     La pantalla del cliente leía la tabla `jobs`, y el cliente no puede
     leerla a propósito: la fila entera es organización interna (P7) y
     lleva cuatro identidades del equipo (CA-04). Devolvía siempre null y
     el formulario no aparecía nunca. Lo arregla la migración
     `20260902000043_client_request_job`, con una función que contesta
     solo el estado del trabajo y si queda corrección.

   El recorrido destapó de paso un agujero de producto que no era del
   armazón sino del dominio: **la clasificación no la llamaba nadie**.
   `src/services/ai-classifier.ts` existía desde el Hito 4, con sus tests,
   y ninguna pantalla lo usaba, así que una solicitud enviada se quedaba en
   "Recibida" para siempre y el flujo solicitar → aceptar era imposible de
   completar desde la interfaz. Ahora la llama el propio envío, que es lo
   que dice RN-CLS-01 ("al enviarse una solicitud").

   **Decisión de Bosco, 02/09/2026, y ya implementada**: el análisis se
   intenta solo al enviarse la solicitud y, si ese primer intento falla, el
   equipo autorizado ve un botón **"Reintentar análisis"**. No aparece en el
   camino normal —la pantalla solo lo pinta con la solicitud en "Recibida",
   que es justo donde la deja un análisis fallido— ni lo ve el cliente, que
   no entra en esa pantalla.

   El permiso lo da la migración `20260902000044`, y son DOS mitades, no
   una: `begin_request_analysis()` acepta ahora al cliente (camino
   automático) **o** a quien tenga `manage_requests`, y
   `record_classification()` acepta a los mismos como actor — sin esa
   segunda mitad el reintento habría movido el estado y fallado al grabar.
   Para preguntar por la capacidad de un usuario concreto sin duplicar la
   matriz de quién puede qué, esa matriz vive ahora en
   `has_capability_as(space, user, cap)` y `has_capability()` la llama con
   `auth.uid()`: un único sitio, dos puertas.

   Y la clasificación deja de estar copiada en dos sitios: envío y
   reintento llaman a `clasificarSolicitud()`
   (`src/services/request-classification.ts`). La diferencia entre ambos es
   deliberada — el envío ignora el fallo (RN-CLS-02, "el flujo nunca se
   bloquea por la IA") y el reintento lo enseña, porque alguien lo ha
   pedido a mano.

   **CA-19 está cumplido.** Los doce tests pasan en verde en Windows el
   02/09/2026, contra el proyecto real y el espacio sembrado: los nueve de
   lectura y los tres del recorrido a 390 px. Ya no queda ningún flujo
   principal que no se pueda completar desde un teléfono.

   Lo que costó llegar merece quedar escrito, porque no fue el criterio:
   fueron **cuatro fallos de producto** que ninguna de las seis revisiones
   de código había visto, y que solo aparecen cuando algo PULSA los
   botones. Ninguno se veía en pantalla — los cuatro se manifestaban como
   "no pasa nada".

   Y una lección sobre el banco de pruebas: la suite con datos corre contra
   `next build && next start`, no contra `next dev`. Tres rondas enteras de
   fallos fueron el servidor de desarrollo compilando bajo demanda mientras
   varios tests le pedían pantallas; ninguno era un fallo de la
   aplicación.

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

   **Al día 02/09/2026**: Bosco decide desplegar en **Vercel**, y el cron
   queda preparado — `apps/web/vercel.json` lo declara una vez al día
   (`0 6 * * *`, lo máximo que admite el plan Hobby) sobre
   `/api/cola`, la ruta responde también a GET (que es como invoca Vercel) y
   acepta `CRON_SECRET` además de `QUEUE_RUNNER_SECRET`, porque el cron de
   Vercel manda esa cabecera él solo y obligar a duplicar el mismo valor en
   dos variables es una avería con fecha. La puerta tiene tests: sin
   secreto configurado responde 503 y no ejecuta nada, con cabecera
   equivocada 401, y cierra igual por GET que por POST.

   Sigue faltando **desplegar**: nadie ha ejecutado esto en Vercel todavía,
   y `vercel.com` está bloqueado desde el contenedor de desarrollo, así que
   tres detalles del contrato de su cron (frecuencia permitida según plan,
   `maxDuration` y que la invocación llegue) están escritos de memoria y hay
   que confirmarlos al desplegar. Están señalados como tales en
   `docs/DESPLIEGUE-VERCEL.md`. Y el primer envío real de correo con Resend
   —dominio verificado incluido— no se ha visto nunca.

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

8. **El coste de la IA se registra en céntimos, y con Haiku 4.5 siempre
   sale 0.** El clasificador pasó a `claude-haiku-4-5` el 02/09/2026
   (decisión de Bosco): la tarea es una clasificación en cuatro categorías
   cerradas, con las definiciones dadas enteras en el prompt y una persona
   validando después (RN-CLS-03). Las constantes de precio se ajustaron con
   él —1,00 $ / 5,00 $ por millón, frente a 5,00 $ / 25,00 $ de Opus 5—,
   porque quedarse con las viejas habría escrito un coste cinco veces mayor
   en `ai_usage`, que es un libro inmutable.

   Efecto colateral que conviene decidir: con esos precios y `max_tokens` en
   512, una clasificación cuesta ~0,03 céntimos y `estimated_cost_cents`
   (RN-CLS-05) **redondea a 0 en todas las llamadas**. La columna deja de
   informar de nada mientras el modelo sea Haiku. Se puede vivir con ello
   —el consumo real se reconstruye de `input_tokens`/`output_tokens`, que sí
   se guardan— o cambiar la unidad a milicéntimos. Es una decisión de
   producto, no se toma por cuenta propia.

9. **La app móvil (`apps/mobile`) es un adelanto consciente, no alcance
   colado.** El PRD §24.1 sitúa "app móvil nativa y push" en la Fase 4, y
   la revisión la señaló como fuera de alcance. Se construyó en el Hito 1
   porque así se aprobó al empezar (web y móvil en paralelo) y hoy contiene
   solo HU-01: registro y login contra Supabase. El push, que es lo que el
   PRD aplaza de verdad, sigue sin existir. Queda dicho para que nadie lo
   confunda con la Fase 4 hecha a medias.

10. **El área de cliente arranca, y no está terminada.** La primera pantalla
   con datos reales del producto: `/espacios/<espacio>/restaurantes/<id>`,
   con el estado del servicio, la bolsa del ciclo, la lista de solicitudes
   con su estado, el formulario para pedir un cambio (HU-10) y el botón de
   aceptar (HU-14). Todo lo que muestra lo filtra RLS; no hay ni una
   comprobación de permisos escrita en la pantalla, a propósito.

   Lo que NO tiene todavía: mensajes, archivos y finanzas del cliente.

   **Al día 02/09/2026 ya tiene pruebas de extremo a extremo**: el detalle
   de la solicitud existe, y doce tests de Playwright entran con sesión de
   verdad sobre el espacio sembrado — nueve leen y tres recorren los flujos
   pulsando, con anchura de teléfono. La salvedad de "no se puede probar
   sin un entorno con Supabase sembrado" decae: el entorno es el proyecto
   real y el sembrado es `supabase/seed/espacio-demo.sql`.

11. **`database.types.ts` ya está al día** (02/09/2026). Se regeneró contra
    el proyecto real con las 42 migraciones aplicadas: pasó de 1.014 a
    4.711 líneas y dejó de necesitar añadidos "(a mano)". La única
    excepción es la firma de `client_request_job()` (migración 43), añadida
    a mano con el formato exacto del generador; conviene regenerarlo entero
    con `supabase gen types` en la próxima ocasión que haya CLI.

12. **El lado del equipo tiene ya sus pantallas de operación.** Bandeja de
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

14. **Las finanzas del equipo, cerradas: HU-25, HU-26 y HU-27** (03/09/2026).
    Eran las tres piezas que el Hito 8 dejó a medias porque tenían servidor
    y no pantalla.

    - **HU-26 · la fecha del cobro.** El formulario de Finanzas registraba
      importe y método pero no fecha, así que `register_payment()` se
      quedaba con su `default now()`: un cobro que entró el viernes y se
      apuntó el lunes quedaba fechado el lunes. Ahora hay campo de fecha, y
      la conversión de día natural a `timestamptz` la hace
      `paymentDayToTimestamp()` en `src/core/finance.ts` anclando al
      **mediodía de la zona del espacio** —no a las 00:00 UTC, que le
      corría el día a cualquier espacio al oeste de Greenwich, ni al
      mediodía UTC, que se lo corría a UTC+13 y UTC+14—. El día propuesto
      por defecto también sale de la zona del espacio y no de la del
      servidor (`todayInTimeZone()`). Comprobado en vivo: guardando el 3 de
      septiembre desde Madrid, `paid_at` es `10:00Z`, que son las 12:00 de
      ese mismo día allí.

      De paso, la clave de idempotencia pasa de `ui:<cobro>:<céntimos>` a
      `ui:<cobro>:<céntimos>:<día>`. La anterior no distinguía un doble
      clic de una segunda entrega a cuenta del mismo importe: la segunda se
      descartaba en silencio y la pantalla decía "Pago registrado".

    - **HU-27 · el trabajador marca pagado sin entrar en Finanzas.** El
      formulario de pago vive ahora en `src/components/` y aparece también
      en el detalle del trabajo, que es por donde el trabajador llega a su
      restaurante. Es el mismo formulario y la misma función a propósito:
      lo que le está vedado a un trabajador —cambiar precios, perdonar
      deuda, reembolsar— no está ahí porque tampoco se lo permite el
      servidor. Comprobado en vivo con la trabajadora sembrada, y
      comprobado también el lado que importa: quitándole la autorización
      sobre un restaurante, `charges` le devuelve **cero filas**,
      `charge_outstanding_cents()` responde "No tienes visibilidad
      financiera de este establecimiento" y `register_payment()` responde
      "Solo puedes marcar como pagado un cobro de un restaurante que tengas
      asignado" (RN-FIN-05, CLAUDE.md MUST).

    - **HU-25 · el libro de consumos para el equipo**, en
      `/espacios/<espacio>/restaurantes/<id>/consumos`, con cada apunte, su
      tipo, su motivo y **su autor**, que es lo que lo distingue del libro
      que ya veía el restaurante en su facturación. La identidad no la
      decide la pantalla: `establishment_consumption_ledger()` solo
      devuelve `author_id` a quien es del espacio, y al cliente le llega
      nulo, así que la misma pantalla no tiene por dónde enseñarle una
      persona. Verificado con las tres identidades sembradas: el equipo ve
      el autor, el cliente se ve a sí mismo como "Tú", y el cliente del
      otro restaurante no ve ni una fila.

    **Lo que esta tanda NO entrega, y hay que decirlo:**

    - El **justificante** de HU-26 sigue sin estar. Es la cuarta pieza que
      pide la historia y depende del bucket de Storage, que no existe en
      ninguna migración. El formulario no finge un campo que no guardaría
      nada.
    - La **ficha del restaurante del PRD §15.2** —cinco pestañas, datos
      fiscales, notas internas, archivos— tampoco. Lo que hay en
      `/espacios/<espacio>/restaurantes` es un listado mínimo cuya razón de
      ser es dar entrada al libro de consumos, y además tapa un agujero que
      venía del Hito 8: ese destino del menú de escritorio existía y
      devolvía 404. La pantalla lo dice en claro en vez de aparentar una
      ficha (P6). Siguen sin ruta `restaurantes/nuevo`,
      `tareas`, `menu-diario`, `mensajes`, `calendario`, `informes`,
      `equipo`, `planes`, `ajustes` y `mas` del mismo menú.

15. **Los archivos, conectados de verdad** (03/09/2026). Era el bloqueante
    que arrastraban HU-26 y HU-35: el catálogo entero existía —`files`,
    `file_versions`, `file_links`, `register_file()`, `can_read_file()`,
    `can_write_file()`, `attach_file_to_message()`,
    `upload_payment_receipt()`— y **no había ningún sitio donde poner los
    bytes**. Ni un bucket.

    - **El bucket** (migración 45) es privado, con el límite de 25 MB y la
      lista blanca de RN-ARC-06 declarados también ahí, y `storage.objects`
      se queda **sin ninguna política**: con RLS activado eso significa
      "nadie", así que las dos únicas puertas son el `service_role` y las
      URLs firmadas que emite el servidor. Es deliberado y va explicado en
      la cabecera de la migración: las reglas de quién sube y quién ve ya
      están escritas una vez en `can_write_file()` y `can_read_file()`, y
      repetirlas parseando el nombre del objeto sería tenerlas en dos
      sitios.

    - **Los bytes no pasan por la aplicación.** El navegador sube
      directamente al bucket con una URL firmada que el servidor emite
      *después* de comprobar `can_write_file()`, y por la server action solo
      viaja un uuid. La razón es prosaica: RN-ARC-06 permite 25 MB y el
      cuerpo de una server action va por la función de Vercel, cuyo límite
      es mucho menor. Subir por ahí habría sido escribir una función que
      falla con cualquier foto de móvil.

    - **Se valida el objeto, no lo que dice el formulario.** Antes de
      registrar nada, el servidor pregunta a Storage el tamaño y el tipo
      **reales** del objeto guardado y valida contra eso; si no vale,
      retira los bytes y no hay archivo. Quien sube controla lo que declara,
      así que declarar no es validar.

    - **La descarga es `/api/archivos/<id>`**, que comprueba
      `can_read_file()` con la sesión de quien pide y redirige a una URL
      firmada de cinco minutos (RN-ARC-08). A quien no puede verlo se le
      responde **404 y no 403**: un 403 confirmaría que el archivo existe, y
      para un trabajador husmeando la facturación de un restaurante
      (RN-ARC-05) eso ya es información.

    Con eso quedan cerradas las dos cosas que la tanda anterior dejó
    pendientes:

    - **HU-26 · el justificante.** El equipo lo adjunta al registrar el
      cobro y el restaurante lo envía desde su facturación
      (`upload_payment_receipt()`, RN-FIN-06). El aviso de "subir un
      justificante todavía no se puede" ha desaparecido de la pantalla
      porque ya se puede.
    - **HU-35 · los adjuntos de un mensaje.** Se enganchan con
      `attach_file_to_message()` después de publicar, porque esa función
      necesita el mensaje ya creado. Si el enganche falla, el mensaje se
      queda publicado sin adjunto y se dice: RN-MSG-08 prohíbe borrarlo,
      así que fingir que todo fue bien sería mentir.

    **Comprobado en vivo contra el proyecto, todo con rollback:** el
    restaurante registra un archivo de facturación (que `register_file()`
    marca solo como "compartido con el restaurante"), lo envía como
    justificante y queda enlazado al cobro; un cliente de otro restaurante
    no lo ve y `files` le devuelve cero filas; la **trabajadora puede
    adjuntar** un justificante (RN-FIN-05) y **no puede verlo después**
    (RN-ARC-05) —cero filas también—; el propietario ve los dos; el
    restaurante adjunta a su propio mensaje y el equipo lo ve; y adjuntar a
    un mensaje ajeno se niega. Nada de eso quedó escrito: los contadores de
    `files`, `file_versions`, `file_links`, `receipts` y `messages` siguen a
    cero.

    **El movimiento real de bytes, comprobado el 03/09/2026.** Es lo único
    que no se puede verificar con SQL, y quedó escrito como
    `pnpm comprobar:storage`: recorre el camino entero —firmar, subir sin
    sesión, leer los metadatos del objeto guardado, firmar la descarga,
    comparar los bytes— y además comprueba que el bucket está cerrado a la
    clave pública. **Lo ejecutó Bosco con la clave de servicio y dio todo
    correcto**, así que los archivos están vistos funcionar de punta a
    punta y no solo razonados.

    **Lo que sigue sin estar:** la segunda mitad de RN-ARC-08 ("se optimiza
    la versión visual conservando el original") necesita una tubería de
    transformación de imágenes que la Fase 1 no monta, y ya estaba dicho en
    `src/services/file-storage.ts`. Tampoco hay recogida de huérfanos: quien
    abandone entre la firma y el registro deja un objeto sin fila en
    `files`, invisible para la aplicación pero ocupando sitio. Y no hay
    pantalla de catálogo de archivos por establecimiento (RN-ARC-01 a
    RN-ARC-04, con sus versiones y su marca de interno / compartido): lo
    que hay son los dos sitios donde se sube y se descarga.

16. **Equipo y calendario, con pantalla: HU-29 a HU-32** (03/09/2026).

    - **HU-29 · el supervisor.** "Supervisor" no es un rol, es una relación
      Administrador–Trabajador (RN-SUP-01 a RN-SUP-06), y ahora se asigna
      desde `/equipo`, con su sustituto y sus fechas. La tabla del equipo y
      las invitaciones salen del inicio del espacio, donde estaban de
      prestado, y pasan a su destino del menú, que hasta hoy devolvía 404.
    - **HU-30, HU-31 · ausencias.** El trabajador declara disponibilidad y
      pide una ausencia; el administrador la aprueba y ve qué trabajos
      quedan sin cobertura.
    - **HU-32 · festivos y cierres** del espacio, con su auditoría.

    La aritmética de días civiles —límites de mes, ventanas de sustitución
    vigentes, validación de un rango de ausencia— vive en
    `src/core/team-calendar.ts` con sus tests, sin Supabase ni React
    (CLAUDE.md). Reutiliza `zoneOffsetMinutes()` de `core/finance.ts`, que
    pasa a exportarse: no es de finanzas, es el primitivo de zona horaria
    que necesita cualquiera que convierta un día del espacio en un
    instante, y lo estrenó HU-26 por casualidad.

    **Migración 46 · el aviso de consumo pasa a ser solo del restaurante.**
    La fila del §18 describe los umbrales del 80 % y el 100 % y **no dice a
    quién se avisa**. La migración 41 rellenó ese silencio aplicando
    RN-NOT-02 y avisaba también al propietario y a los administradores, y
    quedó anotado como matiz a confirmar. Decisión de Bosco: la bolsa es
    del restaurante y quien tiene que reaccionar es él; el equipo lo ve en
    la ficha cuando entra. Solo cambia a quién se emite —umbrales, cálculo
    y deduplicación siguen igual— y los avisos ya emitidos al equipo no se
    tocan, que son historial. El control del test SQL, que exigía lo
    contrario, se ha invertido para que reintroducir al segundo
    destinatario haga fallar.

    **Y un barrido nuevo que faltaba hacer desde el Hito 8:**
    `navigation-routes.test.ts` recorre todos los destinos que pinta el
    armazón, con los cinco roles, y falla si alguno lleva a una ruta que no
    existe y que no esté clasificada con su motivo. El menú de §20.2 se
    escribió entero antes que las pantallas, así que hubo semanas con
    destinos que llevaban a un 404 sin que nada lo dijera; se encontró dos
    veces a mano y tarde. No exige que estén todas —la Fase 1 sigue—: exige
    que nadie añada un destino sin ruta en silencio, y que quien construya
    una pendiente venga a borrarla de la lista. Los nueve que quedan hoy
    están ahí enumerados, cada uno con su porqué: `/tareas` (HU-21),
    `/planes` (HU-07), `/ajustes` (HU-36), `/mensajes` (§66.2), `/mas`
    (§20.3), `/informes` (Fase 3), `menu-diario` (Fase 2, dos rutas) y
    `/restaurantes/nuevo`.

17. **HU-21, las tareas, con pantalla** (03/09/2026). Era la última
    historia del flujo operativo sin interfaz: el Hito 6 dejó `tasks`,
    `create_job_task()`, `update_task_state()`, `cancel_task()` y los
    puntos de `src/core/load-points.ts` probados, y ninguna pantalla los
    usaba. El destino `/tareas` del menú devolvía 404 desde el Hito 8.

    - **El desglose vive en el detalle del trabajo**, que es donde está
      quien desglosa: alta con título, duración y responsable, reparto,
      avance (comenzar, bloquear, reanudar, marcar hecha) y cancelación.
      El peso de §14.4 no lo manda el formulario: lo deduce el servidor de
      la duración, y por encima de 4 h RN-ASG-16 lo rechaza en vez de
      inventarse una categoría.
    - **Y el reparto de puntos de RN-ASG-14**, calculado con la tabla de
      `src/core/load-points.ts`: cuando el trabajo está desglosado, sus
      puntos generales dejan de sumar y cada persona recibe los de sus
      tareas. Las tareas sin repartir lo dicen en claro en vez de
      atribuirle sus puntos a nadie (P6).
    - **`/espacios/<espacio>/tareas`**, con sus tres filtros. Qué tareas ve
      cada uno lo decide `tasks_select`, no la pantalla: el cliente no ve
      ninguna, porque la fila entera es organización interna (P7).

    **Migración 47 · el hueco que no se ve hasta que hay pantalla.**
    `create_job_task()` acepta responsable **al crearla**, y no había
    ninguna función para ponérselo después. Una tarea creada sin nadie —lo
    natural cuando primero se desglosa y luego se reparte— se quedaba sin
    repartir para siempre, porque `tasks` no tiene política de UPDATE a
    propósito. HU-21 dice "desglosar **y repartirlas**", así que solo
    estaba la primera mitad. La arreglan `assign_task()` y
    `list_task_candidates()`, que repiten las guardas de
    `create_job_task()` en vez de relajarlas: RN-ASG-01 (repartir una tarea
    no concede acceso a un establecimiento que no se tenga autorizado, que
    es el agujero que la revisión del Hito 6 ya tuvo que cerrar en la
    puerta de al lado) y RN-ASG-17 (los puntos de carga de los compañeros
    solo se le devuelven a quien tiene `assign_jobs`; al responsable que
    reparte sus propias tareas se le da la lista sin ellos).

    **Verificado contra una base de datos de verdad, no razonado.** Las 47
    migraciones se aplicaron desde cero sobre un PostgreSQL 16 con los
    roles y el esquema `auth` de Supabase emulados, y ahí pasan las siete
    suites de `supabase/tests/` más la nueva
    `hu21_reparto_tareas.sql`, que además corre en CI. Las dos guardas
    están comprobadas **con mutación**: quitando la de RN-ASG-01 el test
    falla, y haciendo que los puntos se devuelvan siempre, también.

18. **Tres listas de estados llevaban meses desfasadas de la base, y el
    barrido que decía vigilarlas no existía** (03/09/2026). Apareció al ir
    a pintar el estado de una tarea, que es lo primero que lo tocaba.

    `src/core/naming.ts` —el archivo de CA-21, el que dice que "solo existe
    UN sitio donde un estado tiene nombre"— **redeclaraba a mano** tres
    listas que ya tenían dueño en `src/core/`, y las tres se habían quedado
    atrás:

    | Lista | Lo que decía | Lo que admite la base |
    |---|---|---|
    | Solicitudes | 14 estados | 15: faltaba `correction_requested` |
    | Trabajos | 9, con un `cancelled` | 11: faltaba `reassignment_requested`, y los cancelados son los dos de RN-JOB-04 |
    | Tareas | `done`, sin `blocked` | `completed` y `blocked` |

    Consecuencias que ya estaban en pantalla: un trabajo en
    `reassignment_requested` enseñaba el valor crudo en inglés, y
    `jobTone()` comparaba con un `"cancelled"` que la base no produce
    nunca, así que un trabajo cancelado salía en gris en vez de en rojo.

    Por qué no lo vio nadie: `naming.test.ts` comparaba el diccionario con
    la lista equivocada —los dos lados estaban mal a la vez, así que
    coincidían—, y la cabecera del archivo afirmaba desde el Hito 8 que
    `hito8_inicio_busqueda_notificaciones.sql` comprobaba la coincidencia
    con los CHECK de la base. **No lo comprobaba: esa comprobación no
    existía en ningún archivo del repositorio.** Es la cuarta vez en este
    proyecto que una garantía escrita en un comentario resulta no estar
    implementada.

    Arreglado en los tres sitios: `naming.ts` ya no redeclara nada
    —importa de `request-states.ts` y `job-states.ts`, que estaban bien—,
    el diccionario nombra los estados que faltaban, y el nuevo
    `state-catalogue.test.ts` lee los CHECK de las migraciones y falla si
    el catálogo y la base dejan de coincidir. Comprobado con mutación.

    De paso apareció un **segundo diccionario** de los mismos estados en
    `es.space.jobs.states`/`taskStates`, con nombres distintos para lo
    mismo ("Pendiente de asignación" frente a "Pendiente de asignar",
    "Completada" frente a "Hecha"). No lo usaba ninguna pantalla y
    `naming.test.ts` no lo veía. Eliminado.

19. **HU-07, planes y servicios, con pantalla** (03/09/2026). El plan
    tenía servidor entero desde la migración 40 —alta con permanencia,
    mejora inmediata, cambio programado, prorrateo— y al ir a construirle
    la pantalla aparecieron tres huecos que solo se ven cuando alguien
    tiene que pulsar un botón. Es el mismo patrón que la 47 con las tareas,
    y ya van tres veces: **el servidor "completo" de un hito no está
    completo hasta que una pantalla lo usa.**

    - **Los servicios no se podían contratar.** `subscriptions` admite
      `kind = 'service'` desde el Hito 5 y **ninguna función escribía una**:
      `create_plan_subscription()` solo crea planes. Menú Diario, que es
      medio catálogo de Restavor (RN-COM-08 a 10), no se podía asignar a un
      restaurante ni a mano. La primera mitad de HU-07 —"asignar un plan **y
      servicios**"— sencillamente no existía.
    - **Un cambio programado no se podía deshacer.** El índice único
      parcial deja como mucho uno vivo, así que programar el plan
      equivocado bloqueaba la suscripción hasta la renovación, sin salida.
      El estado `cancelled` llevaba desde el principio en el CHECK
      esperando a que alguien lo pusiera.
    - **El prorrateo no se podía enseñar antes de cobrarlo.**
      `plan_change_proration()` es interna con razón (no comprueba
      permisos), así que la pantalla no tenía forma de decir "esto te va a
      cobrar 125,92 €" antes de confirmar. Cobrar sin enseñar la cifra es
      justo lo que prohíbe P6.

    Y una cuarta cosa, más callada: **el ciclo de consumo no existía hasta
    que alguien aceptaba la primera solicitud**, así que un restaurante
    recién dado de alta enseñaba una bolsa vacía que no era la suya. Ahora
    se abre al dar de alta el plan. No se inventa nada: sale del mismo
    `get_or_create_consumption_cycle_internal()`, con el mismo cálculo, así
    que el ciclo es exactamente el que habría tenido — lo único que cambia
    es cuándo se ve. La migración incluye el relleno para los planes que ya
    estaban de alta sin ciclo abierto.

    Todo eso es la **migración 48**, aplicada al proyecto y comprobada en
    vivo con las identidades sembradas, con rollback: la trabajadora no
    contrata servicios ni ve el prorrateo; el propietario sí, y contratar
    dos veces devuelve la misma suscripción (CA-17); la permanencia del
    servicio sale a 3 meses (RN-COM-09); el prorrateo se lee sin escribir
    un solo apunte; anular un cambio programado lo deja en `cancelled` en
    vez de borrarlo (CLAUDE.md MUST NOT) y libera el índice para programar
    otro, y anularlo dos veces devuelve `false` sin error. Nada quedó
    escrito salvo el relleno de ciclos, que es el efecto buscado.

    **Lo que NO hace, y se dice en vez de fingirlo:**

    - **La mensualidad de un servicio sigue siendo Fase 2.** RN-COM-08 fija
      dos precios para Menú Diario según el establecimiento tenga o no plan
      Premium activo, y el esquema no sabe cuál de los planes es "Premium":
      solo tienen nombre. Contratar el servicio queda registrado y su cobro
      llegará con Menú Diario. La pantalla lo dice.
    - **Dar de baja una suscripción suelta no existe.** El PRD define la
      baja a nivel de establecimiento (RN-EST-09) y no dice qué pasa si se
      cancela un plan o un servicio estando viva la permanencia de
      RN-COM-04/09. No me lo invento: no hay función, y la pantalla explica
      por qué.

    Con esto `/planes` sale de la lista de pendientes de
    `navigation-routes.test.ts`, que es el barrido que lo hizo notar: al
    existir la pantalla, el test falla hasta que alguien viene a borrar la
    entrada. Quedan siete destinos.

20. **HU-36, los ajustes del espacio y la auditoría, con pantalla**
    (03/09/2026). `/ajustes` era el destino más antiguo del menú de §20.2
    sin construir, y al construirlo volvió a pasar lo de siempre —van
    cuatro— pero esta vez lo que faltaba no era una función: era una
    **puerta abierta**.

    - **El espacio se podía renombrar, y cambiar de zona horaria, sin
      dejar rastro.** `spaces` tenía desde la migración 8 una política de
      UPDATE para el propietario y ninguna función: cambiar el nombre —o
      la zona horaria, que mueve el reloj contractual de TODOS los plazos
      vivos— era un UPDATE directo por PostgREST, sin actor, sin valor
      anterior y sin motivo. Es un MUST de CLAUDE.md y el principio P4 del
      PRD, incumplidos durante todo el proyecto porque ninguna pantalla lo
      hacía y nadie fue a mirar. Ahora la política **no existe** —`spaces`
      se queda sin ninguna de UPDATE, que en RLS significa "nadie"— y los
      dos cambios pasan por `set_space_name()` y `set_space_timezone()`,
      que comprueban `manage_space` y escriben en `audit_log`.
    - **Cambiar la zona horaria no versionaba los calendarios.**
      `space_working_hours` existe desde el Hito 3 para eso exactamente
      (RN-CLK-10: poder reconstruir qué calendario aplicaba a un tramo
      pasado) y nadie insertaba nunca una versión, porque nadie podía
      cambiar la zona. Ahora se da de alta la versión del calendario
      contractual y del de Menú Diario. El de **soporte no se toca**: §132
      fija su zona en Europa/Madrid y es un reloj distinto.
    - **La visibilidad de la auditoría no era la que dice §21.2.** La
      política vigente (migración 42) dejaba que **cualquier miembro
      activo** viera todo el espacio salvo lo financiero: un trabajador
      leía por RPC quién supervisa a quién, a quién se había invitado y qué
      accesos de cliente se habían revocado. Ahora el propietario ve su
      espacio entero, el administrador la operativa, y el trabajador sus
      propias acciones y las filas que ya puede ver.

    Cómo se reparte, porque el criterio importa más que la lista: **la
    capacidad que hace falta para ver una acción es la misma que hace
    falta para ejecutarla**. No es un invento para la pantalla, sale de
    `has_capability_as()`, que ya dice quién renombra el espacio, quién
    cobra y quién gestiona clientes. Y las familias que no dependen de una
    capacidad sino de la fila —trabajos, solicitudes, tareas, archivos,
    ausencias, correcciones— las resuelve `audit_entity_is_visible()`,
    que es **SECURITY INVOKER a propósito**: pregunta por la fila y deja
    que conteste la RLS de esa fila, en vez de escribir una segunda copia
    de esas reglas que el día que discrepara ganaría la peor.

    Todo eso es la **migración 49**, y la pantalla son dos: `/ajustes`
    (identidad del espacio, configuración contractual, calendarios
    vigentes, preferencias de aviso, mi cuenta) y `/ajustes/auditoria`
    (el libro, con filtros por familia y periodo y paginación de §20.7).
    De paso, la sección "Notificaciones" de §123 deja de ser servidor sin
    pantalla: `set_notification_preference()` existía desde el Hito 8 sin
    que nada la llamara, RN-NOT-03 incluido.

    **Verificado contra una base de datos de verdad, no razonado**, y esta
    vez de forma repetible: `supabase/tests/bootstrap-postgres-local.sql`
    emula lo que un proyecto de Supabase da por hecho —los tres roles, el
    esquema `auth`, el `storage` y, sobre todo, el `alter default
    privileges` que concede EXECUTE a `anon` y `authenticated`— así que
    las suites de `supabase/tests/` corren contra cualquier PostgreSQL 16
    sin Docker y sin CLI. Las 49 migraciones se aplican desde cero y pasan
    las diez suites, incluida la nueva `hu36_ajustes_auditoria.sql`.
    Comprobado **con mutación**, que es lo que separa un test de un
    adorno: devolviendo la política permisiva de la migración 42, el test
    falla; haciendo que `audit_entity_is_visible()` devuelva siempre
    `true`, falla; devolviéndole a `spaces` su política de UPDATE, falla.

    De paso, dos cosas que llevaban un día sin estar: `hu07_planes_y_servicios.sql`
    **no se ejecutaba en CI** —se escribió ayer y nadie la enganchó— y
    ahora sí, junto con la nueva.

    **Lo que NO entrega, y se dice en vez de fingirlo:**

    - **El cliente sigue sin ver auditoría.** §21.2 dice que el propietario
      de un restaurante ve la de su establecimiento, y no está: cada fila
      lleva `actor_id`, así que enseñársela rompería el MUST NOT de
      CLAUDE.md. Hace falta una proyección sin identidad, como la que ya
      tiene `establishment_consumption_ledger()`, y una pantalla suya.
      HU-36 es la historia del propietario del espacio.
    - **El logotipo del espacio (§124).** `files.establishment_id` es NOT
      NULL: hoy no existe un archivo que sea del espacio y no de un
      restaurante. La pantalla lo dice en vez de enseñar un botón muerto.
    - **Las secciones de §123 que son de otra fase** —integraciones,
      suscripción a Cuotly, exportación, propiedad y eliminación del
      espacio— se enumeran en la pantalla con su motivo, no se esconden.
    - **El recorrido de Playwright con datos.** `ca19-recorridos-movil.spec.ts`
      no crece con esta pantalla, igual que no creció con equipo,
      calendario, tareas ni planes: esos tests entran con sesión contra el
      proyecto real y desde aquí no se pueden ejecutar. Escribir uno sin
      haberlo visto pasar sería exactamente lo que este repositorio ha
      pagado caro cuatro veces. Queda dicho como deuda de las cinco
      pantallas, no de esta.

    **El matiz de §21.2 quedó confirmado el 04/09/2026** (decisión 14 de
    `docs/DECISIONES.md`, incorporada a §21.2 del PRD). La frase "los
    administradores, la operativa" no decía qué queda fuera. Bosco confirma
    la lectura implementada: los administradores gestionan **toda la
    operativa diaria, incluidas finanzas, cambios, menús e incidencias**, y
    quedan fuera la configuración del espacio (§125) y la
    gestión/composición del equipo —invitaciones, permisos, supervisores y
    las demás capacidades reservadas al propietario—, que son justo las que
    `has_capability_as()` no delega (`manage_space`, `invite_member`). No
    hubo que cambiar nada de la migración 49: es la derivación de lo que el
    permiso ya decía. Lo único que se añadió al confirmarlo es la mitad del
    test que faltaba —la familia `invitation`, que la confirmación nombra
    expresamente y que el fixture de `hu36_ajustes_auditoria.sql` ni
    siquiera generaba, así que esa parte de la comprobación era vacua.

    **La migración 49 está aplicada** desde el 04/09/2026: el proyecto ya
    va por las 49. No era solo aditiva —**retira `spaces_update_owner`**—,
    así que desde ahora ningún UPDATE directo sobre `spaces` funciona, ni
    el del propietario. Es el efecto buscado y ninguna pantalla lo usa
    (no hay ni un `.update(` sobre `spaces` en `apps/web/src`), y quedó
    comprobado en vivo: el propietario cambia 0 filas por UPDATE directo y
    sí renombra por la función, dejando su rastro.

    La comprobación entera, antes y después, está en
    `docs/DESPLIEGUE-SUPABASE.md`: las 49 migraciones desde cero más las
    diez suites y los dos scripts de concurrencia sobre un PostgreSQL
    local, las cuatro mutaciones que demuestran que la suite HU-36 falla
    cuando debe, las huellas `md5` que prueban que lo aplicado es
    exactamente lo que dice el repositorio, doce comprobaciones de
    comportamiento con las identidades sembradas y el SQL exacto para
    volver al estado de la 48.

    Un matiz que conviene no adornar: **hoy el estrechamiento de §21.2 no
    le quita a la trabajadora nada que antes viera** (ve 83 de 95 filas
    con la política nueva, y las 12 que faltan son financieras, que la
    anterior también le tapaba). Las 95 filas vivas son de cinco familias
    operativas y todavía no hay registrada ni una acción de configuración
    del espacio ni de composición del equipo. El cambio es real; su efecto
    empieza con la primera invitación o el primer cambio de permisos.

    Lo que ahora **sí** falta es desplegar la rama: la base va por delante,
    que es el orden correcto.

    Con esto `/ajustes` sale de la lista de pendientes de
    `navigation-routes.test.ts`. Quedan seis destinos.

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

> **Corrección del 08/09/2026 — no estaba resuelto.** Esta línea era falsa
> y conviene que se quede escrita como aviso. La cola sabía **despachar**,
> pero **nadie la llenaba**: no había una sola llamada a
> `enqueue_scheduled_job()` en todo el repositorio, ni en SQL ni en
> TypeScript, así que `scheduled_jobs` llevaba vacía desde el primer día y
> el cron de Vercel entraba cada mañana a reclamar de una tabla vacía. La
> mensualidad de RN-FIN-01 no se habría emitido jamás.
>
> Se cierra en el punto 24, y con él tres averías más que este silencio
> tapaba. La lección para el propio ROADMAP: "la función existe" no es
> "la función se ejecuta", y sin un test que recorra el camino entero
> —encolar, reclamar, ejecutar— la diferencia no se ve.

---

21. **Los destinos que faltaban del menú, y "Más"** (03/09/2026). De los
    nueve que el barrido de navegación tenía clasificados como pendientes
    quedaba **uno**, `/mensajes`, que cerró el punto 22 al día siguiente.
    Los otros ocho eran de tres clases distintas y se han cerrado como
    merecía cada una.

    - **`/mas` (§20.3) es la que de verdad faltaba.** La barra de móvil
      ofrece cinco destinos y un sexto botón "Más" que llevaba a un 404
      desde el Hito 8, así que un trabajador con el teléfono **no tenía
      forma de llegar** a Finanzas, al calendario ni a sus sesiones: los
      tenía en el menú de escritorio y en ningún sitio en móvil. Era un
      agujero de CA-19 que los recorridos no habían pillado porque
      probaban los flujos, no el desbordamiento de la barra.

      `moreDestinations()` **deriva** esa lista de las dos que ya existen
      —el menú completo del rol menos lo que ya está en la barra— en vez de
      escribirla a mano. Es la mitad estructural de CA-21 otra vez: una
      tercera lista escrita a mano sería la tercera que se queda desfasada,
      y de eso va entera la salvedad 18. Se le añaden "Cambiar de espacio"
      (§20.1) y "Mis sesiones" (HU-05), que no son del espacio sino de la
      cuenta y en móvil no tienen otro sitio.

      Con seis tests, y el que importa es el de cobertura: entre la barra y
      "Más" está **todo** el menú del equipo, así que ningún destino puede
      quedarse sin puerta en un teléfono. Los otros comprueban que no se
      repite ninguno, que al cliente no se le ofrece jamás una ruta del
      equipo, que Menú Diario solo se le ofrece a quien lo tiene contratado
      y que sin saber de qué restaurante hablamos va al selector y no a un
      404.

    - **`/informes` y `/menu-diario` (las dos del espacio, más la del
      restaurante) enseñan su estructura y dicen por qué están vacías.**
      Es literalmente lo que pide §20.2 para la Fase 1. El estado vacío
      **no** dice "todavía no hay datos", que sería mentir sobre el motivo:
      dice que no está construido y en qué fase llega (CA-20). Ni una cifra
      de ejemplo ni una gráfica de relleno (CLAUDE.md MUST NOT). Los
      números que se citan —30 actualizaciones, tres plantillas— son
      RN-COM-09 y RN-COM-10, y van en prosa: un contador a cero parecería
      un dato real.

    - **`/restaurantes/nuevo` (§20.5)** era solo una ruta que faltaba. El
      formulario es el mismo del Hito 2 que vive en el inicio del espacio.

    De paso, la resolución de "qué rol tiene quien mira y cuál es su
    restaurante" sale del layout a `src/components/shell/viewer.ts`, porque
    ahora la usan dos sitios: el armazón y "Más". Dos copias de eso
    discrepando harían que la barra y su desbordamiento ofrecieran cosas
    distintas.

    **Lo que quedaba pendiente era uno, `/mensajes`, y se cierra en el
    punto 22.**

22. **Mensajes, terminados: la bandeja y las dos conversaciones que no
    tenían pantalla** (04/09/2026, migración `20260904000050`, aplicada al
    proyecto). Los tres tipos de conversación de §66 existían en la base de
    datos desde el Hito 7 y solo uno se veía: la de solicitud. La interna
    de trabajo (§66.2) y la general del restaurante (§66.3) se podían crear
    por RPC y no las miraba nadie.

    - **La bandeja (`/mensajes`)** lista todas las conversaciones que quien
      mira puede leer, con el último mensaje y lo que lleva sin leer. El
      contador NO se calcula en la pantalla, y no por comodidad: "sin
      leer" se define contra `messages.sender_id`, una columna que el
      Hito 7 revocó a todo el mundo para que el restaurante no pueda
      distinguir individualmente a nadie del equipo. Sale de
      `list_conversations()`, que filtra con `can_read_conversation()` —la
      misma función que sostiene la política de la tabla, no una segunda
      copia de RN-MSG-03.

    - **La conversación interna del trabajo** se abre desde su ficha, y se
      crea al pulsar y no al mirar: una por cada trabajo que alguien
      hojea llenaría la bandeja de conversaciones vacías. El botón solo se
      le ofrece a quien es del espacio (P7: al restaurante no se le cuenta
      que existe una organización interna), y quien lo impide de verdad es
      `get_or_create_job_conversation()`.

    - **La general del restaurante** se monta en la ficha del restaurante,
      que es exactamente a donde llevaba "Mensajes" en el menú del cliente
      desde el Hito 8 — y donde no había ninguna conversación. Ese destino
      no estaba roto a ojos del barrido de navegación, porque la ruta
      existía; estaba vacío de lo que prometía.

    - **Dos fallos que salieron al montarlo, y ninguno era pequeño.** El
      primero: `list_conversation_messages()` le devuelve `sender_id` en
      null al restaurante **también en sus propios mensajes**, y las dos
      pantallas decidían "es mío" comparando esa columna, así que el
      restaurante veía **sus propios mensajes firmados como "Equipo de
      mantenimiento"**. Se arregla contestando la pregunta que la pantalla
      necesita sin revelar la columna (`is_mine`), no devolviéndole la
      identidad. El segundo, en la pantalla del cliente: decidía "es mío"
      por `sender_display === 'client'`, con lo que el mensaje de un
      compañero de local aparecía firmado como "Tú". Los dos vivían en un
      `if` dentro de un componente, donde no había forma de probarlos; la
      decisión está ahora en `resolveAuthorLabel()` (`src/core/messages.ts`)
      con sus tests, y las cuatro pantallas cargan la conversación con el
      mismo `loadConversation()` en vez de con cuatro copias.

    - **RN-MSG-06 y RN-MSG-07 tenían regla y no tenían interfaz.** Ahora la
      conversación marca dónde empiezan los mensajes nuevos y ofrece los 10
      minutos de edición sobre los mensajes propios. Quién puede editar lo
      decide `edit_message()`; la pantalla se adelanta con el mismo cálculo
      de `src/core/messages.ts`, y cuando el servidor dice que no, se
      enseña el motivo en vez de esconder el botón.

    - **Verificado, no supuesto.** `supabase/tests/bandeja_conversaciones.sql`
      (en CI) comprueba quién ve qué conversación, que la interna de
      trabajo no llega al cliente ni por la bandeja ni por su
      identificador, el contador de sin leer en sus tres estados, y —sobre
      la FIRMA de la función, no sobre los datos— que la bandeja no
      devuelve ninguna columna de identidad. Cada negativa va con su
      positiva. Comprobado además por mutación: quitarle el filtro de
      permisos a `list_conversations()` hace fallar la suite.

    **Lo que quedaba pendiente de §66 era uno, "Convertir en solicitud", y
    se cierra en el punto 23.**

23. **Convertir en solicitud, con la revisión que §68 exige** (04/09/2026,
    migración `20260904000051`, aplicada al proyecto). `convert_conversation_to_request()`
    existía y estaba probada desde el Hito 7, pero lo que crea es un
    **borrador**, y §68 dice que "antes de enviar se revisa alcance,
    destinatario y archivos". No había ninguna pantalla en la que
    revisarlo: el borrador aparecía en la lista del cliente, su enlace
    llevaba a una ficha de solo lectura con el estado "Borrador" y desde
    ahí no se podía ni cambiar ni enviar. Era un callejón sin salida.

    - **Elegir los mensajes (`/restaurantes/<id>/convertir`)** es una
      pantalla propia y no un modo dentro de la conversación. §68 habla de
      los mensajes *relevantes*, no del hilo entero, así que hace falta una
      casilla por mensaje; y el componente `Conversation` lo montan cuatro
      pantallas, de modo que un modo "elegir" que solo vale en una de las
      cuatro es la clase de bifurcación que acaba enseñando la casilla
      donde no toca. Cuelga del restaurante y no de `/mensajes` porque
      convertir es del lado del cliente: `create_request_draft()` exige
      `can_write_establishment()`, que deja fuera al equipo a propósito
      ("el equipo no crea solicitudes en nombre del cliente, solo las
      valida"). A propósito NO usa `loadConversation()`: ese cargador marca
      la conversación como leída, y entrar a elegir mensajes no es haber
      leído el hilo.

    - **Revisar el borrador (`…/solicitudes/<id>/borrador`)** tiene
      exactamente los tres apartados de §68, y salen de
      `DRAFT_REVIEW_POINTS` (`src/core/request-draft.ts`) para que no pueda
      faltar ninguno. La ficha de la solicitud redirige aquí mientras el
      estado sea `draft`: un borrador no es una solicitud que enseñar, es
      una que todavía se está revisando.

      · **Alcance.** El texto que trae son los mensajes pegados, que casi
        nunca es como uno redactaría lo que pide. `update_request_draft()`
        lo reescribe y deja versión en `request_versions` (RN-DAT-07) — la
        versión 2 que la migración `20260830000017` dejó dicho que no
        existiría "hasta que exista esa pantalla". Guardar sin cambiar nada
        no inventa una versión.

      · **Destinatario.** Se revisa, no se cambia, y la pantalla dice por
        qué en vez de callarlo: una solicitud es de un restaurante y el
        borrador sale de la conversación general de ese mismo restaurante.
        Mover un borrador a otro restaurante sería inventar una regla que
        el PRD no tiene —lo más parecido es RN-REQ-04, "copiar y pegar
        dentro del mismo grupo", que es otra operación y ya está hecha—.
        **§68 dice "se revisa el destinatario" y no dice si se puede
        cambiar: esta es la lectura que se ha implementado, y si Bosco
        quiere la otra, se hace aparte.**

      · **Archivos.** Se puede quitar el adjunto que se arrastró y no venía
        a cuento, y añadir el que faltaba. Quitar **no borra el archivo**:
        `detach_file_from_request_draft()` borra el ENLACE con el borrador
        y solo mientras es borrador; el archivo sigue en el catálogo con
        sus versiones y en el mensaje del que vino (CLAUDE.md MUST NOT,
        RN-MSG-08). En cuanto se envía, ese enlace ya es "vinculado a una
        operación" (RN-ARC-07) y no se toca.

    - **Enviar es el mismo camino que HU-10**: `submit_request()` y después
      la clasificación, con RN-CLS-02 vigente (la IA caída no bloquea
      nada). Hasta ese botón, el equipo no ve ninguna solicitud y **T1 no
      corre**: es justo lo que la revisión de §68 protege, y por eso el
      test lo comprueba en los dos sentidos.

    - **Un hallazgo de camino.** `convert_conversation_to_request()` nació
      en el Hito 7 con el `EXECUTE` que Supabase concede por defecto y
      nadie se lo quitó a `anon`: una función que ESCRIBE, abierta a quien
      no ha iniciado sesión. No era explotable —comprueba
      `can_read_conversation()` y sin sesión `auth.uid()` es null—, pero
      estaba abierta de verdad en el proyecto, comprobado en vivo el
      04/09/2026. La migración se lo revoca y el test lo vigila.

    - **Lo que NO se ha hecho, y por qué.** No hay forma de **descartar** un
      borrador: ningún estado de PRD §9.2 lo recoge y CLAUDE.md prohíbe el
      borrado físico, así que un borrador se envía o se queda. Inventar un
      estado "descartado" habría sido inventar producto.

    - **Verificado, no supuesto.** `supabase/tests/conversion_a_solicitud.sql`
      (en CI) comprueba que convertir crea un borrador y no arranca T1, que
      el alcance se versiona y que guardar sin cambios no, que quitar un
      archivo deja intactos el catálogo y el mensaje, que un archivo de
      otro restaurante no entra, que el rol Consulta y el equipo no
      escriben en el borrador, y que enviada ya no se toca. Cada negativa
      va con su positiva. Comprobado por mutación en cuatro puntos: quitar
      la comprobación de estado o la de permiso de `update_request_draft()`,
      la de estado de `detach_file_from_request_draft()` y la de
      establecimiento de `attach_file_to_request_draft()` hacen fallar la
      suite. La cuarta no la detectaba al principio —`can_read_file()`
      paraba antes al cliente— y por eso el fixture tiene un propietario
      global de grupo: sin esa identidad, la comprobación pasaba sin
      ejercitarse.

    **Con esto §66 y §68 quedan cerrados.**

24. **La cola que nadie llenaba** (08/09/2026, migraciones 52 y 53). El
    punto de arriba daba por cerrado en la migración 41 lo que no lo
    estaba. Cuatro averías encadenadas, y las tres últimas solo se veían
    porque la primera las tapaba.

    - **Nadie llamaba a `enqueue_scheduled_job()`.** Ni SQL ni TypeScript.
      `scheduled_jobs` estaba vacía, el cron reclamaba de una tabla vacía y
      se iba. Ni RN-FIN-01 (mensualidad), ni RN-FIN-10/11 (impago), ni
      RN-EST-09/10 (final de servicio), ni §6.4 (cambio de plan
      programado), ni los avisos del §18 se disparaban solos. Lo arregla
      `enqueue_due_scheduled_jobs()`, y el llenado se mete **dentro** de
      `runScheduledJobs()` para que no exista la forma de vaciar la cola
      sin haberla llenado: dejarlo como un paso más que la ruta tiene que
      acordarse de dar es exactamente como se perdió la primera vez.

    - **Y aunque se hubiera llenado, no habría cobrado.**
      `generate_monthly_charge_internal()` pasaba por
      `get_or_create_consumption_cycle()`, la **pública**, que comprueba
      `is_space_member()`. El proceso de la cola entra como `service_role`
      y no es miembro de ningún espacio, así que la excepción caía en el
      `exception when others then null` del barrido y **nadie se
      enteraba**. Por eso el test que más importa de los nuevos es el que
      ejecuta el barrido **sin identidad**, como el cron de verdad.

    - **Y aunque hubiera cobrado, el cobro nacía vencido.** `due_at =
      cycle_start`, así que RN-FIN-10 pausaba el restaurante 24 h después
      de emitirle la cuota. El PRD no fija plazo de pago y no se ha
      inventado uno: es `spaces.payment_term_days`, configurable, 7 días
      por defecto (RN-FIN-01b, decisión 15).

    - **Y habría cobrado de más.** `create_plan_subscription()` abría la
      bolsa y la permanencia pero **no emitía la mensualidad del primer
      ciclo**. Una mejora de plan dentro de ese ciclo cobra la
      **diferencia** (RN-COM-15) contra una base inexistente, y el barrido
      emitía después la mensualidad **entera** del plan nuevo por el mismo
      periodo. Restavor tenía el caso vivo: 299,96 € cobrados y 399 € a
      punto de emitirse encima.

    De propina, mirando esos datos salió una quinta:
    `change_plan_immediately()` insertaba el cobro de la diferencia en
    `charges` y **ninguna fila en `financial_entries`**. Como `charges` no
    tiene columna de estado a propósito —lo deriva `charge_status()`
    sumando apuntes—, ese cobro salía **saldado sin que nadie hubiera
    pagado**, el ciclo de impago no lo miraba nunca y no contaba en el
    panel. La migración 53 lo arregla y repara los cobros ya emitidos así.

    Cubierto por `supabase/tests/cola_llena_y_vencimiento.sql`, con un
    barrido en falso-cerrado que recorre **todos** los cobros y falla si
    alguno no tiene su apunte: esta avería se encontró mirando los datos,
    no leyendo el código, y la próxima tiene que romper el test.

La ficha del restaurante (§15.2) está **entera**: las cinco pestañas
—Resumen · Operación · Informes y datos · Gestión · Historial— y los cinco
bloques de Gestión —Plan · Pagos · Usuarios · Archivos · Integraciones—.

**La misma dirección sirve a los dos lados.** `/restaurantes/<id>` ramifica
por la membresía real del espacio: al equipo le da la ficha interna, al
restaurante lo suyo. Un restaurante es un restaurante y su enlace debería
ser el mismo lo mire quien lo mire; lo que cambia es qué se enseña.
Ramificar ahí no autoriza nada —si un cliente forzara `?vista=gestion`
seguiría viendo su pantalla, y aunque no ramificáramos, RLS y
`establishment_client_users()` le devuelven cero filas de todo lo interno—.

La pestaña viaja en la dirección (`?vista=gestion&bloque=archivos`) y no en
un estado del navegador: "los archivos de Magariños" es un enlace que se
comparte, el botón de volver deshace el cambio de pestaña, y la pantalla
entera es de servidor, así que no se pierde nada si no hidrata (CA-22).

**Lo que la Fase 1 no tiene aparece diciendo por qué**, no como un hueco ni
como un dato de ejemplo: el contador propio de Menú Diario (RN-CON-02), el
backup de la web, las integraciones analíticas y el botón de retirar un
acceso (RN-EST-05). Las maquetas de las que sale esta pantalla enseñaban
esos bloques rellenos y van marcadas como "Datos de ejemplo"; aquí no se
copiaron (CLAUDE.md MUST NOT). Los datos fiscales estaban en esa lista y ya
no: los guarda la migración 57 (punto 27).

Dos distinciones que la pantalla sí hace, y que se pierden fácil: una
consulta de usuarios **fallida** no es una lista vacía —"no se ha podido
comprobar" frente a "no hay nadie"—, y una bolsa del ciclo que el plan no
incluye no pinta barra, porque una barra al 0 % diría "te quedan todos",
que es lo contrario de lo que pasa.

La única pieza que faltaba **en el servidor** era la pestaña Usuarios, y por
un motivo que solo se ve al construirla: `profiles_select` deja ver el
perfil de quien comparte **espacio**, y un cliente no es miembro del
espacio, así que el equipo que le da servicio no podía leer su nombre. La
lista habría sido de uuids.

Se resolvió con una función que comprueba el permiso por su cuenta
(migración 55), no ensanchando la política de `profiles`: la política es de
toda la tabla y afectaría a cualquier consulta futura. Y la dirección **no
es simétrica**, que es lo que importa aquí: al equipo se le dice quién es
cada persona del restaurante —es a quien da de alta y a quien retira el
acceso—, y al restaurante no se le da la identidad de nadie del equipo. La
función no tiene rama de cliente: a quien no es del espacio le contesta con
cero filas, no con una lista distinta. Comprobado en vivo con las dos
identidades.

Con esto desaparece también la última salvedad de `database.types.ts`: ya
no queda ninguna función escrita a mano esperando su migración. Al
regenerar salió idéntica, así que no había desviación.

---

25. **Compartir con el restaurante, montado de punta a punta** (09/09/2026,
    migración 56). RN-ARC-04 dice dos cosas —que cada archivo está marcado
    **Interno** o **Compartido con el restaurante**, y que "un trabajador
    puede compartir después uno interno, y queda auditado"— y de las dos
    solo estaba la primera mitad de la primera: todo lo que subía el equipo
    nacía interno y ahí se quedaba.

    Faltaban **los dos extremos**, y el segundo es el que convierte a esto
    en una función y no en una columna:

    - **El botón.** `share_file_with_client()` existe desde el Hito 7, con
      su capacidad (`manage_files`), su idempotencia y su apunte en
      `audit_log`, y **no la llamaba ninguna pantalla**. Van cuatro veces
      —la 47 con las tareas, la 48 con los planes, la 50 con las
      conversaciones y ahora esta—: una función del servidor no está
      terminada hasta que algo la usa. Vive en el panel del archivo, no en
      la fila de la tabla, porque compartir **no se deshace** y la decisión
      se toma mirando qué es el archivo. La pantalla lo dice en claro en
      vez de callarlo: no existe la operación contraria, ni en el PRD ni en
      el servidor, y para cuando se quisiera desandar el restaurante ya lo
      ha visto.
    - **La marca, al subir.** El formulario de subida ofrece ahora
      Interno / Compartido, que es la primera frase de la regla. Por
      defecto interno, que es lo prudente en una operación que solo va de
      ida.
    - **El otro extremo, que no existía.** El restaurante **no tenía dónde
      ver un archivo compartido**: su pantalla no enseñaba archivos por
      ninguna parte, así que compartir era marcar una columna y nada más.
      Ahora tiene su catálogo, con la descarga por la ruta privada y
      temporal de RN-ARC-08. La consulta no lleva ni un filtro de
      visibilidad escrito en la pantalla: lo que llega es lo que
      `can_read_file()` deja pasar, y la facturación solo con visibilidad
      financiera (RN-FIN-07). Los archivados no se le ofrecen —RN-ARC-07,
      "se archiva, no se borra"— y siguen enteros para el equipo.

    **La migración 56 no añade lógica: cierra una puerta.** Las **siete**
    funciones que escriben archivos estaban abiertas a `anon` —Supabase
    concede `EXECUTE` por defecto y el Hito 7 no revocó ninguna—,
    comprobado en vivo, no supuesto. No eran explotables (las siete
    comprueban el permiso y sin sesión `auth.uid()` es null), pero son
    escrituras accesibles por RPC sin haber iniciado sesión: exactamente lo
    que la migración 51 encontró con `convert_conversation_to_request()`.
    `can_read_file()` y `can_write_file()` se quedan como están a
    propósito: viven dentro de las políticas de RLS y son la excepción
    documentada en la migración 32.

    **Verificado contra una base de datos de verdad, no razonado.** Las 56
    migraciones aplican desde cero sobre un PostgreSQL 16 con
    `bootstrap-postgres-local.sql`, y ahí pasan las **quince** suites en el
    orden de CI. La nueva, `compartir_con_el_restaurante.sql`, no repite lo
    que ya probaba el Hito 7: comprueba la consulta que hace la pantalla
    del restaurante tal cual —columnas enumeradas, y `select *` dando error
    de privilegios, que es el motivo de enumerarlas—, RN-FIN-07 en ese
    catálogo, que un trabajador no comparte lo que no puede ver
    (RN-ARC-05), que `files` **no tiene ninguna política de UPDATE** —que
    es lo que sostiene el "y queda auditado", porque no hay otra puerta— y
    los privilegios de las siete. **Comprobada con cuatro mutaciones**:
    devolverle el `EXECUTE` a `anon`, darle a `files` una política de
    UPDATE, quitarle a la función su `return` de idempotencia y hacer que
    `can_read_file()` ignore la visibilidad del cliente hacen fallar la
    suite, cada una por su comprobación.

    De paso, una comprobación que era **vacua** desde el Hito 7: aquella
    suite llama dos veces a `share_file_with_client()` "para probar la
    idempotencia" y no mira nada después, así que un segundo apunte de
    auditoría habría pasado inadvertido. Ahora se cuentan los apuntes, que
    es lo que hace falta cuando hay un botón que se puede pulsar dos veces.

    **Lo que NO entrega, y se dice en vez de fingirlo:**

    - ~~**La migración 56 no está aplicada al proyecto.**~~ **Aplicada el
      10/09/2026**, junto con la 57. El repositorio y la base vuelven a ir
      a la par; `docs/DESPLIEGUE-SUPABASE.md` lo lleva al día y sigue
      teniendo el `grant` exacto que la deshace.
    - **Sin recorrido de Playwright con datos**, igual que las cinco
      pantallas anteriores: esos tests entran con sesión contra el proyecto
      real y desde aquí no se pueden ejecutar. Escribir uno sin haberlo
      visto pasar es lo que este repositorio ha pagado caro cuatro veces.
    - **Dejar de compartir no existe**, y no se ha inventado. El PRD no lo
      tiene, y "desandar lo compartido" no es lo mismo que no haberlo
      compartido.
    - ~~**`supabase/tests/ficha_del_restaurante.sql` sigue sin existir**,
      aunque la cabecera de la migración 55 diga "se comprueba con".~~
      **Cerrado el 10/09/2026** (entrada de abajo): la suite se escribió y
      su primera comprobación salió en rojo — la función no filtraba los
      accesos revocados. El comentario decía que estaba comprobado; no lo
      estaba, y por eso el fallo vivía.

26. **Solicitudes: la pantalla de validación interna** (09/09/2026, sin
    migración). La maqueta 05 · "Solicitudes — Validación interna" puesta
    en pie sobre datos de verdad: lo que pidió el restaurante a un lado
    —con su fecha, su mensaje entero y sus adjuntos—, la propuesta de
    clasificación al otro con su categoría, su consumo estimado, su alcance
    y el reloj de primera atención, y debajo el historial.

    **No añade ni una tabla ni una función.** Todo lo que enseña ya estaba:
    `requests`, `classifications`, `timer_events`, `audit_log`, el catálogo
    de archivos y `establishment_cycle_allowance()`. Lo que faltaba era
    pedirlo y saber decirlo, y eso vive en `src/core/requests.ts` con sus
    tests: el titular (la primera frase de lo que escribió el
    restaurante, porque **no hay columna "título" y no se ha inventado
    una**), si el contador sigue corriendo —la misma regla que
    `counter_is_running()` en SQL, que no se puede llamar por RPC—, y el
    consumo estimado.

    **El consumo estimado no es "1 cambio" y ya.** Son los cuatro
    desenlaces reales de `accept_request()`, que no significan lo mismo:
    un cambio de la bolsa cuando queda saldo (RN-CLS-08: se registra al
    aceptar, no ahora); **a presupuesto** cuando el plan no incluye
    ninguno de esa categoría (RN-COM-12); **sin crédito** cuando sí la
    incluye y el ciclo está a cero, que NO es presupuesto sino una
    aceptación que va a fallar —y quien valida tiene que saberlo antes de
    mandar una propuesta que el restaurante no va a poder aceptar—; y "no
    se ha podido calcular" cuando la bolsa no llegó, que es lo honesto en
    vez de suponer uno de los otros tres (CA-20).

    **Dos botones, no un formulario.** "Validar propuesta" acepta lo
    propuesto de un clic —que es lo que se hace el 90 % de las veces— y
    "Corregir clasificación" abre el formulario largo cambiando la
    dirección (`?corregir=1`), así que el botón de volver lo cierra y la
    pantalla entera sigue siendo de servidor (CA-22). Que el atajo mande
    la categoría y el resumen ocultos **no le concede nada a nadie**:
    `validate_classification()` comprueba `manage_requests` y el estado, y
    mandar otra categoría por ahí es exactamente lo mismo que elegirla en
    el desplegable de al lado. Sin propuesta grabada no hay atajo: sale el
    formulario, diciendo por qué.

    **El historial no es una tabla nueva.** `state_events` es de trabajos y
    tareas, así que el historial de una solicitud sale de `audit_log`, que
    es donde ya está quién, qué, cuándo y por qué (§21.2, CA-15), con los
    mismos nombres en español que la pantalla de auditoría (CA-21). No se
    ha escrito una frase bonita por cada paso: eso habría sido un segundo
    relato que se separa del libro en cuanto cambie una función.

    **Magariños llena la pantalla.** El sembrado da a la solicitud que
    espera validación el texto de la maqueta, su adjunto ("Carta
    actual.pdf", que entra con la solicitud todavía en borrador porque es
    el único momento en que la política lo permite) y una propuesta cuyo
    resumen es el **alcance** y no una copia de la descripción, que era lo
    que había y dejaba la pantalla diciendo la misma frase dos veces. El
    adjunto sube a cinco los archivos del catálogo de Magariños, y la
    comprobación del propio sembrado lo cuenta así.

    **`supabase/tests/validacion_interna.sql`**, ejecutada contra un
    PostgreSQL 16 con `bootstrap-postgres-local.sql` junto a las otras
    quince, comprueba las cinco cosas de las que depende una pantalla que
    solo consulta: que el equipo lee todo lo que pinta, que el restaurante
    **no** lee la propuesta (RN-CLS-04) ni antes ni después de validarla,
    que un trabajador que llame a la función directamente se lleva un
    error —el botón no es el control (CLAUDE.md MUST)—, que el atajo
    guarda exactamente lo propuesto, y que validar **para T1**
    (RN-SLA-03), que es lo que el recuadro del plazo dice. **Comprobada
    con dos mutaciones**: abrirle `classifications` al cliente y darle
    `manage_requests` al trabajador hacen fallar la suite, cada una por su
    comprobación.

    **info@restavor.com entra al espacio sembrado.** Es el correo con el
    que se usa Cuotly de verdad y el que ya reconoce `is_platform_owner()`,
    pero ser propietario de la plataforma **no da acceso a un espacio** (el
    Modo soporte es de la Fase 4), así que le faltaba la membresía. El
    sembrado se la da como propietario si la cuenta existe. **No la crea**:
    escribir aquí una cuenta real con la contraseña de demostración, que
    está en este repositorio, sería publicar la credencial del
    administrador. Si todavía no existe, lo dice y se vuelve a ejecutar
    después de registrarse una vez. A la propietaria de demostración no se
    la toca: es la que suplantan las secciones que construyen los flujos.

    **Lo que NO entrega, y se dice en vez de fingirlo:**

    - **Sin recorrido de Playwright con datos**, igual que las seis
      pantallas anteriores: esos tests entran con sesión contra el proyecto
      real y desde aquí no se pueden ejecutar. El recorrido de CA-19 sí se
      ha **actualizado** al camino nuevo (pasa por "Corregir clasificación"
      antes de validar), pero no se ha visto pasar, y eso no es lo mismo.
    - **El menú de tres puntos de la maqueta no está.** No hay ninguna
      acción que meter dentro que no esté ya a la vista, y un menú vacío es
      peor que ninguno.
    - **El titular sale de la primera frase de la descripción.** Es una
      decisión de presentación, no un campo nuevo: si algún día se quiere
      un asunto de verdad, es una columna y una migración, no un recorte.

---

27. **Los datos del establecimiento: RN-EST-11 dejó de ser decorativa**
    (09/09/2026, migración 57). §15.2 pide **quince datos mínimos** de un
    restaurante y `establishments` tenía siete columnas: `id`, `space_id`,
    `group_id`, `code`, `name`, `status` y `created_at`. Razón social,
    identificación fiscal, dirección, código postal, ciudad, teléfonos,
    correo de contacto, sitio web, dominio, horarios y plataforma web **no
    existían en ninguna parte de la base de datos**, y el bloque de
    Operación de la ficha se limitaba a decir por qué no había nada.

    Con ellos entran las dos reglas que los acompañan, y una de las dos
    llevaba seis migraciones sin hacer nada:

    - **RN-EST-11** ("el propietario puede editar contacto y datos
      fiscales; los Editores solo con el permiso `edit_establishment_data`").
      Ese permiso existe en `establishment_permissions` desde la migración
      3 y **no lo leía nadie**: la pestaña Usuarios lo enseñaba ("Editar
      datos") y no había ni un dato que editar ni una función que lo
      comprobara. Ahora lo comprueba
      `client_can_edit_establishment_data()`, con el mismo molde que
      `client_can_view_billing()` y el mismo reparto de cuatro casos: el
      propietario global del grupo sí, el propietario local sí, el editor
      con el permiso sí, el editor de grupo y Consulta no.
    - **RN-EST-12** ("cambiar datos en la ficha de Cuotly no cambia el
      contenido público de la web"). Va escrito **encima** del formulario y
      no debajo: hay que leerlo antes de escribir el teléfono nuevo, no
      después de guardarlo.

    **La puerta lateral se cierra, y era una de verdad.** Mientras
    `establishments` tuviera política de UPDATE, un administrador podía
    reescribir el CIF de un cliente por PostgREST sin actor y sin valor
    anterior — el mismo agujero que el bloqueante B2 de la migración 37
    encontró con `status`. Se hacen las dos cosas que aquella hizo a
    medias: se retira la política (`establishments` ya no se escribe por
    PostgREST: el estado va por `set_establishment_status()` y la ficha por
    `set_establishment_data()`) **y** se añade el disparador, porque la
    barrera tiene que estar en la tabla y no en el privilegio. Y la función
    del disparador queda revocada a `public`, `anon` y `authenticated`, que
    es un paso más que la 37 (aquella se quedó en justificarse en el
    barrido del Hito 7).

    La auditoría escribe **solo lo que cambió**: un apunte con los trece
    campos en cada guardado esconde el único dato que importa. Y guardar lo
    mismo dos veces no escribe nada (CA-17).

    **La lista de campos es un dato, no trece formularios.**
    `IDENTITY_FIELDS` (`src/core/establishments.ts`) es la fuente y el tipo
    se **deriva** de ella, igual que `CYCLE_CATEGORY_ORDER` de
    `CHANGE_CATEGORIES`. `identity-fields.test.ts` comprueba las cuatro
    copias contra ella —etiquetas en español, formulario, acción y las
    columnas de la propia migración— y **falla con cuatro pruebas** si se
    añade un campo a una sola. Es el fallo que se cuela solo: se añade la
    columna, se añade al formulario, y la vista de lectura sigue enseñando
    once de doce sin que falle ningún tipo. Comprobado con mutación.

    Gestión pasa a tener **seis bloques** y no cinco. §20 de la
    especificación maestra enumera cinco contenidos —"plan, pagos,
    usuarios, archivos e integraciones"— y ninguno es la ficha de datos,
    pero los nueve datos de identidad de §15.2 no caben en ninguno de los
    cinco: van donde los pone la maqueta, primeros, porque la identidad del
    restaurante se consulta antes que su plan. **Está anotado para que
    Bosco lo confirme**, no resuelto por cuenta propia.

    **`supabase/tests/datos_del_establecimiento.sql`**, ejecutada contra un
    PostgreSQL 16 con `bootstrap-postgres-local.sql` junto a las otras
    dieciséis: RN-EST-11 por los ocho lados (propietario del espacio,
    administrador, trabajadora **no**, propietario global, propietario
    local, editor con permiso, editor sin permiso **no**, Consulta **no**),
    el propietario del restaurante **de al lado** tampoco —los dos son del
    mismo grupo, que es lo que hace la prueba interesante—, RN-EST-05 (un
    acceso revocado deja de contar), CA-17, la normalización, las tres
    validaciones y las dos mitades de la barrera. La segunda mitad importa:
    el UPDATE directo como `authenticated` lo niega RLS por no haber
    política, así que ese bloque pasaría igual **sin disparador alguno** y
    no probaría nada — hay un segundo bloque que escribe sin RLS por
    delante y exige que el error mencione `set_establishment_data()`.
    También que el disparador no ha roto la puerta de al lado
    (`set_establishment_status()` escribe otra columna y tiene que seguir
    pasando).

    El sembrado llena la ficha de Magariños **por su función**, no con un
    INSERT de columnas: un UPDATE directo lo rechazaría el disparador igual
    que en producción, y sembrar así comprueba de paso que la puerta
    funciona. El sitio web se siembra sin esquema a propósito, para
    ejercitar la normalización.

    **Lo que NO entrega, y se dice en vez de fingirlo:**

    - **Las notas internas (RN-EST-13) siguen sin existir.** "Los clientes
      nunca" las ven, y una columna de `establishments` la vería: RLS
      filtra filas y la fila del restaurante es suya. Taparla exige
      privilegios de columna sobre la tabla que consultan diecisiete
      pantallas, y además RN-EST-13 reparte las notas en tres niveles. Eso
      es una tabla con su RLS, no una columna.
    - **El CIF no se valida.** Todo el bloque fiscal está aplazado
      (CLAUDE.md) y el dígito de control es parte de él. Se guarda en
      mayúsculas y sin espacios, y no se afirma que sea válido.
    - **Proyecto, estado y última publicación de LandingSite** (§121) no
      están: la plataforma web se registra —es uno de los quince datos— y
      lo demás es de la Fase 2, cuando Menú Diario publique. No se inventan
      tres columnas para dejarlas vacías.
    - **Sin recorrido de Playwright con datos**, igual que las siete
      pantallas anteriores.

    **Al día siguiente (10/09/2026): la salvedad de `database.types.ts` ya
    no existe.** Las migraciones 56 y 57 están aplicadas al proyecto, el
    archivo está regenerado contra el esquema real, y las trece columnas y
    las dos funciones escritas a mano resultaron ser **idénticas** a lo que
    devuelve el generador — el único cambio del diff fue el orden
    alfabético de dos entradas y la cabecera de la salvedad.

- [x] **Maqueta 02 · el alta de un restaurante** — migraciones 58 y 59,
    `create_establishment_with_data()`, la pantalla `/restaurantes/nuevo`
    entera y `alta_del_restaurante.sql`.

    El alta era un modal de dos campos —nombre del grupo, nombre
    comercial— con dos `insert` sueltos por PostgREST. La maqueta pide
    cuatro bloques: datos generales, datos fiscales, contacto principal y
    web y redes. Pero lo que había fallaba por tres motivos que no tienen
    que ver con cuántos campos se piden:

    1. **No era una transacción.** Si el segundo `insert` fallaba, quedaba
       un grupo vacío que nadie había pedido.
    2. **No dejaba rastro.** Crear un cliente es el cambio más grande que
       existe en un espacio y no escribía ni una línea en `audit_log`.
    3. **Pulsar dos veces creaba dos restaurantes**, con dos códigos, dos
       fichas y dos conversaciones.

    Los tres los cierra `create_establishment_with_data()`: una
    transacción, `establishment.created` (más `group.created` si el grupo
    es nuevo), y una clave de idempotencia que **genera la página en el
    servidor** y viaja en un campo oculto — así sobrevive al reintento del
    propio navegador, no solo al doble clic. Generarla en el cliente con
    `useState` daría una en el HTML del servidor y otra al hidratar.

    **La puerta lateral se cierra, y era la misma que la de la 57.**
    Mientras `establishments` tuviera política de INSERT, cualquiera con
    `create_establishment` podía crear un restaurante por `curl` sin actor
    y sin apunte. Se retira. Reutiliza `set_establishment_data()` para la
    ficha en vez de repetir las trescientas líneas de normalización, y eso
    se ve en el libro: un alta con datos deja **dos** apuntes, porque son
    dos hechos distintos y el segundo puede repetirse.

    **El estado no es un parámetro.** La maqueta enseña "Configurando" en
    un desplegable; aquí se pinta bloqueado con su motivo debajo. Un
    restaurante nace `configuring` y se mueve con
    `set_establishment_status()`, que tiene sus reglas y su apunte. Y el
    asterisco de los campos fiscales es **del formulario, no del
    servidor**: RN-EST-06 dice que un restaurante se da de alta con su
    nombre y la ficha se rellena después.

    **Tres columnas nuevas** —`contact_name`, `instagram`, `facebook_url`—
    que entran en `IDENTITY_FIELDS` y por tanto en las cuatro copias que
    `identity-fields.test.ts` vigila. Ese test dejó de leer una migración
    escrita a mano: ahora recorre el directorio entero, así que una columna
    futura sobre `establishments` entra sola y falla hasta que alguien la
    enseñe.

    **El fallo que apareció al comprobarlo en vivo, y por qué hay una 59.**
    La normalización de Instagram de la 58 quitaba el prefijo
    `https://instagram.com/` y **después** cortaba por la primera barra
    siempre. Con la dirección entera funcionaba; escrita sin esquema —que
    es como se escribe— guardaba el host: `instagram.com/magarinos` se
    convertía en `@instagram.com`, en silencio y sin fallar nada. La 59 lo
    corrige y los siete casos están en la suite. Se comprobó **con
    mutación**: puesta de vuelta la versión de la 58, la suite falla.

    Como la 58 ya estaba aplicada al proyecto, el arreglo va en una
    migración nueva y no editando la 58 (CLAUDE.md). Cuesta repetir la
    función entera —plpgsql no permite parchear un cuerpo— y el archivo lo
    dice en su cabecera.

    **Lo que rompió retirar la política de INSERT, encontrado ejecutando
    las suites.** Tres sitios escribían `establishments` por PostgREST: la
    acción del navegador (sustituida) y dos bloques de
    `hito2_permisos.sql`. El negativo —"una trabajadora no puede crear un
    restaurante"— habría seguido en verde **por el motivo equivocado**:
    ahora nadie puede por esa vía. Se reapunta a la función y se añade un
    bloque aparte para el INSERT directo. De paso, la comprobación de CA-16
    dejó de exigir "queda exactamente 1 apunte" y pasa a exigir "quedan los
    mismos que había": el número escrito a mano se rompía cada vez que una
    migración añadía un apunte, y corregirlo a ojo acabaría escondiendo el
    día en que sí desaparece una fila.

    **Las 18 suites de `supabase/tests/` pasan** contra un PostgreSQL 16
    reconstruido desde cero con las 59 migraciones, y el alta se comprobó
    además contra el proyecto real con `rollback`: normalización, los tres
    rechazos (trabajadora, cliente, INSERT directo), la idempotencia y los
    cuatro apuntes de auditoría.

    **Lo que NO entrega:**

    - **Instagram y Facebook no se comprueban contra nada.** Se normalizan
      y se guardan; que el perfil exista no lo sabe nadie.
    - **El plan se asigna llamando a `create_plan_subscription()`**, con
      las reglas que ya tenía y sin repetir ninguna: permanencia, ciclo
      **y la mensualidad de RN-FIN-01**, que desde la migración 52 la emite
      esa función. Dicho aquí porque la primera redacción de este punto
      decía que la mensualidad no se emitía, y sembrar "Casa Sol" lo
      desmintió: un alta con plan Básico deja un cobro de 119,79 € sin
      pagar.
    - **Sin recorrido de Playwright con datos** (ver la entrada "Los
      recorridos de Playwright": desde una sesión remota la política de red
      bloquea la salida a Supabase; los 14 del armazón sí se ejecutan).

- [x] **"Casa Sol": el restaurante ficticio que se da de alta por la puerta
    del alta** — sembrado (`supabase/seed/espacio-demo.sql`) y un paso nuevo
    de CI.

    Un restaurante de mentira con los cuatro bloques de la maqueta 02
    rellenos, para poder mirar la ficha del §15.2 con los datos puestos y
    recién puestos. No entra con un INSERT como los otros tres: sale de
    `create_establishment_with_data()`, que es lo que ejecuta
    `/restaurantes/nuevo`, así que sembrarlo comprueba de paso que el alta
    funciona — grupo creado por nombre, dos apuntes de auditoría, y la
    clave de idempotencia probada llamando **dos veces**.

    Cubre además los cuatro casos que a los otros tres restaurantes les
    faltaban, y que las pantallas sí distinguen: plan **Básico** (un ciclo
    cuya bolsa el plan no incluye, que no pinta barra), estado
    **Configurando** (el filtro del §20.2 pasa a tener dos valores),
    mensualidad **emitida y sin pagar** que ningún recorrido salda después,
    y **cero accesos de cliente** ("no hay nadie", que no es "no se ha
    podido comprobar"). Los datos se escriben sin normalizar a propósito
    —CIF en minúsculas y con espacios, web y Facebook sin esquema,
    Instagram con el `?hl=es` de la barra del navegador— y el propio
    sembrado exige el resultado normalizado.

    **Y de camino apareció que el sembrado llevaba un día roto.** La
    migración 58 metió `p_contact_name` en medio de
    `set_establishment_data()`; la llamada de Magariños iba **por
    posición**, así que el teléfono pasó a llegar donde se esperaba el
    correo y el archivo entero moría con `El correo de contacto no tiene
    forma de correo: 910 123 456`. Tuvo suerte de morir: si el campo
    corrido hubiera sido otro, habría sembrado los datos cambiados de sitio
    sin quejarse. Ahora esa llamada va **por nombre**, y Magariños gana de
    paso los tres campos de la maqueta 02 que no tenía (contacto,
    Instagram y Facebook).

    **Lo que hizo que no se viera: CI no ejecutaba el sembrado.** Ni una
    sola vez, desde que existe. Ahora es un paso más del job `rls-tests`,
    **dos veces seguidas**, porque su cabecera promete que es idempotente y
    ejecutarlo una vez no comprueba esa promesa. Es además la única pieza
    que recorre las funciones de verdad de punta a punta —alta, plan,
    solicitudes, trabajos, cobros— con excepciones que se plantan cuando el
    resultado no es el esperado.

    **Comprobado:** las 18 suites de `supabase/tests/` y el sembrado
    (dos pasadas) contra un PostgreSQL 16 reconstruido desde cero con las
    59 migraciones.

    **Lo que NO entregaba, y ya sí:** ~~el proyecto real sigue con el
    sembrado anterior~~. **Cerrado el 10/09/2026**: se aplicó al proyecto
    sin rehacer el espacio, porque cada bloque comprueba antes si su parte
    ya está sembrada — que es lo que hace que volver a lanzarlo sea seguro
    y no una decisión que haya que preguntar.

- [x] **Maqueta 03 · el Resumen de la ficha** — las cuatro tarjetas del
    dibujo, con datos reales o con su motivo.

    El Resumen tenía tres tarjetas de plan/servicio/renovación y las
    bolsas del ciclo. La maqueta pide otra cosa: consumo del plan,
    solicitudes pendientes, trabajo actual, próximo menú y estado de pago.

    **Lo que se quita.** Las tres tarjetas de plan, servicio y renovación:
    la maqueta no las tiene, el plan ya se lee en la insignia del
    encabezado y Gestión · Plan cuenta los tres datos enteros —plan,
    servicios y permanencia— en vez de resumirlos a medias. No queda nada
    inalcanzable.

    **Lo que se añade, y de dónde sale cada número:**

    - **Solicitudes pendientes**, contando las que esperan validación del
      equipo (`pending_internal_validation`, RN-CLS-03). Con solicitudes
      abiertas pero ninguna esperando, la tarjeta lo dice así en vez de
      enseñar el estado vacío: "no hay ninguna" y "las hay, pero no te
      esperan a ti" no son lo mismo (CA-20).
    - **Trabajo actual**, con su plazo recalculado por `loadJobTimers()`
      —la misma función del detalle del trabajo, para que las dos
      pantallas no puedan decir horas distintas del mismo plazo (CA-10)—.
    - **Estado de pago**, derivado del libro cobro a cobro (RN-FIN-02 +
      RN-DAT-05). Nunca de un contador en columna.

    **Dos decisiones que no se leen solas, y por eso están en `src/core/`
    con su prueba:**

    1. **Cuál es "el trabajo actual"**: el más avanzado de los vivos, no
       el más reciente. Con uno en curso y otro recién asignado, lo que
       está pasando ahora es el primero; ordenar por fecha enseñaría el
       que aún no ha empezado y la tarjeta diría "quedan 2 h para
       comenzar" con otro a medio hacer. `LIVE_JOB_STATES` es esa lista, y
       **no** es `ACTIVE_JOB_STATES`: aquella mide carga de trabajo humano
       (RN-ASG-13) y deja fuera lo bloqueado, que aquí sí cuenta — un
       trabajo esperando a este restaurante es justo lo que quiere ver
       quien abre su ficha. Comprobado con mutación.
    2. **Qué plazo se enseña**: "fuera de plazo" gana a cualquier tiempo
       restante, y sin contador en marcha se dice eso y no un cero, que se
       leería como "se acaba el tiempo".

    **Lo que no se copia del dibujo.** "Menú de mañana · Publicación
    solicitada" son datos de ejemplo: Menú Diario es de la Fase 2, y ni el
    próximo menú ni el contador de actualizaciones de RN-CON-02 existen.
    La tarjeta dice eso (CLAUDE.md MUST NOT).

    **Y una tarjeta que la maqueta no tiene y se queda**: "Necesita
    atención". Cubre lo que las otras dos no miran —un trabajo fuera de
    plazo, uno sin asignar, una corrección pedida— y es la misma lista,
    con el mismo orden, que el Inicio del espacio. Quitarla para parecerse
    más al dibujo escondería avisos reales.

    **Enseñar uno de seis es esconder cinco.** Magariños tiene seis
    trabajos vivos en la semilla y la tarjeta enseña uno, así que dice
    cuántos quedan detrás. Se vio comprobando la pantalla contra los datos
    reales, no leyendo el código.

    **`tiempoRestante()` deja de estar copiado tres veces.** Vivía con el
    mismo cuerpo exacto en el detalle de una solicitud, la lista de
    atención y el detalle de un trabajo; esta pantalla pedía un cuarto.
    Pasa a `src/i18n/duration.ts`, que es donde se eligen las palabras en
    español, mientras `splitRemaining()` sigue siendo la parte de dominio.

    **Lo que NO entrega:**

    - **El estado de pago no distingue "vencido" de "pendiente" en el
      titular**: dice cuánto se debe y cuántos cobros están vencidos
      debajo. La maqueta solo tiene el caso "Al día".
    - **Sin recorrido de Playwright con datos** (ver la entrada "Los
      recorridos de Playwright": desde una sesión remota la política de red
      bloquea la salida a Supabase; los 14 del armazón sí se ejecutan).

- [x] **Vista 04 · la Operación de la ficha** — cuatro tarjetas
    (Solicitudes, Trabajos, Tareas y Menú Diario), las tareas sembradas y
    el primer test de componente del proyecto.

    La Operación eran tres bloques apilados: los datos fiscales y de
    contacto, una tabla de solicitudes y otra de trabajos, las dos con
    columnas de código, estado y fecha. La vista 04 pide otra cosa: una
    rejilla de cuatro tarjetas con filas de icono, titular, subtítulo e
    insignia, y un "Ver todas" en cada cabecera.

    **Lo que se quita.** La tarjeta de datos fiscales y de contacto: la
    maqueta no la tiene y los quince datos de §15.2 se leen enteros en
    Gestión · Ficha —formulario para quien puede editar, lectura para quien
    no (RN-EST-11)—, así que no queda nada inalcanzable. Repetidos en dos
    pestañas eran además la manera de que un día dijeran cosas distintas.
    Con ella se van sus cuatro textos de `es.ts`, que ya no los usa nadie.

    **Lo que se añade, y de dónde sale cada dato:**

    - **Solicitudes** con su autor: "Nuria Ferreiro (Magariños) · Hoy,
      10:24", como el dibujo. El nombre necesita **dos** fuentes y no una,
      y es la misma asimetría que la pestaña Usuarios: `profiles_select`
      deja ver a quien comparte espacio —el equipo—, pero un cliente no es
      miembro del espacio, así que su nombre solo llega por
      `establishment_client_users()`. Comprobado en vivo: con una sola
      consulta, las diecinueve solicitudes de Magariños —todas suyas—
      salían sin autor. Lo que no se resuelve **no se rellena con el
      uuid**.
    - **Trabajos** con su plazo, recalculado desde `timer_events` por
      `loadJobTimers()`, la misma función del Resumen y del detalle: tres
      pantallas no pueden decir horas distintas del mismo contador
      (CA-10).
    - **Tareas**, que es la tarjeta nueva (§11.2, HU-21).

    **Dos decisiones en `src/core/`, con su prueba y comprobadas con
    mutación:**

    1. **Qué tarea va primero.** `OPEN_TASK_STATES` ordena de lo más
       avanzado a lo menos, igual que `LIVE_JOB_STATES`, y lo que no se lee
       solo es que **`blocked` va por delante de `pending`**: una tarea
       bloqueada ya se empezó y hay alguien esperando; una pendiente
       todavía no ha movido a nadie. Invertir el orden hace fallar dos
       pruebas.
    2. **Lo que la tarjeta esconde se cuenta.** `firstRows()` corta a
       cuatro y devuelve cuántas quedan detrás, para las cuatro tarjetas a
       la vez. Magariños tiene **diecinueve** solicitudes abiertas y la
       tarjeta enseña cuatro: sin esa línea, cuatro de diecinueve se leen
       como diecinueve de diecinueve (CA-20).

    **"Ver todas" lleva al listado FILTRADO**, no al del espacio entero.
    Los tres listados —solicitudes, trabajos y tareas— estrenan
    `?restaurante=`, con su aviso de qué se está viendo y su camino de
    vuelta. El filtro **no controla nada**: recorta filas que RLS ya dejó
    pasar, y un uuid ajeno en la dirección deja la lista vacía porque esa
    fila no llega hasta aquí — y como no llega, tampoco se puede resolver
    su nombre, así que el aviso lo dice en vez de callar. En Tareas el
    restaurante viaja además en los tres filtros de la propia pantalla:
    sin eso, pulsar "Abiertas" devolvía las de todos.

    **Un desempate que no es adorno.** Las tres consultas ordenan por fecha
    y desempatan por `id`. `created_at` vale `now()`, que en PostgreSQL es
    la hora de la **transacción**: las seis tareas del reportaje, sembradas
    en un mismo bloque, comparten fecha al segundo, y también las
    diecinueve solicitudes de Magariños. Sin desempate esas filas salen en
    el orden físico de la tabla y "y 1 más" puede esconder una distinta en
    cada recarga. Se vio en los datos, no en el código.

    **El sembrado estrena tareas.** No había **ni una** en todo el
    proyecto, así que la tarjeta nueva salía vacía en los cuatro
    restaurantes y `create_job_task()` no la llamaba nadie —van cinco veces
    que una función del servidor resulta no tener quien la use—. El
    reportaje de las tapas se desglosa en seis (una terminada que no tiene
    que salir, una en curso, una bloqueada y tres pendientes), por sus
    funciones y no con INSERT: `create_job_task()` y `update_task_state()`
    hacen cumplir RN-ASG-16, RN-ASG-01 y las transiciones de
    `TASK_TRANSITIONS`, así que sembrar así comprueba de paso que las
    puertas funcionan. Son cinco vivas y no cuatro a propósito: con cuatro,
    la línea "y 1 más" no la comprobaría nadie.

    **El primer test de componente del proyecto.** El entorno estaba
    montado desde el Hito 1 —jsdom y `@testing-library/jest-dom` en
    `vitest.setup.ts`— y no lo usaba ningún archivo. Lo que la vista 04
    pide no es un cálculo sino una composición —cuántas tarjetas, qué fila
    va primero, qué se dice cuando no hay nada—, y eso las pruebas de
    `src/core` no lo ven. Nueve pruebas sobre la pestaña pintada; dos
    mutaciones (callar el "y 1 más", convertir en enlace la tarea sin
    trabajo) hacen fallar cinco. De paso se encontró que la limpieza de
    Testing Library **no** es automática aquí: este proyecto no usa
    `globals: true`, así que sin un `afterEach(cleanup)` escrito a mano el
    segundo test se encuentra dos pantallas colgando del documento.

    **Comprobado:** typecheck, lint, **633 pruebas** (18 nuevas), `next
    build`, y la base entera reconstruida desde cero —bootstrap + las 59
    migraciones + el sembrado **dos veces**— sobre un PostgreSQL 16 local,
    con las tres consultas de la pestaña ejecutadas bajo RLS como
    propietaria y como trabajadora.

    **Lo que NO entrega:**

    - **La maqueta pone un plazo a cada tarea** ("Hoy, 12:00", "Quedan
      4 h") y `tasks` no tiene fecha de vencimiento ni contador: los tres
      contadores del PRD (T1, T2, T3) son de solicitud y de trabajo. La
      fila enseña lo que existe —trabajo, responsable y minutos
      estimados—, no un plazo inventado.
    - **La tarjeta de Menú Diario no distingue si el servicio está
      contratado**: los servicios se identifican hoy por su nombre dentro
      de cada espacio y no por una clave estable, y comparar cadenas para
      afirmar "no lo tiene contratado" sería inventarse esa identidad.
      Dice el motivo de Fase 2 y ya.
    - **Sin recorrido de Playwright ejecutado**, y ahora se sabe por qué y
      no por costumbre: este contenedor tiene la salida de red hacia el
      proyecto de Supabase **denegada** por la política del entorno, así
      que la aplicación arranca y el login contesta "correo o contraseña
      incorrectos" sin haber podido preguntar. El test de componente cubre
      lo que se puede afirmar sin navegador.
    - ~~**El proyecto real sigue con el sembrado anterior**, o sea **sin
      tareas**.~~ **Cerrado el 10/09/2026**: se sembraron las seis tareas
      en el proyecto sin rehacer el espacio —el bloque comprueba antes si
      ya hay tareas—, así que la tarjeta se ve con datos de verdad.
      Aprovechando el viaje entraron también conversaciones, festivos,
      ausencias, supervisión y una corrección (entrada "El espacio de
      demostración deja de estar medio vacío").

- [x] **Maqueta 05 · el estado de validación de una solicitud** — el panel
    de tres pasos que faltaba, derivado y no almacenado.

    La pantalla de validación interna ya estaba entera (entrada 26): lo que
    pide el dibujo definitivo y no había era el panel de la derecha —
    "Análisis completado · Validación interna · Aceptación del cliente"—
    con la marca de cada paso.

    **No es una columna de progreso, y esa es la decisión.** Los tres pasos
    se derivan del estado y de las fechas que la solicitud ya guarda
    (`validated_at`, `accepted_at`, `rejected_at`, y la fecha de la
    propuesta). Una columna "paso actual" habría que mantenerla en
    sincronía con la máquina de estados, y el día que se desincronizara la
    pantalla mentiría sin que fallara nada (CLAUDE.md: los estados
    derivados los calcula el servidor, no se almacenan).

    **Quién rechazó se deduce, porque el estado no lo dice.** RN-REQ-01 no
    admite dos estados "rechazada" distintos —el nombre visible es único—,
    así que `rejected` puede ser el equipo antes de validar (HU-14) o el
    restaurante rechazando la propuesta (HU-12). Lo separa `validated_at`:
    si nadie llegó a validar, murió en la validación interna. Importa para
    algo concreto: en el rechazo del equipo el paso del cliente **no** se
    marca en rojo, porque el restaurante no rechazó nada — ni llegó a
    verlo. Comprobado con mutación: tratar todo rechazo como del cliente
    rompe el test.

    **Sin propuesta grabada el análisis no se afirma.** Puede que el
    clasificador fallara o que aún no haya corrido; decir "completado" sin
    propuesta sería afirmar algo que no consta (CA-20). Se distingue de
    "todavía no le toca": en `draft` y `received` el análisis es el paso
    actual, no uno fallido.

    Un test recorre **los quince estados del catálogo** y exige que ninguno
    deje los tres pasos en "pendiente": eso significaría que la pantalla no
    sabe dónde está la solicitud, y sería un hueco en blanco.

    **De camino, el botón de volver deja de ser solo un icono.** Era una
    flecha con el nombre en `aria-label`: quien ve la pantalla tenía que
    deducir a dónde volvía, y en móvil, sin `title` que posar, no había
    manera. Ahora lleva su texto, como en la maqueta.

    **Lo que NO entrega:**

    - ~~**El paginador "1 de 3" no está.**~~ **Cerrado el 10/09/2026.** La
      objeción era buena y por eso se resolvió atacándola: "qué
      solicitudes y en qué orden" pasa a estar en UN solo sitio
      (`solicitudes/list-query.ts`), del que leen el listado y el
      paginador, así que no pueden discrepar — si mañana la bandeja se
      ordena por vencimiento, el paginador se entera solo. El filtro viaja
      en `?restaurante=`, y `listPosition()` (en `src/core/`, con sus
      tests) devuelve `null` cuando la solicitud no está en esa lista: al
      llegar por un enlace directo no se pinta paginador, porque "1 de 1"
      fingiría un recorrido que no existe. Las flechas de los extremos se
      deshabilitan y no se ocultan: un control que desaparece mueve los de
      al lado y se pulsa el que no era.
    - ~~**Los dos caminos de rechazo no los ejercita la semilla.**~~
      **Cerrado el 10/09/2026**: la sección 12.8 siembra los dos, con dos
      solicitudes NUEVAS —no se reutilizan las que llenan las pantallas de
      las maquetas 04 y 05, que se quedarían sin caso—. Una la rechaza el
      equipo antes de validar (`reject_request`, HU-14) y la otra el
      restaurante con la propuesta ya en la mano (`decline_request`,
      HU-12), así que la deducción por `validated_at` que hace el panel
      tiene por fin datos detrás. De regalo, dos conversaciones más: las
      dos funciones publican su motivo como mensaje.
    - **Sin recorrido de Playwright con datos** (ver la entrada "Los
      recorridos de Playwright": desde una sesión remota la política de red
      bloquea la salida a Supabase; los 14 del armazón sí se ejecutan).

- [x] **El espacio de demostración deja de estar medio vacío, y los huecos
    dejan de ser feos** — sección 12 del sembrado, y los cuatro estados de
    §20.7 rehechos.

    Dos cosas que Bosco pidió el mismo día, y que resultaron estar
    relacionadas: la demostración enseñaba huecos donde tenía que haber
    datos, y los huecos, además, eran feos.

    **El sembrado.** Contadas las tablas del espacio con `space_id`,
    dieciséis seguían a cero después de ejecutar el archivo entero, y cinco
    de ellas sostienen pantallas ya construidas: Mensajes salía sin una
    sola conversación, el Calendario sin festivos, sin ausencias y sin los
    dos relojes del espacio, la relación de supervisión —que no es un rol,
    es una relación (CLAUDE.md)— no existía en ninguna parte, y
    `corrections` estaba a cero, así que la mitad del recorrido de RN-COR
    no se veía. La sección 12 los llena.

    Nada entra con un INSERT de columnas: se crea por las MISMAS funciones
    que usa la pantalla —`get_or_create_request_conversation()`,
    `post_message()`, `request_absence()`, `decide_absence()`,
    `request_free_correction()`— suplantando a quien de verdad lo haría.
    Los mensajes se escriben alternando identidades, y la comprobación de
    la sección exige que hablen **los dos lados**: un hilo en el que solo
    escribe el equipo se pinta entero a un lado de la pantalla y no enseña
    nada de lo que Mensajes tiene que enseñar.

    **Las tareas NO estaban donde parecía.** El primer recuento dijo
    `tasks = 0` y la conclusión evidente era que el sembrado no las creaba.
    No era eso: las crea desde la maqueta 04, y lo que pasaba es que el
    proyecto llevaba una ejecución **vieja** del archivo. Medir el
    repositorio contra una base reconstruida desde cero, y no solo el
    proyecto, es lo que lo distinguió — y es la diferencia entre añadir una
    sección duplicada y ponerse al día.

    **Los datos son inventados y lo son a propósito.** Lo que CLAUDE.md
    prohíbe es enseñar datos ficticios en pantallas de PRODUCCIÓN —un
    número que nadie ha contado—, no que un espacio de demostración tenga
    contenido de demostración.

    **Los huecos.** Los cuatro estados de §20.7 se pintaban con un emoji
    dentro de una caja de borde discontinuo. El emoji lo dibuja cada
    sistema operativo a su manera y desafinaba junto a los iconos de trazo
    del sistema; el borde discontinuo es la convención de "esto está roto",
    y un hueco bien puesto no está roto: es la respuesta correcta. Ahora
    comparten figura —icono del juego en un círculo con el tinte de su
    tono, título, motivo y sitio para la acción— y `EmptyReason` distingue
    por fin sus cuatro motivos a la vista en vez de obligar a leerse el
    párrafo.

    **Y midiendo los colores apareció un fallo de verdad, en toda la
    aplicación.** `StatusBadge` ponía el texto del tono sobre su propio
    tinte al 10 %, y los cuatro estaban por debajo de AA: success 3,78:1,
    warning 2,33:1, danger 4,01:1, info 3,92:1, contra los 4,5:1 de CA-22.
    No lo veía nadie porque `contrast.test.ts` medía la PALETA —`success`
    contra blanco— y no la mezcla que pinta el navegador. El comentario de
    aquel test afirmaba además que los badges ya usaban una combinación que
    cumple; no era verdad. **Séptima vez** que una garantía escrita en un
    comentario resulta no estar implementada. El mismo fallo estaba en seis
    sitios más.

    El ámbar es aparte y no tiene arreglo dentro de la paleta: 2,55:1 sobre
    blanco y 2,36:1 sobre el fondo, así que no llega a los 3:1 de un icono
    en **ninguna** superficie clara del sistema. Como fondo con letra
    oscura sigue valiendo (15,09:1), así que se prohíbe el primer plano y
    no el color. Donde hacía falta se usa `info`.

    Tres comprobaciones nuevas: `blend()` calcula la mezcla del navegador,
    se miden las combinaciones **reales** de los componentes —con una
    aserción deliberadamente en `false` para quien vuelva a ponerlo mal— y
    un barrido del código falla si el ámbar reaparece como primer plano. El
    barrido cazó en el acto un caso que se me había escapado.

    **Comprobado**: el sembrado entero contra un PostgreSQL 16
    reconstruido desde cero y ejecutado **dos veces** —mismos recuentos, es
    idempotente—, y aplicado además al proyecto real, que llevaba la
    ejecución vieja y ahora coincide: 6 tareas, 2 conversaciones, 5
    mensajes, 2 ausencias, 18 festivos, 2 calendarios, 2 supervisiones y
    una corrección.

    **Lo que NO entrega:** siguen a cero `receipts`, `internal_notes`,
    `space_invitations`, `notification_preferences`, `assignment_weights`,
    `blocks`, `conversation_reads`, `message_edits`, `ai_usage`,
    `scheduled_jobs` y `scheduled_plan_changes`. Ninguna sostiene hoy una
    pantalla que se vea vacía por su culpa, y queda escrito aquí en vez de
    darlo por hecho.

- [x] **Maqueta 06 · la evidencia de publicación** — migración 60,
    `attach_job_evidence()` y `src/core/job-execution.ts`.

    La ficha de un trabajo enseña lo que se publicó: la captura, el PDF, lo
    que sea. No hace falta tabla nueva —RN-ARC-02 ya modela el "elemento
    relacionado" en `file_links`, y `entity_type` admite `'job'` desde el
    Hito 7—: lo que faltaba era la **puerta**. La única función que
    escribía ahí para un trabajo era `link_file()`, que recibe el actor por
    parámetro y no comprueba nada, porque es un ayudante interno de
    `service_role`. Ofrecérsela a una pantalla habría dejado que cualquiera
    enlazara cualquier archivo a cualquier trabajo diciendo ser quien
    quisiera.

    `attach_job_evidence()` comprueba cuatro cosas, y cada una tapa un
    agujero concreto: quién (el responsable o `assign_jobs` — al
    restaurante no, porque `can_read_job()` le deja ver la ficha de SU
    trabajo a propósito y sin esto se habría convertido en permiso de
    escritura por la puerta de atrás, P7); qué archivo (`can_read_file()`,
    o un trabajador enlazaría una factura que no puede abrir y la leería
    después por la ficha); de qué restaurante (`file_links` no tiene
    ninguna columna que lo impida, así que lo impide la función o nadie); y
    que dos veces no duplique — ni el enlace ni el apunte, porque un
    `insert` que no inserta y aun así audita es una auditoría que miente.

    **La fecha estimada de fin no se dice cuando el contador está en
    pausa.** Es una afirmación sobre el futuro que deja de ser cierta en
    cuanto el trabajo se bloquea: el tiempo restante se conserva y la fecha
    se desplaza sola (RN-JOB-08, RN-SLA-14). Y una tarea **cancelada no
    cuenta en ninguno de los dos números** del desglose: si contara en el
    total, un trabajo con dos hechas y dos canceladas se leería "2/4" y
    parecería a medias cuando no queda nada por hacer.

    **La suite que su cabecera prometía ahora existe.** La migración decía
    "se comprueba con `supabase/tests/evidencia_de_publicacion.sql`" y el
    archivo no estaba: habría sido la **séptima** vez en el proyecto que
    una garantía escrita en un comentario resulta no estar implementada.
    Cubre los seis casos —responsable sí, administrador sí, otro trabajador
    no, restaurante no, archivo ajeno no, dos veces no duplica— más los
    privilegios. Comprobada con mutación quirúrgica: quitarle a la función
    solo la comprobación del restaurante hace fallar su aserción, y con la
    auditoría fuera falla la de idempotencia.

    **Lo que NO entrega:**

    - **No se desenlaza.** CLAUDE.md prohíbe el borrado físico de registros
      de negocio y una evidencia enlazada es exactamente eso.
    - **Sin recorrido de Playwright con datos** (ver la entrada "Los
      recorridos de Playwright": desde una sesión remota la política de red
      bloquea la salida a Supabase; los 14 del armazón sí se ejecutan).

- [x] **Cerrar las promesas de las migraciones** — la suite que faltaba, el
    fallo que escondía, y la guarda para que no haya una octava vez.

    Siete veces ha pasado ya lo mismo: una migración termina su cabecera
    con "se comprueba con `supabase/tests/X.sql`", el archivo no se
    escribe, y nadie se entera porque **un comentario no falla**. La
    séptima la iba a commitear yo (migración 60). Este punto lo cierra por
    completo.

    **Un barrido encontró una sola promesa rota**: la de la migración 55,
    anotada en el ROADMAP desde el 09/09 como "la quinta vez... queda
    escrito para que se decida qué se hace con ella".

    **Y al escribirla, su PRIMERA comprobación salió en rojo.**
    `establishment_client_users()` no filtraba `revoked_at` en ninguna de
    sus dos ramas, así que la pestaña Usuarios de la ficha llevaba un día
    enseñando a gente cuyo acceso se había retirado —con su nombre, su
    correo y sus permisos, igual que a quien sí lo tiene—. RN-EST-05 dice
    lo contrario: "al retirar un acceso desaparece de inmediato, pero la
    actividad histórica permanece"; lo que permanece es la actividad, no la
    fila de la lista de accesos.

    No se podía tapar en la pantalla: la pantalla pinta lo que contesta el
    servidor, y el servidor contestaba mal (CLAUDE.md: el cliente nunca es
    la autoridad). Lo arregla la **migración 61**. Y es la variante peor de
    "una función que no usa nadie": `revoke_establishment_access()` existe
    desde la migración 37, sí la usaba alguien, y no servía de nada.

    **La guarda, para que sea la última vez.**
    `src/core/promesas-de-migracion.test.ts` comprueba dos cosas, y las dos
    hacen falta: que todo archivo que una migración nombra exista, y que
    **CI ejecute todas las suites escritas** — una comprobación que nadie
    corre engaña más que no tenerla. Las dos comprobadas con mutación:
    borrar la suite rompe la primera, y sacarla de CI rompe la segunda.

    Hoy: 20 suites SQL, todas nombradas, todas escritas, todas en CI, todas
    en verde contra un PostgreSQL 16 con las 61 migraciones desde cero.

- [x] **Los recorridos de Playwright: los que se pueden, y por qué los
    otros no** — más el fallo de producto que destaparon.

    "Sin recorrido de Playwright ejecutado" aparecía en **siete** entradas
    de este documento sin que nadie dijera por qué. Ya está dicho, y era
    comprobable en un minuto.

    **Ejecutados y en verde: los 14 del armazón** (`smoke` y
    `hito8-experiencia`), que incluyen los de CA-20 —los estados vacíos que
    se acaban de rediseñar— y los cuatro de CA-22, navegación entera por
    teclado.

    **Los de datos NO se pueden ejecutar desde una sesión remota de Claude
    Code, y no es un problema del proyecto.** La política de red de ese
    entorno deniega la salida HTTPS al proyecto de Supabase:

    ```
    connect_rejected | <proyecto>.supabase.co:443
    gateway answered 403 to CONNECT (policy denial)
    ```

    El acceso por MCP a la base sí funciona —va por otro camino—, y por eso
    todo lo demás de esta sesión se ha podido comprobar contra el proyecto
    real. Lo que no se puede es levantar la aplicación y entrar. Queda
    escrito en la cabecera de `ca19-recorridos-movil.spec.ts` para que no
    cueste otra tarde: se ejecutan en una máquina con salida a internet o
    en CI.

    **Y por el camino apareció un fallo de producto de verdad.** Con la red
    bloqueada, la pantalla de entrar decía *"Correo o contraseña
    incorrectos"* con la contraseña correcta. El mensaje mandó a revisar la
    semilla, los hashes de bcrypt y las identidades de GoTrue —todo estaba
    bien— cuando lo único que pasaba es que no había línea.

    La causa: `signIn()` contestaba `invalidCredentials` a **cualquier**
    error de `signInWithPassword()`. Servicio caído, red cortada,
    demasiados intentos y correo sin confirmar, todos como "tu contraseña
    está mal". Es afirmar algo que no se sabe —lo que CA-20 prohíbe en el
    resto de la aplicación— y no había razón para que el login fuera la
    excepción.

    Lo arregla `src/core/auth-errors.ts`, lógica pura con sus tests: cinco
    motivos distintos, y el de red dice explícitamente "es un problema
    nuestro o de tu conexión, **no de tu contraseña**". A un cliente que no
    puede entrar un martes por la mañana eso le ahorra llamar para que le
    cambien una contraseña que no está mal.

    El mensaje del servidor no se enseña tal cual, y eso no cambia: viene
    en inglés y a veces distingue "este correo no existe" de "esta
    contraseña no vale", que es justo lo que no conviene contarle a quien
    prueba correos.

- [x] **Maqueta 06 · la ficha de un trabajo en ejecución** — la pantalla
    que usa por fin lo que ya estaba construido.

    La migración 60, `attach_job_evidence()` y `src/core/job-execution.ts`
    con sus 16 tests estaban hechos desde ayer. **La pantalla no llamaba a
    nada de eso**: ni al recuento de tareas, ni a la fecha de fin, ni a la
    evidencia. Van siete veces que algo del servidor resulta no tener quien
    lo use; esta es la séptima y se cierra pintándolo.

    **Lo que entra:**

    - **El paginador "1 de 5" y "Volver a trabajos"**, con el mismo patrón
      que la maqueta 05: `loadTeamJobs()` es ahora el único sitio donde se
      decide qué trabajos hay y en qué orden, y de él leen el listado y el
      paginador. El filtro viaja en `?restaurante=`.
    - **"Tareas (2/4)"** en el título del desglose, contado por
      `taskProgress()` — una cancelada no cuenta en ninguno de los dos
      números, o un trabajo con dos hechas y dos canceladas se leería "2/4"
      y parecería a medias cuando no queda nada.
    - **Fecha de inicio y fecha estimada de fin**, decididas por `jobEnd()`.
      Los cuatro casos sin fecha se pintan con su motivo y desde una tabla
      única, no con un `switch` repartido por la plantilla: así se ve de un
      golpe que están los cuatro. **En pausa no se da fecha**, y eso es la
      regla, no un hueco: el tiempo restante se conserva y la fecha se
      movería sola (RN-JOB-08, RN-SLA-14).
    - **La evidencia de publicación**, con su descarga por
      `/api/archivos/<id>` —que contesta 404 y no 403 a quien no puede,
      porque un 403 confirma que el archivo existe— y su formulario de
      adjuntar, solo para el equipo (P7).

    **La demo la enseña con datos**: la sección 12.9 registra una captura
    de verdad, "Captura de la carta publicada.png", 1,8 MB, y la adjunta al
    trabajo publicado. **No se reutiliza un archivo cualquiera del
    catálogo**: adjuntar "Fachada.jpg" como prueba de lo que se publicó
    sería una evidencia que no evidencia nada, y el bloque existe para
    poder mirar después qué se dejó publicado. Queda interna, que es lo que
    es: material de trabajo del equipo.

    **Lo que NO entrega, y necesita una decisión tuya** (no lo invento,
    CLAUDE.md):

    - ~~**"Prioridad: Media"**~~ y ~~**"Tipo: Actualización web"**~~ —
      **contestadas por Bosco el 10/09/2026**, y las dos cambiaron el
      diseño respecto del dibujo. Ver la entrada siguiente.

    - **Sin recorrido de Playwright con datos** (ver la entrada "Los
      recorridos de Playwright").

- [x] **La prioridad la pone el restaurante** — migraciones 62 y 63,
    decisión de producto de Bosco (10/09/2026).

    Literal: *"los clientes premium son los únicos que pueden indicar la
    prioridad, y lo hacen organizando sus cambios por cuál es más
    importante: 5 cambios, pues ponerlos en orden del 1 más importante al 5
    menos importante"*. Tres cosas de esa frase cambian el diseño respecto
    de la maqueta 06, donde "Prioridad" era una etiqueta con el valor
    "Media":

    1. **No es una etiqueta, es un ORDEN.** No hay Alta/Media/Baja: hay un
       1, un 2 y un 3 dentro de los cambios pendientes de ese restaurante.
       Una etiqueta no dice cuál va antes entre dos "Media"; un orden sí,
       que es justo lo que el restaurante quiere expresar.
    2. **"Los únicos" es literal.** Ni el propietario del espacio ni un
       administrador la ponen, y hay un test que lo comprueba sentándose
       como la propietaria. Es la aserción que impide que un día se cuele
       un `or has_capability(...)` "para poder ayudar al cliente" y
       convierta la preferencia del restaurante en una decisión del equipo.
       Comprobado con mutación: colar ese `or` rompe el test.
    3. **Depende del plan**, no del nombre del plan.

    **Por qué `plans.grants_priority` y no `name = 'Premium'`.** CLAUDE.md
    fija que Cuotly es multiempresa: otro espacio puede llamar a su plan
    alto "Total" o "Avanzado" y seguiría siendo el que da prioridad. Un
    nombre escrito dentro de una función es una regla que se rompe en
    silencio con el segundo cliente de la plataforma. El test lo vigila
    llamando "Total" y "Sencillo" a sus dos planes: si la regla mirara el
    nombre, fallaría.

    **Por qué la función recibe la lista entera.** Escribir "pon esta la 3"
    invita a que haya dos terceras o un hueco entre la 2 y la 4, y entonces
    el orden deja de ser un orden. Recibiendo la lista ordenada y
    reescribiendo 1..N de una vez, los empates y los huecos son imposibles
    por construcción, no por cuidado. Las cuatro maneras de romperlo
    —repetidas, de otro restaurante, ya publicada, incompleta— se rechazan
    ANTES de escribir nada, y hay un test de que un intento rechazado deja
    el orden intacto: media lista reordenada es peor que ninguna.

    **La pantalla del cliente sube y baja, no escribe números.** Con
    números hay que teclear cinco casillas sin repetir ninguna y el
    servidor rechaza —con razón— cualquier empate; con dos flechas el
    orden inválido no se puede ni escribir. Es un formulario de servidor:
    sin JavaScript sigue funcionando (CA-22).

    **"Tipo: Actualización web" no entra, y la respuesta explica por qué.**
    Bosco: *"al hacerse un cambio se actualiza la web para que aparezca ese
    cambio"*. Eso describe lo que hace todo trabajo de mantenimiento, no un
    eje de clasificación con varios valores: no hay un segundo "tipo" que
    guardar. Lo que clasifica un trabajo sigue siendo su categoría de
    RN-CLS, que ya se enseña.

    **Dos cosas que encontraron los tests, no la lectura del código:**

    - **La columna nueva no se leía.** `requests` tiene el `select`
      revocado y concedido columna a columna (CLAUDE.md), y una columna
      nueva no se concede sola: `priority_rank` existía, la función la
      escribía y ninguna pantalla podía leerla. El error —"permission
      denied for table requests"— ni siquiera menciona la columna.
    - **El barrido en falso-cerrado del Hito 7 la marcó** como función
      `SECURITY DEFINER` sin comprobación. Comprobaba, pero a través de
      `client_can_set_priority()`, un nombre que la heurística no conocía.
      Se le enseña el nombre en vez de meterla en la lista de excepciones:
      la excepción es para las que no comprueban, y ésta sí.

    **Lo que NO decide esta entrada, y hace falta decidir algún día:** el
    orden que pone el restaurante **no cambia hoy el reparto del equipo**.
    RN-ASG-02 tiene su orden determinista en el PRD y no se toca por
    cuenta propia. Hoy la prioridad es lo que el restaurante dice y el
    equipo ve; si además tiene que mover la cola de trabajo, es otra
    decisión y otra regla con su test.

- [x] **Maqueta 07 · Tareas, asignación y coordinación** — migración 65,
    `src/core/task-coordination.ts`, la pantalla
    `/trabajos/<id>/tareas` y `coordinacion_de_tareas.sql`.

    El reparto de tareas estaba entero desde HU-21 (migración 47). Del
    panel "Detalle de la tarea" que pide el dibujo definitivo, solo un
    campo de los tres era gratis.

    **Lo que entra:**

    - **La pantalla**, con la tabla de tareas del trabajo a la izquierda y
      el detalle a la derecha. La tarea elegida viaja en la dirección
      (`?tarea=<id>`) y no en un estado del navegador: "la tarea de los
      enlaces" es un enlace que se le pasa a un compañero, el botón de
      volver cierra el panel, y todo es de servidor, así que funciona sin
      JavaScript (CA-22).
    - **"Fecha estimada"**, que es la segunda vez que una maqueta pide
      fecha por tarea. La 04 pedía "Hoy, 12:00" y "Quedan 4 h" y se dejó
      fuera con motivo escrito, porque era un plazo inventado. **Ésta no
      es lo mismo y por eso entra**: es una casilla que alguien rellena a
      mano. Se guarda como `date` y no como `timestamptz` a propósito —una
      hora invita a leerla como un vencimiento—, no alimenta T1, T2 ni T3,
      no genera avisos, y pasarse de ella **no** deja el trabajo fuera de
      plazo (RN-SLA-17 es de trabajos). La suite lo comprueba de la única
      forma que se puede comprobar una ausencia: contando `timer_events`
      antes y después.
    - **"Solicitar reasignación" a nivel de tarea** (RN-ASG-07/08/09),
      que hasta hoy solo existía para trabajos enteros.
    - **Una sola definición de las tareas de un trabajo**: `loadJobTasks()`,
      de la que leen tanto el "Tareas (2/4)" de la maqueta 06 como esta
      pantalla. Es el mismo patrón que `loadTeamJobs()` — dos consultas
      separadas discrepan primero en el orden y después en todo lo demás.
    - **La tarjeta de la maqueta 06 pasa a ser de solo lectura**, con un
      enlace aquí. Llevaba dentro los formularios de repartir, mover,
      cancelar y dar de alta, apretados en una columna de tabla; el dibujo
      06 no los tiene y el 07 sí, y así no hay dos sitios donde se hace lo
      mismo.

    **Por qué una tabla y no un sexto estado de tarea.** Un trabajo sí
    tiene el estado `reassignment_requested` (§36) y para un trabajo está
    bien: pedirla lo detiene. §37 enumera los estados de tarea y son
    **cinco**; añadir un sexto contradiría la especificación, y además
    sería peor producto — mientras alguien decide, la tarea sigue estando
    Pendiente o En curso, que es la verdad. Lo que hay es una solicitud
    colgando de ella, y eso es una fila. Hay un test de que pedirla no
    cambia el estado ni escribe un `state_event` inventado.

    **La aserción que sostiene RN-ASG-08.** "La aprueba el propietario o
    el administrador" no significa nada si la tarea puede cambiar de manos
    por la puerta de al lado: el responsable del trabajo reparte sus tareas
    todos los días con `assign_task()`, y si además pudiera repartir ÉSTA,
    la solicitud se quedaría abierta para siempre y bastaría con no llamar
    a la función que aprueba. Así que `assign_task()` ahora lanza cuando
    hay una reasignación pendiente. Comprobado con mutación: quitar esa
    guarda rompe el test.

    **Un agujero de verdad, encontrado al comprobar los privilegios.**
    `anon` —sin sesión ninguna— podía cambiar el estado de una tarea sin
    responsable. No es una sospecha de lectura: se reprodujo contra la
    base, y la tarea pasó de `pending` a `in_progress`. El mecanismo es el
    de la migración 32: la guarda de `update_task_state()` era
    `v_assignee_id is distinct from auth.uid()`, y sobre una tarea **sin
    repartir** y sin sesión eso es `null is distinct from null`, que es
    FALSO — la guarda se da por satisfecha y `has_capability()` ni se
    evalúa. Y una tarea sin repartir es el caso normal: nace así cuando el
    responsable desglosa primero y reparte después. Se cierra por dentro
    (una comprobación explícita de sesión) y por fuera (quitarle a `anon`
    un EXECUTE que no necesita), y tiene su test, que falla si se deshacen
    las dos cosas. Las hermanas de al lado se miraron una por una:
    `cancel_task()` exige `has_capability()` de entrada, y
    `create_job_task()` escribe `created_by` en una columna `not null`, así
    que `anon` muere ahí — un tope afortunado, no una decisión, así que
    también se les quita el EXECUTE.

    **Comprobado:** las **23 suites SQL** desde cero sobre un PostgreSQL 16
    con las 65 migraciones y el sembrado, typecheck, lint, **733 pruebas**
    unitarias (30 nuevas, 10 de ellas de componente sobre el panel), `next
    build`, y las consultas de la pantalla ejecutadas bajo RLS como
    trabajadora y como restaurante — el restaurante ve **cero** tareas y
    **cero** solicitudes de reasignación (P7). **Nueve mutaciones sobre la
    migración y tres sobre el dominio**, todas hacen fallar su
    comprobación.

    **Lo que NO entra, y necesita una decisión tuya** (no lo invento,
    CLAUDE.md):

    - **"Prioridad: Media" en el panel.** El 10/09 decidiste que la
      prioridad no es una etiqueta Alta/Media/Baja sino el **orden** que
      pone el restaurante sobre sus cambios pendientes, y que *"los
      clientes premium son los únicos que pueden indicarla"*. Una casilla
      Alta/Media/Baja por tarea, editable por el equipo, es exactamente lo
      que esa decisión quitó, una planta más abajo. No la he
      reintroducido por la puerta de atrás. **Si lo que quieres es que el
      equipo pueda ordenar las tareas DENTRO de un trabajo**, eso es otra
      cosa y se puede hacer —sería un orden, como el del cliente, no una
      etiqueta—, pero es una regla nueva y te la pregunto antes de
      escribirla. Hoy lo que ordena la lista es la fecha prevista.

    - **A quien tiene que aprobar una reasignación no le llega ningún
      aviso.** Se ve en la pantalla —la fila lo marca y la tarjeta del
      trabajo también—, pero no hay notificación. No es un olvido: el
      `request_job_reassignment()` del Hito 6 tiene exactamente el mismo
      hueco desde entonces, y `notifications` no admite ni la clase ni el
      tipo de entidad `task`. Meterlo es ensanchar dos CHECK y decidir a
      quién avisa, y prefiero que las dos —trabajo y tarea— se resuelvan
      juntas y con tu criterio, en vez de dejar dos avisos distintos para
      la misma regla.

    - **Sin recorrido de Playwright con datos**, por el mismo motivo de
      siempre y ya escrito: este contenedor tiene denegada la salida de
      red hacia el proyecto de Supabase.

- [x] **Las cuatro decisiones del 12/09/2026** — migraciones 71, 72 y 73.

    Bosco contestó a las cuatro preguntas que estaban abiertas desde el
    cierre de las vistas. Tres se implementan aquí; la cuarta abre trabajo
    y se explica al final.

    **1 · El aviso de una reasignación llega a quien decide** (migración
    71). *"Se avisa al propietario del mantenimiento y a los
    administradores."* Pedir la reasignación de un trabajo existía desde el
    Hito 6 y la de una tarea desde la 65, y ninguna de las dos avisaba a
    nadie: quien puede aprobarla (RN-ASG-08) se enteraba si entraba a
    mirar. Ahora emiten las dos, con dos tipos de evento —`job_` y `task_`—
    porque el texto no se redacta igual y las preferencias de RN-NOT-02 se
    guardan por tipo: con uno solo, apagar el de tareas apagaría el de
    trabajos. `notifications` admite además `task` como tipo de entidad,
    que es lo que hace que el enlace profundo de RN-NOT-04 abra la tarea y
    no su trabajo.

    Dos cosas que NO hace, ambas a propósito: no avisa a quien la pide —es
    quien acaba de escribirla, y ese ruido es lo que acaba con alguien
    apagando los avisos que importan— y no avisa al cliente: una
    reasignación es organización interna del equipo (P7, CA-04).

    La clave de deduplicación cuelga del **apunte de auditoría**, no del
    trabajo. Con `job_reassignment_requested:<trabajo>`, una segunda
    reasignación meses después no avisaría a nadie: CA-17 la tomaría por un
    doble clic. El doble clic sigue sin duplicar nada porque las dos
    funciones salen antes de escribir ese apunte.

    **2 · Lo que ya se está haciendo no se reordena** (migración 72). *"Solo
    los premium podrán ordenar sus tareas. Eso sí importante, si un trabajo
    ya se está haciendo no se puede mover, no se puede reordenar."* La
    primera mitad ya era así desde la migración 62 y no cambia. La segunda
    saca `in_progress` de `request_is_rankable()`.

    `accepted` **no** sale, y conviene que quede dicho por si no es lo que
    quieres: un cambio aceptado tiene trabajo creado pero sin comenzar, y
    ése es justo el momento en que el orden sirve para algo —decide cuál de
    los aceptados se coge primero—. He leído "ya se está haciendo" como
    comenzar, no como aceptar.

    El compactado no hizo falta tocarlo: el disparador de la migración 64
    pregunta por esa misma función, así que en cuanto un trabajo arranca su
    cambio suelta el puesto y los que quedan se recolocan a 1..k
    conservando el orden que puso el cliente. Había un único sitio donde
    estaba escrito qué se ordena.

    En la pantalla, los que ya se están haciendo **no desaparecen**: van a
    su propio bloque, sin flechas y con el motivo escrito. Un cambio que el
    restaurante pidió y que se esfuma de la lista se lee como que se ha
    perdido.

    **3 · El coste de la IA, en milicéntimos** (migración 73). Con Haiku
    4.5 una clasificación cuesta ~0,01 céntimos, así que
    `estimated_cost_cents` valía **0 en todas las llamadas**: la columna no
    informaba de nada dentro de un libro inmutable. Se añade
    `estimated_cost_millicents` y se rellena lo ya escrito con céntimos ×
    1000 — ni una fila se reescribe con otro valor. La columna vieja se
    queda, porque borrarla sería borrar una columna de un libro, pero deja
    de ser un dato que alguien escribe: un CHECK la obliga a ser el
    redondeo de la nueva. Dos columnas que dicen lo mismo se separan tarde
    o temprano; con el CHECK es imposible.

    `record_classification()` se **borra y se vuelve a crear** —el décimo
    parámetro cambia de nombre y PostgreSQL no lo renombra sobre la
    marcha—, lo que devuelve sus privilegios a los de por defecto de
    Supabase. El `revoke` posterior no es decorativo: sin él, la función
    que graba lo que dijo la IA queda abierta por RPC a cualquiera. Es el
    mismo mecanismo de la migración 24.

    **Comprobado:** las **28 suites SQL** desde cero sobre un PostgreSQL 16
    con las 73 migraciones, typecheck, lint, **817 pruebas** unitarias y
    `next build`. Tres mutaciones, todas hacen fallar su comprobación:
    dejar `notify_reassignment_deciders()` sin emitir (la suite nueva dice
    "ha recibido 0 avisos"), devolver `in_progress` a los estados
    ordenables (la cola no compacta), y separar las dos listas compartidas
    con TypeScript.

    **Y un test que se prometía y no existía.** `src/core/notifications.ts`
    lleva desde el Hito 8 diciendo que su catálogo de eventos "se compensa
    con un test que compara los dos ficheros". No estaba escrito en ninguna
    parte. Ahora está, en `listas-compartidas.test.ts`, que además lee la
    **última** definición de cada regla en las migraciones y no la del
    archivo donde nació: clavarlo a la migración 62 habría comparado contra
    una versión que la 72 acababa de sustituir.

    **Lo que la decisión 4 abre, y por qué no se toca todavía.** Dijiste
    que la paleta es la de las fotos del PDF. Medida sobre el render de las
    láminas, **no coincide con los tokens de hoy**:

    | Elemento | En el PDF | Token actual |
    |---|---|---|
    | Fondo del menú lateral | `#002f26` | `--color-primary-dark: #0b2f2a` |
    | Destino activo del menú | `#006754` | `--color-primary: #145c4e` |
    | Botón "Crear" de la cabecera | `#005845` | — |
    | Botón principal | `#014e3b` | `--color-primary: #145c4e` |
    | Fondo de página | casi blanco (`#fdfdfd`) | `--color-background: #f5f7f4` |
    | Fila resaltada | `#e4f6fc` | — |
    | Fondo de etiqueta "Activo" | `#d0f8e7` | — |

    Los verdes del PDF son más oscuros y más saturados. No lo cambio
    todavía por dos motivos: los valores salen de imágenes comprimidas
    (±2 por canal, y los tonos claros son los menos fiables), y **los
    tokens son globales** — el menú, los botones y las etiquetas son el
    mismo cromo en todas las secciones, así que cambiarlos "solo para
    Restaurantes" no existe: o se cambian para todo o no se cambian. Como
    dijiste que faltan las fotos del resto, lo suyo es hacerlo de una vez
    cuando lleguen, y volver a pasar entonces el test de contraste de
    CA-22, que es lo que hoy limita `success`, `warning` e `info` a
    iconos, bordes y texto grande.

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
