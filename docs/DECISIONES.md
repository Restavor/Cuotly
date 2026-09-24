> **Nota del 30/08/2026:** las 8 aclaraciones de este archivo quedaron incorporadas
> palabra por palabra en `docs/PRD.md` (versión nueva, subida por Bosco) y en
> `docs/ESPECIFICACION-MAESTRA.md`. No hay ninguna contradicción entre este archivo y
> esos dos — simplemente ya no hace falta consultarlo, la fuente vigente es el PRD.
> Se conserva sin borrar por trazabilidad, no como referencia activa.

# Cuotly — Registro de decisiones posteriores a la Especificación Maestra

`docs/ESPECIFICACION-MAESTRA.md` quedó consolidado el 29/08/2026. A partir de esa fecha,
cualquier aclaración, corrección o regla nueva que vaya surgiendo durante el desarrollo se
anota aquí, con fecha y con la sección de la Especificación Maestra a la que afecta (si
afecta a alguna). Cuando un bloque de decisiones sea lo bastante grande o estable, se
incorpora directamente al documento maestro; hasta entonces, **este archivo manda sobre lo
que contradiga a la Especificación Maestra**, igual que ella manda sobre documentos
anteriores.

Léelo entero al empezar cualquier sesión, junto con `CLAUDE.md`, `docs/PRD.md` y
`docs/ROADMAP.md`.

---

## 2026-08-29

1. **Combinación de servicios por establecimiento** (aclara §6). Un establecimiento puede
   tener: solo plan de mantenimiento, solo Menú Diario, o ambos a la vez. No son
   excluyentes.

2. **Columna "Finalizados" de trabajos/tareas** (regla nueva, no estaba en la
   Especificación Maestra). Un trabajo o tarea completado permanece visible en una columna
   "Finalizados" durante 30 días. Pasado ese plazo, se archiva en el historial de
   tareas/trabajos pasados (sigue existiendo y siendo consultable, pero deja de aparecer en
   la vista operativa activa).

3. **Definición del estado de establecimiento "Finalizando"** (completa §27, que lo
   nombraba sin definirlo). El restaurante ha comunicado la baja, pero el servicio sigue
   activo hasta que se cumple el periodo ya pagado o la permanencia contractual vigente. Al
   llegar esa fecha, el establecimiento pasa a "Solo lectura" durante 24 horas y después a
   "Suspendido", siguiendo la misma secuencia que describe §30.

4. **Garantía horaria de Menú Diario, caso de edición tardía** (confirma §62, no lo
   cambia). Si el menú se edita o se pide el cambio después de las 21:00, no se garantiza
   que entre en la publicación del día siguiente — esto ya estaba así escrito en §62.

