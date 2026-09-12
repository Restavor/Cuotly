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

---

### Pendiente de completar (no bloquea la Fase 1)

9. **Redondeo de consumos prorrateados — resuelto por el PRD** (01/09/2026). Este punto
   quedó abierto porque el dinero se redondea a 2 decimales (decisión 7) pero los consumos
   son unidades enteras. Al implementar el §6.4 se vio que **el PRD ya lo cierra**:
   RN-COM-18 dice `unidades_extra(cat) = techo(...)`, es decir, **al alza, a favor del
   cliente**, y añade que si sale negativo se trata como 0 ("una mejora nunca quita
   consumos"). No hizo falta inventar nada: se implementó eso y está cubierto por tests que
   citan la regla. Como manda `CLAUDE.md`, el PRD manda sobre la Especificación Maestra.
