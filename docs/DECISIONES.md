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

---

### Pendiente de completar (no bloquea la Fase 1)

**Una abierta**, la 15. Las catorce anteriores están cerradas y quedan tachadas abajo con la decisión
que las resolvió.

15. **Lecturas aplicadas al implementar las oportunidades (Hito 15, 14/09/2026).** La decisión 26
   fijó los umbrales, el impacto y el esfuerzo, que era lo que bloqueaba el hito. Al escribirlo
   aparecieron cinco huecos más pequeños que §96 a §101 no cubren y que se han resuelto del modo más
   corto, con su motivo al lado. **No hace falta hacer nada**: las cinco están implementadas y con
   test; lo que se pide es que Bosco las confirme o diga otra cosa, como con las pendientes 13 y 14.

   (a) **La "categoría" de §96** (un campo que la maestra pide y no enumera) son las **cinco áreas**
   en que caen las nueve reglas: tráfico, búsqueda, rendimiento, técnico y conversión. Ninguna más.

   (b) **La "prioridad propuesta" de §96** sale del impacto: alto 1, medio 2, bajo 3, y 1 es lo
   primero. Como el impacto y el esfuerzo, es editable (§96), y ordenar la lista es cambiarla.

   (c) **Qué impacto propone cada regla.** La decisión 26a define los tres niveles por lo que toca el
   problema; aplicarlos regla a regla es esto: alto para el error técnico (es la única que dice que
   algo está **roto**, y lo roto puede ser el formulario o la reserva), para la baja conversión móvil
   (convertir **es** el camino de contacto) y para los botones de la ficha de Google (son literalmente
   el teléfono, cómo llegar y la web); alto también para un descenso de tráfico **del 50 % o más**
   ("más de la mitad del tráfico"), medio por debajo; medio para la lentitud, las imágenes pesadas y
   los clics que no responden; bajo para las tres reglas que hablan de **una consulta**.

   (d) **"Otro periodo" en §99** —"puede reaparecer si empeora o vuelve a cumplirse en otro
   periodo"— se lee como una ventana que **ya no se solapa** con la que se descartó. La alternativa
   literal (cualquier detección posterior la reabre) haría que descartar no significara nada al día
   siguiente, porque la regla vuelve a saltar cada día con el mismo dato. Empeorar sí la reabre de
   inmediato, y al volver se indica el descarte anterior, que por eso no se borra.

   (e) **El suelo de ruido de la regla 9b** (clics muertos o de rabia sobre el 5 % de las sesiones).
   La decisión 26c le pone suelo a las demás y a esta no; se hereda el de la regla 6 —**100 sesiones**
   de Clarity—, que divide entre exactamente lo mismo. Un tanto por ciento sobre doce sesiones no es
   una señal.

   Y una consecuencia de la decisión 26 que **no** es una lectura sino un hueco de datos, dicha aquí
   porque amplía la 25c igual que lo hizo la 26d: las tres reglas "por consulta" necesitaban el CTR y
   la posición **de cada consulta**, y el catálogo solo guardaba los clics de las diez consultas con
   más clics de cada día. Se han añadido `impressions_by_query`, `ctr_by_query` y `position_by_query`,
   que salen de la misma respuesta de Search Console que ya se pedía.

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
