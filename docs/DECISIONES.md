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

---

### Pendiente de completar

**Cinco abiertas, todas de la Fase 4.** Las dieciséis de las fases 1 a 3 están cerradas; quedan
tachadas abajo con la decisión que resolvió cada una. Cuatro salieron al desglosar la Fase 4 el
15/09/2026 y **no se inventan**: cada una se pregunta cuando llegue su hito. La quinta son las
lecturas del Hito 18, que esperan confirmación como esperaron las de los hitos anteriores.

21. **Lecturas aplicadas al implementar la suscripción de Cuotly** (15/09/2026, Hito 18, PRD §31,
   migración 90). §4.1 a §4.7 callan en doce sitios y en los doce se eligió lo más defendible, se
   escribió como regla en el PRD y se pregunta aquí. Ninguna es un umbral inventado que la maestra
   sí diera; todas son huecos.

   **(1)** Cuenta como **establecimiento activo** todo el que no está archivado (§4.1 solo distingue
   activos de archivados), y como **usuario interno** todo miembro activo del espacio, propietario
   incluido. **(2)** Los **adicionales de Pro son explícitos**: los contrata el propietario como
   enteros, y el sexto establecimiento sin adicional falla en el servidor; no se añaden solos a la
   factura. **(3)** Subir un adicional se cobra **en proporción al periodo restante** (la misma
   cuenta que RN-COM-18); bajar es inmediato para el límite, nunca por debajo del uso, y sin
   devolución. **(4)** La **primera mensualidad se emite al aprobar** y vence al acabar la prueba:
   así hay importe, concepto y referencia desde el día uno. **(5)** La mensualidad siguiente se
   emite **7 días antes** de la renovación y vence el día de la renovación. **(6)** El quinto aviso,
   "antes de las 72 h", va a las **60 h**: 12 h de margen antes del corte. **(7)** Un **pago declarado
   y pendiente de confirmar detiene el corte** hasta que Cuotly lo confirme o lo rechace: cortar a
   quien dice "ya he pagado" sería bloquear sin comunicación (§4.3). **(8)** **Durante la prueba no
   se cambia de plan ni se contratan adicionales**: §4.4 dice que el plan se elige antes de empezar,
   y el tope de la prueba es otro. **(9)** Pasado el plazo de 30 días, el pago se registra igual pero
   **la reactivación es de la plataforma**, con motivo; la eliminación operativa no se implementa
   (pendiente 20). **(10)** "+ IVA" se aplica al **21 %**, congelado en cada cobro; lo emitido es un
   cobro con referencia bancaria, no una factura (pendiente 20). **(11)** El **modo lectura congela a
   las personas, no a los procesos**: la cola sigue emitiendo, avisando y cortando a los restaurantes
   del espacio archivado, porque sus contratos son con el espacio y no con Cuotly. **(12)** Con un
   cambio a Pro programado, **rigen ya los límites de Pro para crecer**, para que en la renovación no
   haya exceso que resolver (§4.7). **Bosco confirma, cambia o rechaza cada una.**

20. **Los cuatro puntos del bloque legal que toca la Fase 4** (§170.1). La eliminación de datos a
   los 30 días tras el archivado, qué son los "registros que deban conservarse por obligaciones
   legales" y dónde quedan aislados, el procedimiento ante un incidente de seguridad (§142) y la
   numeración fiscal de lo que Cuotly le cobra a un espacio. Los cuatro siguen necesitando la
   revisión profesional que CLAUDE.md exige. **Hitos 18 y 20.** *El Hito 18 dejó el placeholder
   dicho: guarda la fecha límite de los 30 días y no elimina nada; emite una referencia bancaria y
   ninguna factura.*

19. **Cómo se identifica un "negocio"** para "una sola prueba gratuita por persona o negocio"
   (§4.4). Persona se sabe identificar; negocio no: ¿por los datos fiscales de la solicitud, por el
   dominio del correo, a mano al aprobar? Sin una respuesta, la regla antiabuso no se puede
   comprobar en el servidor — y las reglas que solo viven en la pantalla se saltan solas, que es lo
   que CLAUDE.md dice con "ocultar un botón no es un control de acceso". **Hito 18.** *El Hito 18
   no la tocó: la comprobación por negocio sigue sin fingirse (RN-PLA-09).*

18. **El precio del almacenamiento adicional.** Ya estaba aplazado en CLAUDE.md y ahora tiene fecha:
   Pro incluye 20 GB y Agency 100 GB (§113), y qué pasa al llegar a 21 no está escrito en ninguna
   parte. **Hito 18.** *El Hito 18 lo mide (`cuotly_space_usage()`) y no lo limita ni lo cobra
   (RN-SUB-13).*

17. **Qué es "uso razonable"** en Agency (§4.3). La maestra describe bien el procedimiento ante un
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