5. **Menú Diario funciona todos los días de la semana** (confirma §62: "Menú Diario opera
   también fines de semana").

6. **Impago con permanencia mínima activa** (confirma §5.1). Si un establecimiento con
   deuda pendiente solicita la baja durante su periodo de permanencia mínima, mantiene la
   deuda y debe abonar el importe restante del compromiso para poder darse de baja.

7. **Redondeo de importes económicos** (regla nueva). Los importes en euros se redondean
   siempre a 2 decimales.

8. **Establecimientos con solo Menú Diario pueden crear solicitudes de cambio en su web**
   (regla nueva, consecuencia de la decisión 1). Se comportan como un establecimiento en
   plan Básico: sin consumos incluidos, todo se presupuesta aparte, con primera atención de
   48 horas laborables.

10. **Métodos de pago: transferencia o Bizum** (contradicción resuelta, 31/08/2026).
   Los tres documentos no decían lo mismo: el PRD (RN-FIN-03) listaba cinco métodos
   —transferencia, tarjeta, efectivo, domiciliación, otro— y no mencionaba Bizum, mientras
   que CLAUDE.md y la Especificación Maestra (§244) hablaban de "transferencia o Bizum".
   Bosco decide: **transferencia o Bizum, y nada más**. Sin Stripe ni pasarela no hay quien
   cobre una tarjeta ni gestione una domiciliación, así que esos métodos no existen en la
   Fase 1. Aplicado en `RN-FIN-03` del PRD, en `PAYMENT_METHODS` (`src/core/finance.ts`) y
   en la restricción de la tabla `payments` (migración `20260830000031`).

11. **El servicio se detiene a las 24 horas, no a las 72** (contradicción resuelta,
   31/08/2026). RN-FIN-10 decía que a las +24 h el establecimiento queda "Pausado por
   impago" sin mencionar que el servicio se detenga, y RN-FIN-11 ponía la detención en las
   +72 h. El código hacía una cosa intermedia y contradictoria: `evaluate_establishment_dunning()`
   paraba todos los contadores ya a las 24 h, pero nada impedía arrancar otros nuevos acto
   seguido — se paraban once contadores y el cliente o el trabajador encendían dos más.
   Bosco decide: **el servicio se detiene a las 24 h**. A las 72 h lo que cambia es el
   estado (Suspendido) y su gravedad, no la detención, que ya estaba. Aplicado en RN-FIN-10
   a 12 del PRD y en la guarda de servidor, que pasa a rechazar tanto `paused` como
   `suspended` (migración `20260830000033`).

12. **Reembolsar deja el cobro reabierto** (01/09/2026). La sexta revisión destapó que un
   cobro reembolsado se mostraba como "Reembolsado" mientras el ciclo de impago contaba su
   deuda como viva, y al hacer coherente el estado surgió la pregunta de fondo: ¿reembolsar
   cierra el cobro o lo reabre? Bosco decide: **lo reabre**. `refund_charge` revierte el
   pago, la deuda vuelve a estar viva y el estado sale de la fecha de vencimiento —
   **Vencido** si ya pasó, **Pendiente** si no.

   Devolver el dinero *y* que el cliente no deba nada es una operación **distinta**:
   cancelación, anulación o abono del cobro. **No existe todavía y no se improvisa dentro
   de `refund_charge`.** Cuando haga falta, se diseña aparte.

13. **El aviso de inicio de un trabajo: sin correo para el cliente, con correo para el
   equipo** (01/09/2026). La tercera revisión señaló que la fila del §18 —"Inicio de un
   trabajo | Visible **dentro** de Cuotly para el cliente, sin correo ni push"— admite dos
   lecturas: o la fila nombra al único destinatario y al canal de todos, o nombra el canal
   *del cliente*. Bosco decide: **la segunda**. El cliente lo ve dentro de Cuotly y no
   recibe correo; el equipo sigue recibiendo el suyo, apoyado en RN-NOT-02 ("los
   propietarios reciben todo por defecto"). El comportamiento actual es el correcto y no
   hay que cambiar nada.

14. **Qué ve un administrador en la auditoría: "la operativa" es toda la operativa diaria**
   (04/09/2026). §21.2 del PRD reparte la auditoría —"el propietario del espacio ve la auditoría
   completa de su espacio; los administradores, la operativa"— pero no decía qué queda fuera de "la
   operativa", y HU-36 tuvo que elegir una lectura para escribir la política de RLS. Bosco confirma la
   que se implementó: **los administradores pueden gestionar toda la operativa diaria, incluidas
   finanzas, cambios, menús e incidencias. Quedan fuera la configuración del espacio y la
   gestión/composición del equipo: invitaciones, permisos, supervisores y capacidades reservadas al
   propietario.**

   No es una lista aparte que haya que mantener a mano: sale del criterio de que **la capacidad que
   hace falta para ver una acción es la misma que hace falta para ejecutarla**, así que lo que queda
   fuera es justo lo que el propietario no delega (`manage_space`, `invite_member`). En la base son
   `audit_action_capability()` y la política `audit_log_select` de la migración
   `20260903000049`, que ya lo hacían así; el comportamiento vigente es el correcto y no hay que
   cambiar nada. Se cierra con esto el matiz que el ROADMAP dejaba pendiente en el punto 20 del Hito 9,
   incorporado a §21.2 del PRD, cubierto por `supabase/tests/hu36_ajustes_auditoria.sql` (que ahora
   comprueba también la familia `invitation`, la única de las tres que nombra la confirmación que no
   se estaba verificando) y dicho en pantalla en `auditWhatYouSee.admin`.

---

## 2026-09-08

15. **El plazo de pago de una mensualidad: dato del espacio, no regla escrita en el
   código** (08/09/2026). Al poner en marcha la cola periódica salió que
   `generate_monthly_charge_internal()` emitía la mensualidad con `due_at = cycle_start`,
   es decir **ya vencida**: RN-FIN-10 pausaría el restaurante veinticuatro horas después de
   emitírsela. El PRD no fija ningún plazo de pago —RN-FIN-01 dice "en la fecha de
   renovación" y nada más— y `CLAUDE.md` prohíbe inventar umbrales.

   Bosco decide: **no se escribe un número en el código, se añade configuración**. Nace
   `spaces.payment_term_days`, días naturales entre la emisión y el vencimiento, **7 por
   defecto**, que el propietario cambia desde Ajustes (`set_space_payment_term()`,
   `manage_space`, auditada). El plazo se congela en `charges.due_at` al emitir, igual que
   el tipo impositivo: cambiarlo mueve las mensualidades futuras y ninguna de las ya
   emitidas (P4). Se incorpora al PRD como **RN-FIN-01b** y está en la migración
   `20260908000052`.

   Con esto sigue **sin** existir el resto del bloque legal y fiscal (numeración,
   retenciones, jurisdicción): esto es solo cuándo vence un cobro, no cómo se factura.

16. **Los datos de prueba del restaurante «Prueba» se reinician** (08/09/2026). Ese
   establecimiento tenía el ciclo 08/09–08/10 con **solo** el cobro de la mejora de plan
   (299,96 € de base) y sin la mensualidad base de Básico, porque `create_plan_subscription()`
   no la emitía. En cuanto la cola empezara a andar se le habría emitido encima la
   mensualidad completa de Impulso: 399 € sobre 299,96 € ya cobrados. Bosco decide
   reiniciarlo en vez de cuadrarlo a mano.

   Hecho el 08/09/2026 sobre el proyecto: el cobro se **perdona** con su apunte de signo
   contrario (`waiver`) y la suscripción pasa a `cancelled`, las dos cosas con su fila de
   auditoría y su motivo. **No se borró nada físicamente** (`CLAUDE.md`), y el
   establecimiento se conserva para poder volver a asignarle un plan.

17. **Qué significa "trabajos próximos a vencer" en el Inicio** (08/09/2026). El rediseño
   del Inicio (§20.4) pide un contador de trabajos críticos, y "próximo a vencer" suena a
   umbral inventado — justo lo que `CLAUDE.md` prohíbe. **No se inventa ninguno**: se
   compone con los tres que el PRD ya da.

   - **T2** (plazo de inicio): está en riesgo cuando quedan **2 h laborables**, que es el
     momento exacto en el que RN-SLA-10 manda la alerta importante. No es un porcentaje: con
     48 h de plazo, el 80 % consumido deja casi diez horas por delante y no es riesgo
     ninguno.
   - **T3** (plazo de ejecución): está en riesgo al **90 %**, el último aviso de RN-SLA-15
     antes de agotarse.
   - **Fuera de plazo** (RN-SLA-17) cuenta también, y gana: un trabajo pasado de plazo no es
     un trabajo "a punto de", y mezclarlos lo escondería entre los que todavía llegan.

   Qué contador manda en cada estado no se decide en la pantalla: lo dice
   `jobDeadlineCondition()`, que ya existía. La composición vive en `src/core/home.ts` con
   tests que citan las tres reglas, y la tarjeta del Inicio lleva escrito debajo del número
   qué está contando, para que nadie tenga que suponerlo.

18. **Menú Diario en el Inicio: el motivo, no un cero** (08/09/2026). La maqueta del Inicio
   enseña "3 publicaciones pendientes" de Menú Diario. Menú Diario es la **Fase 2** entera y
   no publica nada todavía, así que ese número no se puede calcular. Un `0` habría tenido
   aspecto de dato real, que es lo que `CLAUDE.md` prohíbe (MUST NOT, CA-20). La tarjeta
   existe en su sitio de la maqueta y dice el motivo: "Menú Diario llega en la Fase 2". El
   día que la Fase 2 exista, el contador entra ahí y no hay que rediseñar nada.

## 2026-09-12

19. **Publicar condiciones nuevas avisa al restaurante** (12/09/2026). La migración 75 dejó
   escrito que publicar una versión nueva de las condiciones de un plan o servicio no avisaba
   a nadie, y la pantalla lo decía. Bosco decide: *"El equipo de mantenimiento pulsará un botón
   cuando lo haya publicado y le llegará un push al restaurante"*.

   Cómo se ha leído, y por qué:

   - **El botón es el de publicar.** No se añade un segundo botón "Avisar": publicar es el único
     acto que deja al restaurante con algo pendiente, y un aviso que hay que acordarse de mandar
     es un aviso que un día no se manda (mismo criterio que la decisión 15 con la cola).
   - **"Push" en Fase 1 son los dos canales del PRD §18**: el centro de avisos y el correo. El
     push de verdad llega con la app móvil (Fase 4) y saldrá de la misma fila de
     `notifications`; no hay que tocar nada entonces.
   - **A quién.** A quien puede aceptarlas por el restaurante —propietario local y propietario
     global del grupo, la misma lista que `client_can_accept_terms()`—, por cada restaurante con
     suscripción **activa** a ese plan o servicio. No al Editor ni a Consulta (no firman), no a
     quien se le retiró el acceso (RN-EST-05), no al equipo (es quien publica). Cada versión
     avisa; la misma versión no avisa dos veces al mismo restaurante.

   Es la migración `20260912000076` y el evento `terms_version_published`. El PRD §18 lleva la
   fila. El equipo no tiene casilla de preferencia sobre él en Ajustes: es un aviso que nunca
   recibe.

## 2026-09-13

20. **`grants_priority` identifica al plan Premium también para el precio de Menú
   Diario** (13/09/2026). RN-COM-08 fija dos precios para el servicio —229 € o 199 €
   si el establecimiento tiene plan Premium activo— y el esquema solo distinguía al
   Premium por `plans.grants_priority` (migración 62). La pregunta era si esa marca
   bastaba o hacía falta una propia. Bosco decide: **sí, basta**. Consecuencia: la
   mensualidad del servicio (Hito 12) cobra `services.price_premium_cents` cuando el
   plan activo del establecimiento tiene `grants_priority`, y `price_cents` si no. No
   se añade ninguna columna nueva. Si algún día un espacio quisiera un plan con
   prioridad y sin descuento en el servicio, será una decisión nueva.

21. **Quién acepta o rechaza un presupuesto** (13/09/2026, cierra la pendiente 11).
   §84 no lo decía. Bosco decide: lo acepta **el propietario del restaurante** (local o
   global del grupo, la misma lista que acepta las condiciones), **y el propietario y los
   administradores del espacio también tienen permiso**, para registrar en nombre del
   restaurante la respuesta que dio fuera de Cuotly (por teléfono, por correo, en persona),
   como ya se registra de fuera la aceptación de las condiciones. Consecuencias en la
   migración 80: `accept_quote()` y `reject_quote()` admiten a `manage_requests` además de
   `client_can_accept_terms()`; cuando responde el equipo, el **motivo es obligatorio**
   (cómo y cuándo respondió el restaurante), la fila queda marcada (`quotes.decided_by_team`),
   el apunte de auditoría lleva `on_behalf_of_client` y el motivo, y el restaurante **recibe
   el aviso** de lo que se registró en su nombre (sus dos propietarios, como `quote_sent`).
   Lo que pasa después es idéntico: el cobro, la solicitud y el trabajo. El Editor y Consulta
   siguen sin responder; un trabajador no registra nada. El restaurante ve que se registró
   en su nombre y por qué, no quién del equipo lo hizo (P7).

## 2026-09-14

22. **La ventana de la corrección mínima de Menú Diario son 72 h de reloj** (14/09/2026,
   cierra la pendiente 10). RN-COR-02 mide la ventana en 72 h laborables con el reloj
   contractual; Menú Diario opera todos los días del año con su propio calendario (RN-CLK-09,
   §62), así que el Hito 11 la aplicó como **72 h de reloj desde la publicación**
   (`menu_correction_window_ends_at()`), con las 21:00 de RN-COR-10 aparte. Bosco confirma:
   **se queda en 72 h**. No cambia nada.

23. **Lecturas de §84 sobre los presupuestos, confirmadas** (14/09/2026, cierra la pendiente
   12). Las tres cosas que §84 no decía y que la migración 80 resolvió del modo más corto quedan
   como están: (a) el **periodo** del cobro de un presupuesto es el día de la aceptación; (b) un
   presupuesto **rechazado deja la solicitud donde estaba** (pendiente de aceptación del
   restaurante), sin estado nuevo de solicitud, y el equipo puede enviar otro; (c) "aceptado" no
   se enseña como estado visible, porque aceptar es el instante en que nace el cobro y desde ahí
   el presupuesto está pendiente de pago o pagado (RN-DAT-05). Bosco confirma las tres. No
   cambia nada.

24. **Lecturas de §115 a §122 sobre las integraciones, confirmadas** (14/09/2026, cierra la
   pendiente 13). Las cuatro lecturas de la migración 81 donde la maestra calla quedan como
   reglas: (a) **"frecuencia adaptada"** (§118) para Business Profile y Clarity es **diaria**;
   (b) **"reintenta"** (§118) es una espera creciente de **1 h, 4 h, 16 h y 24 h como máximo**,
   y "desactualizado" es no tener una sincronización correcta en **el doble de la frecuencia**;
   (c) **"suspenderse definitivamente"** (§119) es **archivar** el restaurante: archivar
   desconecta las cinco fuentes y revoca las credenciales; suspendido por impago o al acabar la
   permanencia, la sincronización se detiene y las credenciales se conservan para reactivar;
   (d) la primera sincronización trae **90 días** hacia atrás y cada pasada repite los **3
   últimos días** para recoger las revisiones tardías de GA4 y Search Console. Bosco confirma
   las cuatro el mismo día en que ordena aplicar la 81 al proyecto real. No cambia nada: las
   cuatro funciones de cuenta de la 81 y `src/core/integrations.ts` ya dicen esto, y
   `listas-compartidas.test.ts` vigila que sigan diciendo lo mismo.

25. **Lecturas del Hito 14 sobre los adaptadores y las pantallas de integraciones,
   confirmadas** (14/09/2026, cierra la pendiente 14). Las ocho lecturas que el Hito 14 aplicó
   donde la maestra calla quedan como reglas. Cuatro eran elecciones con alternativa real:
   (a) **"periodo insuficiente"** (§178) es tener menos de **7 días con dato** en la ventana
   para una fuente diaria, y **ninguna medición** para PageSpeed, que es semanal
   (`minimumCoveredDays()`); (b) la **ventana del resumen** son los **28 últimos días
   completos**, hasta ayer, que es la que GA4 y Search Console enseñan por defecto, y no el mes
   natural; (e) **"una revocación remota, una vez"** (RN-INT-08) son **dos intentos en total**,
   es decir, un reintento: el primer fallo pasajero se repite en la siguiente tanda y el segundo
   cierra la pendiente con el motivo en la auditoría, y un token que Google ya no reconoce cuenta
   como revocado; (f) de los **desgloses** (páginas, procedencia, búsquedas) se guardan los
   **diez mayores de cada día** (`TOP_PER_DAY`), no la cola larga entera.

   Las otras cuatro no eran elecciones, sino lo que imponen las API o lo ya decidido:
   (c) el **catálogo de métricas** de Business Profile, Clarity y PageSpeed (§92.3) es lo que
   devuelve la API de cada una, y está en `METRICS_BY_PROVIDER` y en PRD §27; (d) **Clarity** no
   acepta rangos de fechas, así que cada punto se guarda con el día de la consulta y un día sin
   sincronizar no se recupera; (g) **reservas y delivery** (§120) no tienen todavía campo en la
   ficha, así que la tarjeta lo dice en vez de enseñar un enlace vacío, y añadirlos es un dato de
   §15.2, no una integración; (h) al ajustar las pantallas a los PDF de `docs/diseno/`:
   **Business Profile va en la sección "Búsqueda"** con Search Console porque lo que mide es
   visibilidad de la ficha en Google, la **variación** de cada cifra es frente a los **28 días
   anteriores** a la ventana y se dice así aunque las maquetas escriban "vs. mes anterior", el
   **color de la puntuación de PageSpeed** son las bandas de Lighthouse y no un umbral de
   Cuotly, y las **marcas de cada fuente** son iconos del sistema y no los logotipos de los
   productos.

   Bosco confirma las ocho. No cambia nada: `src/core/integrations.ts`, la migración 82 y las
   pantallas ya dicen esto; lo que cambia es que dejan de llamarlo "pendiente" y citan esta
   decisión. Con esto **no queda ninguna pendiente abierta** en este documento.

26. **Los umbrales de las oportunidades, impacto y esfuerzo** (14/09/2026, desbloquea el Hito
   15). Bosco pidió que los escribiera yo y él corrigiera; la propuesta está en
   `docs/PROPUESTA-OPORTUNIDADES.md` y la confirma entera. Es la decisión que CLAUDE.md tenía
   como prohibida de inventar, así que a partir de aquí **son reglas suyas, no lecturas mías**.

   **(a) Impacto** es cuánto gana el restaurante si se arregla, y sirve para ordenar la lista.
   Tres niveles, definidos por lo que toca el problema: **alto** si rompe o estorba el camino por
   el que un cliente contacta (teléfono, cómo llegar, reserva, formulario) o afecta a más de la
   mitad del tráfico; **medio** si afecta a una parte visible o a una entrada de tráfico
   importante pero no al camino de contacto; **bajo** si afecta a una página, una consulta o un
   detalle suelto. **No son euros**: Cuotly no sabe lo que vale una reserva ni cuántas visitas
   acaban en cena, y un euro inventado en una pantalla de producción es lo que CLAUDE.md prohíbe.
   El nivel lo propone Cuotly y el equipo lo puede cambiar antes de enseñarlo (§96).

   **(b) Esfuerzo es la categoría del cambio** —Pequeño, Fotográfico, Mediano o Grande—, sin
   escala nueva. Bosco lo definió como "lo que se tarda en hacer y los cambios que gasta", y eso
   es exactamente lo que la categoría ya lleva dentro: su duración (RN-SLA-12) y una unidad de su
   bolsa. Así la pantalla dice "Mediano: 1 a 3 días laborables, y te gasta 1 de los 3 medianos que
   te quedan" en vez de "esfuerzo: medio". En Básico, o con la bolsa agotada, la oportunidad dice
   que va a presupuesto en vez de fingir que está incluida.

   **(c) Los umbrales**, sobre la ventana de 28 días completos de la decisión 25b, comparada con
   los 28 anteriores, y ninguno salta si su fuente está desconectada, sin autorizar o
   desactualizada:

   | Oportunidad (§96) | Salta cuando |
   |---|---|
   | Descenso de tráfico | Las sesiones caen **30 %** o más, con **100** sesiones o más en el periodo anterior |
   | CTR bajo | Consulta con **100** impresiones o más, en posición 10 o mejor, con CTR bajo el **2 %** |
   | Pérdida de posición | Consulta con 50 impresiones o más que empeora **3** puestos o más y acaba peor del 10 |
   | Lentitud | Puntuación móvil bajo **50** (banda roja de Lighthouse) o LCP móvil sobre **4 s**, en dos análisis seguidos |
   | Imágenes pesadas | **500 KB** o más ahorrables en móvil |
   | Error técnico | Errores de script en el **5 %** o más de las sesiones, con 100 sesiones o más |
   | Baja conversión móvil | El móvil convierte **la mitad** o menos que el escritorio, con 100 sesiones móviles o más |
   | Búsquedas sin contenido adecuado | Consulta con 100 impresiones o más en posición media peor que **20** |
   | Poco uso de botones | Ficha de Google con **500** impresiones o más y acciones bajo el **2 %**; o clics muertos o de rabia sobre el **5 %** de las sesiones |

   Dos matices que quedan dichos: "búsquedas sin contenido adecuado" detecta **"sale muy abajo"**,
   no que el contenido sea inadecuado, porque juzgar eso exigiría leer la web y Cuotly no la lee;
   y la lentitud pide **dos análisis seguidos** para que un mal día no genere trabajo.

   **(d) Dos oportunidades necesitaban datos que no recogíamos**, y Bosco aprueba añadirlos, con
   lo que **la decisión 25c queda ampliada**: `conversions_by_device` en GA4 (las conversiones por
   evento no vienen cruzadas con el dispositivo, así que "baja conversión móvil" era indetectable)
   y los kilobytes ahorrables de las imágenes en PageSpeed (`uses-optimized-images` y
   `uses-responsive-images`, leídos de `details.overallSavingsBytes`, que es donde Lighthouse pone
   los bytes; `numericValue` son milisegundos). Implementadas el mismo día en los dos adaptadores,
   con sus tests y dos mutaciones que los verifican.

   **(e) Básicas y avanzadas** (§101): **avanzadas** son las que cruzan dos fuentes y **básicas**
   las que salen de una sola. Impulso ve las básicas aprobadas y Premium también las avanzadas.

27. **Las cinco lecturas del Hito 15, y las tres métricas por consulta** (14/09/2026, cierra la
   pendiente 15). Bosco confirma las cinco lecturas que el Hito 15 aplicó donde §96 a §101 callan,
   y aprueba la ampliación del catálogo que hicieron falta para cumplir la decisión 26. No cambia
   nada: el código ya dice esto; lo que cambia es que deja de llamarlo "pendiente" y cita esta
   decisión.

   **(a) La "categoría" de §96** son las **cinco áreas** en que caen las nueve reglas: tráfico,
   búsqueda, rendimiento, técnico y conversión. La maestra pide el campo y no lo enumera.

   **(b) La "prioridad propuesta"** sale del impacto —alto 1, medio 2, bajo 3, y 1 es lo primero— y
   es editable como el impacto y el esfuerzo (§96). Ordenar la lista es cambiarla.

   **(c) Qué impacto propone cada regla**, aplicando la definición de la decisión 26a regla a
   regla: **alto** para el error técnico (es la única que dice que algo está roto, y lo roto puede
   ser el formulario o la reserva), para la baja conversión móvil (convertir **es** el camino de
   contacto) y para los botones de la ficha de Google (son el teléfono, cómo llegar y la web);
   **alto** también para un descenso de tráfico del 50 % o más ("más de la mitad del tráfico"),
   **medio** por debajo; **medio** para la lentitud, las imágenes pesadas y los clics que no
   responden; **bajo** para las tres reglas que hablan de una sola consulta.

   **(d) "Otro periodo" en §99** —"puede reaparecer si empeora o vuelve a cumplirse en otro
   periodo"— es una ventana que **ya no se solapa** con la que se descartó. La lectura literal
   (cualquier detección posterior la reabre) haría que descartar no significara nada al día
   siguiente, porque la regla vuelve a saltar cada día con el mismo dato. Empeorar sí la reabre de
   inmediato, y al volver se indica el descarte anterior, que por eso no se borra.

   **(e) El suelo de ruido de la regla 9b** (clics muertos o de rabia sobre el 5 % de las sesiones)
   son **100 sesiones** de Clarity, heredado de la regla 6, que divide entre exactamente lo mismo.
   La decisión 26c le pone suelo a las demás y a esta no.

   **(f) Tres métricas más en el catálogo, y la decisión 25c queda ampliada otra vez.** Las tres
   reglas "por consulta" de la decisión 26 necesitan el CTR y la posición **de cada consulta**, y
   el catálogo solo guardaba los clics de las diez consultas con **más clics** de cada día — justo
   las que esas reglas no buscan, porque lo que detectan es la consulta con impresiones y sin
   clics. Con aquel catálogo no habría saltado ninguna de las tres, nunca, y nada lo habría dicho.
   Se añaden `impressions_by_query`, `ctr_by_query` y `position_by_query`, que salen de la
   respuesta de Search Console que ya se pedía —sin llamada nueva— y se quedan con las diez mayores
   **por impresiones**. `clicks_by_query` no se toca: es lo que "búsquedas principales" enseña, y
   ahí lo principal son los clics.

   **(g) Y la 84 se aplica al proyecto real** el mismo día, por orden de Bosco, con
   `database.types.ts` regenerado detrás (`docs/DESPLIEGUE-SUPABASE.md`).


28. **Las lecturas del Hito 16 sobre los informes, con tres cambios de Bosco** (14/09/2026,
   cierra la pendiente 16). De lo que la maestra deja abierto en §89 a §95, Bosco confirma dos
   cosas tal como estaban y **cambia otras dos**, una de ellas enmendando la maestra.

   **Confirmado sin cambios.** (a) Las secciones que "requieren criterio" (§95.3) son las **dos
   que escribe o elige una persona**: el resumen ejecutivo y las oportunidades. De ahí sale que un
   informe con resumen ejecutivo dentro **pase por aprobación** y que solo quitándolo pueda
   programarse sin aprobar, que es lo que dice la maqueta. (b) "Se acerca la fecha programada"
   (§95) son **24 horas antes**, una sola vez por informe y fecha; cambiar la fecha vuelve a armar
   el aviso. Se eligen 24 h y no una hora porque el aviso sirve para poder pararlo o corregirlo, y
   eso necesita una jornada por delante.

   **(c) Enmienda a §89: el informe lo pueden ver todos.** La maestra dice "Editor ve informes
   siempre. Consulta necesita permiso de su propietario", y la migración 85 lo implementó con un
   permiso fino por persona (`establishment_permissions.view_reports`) y su función para
   concederlo. Bosco lo cambia: lo ve **cualquier persona del restaurante con el acceso vigente**,
   sin distinguir rol. El permiso y su función **se han quitado enteros**, no desactivados. Al
   hacerlo apareció un fallo que nadie había visto: `client_can_view_reports()` no miraba
   `revoked_at`, así que a quien se le retiraba el acceso **seguía viendo los informes**
   (RN-EST-05); ahora lo mira, y la suite lo comprueba.

   **(d) A quién llega el informe: a todos los que trabajan en ese restaurante, por los dos
   lados.** La primera versión lo mandaba solo al lado cliente. La segunda idea, de Bosco, fue
   añadir `noti@restavor.com`; se le hizo notar que una dirección escrita en el código mandaría
   los informes de otro espacio al buzón de Restavor —Cuotly es multiempresa, y eso no es un
   detalle de estilo sino una fuga entre espacios, el mismo patrón que la migración 83 y el
   barrido de las fechas del mismo día— y **cambió la regla por una mejor**: le llega a quien
   trabaja ahí por el lado del restaurante (sus personas y su grupo) y por el de mantenimiento
   (los trabajadores autorizados en ese restaurante y quien lleva la cartera). **No hay ninguna
   dirección escrita en el código**, porque los destinatarios se calculan.

   **(e) El informe se guarda y siempre es un PDF.** No hace falta cambiar nada: cada versión se
   conserva (§95) y el PDF **se regenera desde la versión**, con sus cifras congeladas, así que
   abrir el informe de hace cinco meses da el de hace cinco meses. Guardar además el archivo sería
   un segundo original que puede dejar de coincidir.

   Comprobado: `informes.sql` con los destinatarios verificados **persona a persona** y no por el
   total —un número correcto por casualidad, uno de más y otro de menos, pasaría igual—; las 39
   suites desde cero sobre las 85 migraciones; y dos mutaciones detectadas: quitar el lado de
   mantenimiento de los destinatarios y quitar la comprobación de acceso retirado.

29. **El informe guarda las cifras de todas sus secciones, y quien lo mira elige cuáles ver**
   (14/09/2026, cierra el aviso que dejó la revisión del Hito 16 sobre RN-REP-05).

   **De dónde venía.** RN-REP-05 prometía que los ocho filtros de §93 se guardaban con el informe
   y eran "lo que se vuelve a aplicar al regenerarlo". Al revisar el hito se vio que `filters`
   guardaba tres de los ocho y **nadie los volvía a leer nunca**: una columna que decía una cosa y
   hacía otra. Se le planteó a Bosco como decisión de producto y no se resolvió por cuenta propia.

   **Lo que decide Bosco.** "Todo se tiene que guardar dentro del informe y luego ya el
   restaurante elige qué aplicar". De ahí salen dos reglas:

   **(a) Al generar una versión se calculan las cifras de las tres familias**, las haya marcado el
   equipo o no. Antes solo se generaban las de las secciones incluidas, y eso convertía una
   decisión editorial en una pérdida de datos: desmarcar "Rendimiento digital" dejaba esa versión
   sin una sola cifra digital **para siempre**, y verlas después obligaba a regenerar, que es otra
   versión con otras cifras porque las fuentes siguen sincronizándose.

   **(b) Lo que NO se guarda entero es lo que el equipo escribe o elige**: las **notas** de una
   sección desmarcada no viajan dentro de la versión (RN-REP-13, arreglado en la misma revisión) y
   las **oportunidades** solo entran si el equipo incluyó su sección (§99). La línea es esa y es
   la que sostiene P7: las cifras son datos del propio restaurante y guardarlas enteras no le
   enseña nada del equipo; el texto interno, sí.

   **(c) Quien mira el informe enciende y apaga secciones** sobre la versión guardada, y se abre
   con lo que decidió el equipo. Es estado de pantalla: no escribe nada, no cambia el PDF y no da
   acceso a nada que la versión no trajera ya dentro, así que puede vivir en el cliente sin
   chocar con CLAUDE.md —no es un control de acceso porque no hay nada que controlar—. **El PDF y
   el CSV siguen saliendo con lo que eligió el equipo**, que es lo que §95 llama el informe y lo
   que se envió.

   **Lo que se descarta con esto:** que los filtros se "vuelvan a aplicar al regenerar". No se
   aplican y no van a aplicarse; RN-REP-05 se reescribe para decir lo que pasa. Y el filtro por
   **trabajador** de §93 no se le ofrece nunca al restaurante: le diría quién del equipo hizo qué,
   y CLAUDE.md lo prohíbe sin excepción.

   Comprobado: dos tests nuevos de generación (una sección apagada se guarda igual; un
   consolidado sigue sin cifras digitales), tres de pantalla (se abre con lo del equipo, el lector
   enciende la que sobra y sale marcada como fuera del PDF, y no se ofrece lo que la versión no
   trae) y uno del PDF que **muerde**: mutando el filtro de secciones del PDF, el test falla.

30. **Un informe consolidado no se comparte con ningún restaurante, propietario global incluido**
   (14/09/2026, resuelve la contradicción dentro de RN-REP-01 que dejó abierta la revisión del
   Hito 16).

   **La contradicción.** RN-REP-01 decía, con tres líneas de separación, que el **propietario
   global** del grupo ve "el consolidado de su grupo" y que "un informe **consolidado no se
   comparte con ningún restaurante**". Las dos no pueden ser verdad. CLAUDE.md prohíbe resolver
   una contradicción entre documentos por cuenta propia, así que se dejó marcada y se preguntó.

   **Lo que decide Bosco:** "El informe consolidado no se comparte con ningún restaurante". Vale
   la segunda frase. El propietario global ve el informe de **cada establecimiento suyo**, que es
   lo que tiene cliente al que pertenecer; el consolidado, no.

   **Lo que ya era así sin que nadie lo hubiera comprobado.** La política `reports_select` de la
   migración 85 exige `establishment_id is not null` en la rama del cliente, y
   `client_can_view_reports(null)` devuelve falso, así que un consolidado no llegaba a nadie del
   restaurante. Además, el CHECK `reports_scope` no admite un informe sin restaurante que tenga
   grupo: **"el consolidado de su grupo" no existía ni como fila** — un consolidado es del
   espacio. Lo que faltaba era que algo lo comprobara: una rama que nadie prueba es una rama que
   el siguiente que toque la política puede quitar sin enterarse.

   **Aviso para quien lea la migración 85.** El cuerpo de `client_can_view_reports()` lleva dentro
   un comentario que dice "§14.1 · el propietario global del grupo ve el consolidado y el detalle
   de lo suyo". Esa frase es de antes de esta decisión y **ya no es la regla**; no se edita porque
   la 85 está aplicada y CLAUDE.md prohíbe modificar una migración existente. Lo que manda es esta
   decisión, RN-REP-01 y el bloque de `supabase/tests/informes.sql` que lo comprueba.

   Comprobado: un bloque nuevo en `informes.sql` que deja un consolidado en **"Enviado"** —el
   estado más visible que hay para un cliente— y comprueba **persona a persona** que no lo
   alcanzan ni el propietario local, ni el Consulta, ni el Editor, ni el propietario global, con
   una comprobación en falso-cerrado de que quien lleva la cartera **sí** lo ve (sin ella, una
   fila que no existiera haría pasar el bucle en verde). Las 39 suites desde cero sobre las 86
   migraciones. Y una mutación **detectada**, elegida para modelar el error que esta decisión
   prohíbe y no un borrado cualquiera: añadir a la política la rama que da el consolidado del
   espacio a quien pertenece a un grupo suyo —es decir, implementar la mitad de RN-REP-01 que
   Bosco acaba de descartar— hace fallar la suite.

31. **Las diez lecturas del Hito 17, confirmadas** (15/09/2026). Al escribir la solicitud de
   creación de espacio (PRD §30, migración 89), §10 callaba en diez sitios y en los diez se eligió lo
   más defendible y se preguntó. Bosco confirma las diez; la primera, con sus palabras.

   **(1) Quién pide un espacio.** "Cuando se registran, después rellenan un formulario básico y tienen
   que esperar a que info@restavor.com, que es el dueño global de Cuotly, les acepte." Es decir:
   **primero la cuenta, luego la solicitud, luego la aprobación**. No hay formulario público sin
   cuenta. Un matiz que conviene dejar dicho: §167 permite además que un Administrador de Cuotly
   apruebe **si Bosco le da el permiso** (`can_approve_spaces`), y la 89 lo implementa así; como
   conceder ese permiso es solo de Bosco, la decisión sigue siendo suya en cualquier caso.

   **(2) a (10), confirmadas tal cual:** el solicitante ve el estado y el motivo pero no quién revisó
   (P7 un piso más arriba); se puede aprobar directamente desde "Enviada"; "Aprobada" y "Rechazada"
   son finales; un borrador por persona; para enviar bastan nombre del negocio, responsable y correo;
   los datos fiscales básicos son tres campos de texto libre sin validar; el espacio nace con el
   nombre del negocio y un slug automático numerado en caso de choque; la prueba dura 7 días exactos
   desde el instante de aprobar; y "una prueba por persona" se comprueba por cuenta, que es lo que
   §7.1 dice que es una persona.

   **Lo que esta decisión deja claro para los hitos siguientes:** el formulario básico del
   solicitante y la pantalla en la que Bosco acepta son **pantallas**, y el Hito 17 no las trae. Las
   dos son las dos caras del mismo flujo y van juntas con el panel del **Hito 19**.

32. **Las doce lecturas del Hito 18, confirmadas** (15/09/2026). Al escribir la suscripción de
   Cuotly (PRD §31, migración 90), §4.1 a §4.7 callaban en doce sitios y en los doce se eligió lo
   más defendible, se escribió como regla y se preguntó (pendiente 21). Bosco confirma las doce tal
   cual, sin cambiar ninguna: qué cuenta como establecimiento activo y usuario interno; los
   adicionales de Pro explícitos y enteros; subir un adicional en proporción al periodo restante y
   bajar sin devolución ni por debajo del uso; la primera mensualidad emitida al aprobar y vencida
   al acabar la prueba; la siguiente emitida 7 días antes de la renovación; el quinto aviso a las
   60 h; el pago declarado y pendiente detiene el corte; en la prueba no se cambia de plan ni se
   contratan adicionales; pasados los 30 días la reactivación es de la plataforma con motivo; el
   IVA al 21 % congelado en cada cobro y una referencia bancaria en vez de factura; el modo lectura
   congela a las personas y no a los procesos; y con un cambio a Pro programado rigen ya los
   límites de Pro para crecer.

   **Lo que esta decisión NO cierra:** las cuatro pendientes que §31 deja con placeholder siguen
   abiertas —"uso razonable" (17), el precio del almacenamiento adicional (18), qué identifica a un
   negocio (19) y el bloque legal (20)—. Confirmar el 21 % y la referencia bancaria es confirmar el
   placeholder, no el bloque legal.

33. **Las catorce lecturas del Hito 19, confirmadas** (15/09/2026). Al escribir el panel de
   Administración, Modo soporte y la 2FA (PRD §32, migración 91), §128, §129, §136, §137 y §167
   callaban en catorce sitios y en los catorce se eligió lo más defendible, se escribió como regla y
   se preguntó (pendiente 22). Bosco confirma las catorce tal cual, sin cambiar ninguna: la 2FA se
   impone cerrando la plataforma y no el login; un Administrador de Cuotly lee el panel entero sin
   permiso fino; "soporte" en §128 es Modo soporte y no las incidencias; los tres niveles `read` ·
   `admin` · `owner`, y que `owner` no invita; la duración de 15 a 240 minutos con 60 por defecto;
   no hay soporte sobre un espacio propio; una sesión activa por persona y espacio; caducar no
   escribe apunte; el propietario ve la identidad de quien entró y recibe un aviso obligatorio; los
   administradores y trabajadores del espacio no ven las sesiones; los ingresos son una cifra de
   libro por mes y no una factura; en un espacio archivado el soporte también es solo lectura; los
   avisos por dispositivo nuevo no se implementan; y la escritura directa sobre `platform_roles` se
   retira.

   **Lo que esta decisión NO cierra:** las mismas cuatro pendientes de la 32 —17, 18, 19 y 20—.
   Confirmar que los ingresos se cuentan por el libro es confirmar el placeholder, no el bloque
   legal. **Y la 91 sigue sin aplicar al proyecto real**: Bosco decide cuándo, y ese día registra
   el segundo factor antes de nada.

34. **Las trece lecturas del Hito 20, confirmadas** (15/09/2026). Al escribir el onboarding y el
   ciclo de vida del espacio (PRD §33, migración 92), §9, §127 y §141 callaban en trece sitios y en
   los trece se eligió lo más defendible, se escribió como regla `RN-CIC` y se preguntó (pendiente
   23). Bosco confirma las trece tal cual, sin cambiar ninguna: el asistente no bloquea nada; seis
   pasos se saben por el dato y cuatro se completan con una confirmación del propietario; los seis
   derivados también se pueden confirmar y el origen se enseña; solo el propietario ve y confirma el
   asistente; terminar el onboarding se sella una vez; transferir la propiedad la mueve y quien la da
   queda como administrador; el destinatario tiene que ser miembro activo; "al menos un propietario"
   lo sostiene un disparador; el archivado del propietario es un modo más del espacio sin
   reactivación por pago; dentro de los 30 días restaura el propietario y pasados, la plataforma; la
   exportación es un único JSON del servidor entregado como descarga firmada y caducable; las
   confirmaciones de pasos no van a la auditoría una por una; y los dos avisos nuevos son
   obligatorios.

   **Lo que esta decisión NO cierra:** las mismas cuatro pendientes de la 32 y la 33 —17, 18, 19 y
   20—. Confirmar que a los 30 días no se borra nada y que el cierre de cuenta no se implementa es
   confirmar el placeholder del bloque legal, no el bloque legal.

35. **Las catorce lecturas del Hito 21, confirmadas** (15/09/2026). Al escribir el soporte de
   Cuotly, el centro de ayuda y la página de estado (PRD §34, migración 93), §131, §132, §133 y §157
   callaban en catorce sitios y en los catorce se eligió lo más defendible, se escribió como regla
   `RN-SOP` y se preguntó (pendiente 24). Bosco confirma las catorce tal cual, sin cambiar ninguna:
   Modo soporte no abre incidencias ni en nivel `owner` y el espacio ve todas las suyas; una
   sugerencia es una incidencia de tipo sugerencia, aparte y sin prioridad ni tiempo de atención; las
   categorías son los ocho temas de §133 más "otra"; el impacto tiene cuatro niveles; la tabla de
   transiciones es la de RN-SOP-04, nadie cierra sola y el motivo es obligatorio en "necesita
   información" y al cerrar sin resolver; un espacio sin plan tiene prioridad estándar; los festivos
   del horario humano son los de Cuotly, en una lista que nace vacía; atienden Bosco y los
   Administradores de Cuotly sin permiso fino; el espacio ve "Cuotly" y no quién contestó, con el
   lado visible; los adjuntos no van a `files`; las guías son contenido versionado por migración, sin
   editor, para cualquiera con sesión; a quien no puede abrir una incidencia se le dice con quién
   hablar; en la página de estado se miden notificaciones e integraciones, la aplicación porque
   responde, y autenticación y archivos no, y se dice; y ningún aviso de incidencias es obligatorio.
   Sigue sin haber ningún tiempo contractual de respuesta: §131 dice que no existe y no se inventa.

   **Lo que esta decisión NO cierra:** las mismas cuatro pendientes de la 32 a la 34 —17, 18, 19 y
   20—, ni la aplicación de la migración 93 al proyecto real, que es una orden aparte.

36. **Las diez lecturas del Hito 22: nueve confirmadas y una cambiada** (16/09/2026). Al escribir
   la app móvil y el push (PRD §35, migración 94), §21, §70, §144, §145 y §176 callaban en diez
   sitios; en los diez se eligió lo más defendible, se escribió como regla `RN-MOV` y se preguntó
   (pendiente 25). Bosco confirma nueve tal cual: las rutas de la app son las de la web; la barra
   sale de la misma función que la web; un dispositivo es de una persona y el token pasa a quien
   entra; la explicación del push va antes del diálogo del sistema y el push tiene su preferencia
   por evento con los obligatorios bloqueados; escanear es fotografiar con la cámara y los permisos
   se piden al usarlos; la biometría es un cerrojo local y el panel de Cuotly no está en la app; sin
   conexión no se encola ninguna acción crítica; la caché es de quien mira y se borra al cerrar
   sesión; y la clave de idempotencia nace con el borrador.

   **Y cambia la tercera.** Se había propuesto que el push dijera solo el evento y el espacio. Bosco
   decide que **el push tiene que dar más información**: el **restaurante**, el **espacio**, la
   **cifra** si la hay y **una frase de lo que se pide** —«Quiero cambiar el precio…»—. Queda así en
   RN-MOV-04: el título lleva el evento y el restaurante; el cuerpo, el espacio, la cifra o el umbral
   y la frase, resueltos por el servidor desde la entidad del aviso en el momento del envío
   (`notification_push_context()`, solo para la cola). Lo que no cambia: nunca el nombre de nadie
   del equipo, que no está en ninguna columna que el push lea.

   **Lo que esta decisión NO cierra:** las mismas cuatro pendientes de la 32 a la 35 —17, 18, 19 y
   20—, ni la aplicación de la migración 94 al proyecto real, ni la publicación en las tiendas.

37. **El orden de lo que viene después del Hito 22** (16/09/2026). Bosco fija ocho pasos, en este
   orden y con una pausa entre cada uno —se termina uno, se para, y solo entonces se empieza el
   siguiente—: (1) las cuatro pendientes de la Fase 4 (17 a 20); (2) el diseño definitivo de
   escritorio, si no queda ningún hito de la web, y si falta alguno se hace entonces; (3) el diseño
   definitivo móvil, que él entrega, y con él se termina la versión móvil; (4) la parte legal y
   fiscal; (5) desplegar todo en Vercel; (6) lo aplazado en CLAUDE.md; (7) poner la app en las
   tiendas; (8) desplegar todo en Vercel otra vez. Está copiado en el ROADMAP, en "Después del
   Hito 22".

38. **Las cuatro pendientes de la Fase 4, cerradas** (16/09/2026; paso 1 del orden de la decisión
   37). Se le pusieron delante a Bosco con su contexto y las decidió así, en sus palabras:
   *"17. Eso lo controlo yo tú tienes que estar pendiente de lo que hablamos del almacenamiento
   18. Vamos a dejar que si se pasen se presupuesta aparte 19. Las 2 cosas 20. Si esa revisión la
   haré cuando toque en el orden 1. Tal cual está 2. Todo el historial, archivos subidos y datos del
   restaurante yo creo que así está bien 3. Me parece bien 4. Si, ya instalaré un agente para
   preparar las facturas"*. Lo que eso fija, punto por punto:
   - **17 · "Uso razonable" en Agency (§4.3): sin umbral.** Lo controla Bosco a mano desde el
     panel, que ya enseña el uso de cada espacio (RN-ADM-04). No se mide ninguna actividad ni se
     bloquea nada, y no se inventa ningún número. Lo que sí hay que vigilar es el **almacenamiento**
     de §113: los avisos al **80 %** y al **100 %** de lo incluido en el plan (20 GB Pro, 100 GB
     Agency), al propietario del espacio y, al 100 %, también a Cuotly (RN-SUB-13, migración 95).
   - **18 · Precio del almacenamiento adicional: no hay.** Pasarse de lo incluido **se presupuesta
     aparte**: ni precio por GB, ni bloqueo, ni límite duro. El aviso del 100 % a Cuotly es el
     "hay un presupuesto que preparar". Sale de la lista de aplazados de CLAUDE.md.
   - **19 · Un "negocio" es el mismo NIF o el mismo dominio de correo** ("las 2 cosas"). El NIF se
     compara sin espacios, guiones ni mayúsculas; el dominio, del correo de la solicitud y del de la
     cuenta que la escribe, **salvo los dominios públicos** (Gmail, Hotmail, Outlook…, y los
     `example.*` reservados), que no identifican a nadie. `approve_space_request()` rechaza el
     choque en el servidor y el panel lo enseña antes (RN-PLA-09, migración 95).
   - **20 · Los cuatro puntos del bloque legal**: la revisión profesional la hará Bosco cuando
     toque en el orden (paso 4). Mientras tanto: (1) la eliminación a los 30 días **queda tal cual
     está** —fecha guardada y enseñada, nada se borra—; (2) lo que se conserva es **todo el
     historial, los archivos subidos y los datos del restaurante**, que es lo que ya se conserva;
     (3) el procedimiento ante un **incidente de seguridad** (§142) **le parece bien** como se
     propuso: Cuotly lo declara como evento de estado marcado como de seguridad, todos los
     propietarios afectados reciben un aviso **obligatorio** y la página pública lo marca; el texto
     lo fijará el profesional del bloque legal (RN-ADM-13, migración 95); (4) la **numeración
     fiscal** no se hace aquí: Bosco instalará un agente aparte para preparar las facturas, y Cuotly
     sigue emitiendo referencia bancaria y ninguna factura (RN-SUB-05).

39. **Los cuatro planes de mantenimiento de Restavor** (16/09/2026). Bosco entregó las cuatro
   fichas definitivas —Impulso, Impulso+, Premium y Premium+— y pidió que Cuotly las refleje tal
   cual, sustituyendo lo que las contradiga. Los números, en PRD §6.1: Impulso 299 € (6/6/1/0, 48 h,
   prioridad estándar), Impulso+ 399 € (16/12/3/0, 24 h, alta), Premium 499 € (10/12/2/0, 24 h,
   alta), Premium+ 599 € (25/24/5/1, 24 h, máxima con prioridad superior en la cola), todos + IVA.
   Premium incluye menos cambios pequeños que Impulso+ y es intencionado. Se le plantearon siete
   puntos y los cerró así:
   - **1 · Básico se mantiene y no se toca** (99 €, sin cambios incluidos). Las fichas no lo
     mencionan; RN-COM-01 y RN-COM-12 siguen apoyándose en él.
   - **2 · Los datos vivos se renombran, no se duplican.** El Impulso del Hito 2 (399 €, 16/12/3/0)
     es exactamente Impulso+, y el Premium (599 €, 25/24/5/1, con prioridad) es exactamente
     Premium+: la migración 96 renombra esas dos filas y crea Impulso y Premium nuevos. Las
     suscripciones existentes conservan sus condiciones sin cambio.
   - **3 · `grants_priority` lo concede solo Premium+.** De él siguen colgando las cuatro cosas de
     siempre: ordenar los cambios (migración 62), ir por delante en la cola (RN-COM-03), el precio
     de 199 € de Menú Diario (RN-COM-08, decisión 20) y las oportunidades avanzadas (RN-OPP-08).
     Impulso+ y Premium tienen las 24 h de inicio pero no la prioridad: sus fichas dicen "alta" y
     solo la de Premium+ dice "superior en la cola". Bosco subrayó como **muy importante** que el
     descuento de Menú Diario es exclusivo de Premium+.
   - **4 · Oportunidades: se mantiene el modelo básicas/avanzadas** (opción A). Impulso, Impulso+ y
     Premium ven las básicas aprobadas; Premium+ también las avanzadas. Las cantidades por ciclo
     de las fichas ("1 priorizada", "varias", "hasta 2", "detección avanzada") se recogen como
     descripción comercial y **no** se construyen topes por ciclo.
   - **5 · Analítica, informes, SEO y copias de seguridad**: descripción del plan en PRD §6.1 y en
     la maestra §5, sin construir restricciones nuevas por plan.
   - **6 · Las condiciones del plan (RN-DAT-07) las publica Bosco desde la pantalla**, no la
     migración: publicar dispara el aviso de condiciones nuevas a los restaurantes con suscripción
     activa (migración 76).
   - **7 · Se actualiza todo**: CLAUDE.md, PRD, la maestra (§5, §6, §33.1, §45, §101 y §172), la
     guía del centro de ayuda (versión 2), las semillas, los textos de pantalla y los tests.
   Consecuencias: migración 96 (`create_restavor_space()` con cinco planes,
   `upgrade_restavor_plan_catalogue()` para los espacios que ya existen), suite
   `planes_de_restavor.sql`, y RN-COM-02, RN-COM-03, RN-COM-08, RN-SLA-02 y RN-OPP-08 reescritas
   en el PRD. Sale de "Decisiones que NO deben reaparecer" en CLAUDE.md la lista de tres planes y
   entra la de cinco.

40. **Las facturas las emitirá Cuotly, porque el agente vivirá dentro** (16/09/2026). Al revisar el
   diseño definitivo apareció una contradicción: la vista R27 enseña una factura emitida por Cuotly
   con número `FAC-2026-010` y los datos fiscales de las dos partes, y RN-FIN-09 dice que Cuotly
   **no** emite facturas. Preguntado, Bosco aclaró: *"en este diseño sale que las facturas las emite
   Cuotly y todo eso porque tengo pensado instalar el agente dentro de Cuotly"*. O sea que no es un
   error del diseño ni un cambio de la regla: es el **estado final**. El agente que prepara las
   facturas, que la decisión 38 dejaba "aparte", va **dentro** del producto.
   Lo que eso fija, y lo que no:
   - **Sí**: las pantallas de facturas del diseño (R25, R26, R27, M42, M52 y la pestaña de impuestos
     M58) se construyen con su sitio hecho, porque van a usarse.
   - **No todavía**: la **numeración fiscal** sigue en el bloque legal, que es el paso 4 del orden
     acordado y necesita la revisión profesional que CLAUDE.md exige. Hasta que llegue, ninguna
     pantalla inventa un número de factura ni una serie: donde no haya factura se dice el motivo
     (CLAUDE.md prohíbe el dato de relleno), y lo que Cuotly emite sigue siendo el **cobro con
     referencia bancaria** de RN-SUB-05.
   - **Orden**: primero el paso 2 (el diseño de escritorio, con el hueco preparado), después el
     paso 4 (legal y fiscal, con el profesional), y con él el agente dentro.

41. **Cómo se entra en Cuotly: se acabó el registro abierto** (16/09/2026). Al escribir el PRD de
   la solicitud de acceso (§37) salieron dos preguntas, y Bosco las cerró así:
   - **Quién revisa**: el permiso **"Aprobar espacios"** de §167, el mismo que decide sobre las
     solicitudes de creación de espacio. *"Me parece bien lo de aprobar espacios y solo lo llevo yo
     con el correo info@restavor.com"*: hoy nadie más lo tiene, y el permiso existe por si algún día
     lo delega.
   - **Cómo se entra**: *"el que solicita acceso se registra y cuando se va a registrar le sale un
     espacio para el correo y el resto de datos. Si info@restavor.com lo acepta le llega al correo
     que puso su cuenta creada"*. Es decir, **el formulario de solicitud ocupa el lugar del
     registro**: quien va a registrarse encuentra la solicitud, y la cuenta **se crea al aprobarla**,
     no antes.
   - **La contraseña no viaja por correo.** Bosco propuso enviarla junto con el aviso de cuenta
     creada; se le explicó que un correo se queda guardado en el buzón y pasa por servidores por el
     camino, y aceptó la alternativa: **un enlace de un solo uso y con caducidad** donde la persona
     pone su contraseña al entrar. Misma sencillez para quien lo recibe y sin contraseña escrita en
     ningún buzón.
   - **La invitación también crea cuenta**: *"si invito, directamente le doy acceso a crearse una
     cuenta, ese enlace que le envío ya es para que se cree una cuenta"*. Quedan **dos puertas y
     ninguna más**: una solicitud que aprueba Bosco, o una invitación de un propietario, que ya es
     la autorización. Matiz añadido al escribirlo: el **correo viene prefijado y no se puede
     cambiar** en esa pantalla, porque `accept_space_invitation()` exige desde la migración 7 que
     coincida con el de la invitación; dejarlo escribir a mano solo produce un rechazo que nadie
     entiende. Se ponen contraseña y repetición, y nada más.
   - **Se retira "entrar con Google"**: *"vamos a quitar lo de entrar con Google directamente, mejor
     que cada uno rellene correo y contraseña así no hay líos"*. Una sola forma de entrar.

42. **Se entra siempre al Inicio global** (16/09/2026). Al construir el contexto global (§36) salió
   una incompatibilidad con algo escrito desde la Fase 1: §20.1 dice *"con un solo contexto
   accesible se entra directamente"*, y §36 dice que el diseño *"convierte la raíz en un lugar donde
   se trabaja"*. Las dos a la vez no caben: quien tiene un solo espacio —que es casi todo el
   mundo— no vería nunca el Inicio global, y ahí es donde están sus mensajes de todas partes, sus
   solicitudes, su cuenta y la ayuda.
   Se construyó **sin tocar la raíz** y se preguntó. Bosco: *"mi decisión es que siempre se entre al
   inicio global"*. Se aplica tal cual, y lo que eso implica:
   - **La raíz ES el Inicio global.** Entrar lleva siempre ahí, tengas un contexto o diez. Se retira
     la redirección automática de `app/page.tsx`, y con ella la pantalla de selector de contexto:
     el selector de HU-02 **no desaparece**, es la parte de abajo del Inicio (RN-GLO-03).
   - **Lo que traía la portada anterior sigue**: la entrada a Administración de Cuotly con su aviso
     de 2FA (§8, RN-ADM-01) y la tarjeta de crear el espacio de Restavor para el Propietario de
     Cuotly. Cambia dónde se lee, no qué se lee.
   - **§20.1 queda reescrito**, no interpretado: la frase de la entrada directa ya no vale para la
     raíz. Se mantiene "Existe una acción persistente «Cambiar de espacio»", que sigue siendo cierta.
   - **Los recorridos de Playwright cambian con ello.** Quince pruebas daban por hecha la
     redirección; ahora entran al Inicio y van a lo suyo desde ahí, que es lo que hará una persona.
     Y hay una prueba nueva que se pone roja si alguien devuelve la redirección: el fallo que esta
     decisión evita es precisamente que vuelva sin que nadie lo note.
   - Coste asumido a sabiendas: un clic más cada mañana para quien tiene un solo contexto. Se
     preguntó con esa recomendación en contra y Bosco decidió lo contrario, que es su decisión.

43. **Las cuatro que faltaban de las piezas sueltas** (17/09/2026). Al triar las catorce piezas del
   diseño (`docs/diseno/LAS-CATORCE-PIEZAS.md`) cinco no tenían reglas en ninguna parte. Bosco
   contestó cuatro; la quinta —los alérgenos— sigue abierta y se explica abajo.
   - **Transferir un restaurante a otro espacio: el historial VIAJA con él.** El espacio de destino
     hereda solicitudes, trabajos, cobros, conversaciones y auditoría. Se preguntó con la
     consecuencia escrita delante —*"el equipo nuevo pasaría a ver trabajos, presupuestos y
     conversaciones internas de un equipo que no es el suyo"*— y se eligió así de todas formas. Se
     construye tal cual, y se deja constancia: **la transferencia es un acto con nombre y auditoría
     propia**, no un cambio de columna, precisamente porque mueve la organización interna de un
     equipo a otro. Lo que P7 protege sigue protegido hacia el **cliente**; entre equipos, manda
     esta decisión.
   - **Copias de seguridad: lo que hay dentro de Cuotly.** Menús, archivos, solicitudes y datos del
     restaurante que Cuotly guarda, descargable. **No** la web, que Cuotly no aloja y que habría
     significado conectarse a donde esté alojada.
   - **Canales internos: del espacio, con miembros elegidos a mano.** El propietario o un
     administrador crea el canal y elige quién entra. Los cuatro nombres de la maqueta —General,
     Proyectos web, Menú diario, Redes sociales— son los que vienen **de fábrica**, no una lista
     cerrada.
   - **Recordatorios de cobro: vencimiento, +24 h y +72 h.** Los tres avisos de la maqueta salen de
     fechas que ya existen: la de `charges.due_at` y los dos umbrales de RN-FIN-10 y RN-FIN-11. **No
     se inventa ningún plazo nuevo**; lo único que se añade es el aviso del día del vencimiento,
     que hoy no existe.

   **Sigue abierta: los alérgenos del editor de menú (R14).** No aparece en el PRD ni en la maestra,
   y es la única de las catorce que toca materia legal —la información de alérgenos de una carta es
   una obligación del restaurante—. Encaja con el **paso 4** del orden acordado, el bloque legal que
   CLAUDE.md manda que revise un profesional. No se construye hasta que Bosco diga si es texto libre
   por plato o la lista de los catorce alérgenos de la normativa europea con casillas.

44. **Los cuatro flecos que la decisión 43 dejó sin contestar** (17/09/2026). La 43 decidió el
   *qué* de cuatro piezas y dejó dentro cuatro preguntas de *cómo* que seguían sin respuesta y que
   CLAUDE.md prohíbe inventar. Se preguntaron con la recomendación escrita delante y Bosco eligió
   las cuatro recomendadas.
   - **La transferencia la ACEPTA el espacio de destino.** El propietario del origen la propone y el
     del destino la acepta; hasta entonces no se mueve nada. Dos firmas, como la solicitud de
     acceso. El motivo es el que la decisión 43 dejó escrito: si el historial viaja, el destino
     recibe trabajos y conversaciones internas de otro equipo, y eso no se le puede meter en casa
     sin que diga que sí. Mientras la propuesta está abierta, el restaurante **sigue entero en el
     origen**: no hay un limbo en el que no sea de nadie.
   - **Los cobros y la permanencia se quedan en el origen, y con deuda vencida no se transfiere.**
     La deuda es de quien la emitió, que es lo mismo que RN-FIN-14 ya dice de la baja. El destino
     empieza a facturar desde cero, con su plan y su permanencia nuevos. Y si hay deuda vencida, la
     transferencia se para: mover a un moroso a otro espacio sería una manera de borrar la deuda
     cambiando de sitio, y ya existe la guarda de RN-FIN-13 que dice que de una parada por impago se
     sale cobrando.
   - **Copias de seguridad: una al día, se guardan 30.** Un mes de vuelta atrás con resolución de
     un día. Es lo que espera quien mira el historial de respaldos de la maqueta, y lo que Cuotly
     guarda de un restaurante —menús, solicitudes, archivos, datos— no pesa lo bastante como para
     que treinta copias sean un problema. La número 31 desaparece: **es el único borrado físico que
     el producto admite**, y se admite porque una copia no es un registro de negocio, es una foto
     de él.
   - **"Restaurar" es descargar, y lo aplica el equipo a mano.** Cuotly no deshace nada. No es
     pereza: reponer los datos de hace tres días machacaría apuntes de auditoría, consumos y cobros
     posteriores, y el producto entero está construido sobre libros que no se reescriben. Una
     restauración automática sería la única operación de Cuotly capaz de romper esa promesa. La
     pantalla lo dice con esas palabras en vez de ofrecer un botón que promete más de lo que hace.

45. **Los alérgenos del editor de menú** (17/09/2026). La última de las catorce piezas, y la única
   que toca materia legal. Se decidió con el coste de cada respuesta escrito delante.
   - **Se declaran plato a plato**, que es lo que pide el Reglamento UE 1169/2011: la información
     va referida a cada plato, no al menú. Se eligió sabiendo el precio: hasta ahora un plato era
     una línea de texto suelta dentro de una lista de textos, y esto le da estructura. Toca el
     editor, la comparación de versiones y la manera de guardar una versión.
   - **Los catorce del reglamento, con casillas, más una nota libre por plato.** Las casillas son
     una lista cerrada: se pueden pintar con icono, buscar y contar. La nota existe para lo que las
     casillas no saben decir —"puede contener trazas", "consultar al personal"—, que es información
     real y que sin ella acabaría metida dentro del nombre del plato.
   - **No bloquea la publicación.** Se avisa de los platos sin declarar y el menú publicado dice
     cuáles no la llevan, pero el menú sale. El motivo, dicho al preguntarlo: quien responde de esa
     información es el restaurante, y pararle el menú del día por una casilla sin marcar es un daño
     cierto por un riesgo que Cuotly no está en condiciones de juzgar.

   **Lo que sigue siendo del paso 4:** el **aviso legal** que acompaña a la declaración. Lo que la
   pantalla dice hoy —de quién es la información y que Cuotly no la comprueba— es un hecho sobre
   cómo funciona el producto, no un texto legal; el texto legal lo escribe el profesional que
   CLAUDE.md exige, y hasta entonces no se redacta ninguno.

46. **El panel del restaurante como contexto propio** (17/09/2026). Lo último que quedaba del paso 2.
   El diseño dice que "el panel del restaurante **se presenta** como un contexto propio ('Panel de
   restaurante'), con su selector de restaurante y un 'Volver al inicio de Cuotly'"
   (`docs/diseno/MAPA-DEL-DISENO.md`), y esa frase se puede leer de dos maneras: como armazón o
   como dirección. Se preguntó con el coste de cada una delante.
   - **Cambia el armazón, no la dirección.** El panel sigue viviendo en
     `/espacios/<espacio>/restaurantes/<id>/…`. Lo que cambia es lo que se ve: cabecera "Panel de
     restaurante", selector de restaurante, "Volver al inicio de Cuotly" y su propia barra lateral
     en vez de la del espacio.

     El motivo no es solo el coste —mudarla obligaba a una migración que reescribiera los **51**
     enlaces profundos construidos en SQL, a una redirección permanente para que los avisos ya
     guardados siguieran llevando a alguna parte, y a tocar 40 sitios de TypeScript—, sino que
     conserva algo que el código ya defendía y que no se quiso perder: **un restaurante es un
     restaurante, y su enlace debería ser el mismo lo mire quien lo mire.** Hoy la misma dirección
     sirve a los dos lados y lo que cambia es qué se enseña, decidido por la membresía real del
     espacio y no por un parámetro.

     La objeción a favor de mudarla, que es real y queda escrita por si algún día pesa más: el
     cliente **no es miembro** del espacio y lleva su identificador en la dirección sin necesidad
     —`establishment_id` basta para saber de qué espacio es—. Si alguna vez se muda, esto ya está
     pensado y lo que falta es la migración de los enlaces y la redirección.
   - **El selector lista todos los restaurantes de esa persona**, estén en el espacio de
     mantenimiento que estén. Sale de `my_contexts()` (migración 98), que ya decide eso con la RLS
     de siempre y no estrena ninguna capacidad (RN-GLO-01). Cambiar a un restaurante de otro
     espacio cambia también el espacio de la dirección, que es exactamente lo que tiene que pasar.
     Lo contrario —listar solo los de este espacio— obligaría a una cadena con restaurantes en dos
     espacios a salir al Inicio global para cambiar de local, que es dar un rodeo por una frontera
     que al cliente no le importa.

   **Lo que esta decisión NO cambia:** las cinco pestañas de la ficha del restaurante (§15.2), que
   el ROADMAP daba por pendientes y llevaban hechas desde el Hito 7 —`SHEET_TABS`, `Sheet.tsx` y
   una docena de tests por bloque—. La entrada del ROADMAP estaba desactualizada y se corrige.

47. **Las tres del diseño móvil** (19/09/2026). Al leer entero `Cuotly_movil.pdf` (157 páginas,
   `docs/diseno/MAPA-DEL-DISENO-MOVIL.md`) salieron siete diferencias con lo decidido. Tres se
   resolvieron al empezar; las otras cuatro siguen abiertas.

   - **Los alérgenos vuelven a ser una nota de texto libre por menú.** El diseño los pone así
     (página 125, campo de 200 caracteres: *"Contiene gluten, lácteos y frutos secos"*), y manda el
     diseño sobre la **decisión 45**, que era de dos días antes y los había puesto plato a plato
     con los catorce del Reglamento UE 1169/2011.

     **Queda escrito lo que esto cuesta, porque se preguntó con el coste delante y la respuesta
     fue esta:** se deshace §39 entero —nueve reglas RN-ALE—, el editor de casillas por plato, la
     comparación de declaraciones y la distinción entre "sin declarar" y "sin alérgenos", que era
     justamente lo que separaba un plato del que nadie ha dicho nada de uno del que se ha dicho que
     no lleva ninguno. La migración 101 **no se edita** (CLAUDE.md): una migración nueva deja su
     columna sin uso y añade la nota. La suite 52 se reescribe.

     Lo que **no** cambia es de quién es la información: la escribe el restaurante, Cuotly no la
     comprueba, y el aviso legal que la acompañe sigue siendo del paso 4.

   - **Un plato sigue siendo una línea de texto**, porque es como se ve en la plantilla que se
     publica. Las tres previsualizaciones del diseño (páginas 125, 126 y 127) enseñan los platos
     como líneas de texto bajo PRIMEROS/SEGUNDOS/POSTRES y **un solo precio fijo** al pie
     ("16,50 € · Incluye pan · Bebida no incluida"). Las fotos y los precios por plato de las
     páginas 129 y 131 son de una **carta**, no del menú del día, y no cambian este modelo. Se
     evita así una migración grande de `menu_versions` y dar identidad propia a cada plato.

   - **La barra inferior de móvil pasa a ser la misma para todos los roles**: Inicio ·
     Restaurantes · **Crear (+)** · Mensajes · Más, con el botón central elevado. Es lo único
     verdaderamente nuevo de móvil en las 157 páginas, y **contradice §20.3**, que fijaba cinco
     destinos distintos por rol. Se reescribe §20.3 con su motivo.

     El "Crear" central **no es un destino**: es la acción de §20.5, cuyas opciones dependen del rol
     y del contexto, y que el servidor vuelve a comprobar al ejecutar (CLAUDE.md: ocultar un botón
     no es un control de acceso).

   **Lo que sigue abierto** y no se construye hasta decidirlo (apartado 5 del mapa): crear el panel
   del restaurante como acto explícito, los permisos finos del cliente, la foto de perfil, el estado
   "Configurando", "Cuotly Insights", el almacenamiento por restaurante, la frecuencia de aviso, la
   prioridad con motivo, los seis canales de fábrica y qué subpestañas tiene Gestión —el diseño se
   contradice a sí mismo entre sus páginas 27 y 58—.

48. **Dos del diseño móvil, y un roce que queda abierto** (19/09/2026). De las tres preguntas que
   dejó la propuesta (`docs/PROPUESTA-DISENO-MOVIL.md`), Bosco contestó dos.

   - **"Cuotly Insights" es el resumen.** No es una fuente de datos nueva: es el nombre que el
     diseño le da al resumen que Cuotly ya calcula a partir de GA4, Search Console, Clarity y
     PageSpeed (páginas 41 y 44). No hay recogida propia, ni retención, ni aviso legal nuevo. Se
     construye como una etiqueta sobre lo que existe.

   - **La prioridad del plan es el tiempo de respuesta**, y quien más tiene es **Premium+**.

     **Lo que esto NO resuelve todavía, dicho aquí para que no se pierda:**

     1. **Premium+ no responde hoy más rápido que Impulso+ y Premium**: los tres arrancan a 24 h
        laborables (`plans.start_sla_hours`, RN-SLA-02, fichas de Restavor del 16/09 — decisión
        39). Si "el menor tiempo de respuesta" significa *más corto que los demás*, falta el
        número y **no se inventa** (CLAUDE.md). Si significa *el más corto de los que hay*, ya se
        cumple y no hay nada que cambiar.
     2. **RN-COM-03 dice que el cliente NUNCA ve esa prioridad**, y las fichas de plan del diseño
        (páginas 96 y 97) la enseñan como atributo comercial: "Prioridad: Alta / Superior". O la
        prioridad del plan pasa a ser visible y RN-COM-03 se reescribe con su motivo, o la ficha
        de plan no la pinta. **No se resuelve por cuenta propia.**

     Mientras tanto, el punto 10 de la propuesta —los atributos de plan— **sigue sin construirse**,
     igual que "Informes: Estándar / Avanzado", que nadie ha definido.

   **Los dos canales que faltaban salen del propio diseño** (contestado el 19/09/2026): la página
   74 enumera seis y los dos que no estaban son **Diseño y creatividad** y **Soporte interno**. No
   hizo falta proponer ninguno: se leyó la página. RN-CAN-03 pasa de cuatro a seis (migración 104).

   **El orden de construcción queda confirmado** tal como lo propone `PROPUESTA-DISENO-MOVIL.md`:
   Gestión → almacenamiento por restaurante → canales → crear panel → orden interno con motivo →
   horario de recepción → permisos finos del cliente → foto de perfil.

49. **La prioridad de la solicitud: manda el diseño, y se dice lo que cuesta** (19/09/2026). La
   página 63 del diseño definitivo móvil resultó **no ser** la pantalla del equipo, como se había
   anotado en el mapa, sino **"Nueva solicitud"**: la del cliente. Y trae dos campos con asterisco,
   "Prioridad" con el valor "Alta" y "Motivo de la prioridad".

   Eso contradice una decisión de Bosco del **10/09/2026**, razonada en la migración 62 y literal:
   *"los clientes premium son los únicos que pueden indicar la prioridad, y lo hacen organizando sus
   cambios por cuál es más importante: 5 cambios, pues ponerlos en orden del 1 más importante al 5
   menos importante"*. Ahí se argumenta expresamente que **no es una etiqueta Alta/Media/Baja**,
   porque una etiqueta no dice cuál va antes entre dos "Media".

   Se preguntó con las tres diferencias delante —nivel frente a orden, todos frente a solo el plan
   que la concede, al crear frente a reordenando lo pendiente— y Bosco decidió:

   - **Manda el diseño**: la prioridad es un **nivel** —**Alta · Media · Baja**— que elige el
     cliente **al crear** la solicitud, y lo elige **cualquier** restaurante, no solo el plan que
     concede prioridad.
   - **El motivo es obligatorio siempre**, en 200 caracteres, como dibuja la página.
   - **El orden 1..N de la migración 62 se queda vivo y aparte.** No se borra ni se marca sin uso:
     son dos datos distintos. Para que no se confundan, en pantalla se llaman distinto — "Prioridad"
     es el nivel, y al 1..N se le llama **"Orden de importancia"**, que ya era el título de su propia
     pantalla. Las dos etiquetas de la ficha del equipo que decían "Prioridad" refiriéndose al orden
     se renombraron.

   Los niveles **no se inventaron**: en el PDF solo se ve "Alta", se preguntó y Bosco eligió los
   tres. Escrito como RN-REQ-05 y RN-REQ-06; migración 106; suite 55.

   **Lo que esto cuesta, dicho porque se decidió sabiéndolo**: una solicitud ya no se puede enviar
   sin prioridad ni motivo, así que **diecisiete suites y el sembrado** tuvieron que empezar a
   ponerlos — y eso es la señal de que la regla muerde de verdad, no un efecto colateral.

50. **Ajustes del espacio: la pantalla la diseño yo, las reglas ya están** (19/09/2026). El punto 6
   del orden era el "horario de recepción", y al ir a construirlo **no se encontró la página**: la
   nota del mapa decía "página 109" y ahí está "Ajustes del espacio · General". Se miraron la 110,
   111, 112, 114, 116 y la 8 y la pantalla de preferencias de notificaciones no aparece en ninguna.
   Es la **tercera** nota del mapa que apunta mal —ya pasó con la 63 y con la 46—, porque se tomaron
   leyendo las 157 páginas de corrido y la numeración se desplazó.

   Se preguntó en vez de inventar, y Bosco contestó: **"la página diséñala tú basándote en las otras
   fotos que tienes del diseño, y cómo funciona esa página es igual que en ordenador: las normas y
   todo es lo que ya está definido"**.

   Leído así, lo que faltaba no eran reglas —`NotificationPreferencesForm` existe desde el Hito 8—
   sino **las ocho pestañas** que la página 109 sí dibuja: General · Horarios · Impuestos ·
   Integraciones · Suscripción · Seguridad · Auditoría · Notificaciones. Ajustes era una sola
   columna de casi quinientas líneas.

   - **Suscripción y Auditoría conservan su dirección.** Ya eran páginas propias y hay avisos
     emitidos que apuntan ahí (RN-NOT-04). Su "pestaña" es un enlace; las otras seis van en
     `?vista=`.
   - **El horario de recepción y el resumen diario siguen sin construirse**, y ahora con su motivo
     escrito en §18: piden una hora por defecto, una zona y una regla de qué se salta el silencio.

51. **Los permisos del cliente: dos roles, seis casillas cableadas y una parada** (19/09/2026).
   Punto 7 del orden. Las páginas **152 y 153** del diseño definitivo móvil dibujan "Usuarios y
   accesos" del panel del restaurante con **dos roles** —Propietario y Editor— y **siete permisos**
   con casilla sobre el Editor. Hasta hoy había **tres roles** (`local_owner`, `editor`, `consulta`)
   y **dos** permisos finos; todo lo demás salía del rol.

   **Lo que decidió Bosco**, preguntado antes de tocar nada:

   - **`consulta` "se convierte en Editor sin permisos"**. No se borra ninguna fila: cambia el rol y
     nacen las casillas apagadas, que es exactamente lo que un Consulta podía hacer (RN-EST-16).
   - **A los accesos del restaurante "los invito yo"**, el equipo de mantenimiento; dentro del panel
     manda el Propietario. Un Editor con `manage_users` gestiona a los demás Editores pero **no
     puede tocar al Propietario** (RN-EST-17). Sin ese último cerrojo, un Editor podía degradar a
     quien le dio acceso.

   **Lo que esto destapó.** Retirar `consulta` funcionó como sonda: **cinco funciones decidían por
   ROL y no por permiso** —editar un borrador, enviarlo, el orden 1..N, el recordatorio de Menú
   Diario y actuar sobre una oportunidad—. Todas pasan ahora por `client_permission()`, la puerta
   única: siete copias de la misma regla acaban diciendo siete cosas.

   **La séptima casilla está parada, y es lo importante de esta entrada.** El diseño llama al
   séptimo permiso "Consultar informes". Ese permiso **ya existió** —columna
   `establishment_permissions.view_reports` y su función, migración 85— y **Bosco lo quitó entero
   cinco días antes**, el 14/09/2026, en la **decisión 28c**: el informe lo ve cualquier persona del
   restaurante con el acceso vigente, sin distinguir rol. La primera versión de la migración 107 lo
   reinstauró sin darse cuenta; lo cazó `informes.sql`, que defiende la decisión 28c con una
   afirmación literal.

   No se resuelve por cuenta propia —CLAUDE.md lo prohíbe— así que **manda lo decidido**: la
   migración 107 cablea **seis** de los siete, `client_permission()` **no reconoce** el nombre
   `view_reports`, `client_can_view_reports()` **no se ha tocado** y **nadie deja de ver un informe
   que hoy ve**. La pregunta a Bosco queda abierta abajo. El día que elija, se añade en tres sitios
   a la vez: la lista de `client_permission()`, `client_can_view_reports()` y la tabla de RN-EST-15.

   Comprobado: suite 56 `los_siete_permisos_del_cliente.sql` —el CHECK rechaza `consulta`, el
   Propietario los tiene todos, un Editor nuevo ninguno, **cada casilla abre solo lo suyo** (el
   fallo que busca es el de copiar y pegar la puerta equivocada), los permisos del Propietario no se
   pueden guardar, un Editor con `manage_users` no revoca ni asciende al Propietario y el equipo
   sí— y las 56 suites en verde.

52. **"Consultar informes" vuelve a ser un permiso: manda el diseño** (19/09/2026). Bosco: **"La
   a"**. Cierra la pregunta 26 y completa el punto 7 del orden.

   **La contradicción.** El diseño definitivo móvil, página 153, dibuja "Consultar informes" entre
   los permisos del Editor. La **decisión 28c**, del propio Bosco cinco días antes (14/09/2026),
   decía lo contrario: ese permiso existió —columna `establishment_permissions.view_reports` y su
   función, migración 85—, lo quitó entero, y el informe pasó a verlo **cualquier persona del
   restaurante con el acceso vigente**. No cabían las dos.

   **Cómo se encontró**, que es lo que merece la pena recordar: la primera versión de la migración
   107 reinstauró el permiso **sin que nadie se diera cuenta**, simplemente porque el diseño lo
   dibujaba. Lo tumbó `informes.sql`, que defiende la decisión 28c con una afirmación literal. Sin
   ese bloque, una decisión de Bosco se habría deshecho sola y en silencio.

   **Lo que decide Bosco:** la (a), el diseño. El permiso vuelve (migración 108) y es el séptimo de
   RN-EST-15.

   **La consecuencia, que se le puso por escrito antes de preguntarle:** a partir de ahora **un
   Editor nuevo nace sin ver informes** hasta que su Propietario le encienda la casilla. Eso es
   exactamente lo que la 28c quitaba, y es lo que se acepta al elegir el diseño.

   **Lo que NO pasa:** nadie perdió un informe que ya veía. La migración 108 enciende la casilla a
   **todos** los Editores con acceso vivo, incluidos los que la 107 convirtió desde `consulta` —que
   también los veían—. A quien tiene el acceso **retirado** no se le enciende: no los ve hoy
   (RN-EST-05) y encendérsela sería devolverle algo por la puerta de atrás.

   **Alcance de la enmienda:** la 28c queda enmendada **en ese punto y solo en ese**. A quién LLEGA
   el informe (28d), la aprobación (28a), los avisos de §95 (28b) y que el informe se guarda como
   PDF (28e) siguen exactamente igual. La rama de grupo de `client_can_view_reports()` tampoco
   cambia: el propietario global ve el informe de cada establecimiento suyo (§14.1) y el consolidado
   no (decisión 30).

   Comprobado: el bloque de RN-REP-01 de `informes.sql` **dado la vuelta** —un Editor sin la casilla
   no ve los informes, uno con ella sí—, y en la suite 56 un bloque nuevo que prueba la casilla
   entera: que abre los informes y que **no** abre los menús ni la facturación.

53. **La foto de perfil: bucket propio, y la ve quien ya te ve** (19/09/2026). Punto 8 y último del
   orden. La página 7 del diseño ("Mi cuenta") dibuja un botón "Cambiar foto"; hasta hoy la pantalla
   decía por qué no estaba, en vez de dejar un hueco.

   **Por qué faltaba.** `files.space_id` es `NOT NULL` y una cara no es de ningún espacio: la misma
   persona puede estar en dos espacios y en el panel de un restaurante. Se resuelve con sitio propio
   —bucket `avatars`, privado como el de archivos (RN-ARC-08)— y `profiles.avatar_path`.

   **La parte que había que pensar no era dónde se guarda, sino quién la ve.** Una foto **es
   identidad**, y CLAUDE.md prohíbe que el cliente vea la identidad individual de nadie del equipo de
   mantenimiento. La respuesta fue **no escribir ninguna regla nueva**: `avatar_path` es una columna
   de `profiles`, y `profiles_select` ya dice exactamente lo que hace falta —tu fila, o la de alguien
   con quien compartes `space_memberships`—. Un cliente no está en esa tabla, así que no lee la fila
   de nadie del equipo, foto incluida. Una regla nueva habría sido una segunda copia de la política,
   y el día que discreparan ganaría la copia peor.

   Eso decide también algo que **no** se hizo: la foto no se añade a `establishment_client_users()`
   ni a `establishment_panel_users()`. Son `SECURITY DEFINER` y se saltan `profiles_select` a
   propósito —para que el equipo vea el nombre de un cliente—, así que meter la foto ahí habría
   abierto por esa puerta justo lo que la política cierra. Encaja con el diseño: las listas del panel
   (páginas 152 y 153) dibujan **iniciales**; donde sí hay caras es en pantallas del equipo (página
   22), y ahí las dos personas comparten espacio.

   **La otra comprobación que importa es la del prefijo.** `set_my_avatar()` escribe la fila de quien
   llama, pero eso no basta: hay que rechazar una **ruta** ajena, o la fila propia acabaría apuntando
   a la foto de otra persona. Se exige que la ruta empiece por el uuid de quien llama **y una barra**
   —sin la barra, un uuid sería prefijo de cualquier ruta que empezara por esas letras—.

   **Lo que NO entra**, para que no se confunda: la **foto del restaurante** que el diseño enseña en
   las listas (página 22) es otra cosa, esa sí es del espacio y cabe en `files`. Y el **límite de 2 MB
   y los tres formatos son técnicos**, no un umbral que Bosco haya fijado: se presentan como lo que
   son.

   De paso, una nota del mapa del diseño que volvía a apuntar mal —la **cuarta**—: decía que la
   página 3 enseñaba avatares de persona y lo que hay ahí es el estado de una solicitud de espacio.
   Las caras están en la 22.

   Comprobado: suite 57 `la_foto_de_perfil.sql` —el bucket es privado y solo admite imágenes, cada
   quien cambia la suya, una ruta ajena y una sin la barra se rechazan, el cliente **no alcanza ni un
   perfil del equipo**, el equipo sí ve la foto de su compañero, y quitar la foto no borra a nadie—,
   con dos mutaciones probadas: quitar la comprobación del prefijo y poner el bucket en público hacen
   fallar la suite nombrando la regla.

54. **"Cuotly Insights" construido: es el resumen, y la pantalla lo dice** (19/09/2026). No es una
   decisión nueva —Bosco ya la tomó el 19/09 como parte de la **48**—, sino la parte que faltaba por
   construir de aquella, y se anota porque **lo que se hizo no es copiar el diseño literal**.

   Las páginas 41 y 44 pintan "Cuotly Insights" como una tarjeta más entre Google Analytics 4 y
   Search Console, siempre en **"Activa"** y con el pie "Datos internos del sitio". Copiado tal cual
   sería (a) prometer una fuente de datos propia que no existe —no hay recogida, ni retención, ni
   aviso legal— y (b) afirmar que hay un resumen cuando puede no haber ni un dato detrás.

   Lo construido (RN-INT-09): aparece **donde el diseño lo pone**, entre las fuentes, y la columna
   Información dice lo que es —"no es una conexión: es la lectura propia de Cuotly sobre las fuentes
   que tengas conectadas"—. Su estado **se deriva** (RN-DAT-05): activo si alguna fuente ha traído
   datos alguna vez, "sin nada que resumir" si ninguna. Y su fecha es la **del dato más reciente que
   resume**, porque no sincroniza nada y una fecha propia sería inventada.

   No hizo falta ninguna migración: la sección `summary` existe desde el Hito 14 y esto es ponerle
   el nombre que el diseño le da.

   Comprobado: `cuotly-insights.test.tsx` —aparece con datos y sin ellos, el estado cambia con
   ellos, dice que no es una conexión en los dos casos, y la fecha es la más reciente de **las
   fuentes de esa sección**, no de todas: el resumen de Búsqueda no puede fecharse con lo que trajo
   Clarity.

55. **El plan manda tres cosas distintas, y hasta hoy eran un solo booleano** (19/09/2026). Bosco
   cierra los dos cabos que la decisión 48 había dejado abiertos sobre la prioridad del plan. Sus
   dos respuestas, literales:

   - *"Todos tienen de máximo 24 h, pero el Premium+ siempre recibirá respuesta frente al resto de
     planes. Ej: hay una solicitud de Premium+ y de Premium, pues se contestaría primero la de
     Premium+."*
   - *"Solo pueden organizar por prioridad sus solicitudes los de Premium y Premium+."*

   **La primera cierra el plazo sin inventar nada.** "El menor tiempo de respuesta" no era un plazo
   más corto: era el **turno** dentro del mismo plazo. `start_sla_hours` se queda como está —48 h en
   Básico e Impulso, 24 h en Impulso+, Premium y Premium+— y no hay ningún número que fijar.

   **Lo que las dos juntas destaparon.** Con un solo booleano no se pueden decir a la vez: darle
   `grants_priority` a Premium para que ordene le quitaría a Premium+ la manera de ir delante. Y al
   ir a hacerlo apareció algo peor: **`plans.grants_priority` estaba sobrecargado y decidía CUATRO
   cosas**, dos de ellas fijadas por Bosco el 16/09/2026 en la decisión 39 y enumeradas en
   CLAUDE.md:

   1. Ordenar las solicitudes propias (migración 62).
   2. El turno interno de la cola.
   3. **Menú Diario a 199 € en vez de 229 €** (RN-COM-08).
   4. **Las oportunidades avanzadas** (RN-OPP).

   Poner ese booleano a `true` en Premium le habría dado **también la 3 y la 4, en silencio**:
   Premium habría empezado a pagar el Menú Diario más barato y a ver oportunidades que no le
   corresponden, deshaciendo dos decisiones suyas sin que nadie lo pidiera. Es exactamente la clase
   de cosa que CLAUDE.md pone en "decisiones que NO deben reaparecer".

   **Lo construido** (migración 110, RN-COM-03 reescrita): `grants_priority` **no se toca** y sigue
   siendo solo de Premium+ para el precio y las oportunidades. A su lado, dos columnas con nombre
   propio: `queue_rank` (el turno: Premium+ 2, Premium 1, el resto 0) y `can_order_requests` (ordenar
   lo propio: Premium y Premium+). `client_can_set_priority()` deja de leer el booleano y lee la
   columna que le toca.

   **Un espacio nuevo también nace bien.** Los planes no los crea ninguna migración sino
   `create_restavor_space()`, así que rellenar los existentes no bastaba: sin tocar esa función,
   cada espacio nuevo habría nacido con Premium sin poder ordenar y todo el catálogo empatado a
   turno 0. Se vio al ejecutar las suites sobre una base limpia, donde no hay ni un plan.

   **Sobre la ficha de plan del diseño** (páginas 96-97, "Prioridad: Alta / Superior"): la lectura
   aplicada es que esa línea es **`can_order_requests`** —una capacidad que el restaurante compra, y
   por eso visible—, y que lo que RN-COM-03 sigue sin enseñarle es el **turno** frente a otros
   restaurantes. Con eso las dos cosas caben. Es una lectura, no una respuesta literal: si no es lo
   que querías decir, se cambia.

   **Lo que sigue sin definirse:** "Informes: Estándar / Avanzado". Bosco dio la dirección —"más
   completo, con más información y más oportunidades; cuanto mejor sea el plan, más profundidad"—
   pero no el reparto concreto, y sin saber qué secciones lleva cada plan no se construye (CLAUDE.md).

   Comprobado: suite 58 `el_plan_manda_tres_cosas.sql` —dos planes que son el caso entero, uno alto
   y otro que **ordena sin ser el alto**, con el mismo plazo, el turno correcto y `grants_priority`
   intacto— y el bloque ampliado de `planes_de_restavor.sql`, que guarda los números de Restavor.
   Mutación probada: darle a Premium el booleano del plan alto hace fallar `planes_de_restavor.sql`
   nombrando el plan.

56. **Los cinco niveles de informe** (20/09/2026). Cierra el último cabo de la decisión 48, y lo
   cierra **corrigiendo el planteamiento**: no son dos niveles, son cinco.

   Bosco, literal: *"Básico tiene un informe básico, Impulso tiene un informe estándar, Impulso+ un
   estándar+, Premium un avanzado y Premium+ un informe completo en el que está detallado todo"*. Y
   además: las dos cosas a la vez —más informes y más profundidad—, la comparación con el periodo
   anterior **en todas las cifras**, y el informe tiene que ser **"un resumen de todo lo que ha
   pasado en el mes"**.

   **Dónde estaba escrito el modelo de datos, que era lo que faltaba.** La página **97** del diseño
   ("Versiones de plan") enseña "Informes" en la comparativa de versiones, junto a "Prioridad" y a
   los cambios incluidos, y una línea del resumen de cambios dice *"Se mejora el nivel de informes a
   Avanzado"*. Es decir: es un **atributo del plan y se versiona con él**. Eso lo convierte en una
   columna, `plans.report_level`, y **no** en una regla por nombre de plan: Cuotly es multiempresa.

   (De paso, la **quinta** imprecisión del mapa del diseño: los atributos de plan están en la 97, no
   en la 96, que es "Servicios adicionales".)

   **Lo que se construyó** (migración 111, RN-REP-15/16):

   - La columna con sus cinco valores y el reparto de Restavor, más las dos funciones que crean el
     catálogo de un espacio —porque los planes **no los crea ninguna migración** y sin eso cada
     espacio nuevo nacería con Premium+ dando el informe más corto. **Es el mismo tropiezo que la
     110 tuvo ayer**, y por eso la migración lo deja escrito: una columna nueva en `plans` se toca en
     **tres** sitios o el espacio siguiente nace mal.
   - **El nivel es una BARRERA, no una sugerencia**: una sección que el nivel no permite no entra al
     preparar el borrador **ni marcándola a mano después**. Sin la segunda mitad, el nivel sería
     decorativo y un Básico recibiría lo que no paga en cuanto alguien se despistara.
   - **RN-REP-16 · un informe con Finanzas solo lo ve quien tenga "Pagos y facturas"**, y no lo ve
     recortado: no lo ve. Bosco: *"no verá ese informe a no ser que le den permiso"*. Recortar el PDF
     según quién lo abra convertiría un informe en dos documentos, y el informe es **uno** (RN-REP-12).

   **Por qué Básico es tan corto**, que parece un descuido y no lo es: Básico no incluye ningún
   cambio (RN-COM-01), así que su mes tiene poco que contar. Un informe largo lleno de "no
   conectado" (§178) sería peor que uno corto que dice lo que hay.

   Comprobado: suite 59 `los_cinco_niveles_de_informe.sql` —los cinco escalones uno a uno, que
   ninguno quita lo del anterior, que un nivel o una sección inventados no abren nada, el reparto de
   Restavor, y las dos mitades de RN-REP-16— con **dos mutaciones**: hacer que el nivel lo admita
   todo, y quitarle a la política la condición de la facturación, hacen fallar la suite nombrando la
   regla.

   **Lo que queda de los informes**, y es lo más grande: la comparación con el periodo anterior, el
   PDF de la maqueta y la sección **"Lo que ha pasado este mes"**. Están en
   `docs/PROPUESTA-INFORMES.md` con su coste. *Las tres se construyeron el mismo día, como decisión
   57.*

57. **Las tres piezas que le faltaban al informe** (20/09/2026). Bosco, mirando la maqueta del PDF:
   *"está perfecto pero hay que añadir cosas porque el informe tiene que ser un resumen de todo lo
   que ha pasado en el mes"*. Y antes, sobre la comparación: *"sí, en todas las cifras"*.

   **RN-REP-17 · la comparación con el periodo anterior.** Lo que había que decidir no era si se
   compara, sino **con qué**, y son dos reglas porque el equipo elige las fechas: un **mes natural**
   se compara con el mes natural anterior entero —septiembre contra agosto del 1 al 31, aceptando 30
   días contra 31, porque lo que el restaurante lee es "agosto" y recortarle el día 1 sería llamar
   agosto a algo que no lo es—; **cualquier otro periodo**, con otros tantos días pegados detrás.

   Tres cosas que no son evidentes:

   - **El nivel del plan decide hasta dónde llega**, y un informe `basic` **ni siquiera pide** el
     periodo anterior. Si se calculara y se escondiera, la versión guardada llevaría dentro lo que
     el plan no incluye, y el nivel sería un filtro de pintado en vez de una barrera (RN-REP-15).
   - **El nivel NO se lee con `establishment_report_level()`**: esa función comprueba que quien
     pregunta sea del espacio, y la generación corre como `service_role`, sin `auth.uid()`.
     Devolvería `basic` siempre y **todos** los informes saldrían recortados en silencio.
   - **Lo que no hay no se rellena con un cero.** Son cinco casos y se dicen los cinco distinto: sin
     comparación, sin periodo anterior, desde cero, igual, y la variación. La variación dice la
     **dirección**, no si está bien: que suban las incidencias es malo y que suban las visitas es
     bueno, y decidirlo cifra a cifra sería una lista de juicios inventada (CLAUDE.md).

   **RN-REP-18 · "Lo que ha pasado este mes"** (migración 112). Hasta hoy el informe eran
   **indicadores**, que responden "cómo fue el mes" pero no **"qué pasó"**. Entra en los cinco
   niveles, Básico incluido — es la razón por la que su informe no es una hoja en blanco—. Lo que se
   cuidó: **ninguna entrada lleva identidad del equipo**, y la suite no se fía de leer la función:
   busca en el JSON el uuid y el nombre de cada persona; **los cobros solo con Finanzas dentro**, y
   el parámetro sale de la sección de ESE informe; y **lo que no pasó no se cuenta** —un borrador
   que el cliente nunca envió, un pago revertido, una corrección por error del equipo, un archivo
   interno, o las incidencias de soporte, que son del espacio a Cuotly—.

   **RN-REP-19 · el PDF de la maqueta.** Portada, "Lo esencial" —*"si solo lees una página, es
   esta"*—, resumen ejecutivo, índice, una página por sección y anexos. Dos correcciones que salieron
   de **mirar el PDF generado**, no de los tipos ni de los tests:

   - **La tarjeta de "clics en reservas" del primer boceto no se construye**: las reservas no se
     monitorizan (CLAUDE.md), así que esa cifra no existe y ponerla sería inventarla.
   - **La caída se imprimía sin signo.** La variación usaba el menos **tipográfico** (U+2212), que
     no existe en WinAnsi —lo que escribe la fuente estándar del PDF—, así que el filtro se lo comía
     y `-16 %` salía impreso como `16 %`: una bajada pintada como una subida. Ahora hay un barrido
     que recorre **todas** las frases que el PDF puede imprimir, llamando también a las plantillas
     con valores de ejemplo, y falla si alguna no se puede escribir. Mutación probada: devolver el
     menos tipográfico pone la suite en rojo.

   También se vio ahí que las barras de dos tonos solo valen en **Rendimiento digital**: un 100 % de
   cumplimiento contra otro 100 % son dos barras iguales que no dicen nada, y un tiempo medio
   dibujado como barra se lee al revés, porque ahí la barra corta es la buena.

   Comprobado: suite 60 `lo_que_ha_pasado_este_mes.sql` con **tres mutaciones** —filtrar la
   identidad, el parámetro de Finanzas y el pago revertido—, las 60 suites juntas sobre una base
   limpia en el orden de CI, y el PDF generado y mirado página a página.

58. **Qué lleva cada uno de los cinco informes** (20/09/2026). Bosco leyó el primer PDF de verdad y
   pidió tres cosas; al contestarlas salió el principio que faltaba, que es lo más importante de
   esta decisión.

   **El principio: los cinco niveles reparten ANÁLISIS, no información.** Los cinco dicen la verdad
   sobre el mismo mes y ninguno esconde el historial del restaurante. Lo que el restaurante pidió,
   lo que se le entregó y lo que gastó de su bolsa está en los cinco; lo que sube con el plan es la
   lectura de cómo fue —plazos, comparación, Rendimiento digital, Oportunidades, Finanzas—. Ante la
   duda de mañana ("¿esto va en Básico?"), la pregunta es si es **lo que pasó** o **una valoración
   de lo que pasó**.

   Esto corrige la decisión 56, donde "el detalle cambio a cambio" era exclusivo de Completo. Con el
   relato del mes ya construido eso no encajaba, porque el relato **es** el detalle. Se separan por
   tanto dos cosas que se llamaban igual: **el qué** —descripción, fechas, tipo de cambio— en los
   cinco, y **los tiempos de cada cambio uno a uno** en Completo. Bosco lo eligió así sobre las otras
   dos opciones que se le propusieron: *"esconder la descripción de un cambio que un Básico ha
   pagado aparte sería cobrarle por ver su propia factura"*.

   **Consecuencia que hay que recordar:** `operation` pasa a empezar en `standard`. Un informe
   `basic` es resumen ejecutivo más "Lo que ha pasado este mes" —con su bolsa y la ficha de cada
   cambio— y nada más; su portada se queda incluso sin "Lo esencial", porque no tiene cifra de
   cabecera que enseñar, y el bloque no se dibuja vacío.

   **RN-REP-20 · la bolsa del mes.** Bosco: *"pon por separado cuántos cambios pequeños ha
   consumido, cuántos medianos, cuántos grandes y cuántos fotográficos"*, y *"si hubiesen comprado
   cambios adicionales habría que mencionarlo: 1/0 cambios grandes"*. Las cuatro categorías siempre,
   el 0 de 0 incluido, porque esa línea dice lo que el plan **no** le da.

   Lo que hubo que aclararle antes de construirlo, y él aceptó: **"1 de 0" no es un error de
   cuentas**. Un cambio presupuestado aparte **no consume bolsa** (RN-CON-03), así que el 1 y el 0
   salen de sitios distintos —los trabajos presupuestados del periodo y la instantánea del ciclo— y
   sin coletilla el restaurante leería que se ha pasado de su plan cuando lo que hizo fue comprar
   uno aparte.

   **RN-REP-18 ampliada · la ficha de cada cambio**, con su descripción, su tipo, y las fechas de
   inicio y fin; donde no hay fecha de fin se dice **"En proceso"**, y donde no hay de inicio,
   **"Pendiente de empezar"** o **"En análisis"** según esté aceptado o no. Los dos últimos no los
   pidió Bosco: salieron de preguntarse qué pasa con un cambio que nadie ha aceptado todavía, y sin
   ellos desaparecía del informe.

   **El fallo que encontró construirlo:** la ficha se montó primero sobre `jobs`, y así **una
   solicitud enviada y todavía en análisis no aparecía en ninguna parte** — el restaurante la había
   pedido y su informe no la mencionaba. La ficha sale de `requests` con el trabajo enganchado por
   la izquierda, no al revés. Lo cazó la comprobación del consolidado de la suite 60, que existía
   por otro motivo.

   **Y una corrección de estilo que solo se ve mirando el PDF:** "Fotografías · 3 de 6 incluid**os**"
   y "1 de 1 incluid**os**". El adjetivo concuerda en género y número, y son cuatro formas. En un
   documento que lee un cliente, un plural mal puesto se nota más que en cualquier otro sitio.

   Comprobado: suite 60 ampliada con la ficha y la bolsa, con **tres mutaciones nuevas** —juntar
   presupuestados y consumidos, contar los débitos sin restar las devoluciones, y volver a montar la
   ficha sobre `jobs`—, las 60 suites sobre una base limpia, 1.537 tests de web, y el PDF generado y
   mirado página a página.

59. **La tercera puerta: el restaurante invita, Cuotly aprueba** (20/09/2026). Hasta hoy solo había
   dos maneras de que alguien entrara en el panel de un restaurante: que el equipo le diera acceso a
   una cuenta que ya existía, o que el equipo le mandara un alta. Faltaba la que pide la vida real:
   el restaurante quiere meter a su jefe de sala, y su jefe de sala no tiene cuenta de Cuotly.

   Bosco eligió **"el restaurante invita, tú apruebas"** frente a las otras dos opciones —que el
   restaurante pudiera crear cuentas por su cuenta, o que tuviera que pedírselo al equipo por
   mensaje—. Es la que no regala la creación de cuentas ni obliga a que el equipo teclee los datos
   de un tercero: el restaurante escribe a quién quiere meter y con qué permisos, y la invitación
   se queda **esperando revisión** hasta que alguien del equipo la aprueba o la rechaza.

   **Quién puede invitar: igual que ahora** (RN-ACC-13). El equipo con `manage_clients`, y dentro
   del panel quien tenga "Usuarios y accesos". No se inventó un permiso nuevo: el que ya decide
   quién entra en el panel es el que decide a quién se invita.

   **Lo que cambia para el equipo y lo que no.** Si el correo invitado **ya tiene cuenta**, no hay
   nada que aprobar: es el acceso de siempre y se concede en el acto. La revisión existe solo
   cuando la invitación va a **crear una cuenta nueva**, que es lo único que el restaurante no
   puede hacer solo.

   **RN-PAN-15 · el restaurante no ve quién revisó.** La fila guarda quién invitó, quién revisó y
   quién aceptó, y las tres son identidad del equipo. Se tapan con privilegios de columna, como
   manda CLAUDE.md, no con una vista ni confiando en la pantalla.

   **Lo que encontró construirlo, que es la parte que conviene no olvidar:**

   · Cuatro columnas que escribí de memoria **no existen**: `establishment_memberships` no tiene
     `space_id`, ni `edit_establishment_data`, ni `view_billing`, ni `granted_by` —los permisos
     viven en `establishment_permissions`—. plpgsql no valida nombres de columna al crear la
     función, así que la migración aplicó limpia y solo habría reventado el día que alguien
     aceptara una invitación. El permiso tampoco se llama `manage_access` sino `manage_users`. La
     regla que sale de aquí es simple: **una función nueva se escribe leyendo la que ya hace lo
     mismo**, no recordándola.

   · Lo mismo con dos listas `check` cerradas —`state_events.entity_type` y el catálogo de
     notificaciones—: las escribí de memoria, con tipos inventados y sin algunos de los de verdad.
     Se reescribieron leyendo la definición viva.

   · **Los tres barridos del proyecto dispararon los tres.** El de `SECURITY DEFINER` en falso
     cerrado obligó a que `establishment_invitation_status()` comprobara permisos de verdad; el de
     solo lectura pedía **los dos** disparadores (soporte y espacio archivado), no uno; y el de
     traspaso exigía declarar la tabla nueva en `establishment_transfer_tables()`. Ninguno de los
     tres lo habría visto yo leyendo mi propio código.

   · **Y una mutación pasó en verde**, que es el hallazgo serio del día. Quité de
     `consume_establishment_invitation()` la línea que exige que la invitación esté **aprobada** —la
     barrera de seguridad entera de esta decisión— y la suite siguió pasando: el test moría antes
     por otro motivo y el `when sqlstate 'P0001'` se tragaba el mensaje. Un test que pasa por el
     motivo equivocado es peor que no tenerlo, porque además tranquiliza. Se arregló creando la
     cuenta antes de la barrera y exigiendo que el error diga `no está aprobada`.

   **La migración 115 salió de un test de web, no de una suite de SQL.** `audit_action_capability()`
   no sabía de quién era la familia `panel_invitation`, así que caía en el `else null` —que no
   significa "la ve cualquiera" sino "lo decide la fila"—, y la pantalla habría filtrado por
   `manage_clients` mientras el servidor filtraba por la fila: **la pantalla más estricta que el
   servidor**, que es la forma silenciosa de este fallo, la que nadie nota hasta que alguien
   consulta por otra vía.

   Comprobado: suite 61 `invitaciones_al_panel_del_restaurante.sql`, las 61 suites sobre una base
   limpia en el orden de CI, 1.537 tests de web, y las huellas de las nueve funciones de las
   migraciones 114 y 115 iguales en local y en producción.

60. **Qué añade Premium+, dentro y fuera del informe** (20/09/2026). Bosco: *"El premium+ tiene que
   tener más cosas en el informe dame recomendaciones. También diría de añadirle algo al premium+ ya
   sea una integración o algo así"*.

   **De dónde venía.** La tabla de RN-REP-15 le prometía a Premium+ dos cosas que no existían —los
   tiempos de cada cambio y la evolución digital dentro del mes—, así que llevaba desde el 20/09
   pagando 100 € más que Premium por **un informe idéntico**. Eso no era una mejora pendiente: era
   una promesa incumplida, y por eso va primero.

   **Seis cosas en el informe**, las dos prometidas y cuatro recomendadas que Bosco aceptó enteras:

   - **Los tiempos de cada cambio** (RN-REP-21): cuánto tardó en arrancar desde que se aceptó, si
     cumplió el plazo con el que se aceptó, cuánto tardó en hacerse, cuánto estuvo parado y por qué.
     Todo en reloj laboral, bloqueos incluidos: mezclar horas laborables con días de calendario en
     la misma fila hace comparar dos unidades creyendo que se comparan dos números.
   - **La evolución dentro del mes** (RN-REP-22), en bloques de 7 días y no en semanas naturales.
     La razón es de hostelería: un bloque de 7 días tiene exactamente un sábado, y una semana
     natural recortada por el borde del mes parece una caída que no existe.
   - **La comparación con el mismo mes del año anterior** (RN-REP-23). Es la recomendación que más
     valor da por lo poco que cuesta: septiembre contra agosto es en buena parte temporada;
     septiembre contra septiembre es el dato que el restaurante se pregunta de verdad.
   - **Qué pasó con las oportunidades del informe anterior** (RN-REP-24). Premium ya las recibe; lo
     que añade Premium+ es cerrar el círculo. Un informe que propone cada mes y nunca dice qué fue
     de lo del mes pasado se lee como un folleto.
   - **El efecto de cada cambio publicado** (RN-REP-25), con **14 días a cada lado** —el número lo
     eligió Bosco sobre 7 y 28—. Es lo que contesta la única pregunta que un restaurante se hace
     sobre lo que paga. Y lleva escrita la frase más importante del informe entero: *"Es lo que pasó
     después, no necesariamente lo que el cambio causó"*. Cuotly no sabe aislar una causa y fingirlo
     sería justo lo que CLAUDE.md prohíbe.
   - **El aprovechamiento del plan** (RN-REP-26): de los ciclos ya cerrados de la permanencia,
     cuántos cambios quedaron sin usar. Decirle a un restaurante que está tirando dinero es más
     honesto —y a la larga mejor negocio— que dejar que lo descubra el día que se plantea irse.

   Lo que **no** se metió, aunque se propuso: el texto escrito a mano por el equipo cada mes. Barato
   de programar y caro para siempre.

   **Fuera del informe: la vigilancia de reseñas de Google** (RN-INT-10 a 12). Sale de una conexión
   que ya existía —Business Profile lleva construido desde el Hito 14— y que hoy solo traía
   rendimiento. **Reseña baja es 3 estrellas o menos** y **avisa al equipo siempre y al restaurante
   solo si es baja**: las dos cosas las decidió Bosco. Un aviso que llega todos los días deja de
   leerse, y entonces no sirve el día que importa.

   Lo que se descartó aquí: **quitarle a los planes bajos las cinco integraciones** que hoy ya
   tienen —eso no es añadir a Premium+, es retirar a los demás— y el **plazo de entrega
   garantizado**, que Bosco rechazó: *"lo que podemos hacer es bajar el tiempo de realizaciones de
   los trabajos"*, y eso queda para después.

   **La contradicción aparente que hubo que resolver por escrito.** Las reseñas parecen romper el
   principio de la escalera de la decisión 58 —"los cinco niveles dicen la verdad sobre el mismo
   mes"—. No lo rompen, y queda dicho en RN-INT-10 para que nadie lo redescubra mal: si el plan no
   las vigila **no se descargan**, así que no es un dato del restaurante que se le esconda, es un
   trabajo que no se está haciendo, como Menú Diario. La confusión entre las dos cosas es fácil y
   sería grave.

   **Lo que encontró construirlo:**

   · **Cinco de las seis piezas no tocaron el servidor**, y eso no fue suerte:
     `report_operation_dataset()` se diseñó devolviendo **filas y no cifras** justamente para que una
     lectura nueva se escriba en `src/core/` sin tocar SQL. La única migración de informe (la 116)
     añade tres datos a la fila, no un cálculo.

   · **La flecha `→` no existe en WinAnsi**, y `sanitize()` se la comió dejando "1240 1480": dos
     números pegados sin decir cuál era cuál. Es el mismo fallo que el menos tipográfico de la
     decisión 58, y lo encontró mirar el PDF, no el typecheck. **El barrido que lo tenía que cazar
     existía y no llegaba a las cadenas nuevas.** La lección no es "cuidado con las flechas": es que
     una red que no cubre lo último que se añadió no es una red, y ahora el barrido recorre los seis
     bloques nuevos.

   · **El motivo del bloqueo se montaba encima del "en plazo"**, porque las líneas de apoyo se
     colocaban con desplazamientos escritos a mano. Ahora bajan solas. Solo se ve generando el PDF.

   · **El barrido de catálogos compartidos saltó** por los dos avisos nuevos —bien— y después **no
     supo leer la lista**: la migración 117 escribió el `check` como `any (array[...])`, que es como
     lo devuelve `pg_get_constraintdef()`, y el barrido solo entendía `in (...)`. Falló por no poder
     leer, que se parece peligrosamente a fallar por haber encontrado algo. Ahora entiende las dos
     formas.

   · **El aviso de reseña baja llevaba al restaurante a una pantalla cerrada al equipo.** Habría
     pulsado su propio aviso para que le dijeran que no podía entrar. La puerta es
     `can_read_establishment()`, la misma que filtra las filas.

   · **Y una limitación que se dice en vez de taparse:** la API de reseñas de Google necesita
     `accounts/A/locations/L`, y una conexión que solo guardó la ubicación no se puede completar a
     ojo sin adivinar de quién es la ficha. Esas conexiones **lo dicen en la pantalla** —"hay que
     volver a conectar eligiendo la cuenta"— en vez de enseñar una lista vacía para siempre.

   Comprobado: suite 62 `vigilancia_de_resenas.sql` con **cinco mutaciones** —quitar la barrera del
   plan, bajar el umbral a 2, avisar al restaurante de todas, volver a avisar de las conocidas, y el
   `entity_type` equivocado que `emit_notification()` se traga en silencio—, **cinco mutaciones más**
   sobre las funciones nuevas de `src/core`, las 62 suites sobre una base limpia, 1.567 tests de web,
   y el PDF de un Premium+ con las seis piezas dentro generado y mirado página a página.

61. **Premium+ tarda menos en hacer los cambios** (20/09/2026). Bosco, al cerrar la decisión 60:
   *"lo que podemos hacer es bajar el tiempo de realizaciones de los trabajos"*, y después: *"solo lo
   vamos a bajar en premium+"*.

   Hasta hoy el plazo de realización era el mismo para todos: 72 h laborables en pequeño,
   fotográfico y mediano, y 120 h en grande (RN-SLA-12). Los nuevos, **solo en Premium+**:

   | Categoría | Antes | Premium+ | Lo que ve el cliente |
   |---|---:|---:|---|
   | Pequeño | 72 h | **48 h** | 1–3 días → **1–2 días** |
   | Fotográfico | 72 h | **48 h** | 1–3 días → **1–2 días** |
   | Mediano | 72 h | 72 h | 1–3 días (igual) |
   | Grande | 120 h | **96 h** | 3–5 días → **2–4 días** |

   **Los eligió él y son mejores que los tres que se le propusieron**, que eran recortes planos
   (48/96, 48/72, 24/72). Lo que hizo fue crear una **escalera por categoría** que antes no existía:
   hoy un cambio pequeño y uno mediano tienen exactamente el mismo plazo, que nunca tuvo mucho
   sentido. Premium+ queda en 48, 48, 72 y 96, que sube con el tamaño del trabajo.

   **La pega que se le puso y por qué se cayó sola.** Se le recomendó dejar las fotografías en 72 h,
   porque una sesión depende de ir al restaurante y de que la cocina pueda emplatar. Él las bajó
   igual, y al mirarlo resultó que no hacía falta la excepción: **el reloj de ejecución ya se pausa
   durante los bloqueos** (RN-SLA-14), así que una sesión que espera al restaurante no consume
   plazo. Lo único que exige es bloquearla de verdad en vez de dejar el reloj corriendo, que es una
   costumbre del equipo, no una regla que haya que escribir.

   **El plazo se congela al aceptar** (`jobs.execution_sla_hours`), igual que el de inicio
   (RN-COM-15). Bajar de plan a mitad de mes **no alarga** el plazo de lo que ya está en marcha, ni
   subir lo acorta. Un trabajo aceptado antes de esta regla se queda a `null`, que significa "el de
   la tabla", que es el que tenía: rellenarlo hacia atrás habría reescrito compromisos vivos.

   **Lo que encontró construirlo, y lo encontró el typecheck, no yo:** creía que el plazo de
   ejecución se leía en **un** sitio y se lee en **tres** —el barrido que emite los avisos, los
   contadores del Inicio del espacio y la ficha del trabajo—. Si una se hubiera quedado fuera,
   habría **dos relojes distintos para el mismo trabajo**: el equipo vería "va sobrado" en una
   pantalla y recibiría un aviso de vencimiento por correo. Eso es peor que un reloj mal, porque
   deja de fiarse de los dos.

   Y el fallo silencioso que esto evita: si el barrido hubiera seguido midiendo contra las 72 h de
   la tabla, **un Premium+ no habría recibido ningún aviso hasta pasarse de largo**, porque el 100 %
   de 72 h llega cuando las 48 reales hace rato que vencieron. Todo lo demás habría funcionado y
   solo se habría notado el día que alguien se preguntara por qué no saltó nada.

   **Los avisos del 75 %, 90 % y 100 % se mueven solos**, porque son porcentajes del plazo: en un
   pequeño de Premium+ el primero salta a las 36 h laborables en vez de a las 54. No hubo ningún
   umbral nuevo que decidir.

   Comprobado: suite 63 `plazo_de_realizacion_del_plan.sql` con **tres mutaciones** —no congelar el
   plazo, congelar siempre la columna del pequeño, y que el barrido leyera el plan de hoy en vez del
   congelado—, las 63 suites sobre una base limpia, 1.572 tests de web, y las huellas de las cuatro
   funciones iguales en local y en producción.

62. **El restaurante tiene foto** (21/09/2026). Sale de un repaso de las 157 páginas del diseño
   contra el código: la foto del local aparece en **cuatro** pantallas —el Inicio del espacio, la
   lista de Restaurantes, la ficha y Gestión— y no existía ninguna columna de imagen. Hasta hoy
   esas cuatro pantallas se construyeron sin ella y diciendo por qué, en vez de poner la foto de
   archivo del PDF.

   Bosco: **una foto por restaurante**, y la puede subir tanto el equipo como el cliente.

   Qué significa, para que no se convierta en otra cosa al construirlo:

   - **Una, no una galería.** Es la foto que identifica el local en una lista. Las fotos de un
     trabajo son otra cosa y ya existen: son las evidencias (antes/después).
   - **Vive donde viven los archivos del espacio.** Un restaurante es de un espacio, así que
     `files` le sirve —a diferencia de la foto de perfil, que no era de ningún espacio y necesitó
     bucket propio (decisión 53)—.
   - **La ve el cliente y la ve el equipo.** No es material interno: es la cara de su propio
     restaurante.
   - **Sin foto no hay hueco gris esperándola.** Un restaurante sin foto se enseña sin foto, como
     ahora, no con un marco vacío que parece que algo falló.

   Hecho el mismo día (RN-EST-18, migraciones 120 y 121). Dos cosas que se aprendieron
   construyéndolo y que conviene no volver a descubrir:

   - **Una columna, no "el último archivo de categoría fotos".** Con lo segundo, subir una
     fotografía cualquiera de un trabajo cambiaría la cara del restaurante sin que nadie lo
     decidiera. La foto es una elección y una elección se guarda.
   - **La foto sigue la regla de ver el restaurante, no la de leer archivos.** Lo evidente era
     dejar que filtraran las políticas de `files`, pero un trabajador ve todos los restaurantes
     del espacio y solo lee los archivos de los que tiene autorizados (RN-ARC-05): la lista le
     habría salido con unas caras sí y otras no, sin que nada lo explicara. Por eso
     `establishment_photo_path()` comprueba esa otra regla dentro.

   Comprobado: suite 65 `la_foto_del_restaurante.sql` con **quince mutaciones** —once sobre la 120
   y cuatro sobre la 121—, nueve mutaciones más sobre las pantallas y cinco sobre el adaptador (una
   sobrevivió y descubrió que al test le faltaba el caso que separa mirar el error de mirar si hay
   datos), las 65 suites sobre una base limpia con las 121 migraciones, 1.724 tests de web, y las
   huellas de las tres funciones iguales en local y en producción.

63. **Responsable del restaurante, y opcional** (21/09/2026). El diseño enseña en la página 23 un
   "Supervisor · Diego" por restaurante. Eso chocaba con una decisión que no debe reaparecer:
   **supervisor no es un rol, es una relación Administrador–Trabajador**, y `supervisions` enlaza
   dos personas, no una persona con un local. Se construyó la lista sin esa columna y se preguntó.

   Bosco: **crearlo, pero no es obligatorio que haya siempre uno.**

   Las dos mitades importan y la segunda más:

   - Es un **responsable del restaurante**: alguien del equipo a quien se le atribuye ese cliente.
     No se llama "supervisor" —ese nombre ya está cogido y significa otra cosa— para que nadie los
     confunda dentro de seis meses.
   - **Opcional de verdad.** Un restaurante sin responsable es un estado normal, no un error ni un
     aviso: se dice "sin responsable" y ya. Esto es lo que evita que la pantalla empiece a
     empujar a asignar a alguien para quitarse un hueco de encima, y lo que impide que nada del
     servidor —un aviso, un reparto, un cálculo— dependa de que ese campo esté relleno.
   - **No cambia quién puede hacer qué.** Ser responsable no da permisos: los permisos siguen
     saliendo de las capacidades del espacio. Es una atribución, no una llave.

64. **Las subtareas y las evidencias se ven bajo la solicitud, en solo lectura** (21/09/2026). El
   diseño de la página 25 las dibuja debajo de la solicitud; en el modelo cuelgan del **trabajo**,
   que nace al aceptarla. El panel se construyó sin ellas, con el enlace al trabajo, y se preguntó.

   Bosco: **sí, en solo lectura.**

   La línea está donde tiene que estar: **se ven ahí, se marcan en el trabajo**. Una casilla que
   se pudiera marcar en dos sitios acabaría marcándose en uno y no en el otro, y las evidencias se
   suben donde se hace el trabajo. Bajo una solicitud todavía sin aceptar no hay nada que enseñar
   —no existe el trabajo—, y eso se dice en vez de pintar una lista vacía.

   Hecho el mismo día (RN-REQ-07). Tres cosas que salieron construyéndolo:

   - **No hizo falta migración, y eso había que demostrarlo.** Las políticas que ya estaban bastan,
     y la manera de equivocarse aquí habría sido añadir una excepción "para que el panel pueda
     pintar". La suite 66 comprueba que no se añadió: el cliente no ve ni una subtarea de su propia
     solicitud, un trabajador sin ese restaurante autorizado tampoco, y `tasks` no tiene política
     de `update` — un `UPDATE` directo afecta a **cero filas sin dar error**, que es peor que un
     error porque parece que funcionó.
   - **Ni una casilla.** Se pintan iconos de estado con su nombre escrito al lado, no casillas
     apagadas: una casilla que no se deja pulsar invita a pensar que la pantalla está rota, y por
     eso además se dice dónde se marcan.
   - **Tres vacíos, tres frases.** "Todavía no hay trabajo", "el trabajo no está desglosado" y "no
     hay evidencias" se parecerían todos en una lista vacía (CA-20).

   Y una consulta duplicada que se evitó a tiempo: la evidencia estaba escrita a mano dentro de la
   ficha del trabajo, y copiarla habría sido el principio de dos versiones distintas de cuál es la
   versión vigente de un archivo. Vive ahora en `evidence-load.ts`, como las tareas en
   `tasks-load.ts`.

   Comprobado: suite 66 `subtareas_bajo_la_solicitud.sql` con **cuatro mutaciones sobre las propias
   políticas** —quitarle `is_space_member` a `tasks_select`, quitarle `can_read_job`, abrir
   `file_links_select` y añadir una política de `update` a `tasks`—, siete mutaciones más sobre la
   pantalla, las 66 suites sobre una base limpia, 1.727 tests de web y 23 de móvil.

65. **Frecuencia de aviso: al momento o resumen diario a las 08:00** (21/09/2026). Era el último
   hueco abierto del repaso del diseño. La página dibuja "Instantáneo / Resumen diario" y un
   "horario de recepción", y no se construyó nada porque faltaban tres cosas que nadie había
   decidido: la hora del resumen, si la franja existe, y qué se salta el silencio.

   Bosco, después de preguntar con razón **a qué hora de corte me refería** —"Instantáneo" no
   necesita ninguna; solo la necesita el resumen—:

   - **El resumen sale a las 08:00** de la zona del espacio, cubriendo las 24 h anteriores.
   - **El horario de recepción se queda fuera.** No es un aplazamiento vago: elegir entre las dos
     frecuencias ya resuelve el "no me molestéis a deshora", y una franja traería cambios de hora,
     husos ajenos y qué hacer con lo acumulado al cerrarse.
   - **Un aviso obligatorio sale al momento**, aunque la persona tenga resumen diario.

   Lo que eso obliga a decidir al construirlo, y queda escrito para que no se redecida:

   - **La frecuencia es por persona Y espacio**, no por persona. Los avisos son de un espacio y la
     hora de corte es la de ese espacio: quien trabaja en dos recibe dos resúmenes, cada uno en su
     mañana. Con una frecuencia global habría que elegir la zona de alguien.
   - **Agrupa el correo y el push, nunca la campana.** Si la campana también esperara, quien
     eligiera resumen diario abriría Cuotly y no vería nada de lo que ha pasado hoy — y lo que la
     campana hace no interrumpe a nadie.
   - **Un día sin nada no genera resumen.** Un correo que dice "no ha pasado nada" es ruido, y el
     que lo recibe deja de abrir los que sí traen algo.

   Escrito como RN-NOT-06 antes de tocar código.

   **Corrección del mismo día, antes de que nadie lo usara.** La primera versión exigía que fueran
   **las ocho en punto** en el espacio, y eso habría hecho que el resumen no se enviara nunca en
   Madrid durante el verano: el barrido lo lanza el cron de Vercel, que pasa dos veces al día
   —07:00 y 19:00 UTC—, o sea a las 09:00 y 21:00 hora de Madrid en horario de verano. Habría
   funcionado en invierno, se habría apagado solo en marzo y no habría dado ningún error.

   El fallo fue escribir "a las ocho" sin mirar cada cuánto corre la cola de verdad. Se arregla en
   la migración 124: **la primera pasada del día a las 08:00 o después**, que además es mejor
   aunque la cola pase cada hora —con "las ocho en punto", una sola pasada perdida deja a todo el
   mundo sin resumen ese día—. La pantalla dice "a partir de las 08:00", que es la verdad con
   cualquier frecuencia.

---

### Pendiente de completar

**Ninguna abierta.** La 26 se cerró el 19/09/2026 como decisión 52.

26. ~~¿"Consultar informes" es un permiso del Editor, o lo ven todos?~~ — resuelta el 19/09/2026
   como **decisión 52**, a favor del diseño.

Las dieciséis de las fases 1 a 3 y las cuatro de la Fase 4 están cerradas;
quedan tachadas abajo con la decisión que resolvió cada una. Las cuatro de la Fase 4 se cerraron el
16/09/2026 como decisión 38, en el paso 1 del orden acordado. Las lecturas de los hitos 18 a 22
están confirmadas (decisiones 32, 33, 34, 35 y 36).

25. ~~Lecturas aplicadas al implementar la app móvil y el push~~ — confirmadas nueve y cambiada
   la tercera el 16/09/2026 como decisión 36. Se conservan abajo tal como se preguntaron (Hito 22,
   PRD §35, migración 94). §21, §70, §144, §145 y §176 dicen qué hace la app y callan en **diez** sitios sobre el cómo.
   En los diez se ha elegido lo más defendible, se ha escrito como regla `RN-MOV` marcada como
   lectura y se pregunta aquí. **Ninguna es un umbral ni un plazo.** Se pide confirmarlas, o
   cambiarlas, antes de publicar la app en las tiendas.

   1. **Las rutas de la app son las de la web** (RN-MOV-01): `/espacios/<slug>/…`, para que el
      enlace profundo de cada aviso (RN-NOT-04) abra lo mismo en los dos sitios y el acceso lo
      verifiquen las mismas políticas.
   2. **La barra de §21 sale de `mobileNav()`**, la función que ya la calcula para la web
      (RN-MOV-02), y no de una copia. "Más" se deriva.
   3. **El push dice el evento y el espacio, y nada más** (RN-MOV-04): ni restaurante, ni cifra,
      ni quién. Se lee en una pantalla bloqueada; el detalle está detrás de la sesión.
   4. **Un dispositivo es de una persona** (RN-MOV-05): el token pasa a quien entra, se da de
      baja al cerrar sesión, y uno que el proveedor devuelve como inexistente se cierra con su
      motivo sin reintentos. Registrar y dar de baja dejan auditoría sin espacio, que ve el
      interesado.
   5. **La explicación del push va antes del diálogo del sistema** (RN-MOV-06), porque ese diálogo
      solo se puede enseñar una vez; y el push tiene su propia preferencia por evento, activada
      por defecto, con los obligatorios de RN-NOT-03 bloqueados también en ese canal.
   6. **"Escaneo de documentos" es una fotografía con la cámara** (RN-MOV-07): sin librería de
      escaneo ni OCR. Los permisos se piden al usarlos, nunca al arrancar, y lo subido pasa por
      el mismo registro que en la web.
   7. **La biometría es un cerrojo local y opcional** (RN-MOV-08): no autentica contra el
      servidor, no es la 2FA, y el panel de Cuotly y Modo soporte no están en la app.
   8. **Sin conexión no se encola ninguna acción crítica** (RN-MOV-09): el botón se deshabilita
      con el motivo. Solo se guardan borradores de solicitudes y mensajes, que se confirman uno a
      uno al volver la conexión.
   9. **La caché es de quien mira y se borra al cerrar sesión** (RN-MOV-09).
   10. **La clave de idempotencia nace con el borrador** (RN-MOV-10), y el identificador que
      devuelve `create_request_draft` se guarda antes de llamar a `submit_request`, para que un
      corte entre los dos no cree una segunda solicitud.

   **Lo que esta pendiente NO incluye**, porque no es una lectura sino lo que la maestra deja
   fuera: la sincronización de calendarios y la API pública (aplazadas en CLAUDE.md), y la
   publicación en las tiendas, que es una operación con cuentas de desarrollador de Apple y de
   Google que no existen todavía en el repositorio.

24. ~~Lecturas aplicadas al implementar el soporte de Cuotly, el centro de ayuda y la página de
   estado~~ — confirmadas las catorce el 15/09/2026 como decisión 35. Se conservan abajo tal como se
   preguntaron (Hito 21, PRD §34, migración 93). §131, §132, §133 y §157 dicen qué y no cómo, y callan
   en **catorce** sitios. En los catorce se ha elegido lo más defendible, se ha escrito como regla
   `RN-SOP` y se pregunta aquí. **Ninguna es un plazo**: §131 dice que no hay tiempo contractual de
   respuesta público y aquí no se ha puesto ninguno.

   1. **Modo soporte no abre incidencias ni en nivel `owner`** (RN-SOP-01): hablar con Cuotly en
      nombre de un espacio ajeno es lo que RN-ADM-07 prohíbe con invitar, un piso más arriba. Y el
      espacio ve **todas** sus incidencias, las abriera quien las abriera de su equipo.
   2. **Una sugerencia es una incidencia de tipo sugerencia** (RN-SOP-02), con los mismos estados y
      el mismo hilo, listada aparte y **sin prioridad ni tiempo de atención**.
   3. **Las categorías son los ocho temas de §133 más "otra"** (RN-SOP-03), para que la guía y la
      incidencia hablen el mismo idioma.
   4. **El impacto tiene cuatro niveles** (RN-SOP-03): bajo, medio, alto y crítico. §131 solo
      nombra el crítico; sin escalones por debajo sería una casilla sí/no.
   5. **La tabla de transiciones** (RN-SOP-04): Cuotly mueve; "necesita información" devuelve la
      pelota al espacio, que al contestar la deja en revisión; de "resuelta" el espacio cierra o
      reabre; "cerrada" es final; **nadie cierra sola**, porque §131 no da plazo. Motivo obligatorio
      en "necesita información" y al cerrar sin resolver.
   6. **Un espacio sin plan de Cuotly tiene prioridad estándar** (RN-SOP-05): Restavor y el de
      demostración.
   7. **Los festivos del horario humano son los de Cuotly**, en una lista de plataforma que nace
      vacía (RN-SOP-06). §132 es el horario de Bosco, no el de cada espacio, y no se supone ningún
      calendario.
   8. **Atienden Bosco y los Administradores de Cuotly sin permiso fino** (RN-SOP-07), como leer el
      panel (decisión 33, lectura 2).
   9. **El espacio ve "Cuotly", no quién contestó** (RN-SOP-07), como en RN-PLA-07: privilegio de
      columna sobre el autor, con un `author_side` visible para distinguir los dos lados.
   10. **Los adjuntos no van a `files`** (RN-SOP-08): esa tabla exige establecimiento y una
      incidencia es del espacio. La misma lectura que el logotipo (decisión 34).
   11. **Las guías son contenido de Cuotly versionado por migración, sin editor** (RN-SOP-10), y las
      ve cualquiera con sesión, cada rol las suyas primero.
   12. **A quien no puede abrir una incidencia se le dice con quién hablar** (RN-SOP-11), no se le
      esconde el botón.
   13. **Qué se mide en la página de estado y qué no** (RN-SOP-12): notificaciones e integraciones se
      miden; aplicación, porque responde; autenticación y archivos **no**, y la página lo dice.
   14. **Ningún aviso de incidencias es obligatorio** (RN-SOP-15): no son seguridad ni pérdida de
      acceso. `incident_opened` va a toda la plataforma, crítica o no.

   **Lo que esta pendiente NO incluye**, porque no es una lectura sino lo que la maestra deja fuera:
   la monitorización automática de §157 (es del proveedor y no se finge) y el cierre automático de
   incidencias (sin plazo en §131, sin barrido).

23. ~~Lecturas aplicadas al implementar el onboarding y el ciclo de vida del espacio~~ —
   confirmadas las trece el 15/09/2026 como decisión 34. Se conservan abajo tal como se
   preguntaron (Hito 20, PRD §33, migración 92). §9, §127 y §141 son los tres apartados más escuetos de la maestra —diez
   palabras sueltas, siete líneas y cuatro— y callan en **trece** sitios. En los trece se ha elegido
   lo más defendible, se ha escrito como regla `RN-CIC` y se pregunta aquí. **Ninguna es un umbral
   ni un plazo**: los dos únicos números del apartado, los diez pasos y los 30 días, los dan §9 y
   §127 y no hay nada que decidir sobre ellos.

   1. **El asistente no bloquea nada** (RN-CIC-01). §9 dice "completa progresivamente", así que un
      espacio recién aprobado funciona entero desde el primer minuto y los diez pasos son una lista
      de tareas pendientes. La alternativa —no dejar recibir una solicitud hasta subir un
      logotipo— no la pide la maestra en ninguna parte.
   2. **Seis pasos se saben por el dato y cuatro no** (RN-CIC-02). Zona horaria, impuestos,
      notificaciones y seguridad tienen ya un valor de partida (`Europe/Madrid`, 21 %, todos los
      avisos activados, 2FA opcional), y en la base no hay nada que distinga "el valor por
      omisión" de "mirado y decidido". Se completan con **una confirmación del propietario**, que
      es un hecho con actor y fecha; dar por hecho el valor por omisión sería exactamente el dato
      de relleno que CLAUDE.md prohíbe.
   3. **Los seis derivados también se pueden confirmar**, y el origen se guarda y se enseña. Un
      espacio que no quiere logotipo marca el paso, y la pantalla dice "confirmado por el
      propietario", no "hecho".
   4. **Solo el propietario ve y confirma el asistente** (RN-CIC-03). §9 no nombra a nadie más. El
      trabajo de cada paso lo sigue haciendo quien ya podía hacerlo: no se inventa ningún permiso.
   5. **Terminar el onboarding se sella una vez** (RN-CIC-04). Archivar después el único
      establecimiento no devuelve el espacio al asistente: es un hecho del pasado (§3.4).
   6. **Transferir la propiedad la mueve, no la duplica** (RN-CIC-05): el destinatario pasa a
      propietario y **quien transfiere pasa a administrador de mantenimiento**, dentro del espacio.
      Si lo que se quiere es un segundo propietario, eso es cambiar el rol de un miembro y se hace
      por donde se cambian los roles. **Es la lectura más discutible de las trece** y la que más
      conviene confirmar o cambiar.
   7. **El destinatario tiene que ser un miembro activo del espacio** (RN-CIC-05). Dársela a quien
      todavía no está dentro es invitar, e invitar ya tiene su camino (HU-03).
   8. **"Al menos un propietario" lo sostiene un disparador** y no una función (RN-CIC-06): la
      política de `space_memberships` deja al propietario escribir esa tabla directamente por
      PostgREST, así que una comprobación dentro de una función la esquiva un `update` de una línea.
   9. **El archivado del propietario es un modo más del espacio** (RN-CIC-07), `archived_by_owner`,
      y hereda la solo lectura de RN-SUB-08 sin tocar nada. Lo que **no** hereda es la reactivación
      por pago: aquí no hay deuda, así que pagar no resucita nada.
   10. **Dentro de los 30 días restaura el propietario; pasados, la plataforma** (RN-CIC-08), igual
      que la reactivación tardía de RN-SUB-09.
   11. **La exportación es un único JSON, generado en el servidor y entregado como descarga firmada
      y caducable** del bucket privado de los archivos (RN-CIC-10). La maestra no dice ni formato
      ni entrega. Lo que no es una lectura es dónde se arma: en el cliente, nunca.
   12. **Las diez confirmaciones de pasos no se copian a la auditoría** una por una (RN-CIC-13).
      Viven en su propia tabla inmutable con actor y fecha; duplicarlas ahogaría la auditoría del
      espacio en ruido de lista de tareas. Transferir, archivar, restaurar, exportar y terminar el
      onboarding sí dejan apunte.
   13. **Los dos avisos nuevos son obligatorios** (RN-CIC-15): `space_ownership_transferred` y
      `space_archived_by_owner`. Uno es un cambio sensible (§137) y el otro es una pérdida de
      acceso para todo el equipo, y RN-NOT-03 dice que ninguna de las dos cosas se puede apagar.

   **Lo que esta pendiente NO incluye**, porque no es una lectura sino un placeholder de la
   pendiente 20: que a los 30 días **no se borre nada** y que **el cierre de cuenta no se
   implemente**. Las dos son del bloque legal y se dicen en RN-CIC-09 y RN-CIC-12 tal cual.

22. ~~Lecturas aplicadas al implementar el panel, Modo soporte y la 2FA~~ — confirmadas las
   catorce el 15/09/2026 como decisión 33. Se conservan abajo tal como se preguntaron.

   1. **Cómo se hace obligatoria la 2FA** (RN-ADM-02): cerrando la plataforma, no el login. Sin
      sesión `aal2`, Bosco entra en Restavor como un propietario cualquiera y ninguna función de
      plataforma responde; la alternativa —no dejarle entrar en nada— castigaría a Restavor por
      una regla de Cuotly.
   2. **Un Administrador de Cuotly lee el panel entero** aunque no tenga ningún permiso fino; §167
      solo reparte tres acciones y leer no es ninguna de ellas.
   3. **"Soporte" en los doce bloques de §128 es Modo soporte (§129)**, no las incidencias de
      §131, que son el bloque "incidencias" y llegan con el Hito 21.
   4. **Los tres niveles de acceso**: `read` (ver sin escribir nada), `admin` (como un administrador
      sin permisos concedidos) y `owner` (como el propietario **salvo invitar o añadir personas**,
      que es lo único que dejaría un acceso vivo después de la sesión).
   5. **La duración**: de 15 a 240 minutos, 60 si no se dice. Un número que la maestra no da.
   6. **No se abre soporte sobre un espacio del que ya se es miembro**: se entra como quien se es.
   7. **Una sesión activa por persona y espacio.** Pulsar dos veces devuelve la misma.
   8. **Caducar no escribe apunte**: en ese instante no ocurrió nada. Abrir y cerrar sí lo dejan,
      y el cierre lleva la duración.
   9. **El propietario del espacio ve la identidad de quien entró** y recibe un aviso que no puede
      desactivar. §129 dice "identidad visible en auditoría" y P7 no aplica: Cuotly no es el
      equipo de mantenimiento del espacio.
   10. **Los administradores y trabajadores del espacio NO ven las sesiones ni sus apuntes**: la
      familia `support` va a `manage_space`, como la composición del equipo.
   11. **Ingresos es una cifra de libro por mes** —pagos confirmados menos reversiones—, no una
      factura. Confirmar esto es confirmar el placeholder, no el bloque legal (pendiente 20).
   12. **En un espacio archivado el soporte también es solo lectura**: el disparador de la 90 mira
      si hay identidad de persona, y la hay.
   13. **Los avisos por dispositivo nuevo de §137 no se implementan** hasta decidir qué es "un
      dispositivo". Los límites por intentos fallidos los aplica Supabase Auth con su configuración.
   14. **La política de escritura directa sobre `platform_roles` de la Fase 1 se retira**: nombrar
      y retirar Administradores de Cuotly pasa por función, con auditoría.

21. ~~Lecturas aplicadas al implementar la suscripción de Cuotly~~ — confirmadas las doce el
   15/09/2026 como decisión 32.

20. ~~Los cuatro puntos del bloque legal que toca la Fase 4~~ — cerrada el 16/09/2026 como
   decisión 38: nada se elimina a los 30 días, se conserva todo, el incidente de seguridad es un
   evento de estado con aviso obligatorio (RN-ADM-13) y las facturas las preparará un agente aparte.
   Se conserva abajo tal como se preguntó. (§170.1). La eliminación de datos a
   los 30 días tras el archivado, qué son los "registros que deban conservarse por obligaciones
   legales" y dónde quedan aislados, el procedimiento ante un incidente de seguridad (§142) y la
   numeración fiscal de lo que Cuotly le cobra a un espacio. Los cuatro siguen necesitando la
   revisión profesional que CLAUDE.md exige. **Hitos 18 y 20.** *El Hito 18 dejó el placeholder
   dicho: guarda la fecha límite de los 30 días y no elimina nada; emite una referencia bancaria y
   ninguna factura. El Hito 20 dejó los otros dos: al archivar un espacio se **programa** la
   eliminación —fecha guardada y enseñada, ningún borrado— y el cierre de una cuenta personal
   **no se implementa**; lo que sí entrega es la comprobación de §141, que dice qué lo impide
   (RN-CIC-09 y RN-CIC-12).*

19. ~~Cómo se identifica un "negocio"~~ — cerrada el 16/09/2026 como decisión 38: el mismo NIF o el
   mismo dominio de correo no público (RN-PLA-09, migración 95). Se conserva abajo tal como se
   preguntó. Para "una sola prueba gratuita por persona o negocio"
   (§4.4). Persona se sabe identificar; negocio no: ¿por los datos fiscales de la solicitud, por el
   dominio del correo, a mano al aprobar? Sin una respuesta, la regla antiabuso no se puede
   comprobar en el servidor — y las reglas que solo viven en la pantalla se saltan solas, que es lo
   que CLAUDE.md dice con "ocultar un botón no es un control de acceso". **Hito 18.** *El Hito 18
   no la tocó: la comprobación por negocio sigue sin fingirse (RN-PLA-09).*

18. ~~El precio del almacenamiento adicional~~ — cerrada el 16/09/2026 como decisión 38: no hay
   precio; pasarse se presupuesta aparte, y el 100 % avisa a Cuotly (RN-SUB-13, migración 95). Se
   conserva abajo tal como se preguntó. Ya estaba aplazado en CLAUDE.md y ahora tiene fecha:
   Pro incluye 20 GB y Agency 100 GB (§113), y qué pasa al llegar a 21 no está escrito en ninguna
   parte. **Hito 18.** *El Hito 18 lo mide (`cuotly_space_usage()`) y no lo limita ni lo cobra
   (RN-SUB-13).*

17. ~~Qué es "uso razonable"~~ — cerrada el 16/09/2026 como decisión 38: sin umbral, lo controla
   Bosco desde el panel; lo que se vigila es el almacenamiento (80 % y 100 %). Se conserva abajo tal
   como se preguntó. En Agency (§4.3). La maestra describe bien el procedimiento ante un
   uso anormal —se informa, Bosco revisa, se plantea ampliación o plan específico, no se bloquea sin
   comunicación— pero **no da ningún umbral**, y "ilimitado bajo uso razonable" sin número no se
   puede medir. Es exactamente la situación de los umbrales de oportunidades antes de la decisión
   26, y se resolverá igual: los escribe quien esto redacta, los confirma o los cambia Bosco.
   **Hito 18.** *El Hito 18 no mide ninguna actividad: Agency no tiene límite en el servidor
   (RN-SUB-03, RN-SUB-13). El procedimiento de §4.3 es material del panel del Hito 19.*

16. ~~Lecturas aplicadas al implementar los informes~~ — cerradas el 14/09/2026 como decisión
   28, con dos confirmadas y dos cambiadas por Bosco.

15. ~~Lecturas aplicadas al implementar las oportunidades~~ — confirmadas el 14/09/2026 como
   decisión 27.

14. ~~Lecturas aplicadas al implementar los adaptadores y las pantallas de integraciones~~ —
   confirmadas el 14/09/2026 como decisión 25.

13. ~~Lecturas aplicadas de §115 a §122 al implementar las integraciones~~ — confirmadas el
   14/09/2026 como decisión 24.

12. ~~Lecturas menores de §84 al implementar los presupuestos~~ — confirmadas el 13/09/2026
   como decisión 23 (14/09/2026).

11. ~~Quién acepta un presupuesto por el restaurante~~ — resuelta el 13/09/2026 como decisión 21.

10. ~~La ventana de la corrección mínima de Menú Diario~~ — confirmada en 72 h de reloj el
   14/09/2026 como decisión 22.

9. **Redondeo de consumos prorrateados — resuelto por el PRD** (01/09/2026). Este punto
   quedó abierto porque el dinero se redondea a 2 decimales (decisión 7) pero los consumos
   son unidades enteras. Al implementar el §6.4 se vio que **el PRD ya lo cierra**:
   RN-COM-18 dice `unidades_extra(cat) = techo(...)`, es decir, **al alza, a favor del
   cliente**, y añade que si sale negativo se trata como 0 ("una mejora nunca quita
   consumos"). No hizo falta inventar nada: se implementó eso y está cubierto por tests que
   citan la regla. Como manda `CLAUDE.md`, el PRD manda sobre la Especificación Maestra.

66. **Un error de configuración no gasta los intentos de la cola** (21/09/2026). No es una
    decisión de producto sino de diseño, y se escribe porque costó once días de correo
    perdido descubrirla. Del 10 al 21/09/2026 `RESEND_FROM` en producción tenía un valor que
    Resend rechaza con un 422 de formato. Los 211 avisos encolados fueron fallando uno a uno
    y **nadie se enteró**: el aviso dentro de Cuotly sí llegaba, y la cola contestaba 200 con
    un `sent: 0` indistinguible de "hoy no había nada que mandar".

    Lo grave no era que no salieran, sino que se estaban **muriendo**.
    `claim_notification_deliveries` hace `attempts + 1` al **reclamar** la fila, no al fallar,
    y `MAX_DELIVERY_ATTEMPTS` son 5. Cada pasada del cron acercaba veinte avisos buenos a
    `dead` por un remitente mal escrito que reintentar no iba a arreglar nunca. Iban por tres.

    La regla que queda: **si el transporte no puede enviar por cómo está configurado, no se
    reclama nada.** La comprobación va antes de reclamar, no antes de enviar, porque reclamar
    es lo que gasta el intento. `MailTransport` gana un `unusableReason()` opcional y
    `DrainResult` un `blockedBy` que dice por qué no se intentó nada.

    Dos consecuencias que conviene haber decidido a propósito y no descubrir luego:

    - **La tanda entera espera, también el push.** La cola mezcla los dos canales y
      `claimDeliveries` no distingue: reclamar para salvar el push gastaría igualmente el
      intento de las filas de correo de la misma tanda. Se elige el lado seguro, y además
      hace la avería imposible de no ver.
    - **El remitente se recorta, pero no se adivina.** Un salto de línea al final se quita
      —es un despiste de copiar y pegar, no una decisión de nadie— pero unas comillas
      alrededor del valor o un `<` sin cerrar se rechazan y se dicen. "Corregir" suponiendo
      qué quiso poner quien lo escribió esconde el problema en vez de resolverlo.

    Y el motivo sale arriba del cuerpo de `/api/cola` y en el registro del servidor, que es
    donde mira quien va a averiguar por qué no llegan los correos.

    Los 183 envíos que iban a `cuotly.test` —de los datos sembrados, a un dominio que no
    puede recibir— se cerraron a mano como `dead` con su motivo **antes** de arreglar la
    variable: soltar la cola entera le habría metido a Resend 183 rebotes duros seguidos en
    una cuenta recién abierta. Los 28 que van a una dirección real siguen vivos y serán la
    primera prueba de verdad de Resend.

67. **El DNI, CIF o NIF en la solicitud de acceso, y la dirección de contacto** (22/09/2026).
    Bosco, al revisar el diseño de la puerta de entrada (F01, A01 a A12):

    - **La solicitud pide seis campos**: nombre y apellidos, nombre del negocio, teléfono,
      correo electrónico, **DNI/CIF/NIF** y un comentario opcional. Los cinco primeros son
      obligatorios. RN-ACC-02 decía cinco campos y cuatro obligatorios; se ha reescrito.
    - **La dirección de contacto de Cuotly es `info@restavor.com`.** Es la de "Contactar con
      Cuotly" en A03 y A04, y la de "Ayuda" para quien no tiene sesión (el centro de ayuda pide
      entrar). Vive en `apps/web/src/core/contact.ts`.

    Cómo se llevó (migración 125, `el_nif_en_la_solicitud_de_acceso`):

    - `access_requests.tax_id` **admite nulo**, porque un `not null` impediría decidir las
      solicitudes anteriores. La obligación la pone `submit_access_request()`, que es la única
      puerta de entrada, y cuya firma de cinco argumentos **se borró**: si siguiera viva, la
      regla sería de la pantalla. En producción había 0 solicitudes al aplicarla.
    - Se guarda **sin espacios, puntos ni guiones y en mayúsculas**, en la base y en
      `normalizeTaxId()`, para que quien revisa lo busque de una sola forma.
    - **No se comprueba la letra de control ni la forma.** No está decidido qué documentos se
      aceptan, y uno extranjero no tiene la forma española: se exige que haya algo. Si se
      quiere validar DNI, NIE y CIF españoles, es una decisión aparte.
    - Lo ve quien revisa solicitudes (`is_platform_approver()`). El seguimiento por enlace con
      clave **no** lo devuelve: un enlace se reenvía.

68. **El DNI, CIF o NIF se comprueba, sea del país que sea** (22/09/2026). Bosco, sobre la
    decisión 67: "controla que el DNI exista, no tiene por qué ser español, pero controla que
    sea real". Se le explicó lo que se puede comprobar y eligió **cálculo de control + VIES**.

    - **Lo que no se puede:** ningún registro público dice si un documento de identidad
      pertenece a una persona, ni en España ni fuera. El servicio de Hacienda que comprueba NIF
      exige el certificado digital de la empresa y solo vale para España.
    - **Lo que sí:** el cálculo de control de cada documento (España: DNI, NIE, NIF de K, L y M,
      y CIF; Portugal: NIF; Países Bajos: BSN; Bélgica: número nacional y de empresa). Si no
      cuadra, **se rechaza** con "Este documento no es válido para ese país". Para los números de
      IVA de empresas de la UE fuera de España, **VIES**, que además devuelve el nombre
      registrado para compararlo con el negocio.
    - **Lo que no se puede confirmar entra marcado**, no rechazado: un país sin cálculo y fuera
      de VIES, VIES que no encuentra el número y no hay cálculo, o VIES caído. Quien revisa lo ve
      en ámbar con "Revisar" y el motivo. Rechazarlo dejaría fuera a gente real.
    - **No se inventa ningún cálculo.** Solo están los que se conocen con certeza, probados con
      números calculados aparte. Añadir un país es añadir su cálculo con sus números de prueba.
    - **La comprobación vive en el servidor de Cuotly**, porque VIES no se puede consultar desde
      la base. Por eso `submit_access_request()` pasa a ser **solo de `service_role`**
      (migración 126): abierta, cualquiera la llamaría con un documento falso "ya comprobado".
      La web y el teléfono pasan por el mismo código (`src/services/access-request.ts`); el
      teléfono, por `/api/movil/solicitud-acceso`. La base sigue exigiendo el país, una de las
      cinco comprobaciones conocidas, y que un documento español solo entre comprobado por
      cálculo.
    - Se elige el país en un desplegable (España por defecto, los 249 de ISO con su nombre en
      español); en el teléfono, "España" u "Otro país" con su código de dos letras.
    - **VIES comprobado en vivo** (22/09/2026, a petición de Bosco). Este entorno no llega a
      `ec.europa.eu`, así que se consultó desde un sandbox de Vercel en París (proyecto
      `cuotly-web`, salida solo a `ec.europa.eu`, apagado al terminar), con una copia literal de
      `src/services/vies.ts`. Resultado: Google Ireland (`IE6388047V`) → **encontrada**, con su
      nombre; `PT123456789`, bien formado pero no dado de alta → **no encontrado**; Alemania →
      **no se sabe**, porque su servidor contestaba `MS_UNAVAILABLE` **con un 200**, que es
      justo el caso que el adaptador trata como "no se sabe" y no como "no existe". Esas tres
      respuestas reales quedan fijadas en `vies.test.ts`.

69. **Las facturas las hará un agente de facturas; Finanzas le deja el sitio** (23/09/2026).
    Bosco, al revisar M16 y M17, sobre la pestaña "Facturas" del dibujo (M52): "deja un espacio
    de facturas para cuando cree el agente de facturas poder conectarlo".

    - **La pestaña existe y dice la verdad**: "Las facturas todavía no están conectadas", con el
      motivo y dónde están mientras tanto los cobros. Sin facturas de ejemplo (CLAUDE.md).
    - **Un solo punto de conexión**: `loadSpaceInvoices()` en `src/services/invoices.ts`. Hoy
      devuelve `not_connected`; conectar el agente es añadir ahí la variante con sus facturas, y
      la pestaña la pinta. Pide `manage_finance`, como el resto de Finanzas (CA-03).
    - **No resuelve el bloque fiscal.** La numeración, la serie, el receptor y los impuestos de
      una factura siguen aplazados (CLAUDE.md, "No inventes lo que está pendiente"): no se ha
      creado ninguna tabla ni se ha fijado la forma de una factura. Lo decidirá quien construya
      el agente, con esas reglas delante.

70. **Planes y servicios: primero las pantallas, la edición cuando haya reglas** (23/09/2026).
    El diseño de Planes (M21, M53, M54) dibuja crear, editar y archivar planes y servicios con
    precio, cuotas y "Crear nueva versión", y la comparativa de versiones (M55) compara cifras.
    Cuotly solo versiona el texto de las condiciones (RN-DAT-07, migración 75); el precio y las
    cuotas no tienen versión, y la maestra (§102–104) describe cómo debería ser sin que el PRD
    tenga ninguna regla `RN-` que lo concrete. Bosco eligió: "Pantallas ahora, edición después".

    - **Se hicieron las pantallas con lo que existe**: la lista y la ficha de cada plan, el
      catálogo de servicios, las versiones de las condiciones (historial, qué cambió frente a la
      anterior, en qué versión está cada restaurante y publicar la siguiente) y la asignación y
      cambio de plan de cada restaurante con las reglas de §6.4.
    - **Crear, editar y archivar planes y servicios no se ofrece**, y las pantallas lo dicen con
      su motivo. Tampoco se editan filas de `plans` o `services` por ningún otro camino de la
      aplicación.
    - **La propuesta de reglas** está en `docs/PROPUESTA-EDICION-DE-PLANES.md`, con una propuesta
      concreta por punto y una pregunta abierta (qué pasa si el restaurante no acepta una versión
      que le perjudica). Cuando Bosco la decida, se escribe aquí y en el PRD antes de programar.

71. **Los datos viejos de una fuente se enseñan como viejos, no se esconden** (23/09/2026). Lectura
    de RN-INT-07 ("se indica la fecha de última sincronización; nunca se presenta información
    desactualizada como actual") al construir A16, "Error de sincronización".

    - Hasta ahora una fuente con error o con el dato viejo dejaba su sección en blanco, con el
      motivo. A16 dibuja lo contrario: la franja roja con "Datos desactualizados" y, debajo,
      "Últimos datos disponibles". Las dos cosas caben en la regla, que prohíbe hacer pasar lo
      viejo por actual, no enseñarlo.
    - Por eso los últimos datos van **siempre** con la franja, la insignia, la fecha de la última
      sincronización correcta y el día hasta el que llegan, y **sin la variación** frente al
      periodo anterior: con la ventana a medias, la comparación diría una caída que no ha pasado.
    - Sin puntos en la ventana, se sigue diciendo el motivo y no se pinta ninguna cifra.
    - No hay "Reintentar sincronización": CLAUDE.md prohíbe "Sincronizar ahora" en las
      integraciones analíticas. El remedio que se ofrece es "Revisar conexión".

72. **Editar planes y servicios: reglas fijadas, opción A** (23/09/2026). Bosco acepta la propuesta de
    `docs/PROPUESTA-EDICION-DE-PLANES.md` tal como está y elige la **opción A** del punto 4. Queda
    escrita como RN-COM-19 a RN-COM-30 (PRD §6.5) y levanta el "pendiente" de la decisión 70.

    - Cambia de versión lo que el restaurante contrata (precio, cuotas, plazos, prioridad, nivel,
      vigilancia); el nombre y la descripción se corrigen en el sitio. Un plan sin restaurantes se
      edita en el sitio.
    - Los clientes pasan en su primera renovación a 30 días o más de publicar la versión, sin
      reiniciar la permanencia.
    - Lo que les favorece solo se avisa; lo que les perjudica en algo pide aceptación.
    - **Opción A:** quien no acepta un cambio que le perjudica **sigue en la versión que aceptó**,
      marcado "en versión anterior", y el propietario decide. Nunca se cobra una versión no aceptada.
      Se descartó la B (pasar igualmente con la aceptación pendiente) porque cobraría un precio más
      alto sin consentimiento.
    - Archivar solo quita de las altas; nada se borra; los trabajos aceptados no se reescriben.
    - Si Bosco cambia desde la aplicación un precio que fija CLAUDE.md (decisión 39, Menú Diario),
      esas líneas se actualizan el mismo día.
    - **Cómo se programó (migración 131).** Cada versión es una fila nueva de `plans`/`services` con
      el mismo `lineage_id`; la suscripción apunta a la versión que tiene. Así todo lo que ya leía
      el contrato por `subscriptions.plan_id` (mensualidad, bolsa, plazos, prioridad, informe)
      sigue diciendo la verdad sin tocarlo. Las condiciones pasan a colgar del linaje.
    - **Una lectura que había que hacer:** el turno en la cola (`queue_rank`) crea versión, pero
      **no cuenta** para decidir si perjudica ni se le enseña al restaurante: RN-COM-03 dice que el
      cliente no lo ve, y no se le puede pedir que acepte lo que no se le enseña.

73. **Crear una solicitud en nombre del restaurante (M77)** (23/09/2026). La pantalla M77 del diseño
    definitivo se había dejado fuera (entrada del 23/09 de `docs/diseno/PLAN-ESCRITORIO.md`) porque
    `create_request_draft()` exige ser del restaurante. Bosco decide hacerla, con el patrón de la
    decisión 21. Queda escrita como **RN-REQ-08** (PRD §9) y la programa la **migración 132**.

    - **Quién:** propietario y administradores del espacio (`manage_requests`). Un trabajador no.
    - **Sin borrador:** se crea y se envía en un paso. No se copia "Guardar borrador" del dibujo.
    - **Motivo obligatorio** (cómo y cuándo lo pidió el restaurante), marca en la fila, auditoría con
      `on_behalf_of_client` y aviso a los propietarios del restaurante. El restaurante ve que lo
      creó el Equipo de mantenimiento, no quién.
    - **La aceptación sigue siendo del restaurante.** No se abre ninguna aceptación en su nombre
      fuera de la del presupuesto.
    - **La "Categoría sugerida" del dibujo sustituye a la IA** cuando el equipo la elige
      (`source = 'team'`), y pasa igualmente por validación interna.
    - **Dos cosas que salieron al programarlo.** (1) `requests.created_by` y
      `request_versions.created_by` los lee el restaurante por columna, porque hasta ahora siempre
      eran suyos: en una solicitud del equipo quedan vacíos, y quién fue sale de `audit_log`.
      (2) `accept_request()` dejaba al propietario y a los administradores aceptar por RPC cualquier
      propuesta **sin presupuesto**: la excepción de la decisión 21 comparaba con un estado de
      presupuesto nulo y el `if` no saltaba. Se corrige en la misma migración.
    - **La misma fuga, por la ruta de los presupuestos (migración 133).** Responder un presupuesto en
      nombre del restaurante (decisión 21) escribía la identidad del administrador en tres columnas
      que el restaurante lee: `requests.created_by` (cuando `accept_quote()` crea la solicitud),
      `requests.accepted_by` y `acceptances.accepted_by`. Ahora quedan vacías cuando es el equipo, y
      la solicitud que nace así va marcada como creada en su nombre con el motivo de la aceptación.
      La suite 74 recorre todas las rutas "en su nombre" y barre, sentada como el restaurante, toda
      columna uuid y de texto: el barrido de hito7 no las veía porque su fixture no tenía filas así.

74. **Grupos: crear, renombrar y mover un restaurante de grupo (M82)** (23/09/2026). La pantalla M82
    del diseño definitivo tiene "Crear grupo", "Editar grupo" y "Asignar establecimiento", y se había
    dejado fuera (entrada del 23/09 de `docs/diseno/PLAN-ESCRITORIO.md`) porque mover un restaurante
    de grupo cambia accesos (RN-EST-03) y no había regla. Bosco las fija. Quedan escritas como
    **RN-EST-20** (PRD §15) y las programa la **migración 135**.

    - **Un grupo se puede crear vacío**, con su nombre y, si se quiere, una descripción. Sirve para
      preparar un cliente antes de dar de alta sus locales; los datos y los accesos se rellenan
      después. Lo crean el propietario y los administradores del espacio (`manage_clients`).
    - **Renombrarlo es libre**, y editar su descripción también. Mismas personas.
    - **Mover un restaurante de grupo** lo pueden hacer **el equipo** (propietario y administradores
      del espacio) **o el propietario del restaurante** (propietario local o propietario global de su
      grupo).
    - **Quien tenía acceso por el grupo de origen elige**: **quedarse como Editor** de ese restaurante
      o **perder el acceso**. Lo elige quien hace el cambio, y vale para todos los que entraban por el
      grupo de origen (propietarios y editores de grupo) y no siguen entrando por otra vía.
    - **El grupo de destino gana acceso en el mismo momento.** No hay nada que conceder: el acceso de
      un grupo a sus restaurantes se deriva del grupo (RN-EST-03).

    **Tres cosas que se añadieron al programarlo, y se pueden cambiar:**

    - **A dónde puede moverlo el restaurante.** El equipo, a cualquier grupo del espacio. El
      propietario del restaurante, **solo a un grupo del que también sea propietario global**: si
      pudiera meterlo en un grupo ajeno estaría dando su restaurante a desconocidos, y además no ve
      los grupos de otros clientes. Si el local cambia de dueño, lo mueve el equipo.
    - **Con qué permisos se queda quien pasa a Editor.** Con los operativos que ya usaba —crear
      solicitudes, editar menús, mensajes, subir archivos y consultar informes— y **sin** los de
      propietario —pagos y facturas, usuarios y accesos, y editar los datos del restaurante—. Es el
      mismo criterio de la migración 107 ("se les concede lo que ya tenían"), y el nuevo propietario
      los ajusta en Permisos.
    - **Los accesos del propio restaurante no se tocan**: un propietario local o un Editor de ese
      restaurante sigue igual, porque su acceso es del restaurante y no del grupo.

    Lo demás, por coherencia: el restaurante se lleva sus archivos (`files.group_id`) y sus informes
    individuales; los informes **consolidados** del grupo de origen se quedan en él, porque son
    historia de ese grupo. Mover al mismo grupo no hace nada, y crear dos veces con la misma clave
    crea un solo grupo (CLAUDE.md). Todo deja auditoría con actor, valor anterior y nuevo.

75. **En solo lectura se siguen pudiendo corregir la ficha y los accesos (M74)** (24/09/2026). El
    dibujo de M74 pone en "Qué no puedes hacer" "Modificar la información del restaurante" y
    "Cambiar configuraciones o permisos". Bosco decide que **no hace falta bloquearlo**: solo
    lectura (RN-EST-10) detiene el servicio —solicitudes, trabajos, Menú Diario, presupuestos y
    cambio de plan, lo que cierra `assert_establishment_service_running()`—, pero corregir un dato
    de contacto o retirar un acceso no le da servicio a nadie y puede hacer falta justo en esas 24 h.
    Consecuencias: el servidor no cambia, la pantalla enseña en "Qué no puedes hacer" solo lo que la
    guarda cierra, y "Editar restaurante" sigue en la cabecera en lugar del candado del dibujo.

76. **El diseño móvil se aplica a la web en el teléfono** (24/09/2026). `Cuotly_movil.pdf` es el
    producto entero a ancho de teléfono, no una app reducida, y había dos sitios donde aplicarlo:
    la web (`cuotly-web`), que ya tiene todas esas pantallas con sus datos y la barra inferior de la
    decisión 47, o la app de Expo (`cuotly-movil`), que tiene 29. Bosco elige **la web**: el trabajo
    es de forma, pantalla a pantalla, sin construir nada nuevo ni duplicar cada pantalla en dos
    códigos. La app de Expo se decide aparte, cuando toque llevarla a las tiendas (paso 7 de la
    decisión 37). El plan está en `docs/diseno/PLAN-MOVIL.md`.
