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

### Pendiente de completar (no bloquea la Fase 1)

9. **Redondeo de consumos prorrateados — resuelto por el PRD** (01/09/2026). Este punto
   quedó abierto porque el dinero se redondea a 2 decimales (decisión 7) pero los consumos
   son unidades enteras. Al implementar el §6.4 se vio que **el PRD ya lo cierra**:
   RN-COM-18 dice `unidades_extra(cat) = techo(...)`, es decir, **al alza, a favor del
   cliente**, y añade que si sale negativo se trata como 0 ("una mejora nunca quita
   consumos"). No hizo falta inventar nada: se implementó eso y está cubierto por tests que
   citan la regla. Como manda `CLAUDE.md`, el PRD manda sobre la Especificación Maestra.
