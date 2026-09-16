/**
 * `src/services/queue-runner.ts` — el proceso de la cola (CLAUDE.md: "los
 * adaptadores externos viven en `src/services/`").
 *
 * Es lo que el ROADMAP llevaba tres hitos diciendo como salvedad. Hasta
 * ahora `generate_monthly_charge()` y `evaluate_establishment_dunning()`
 * existían y funcionaban pero **no se disparaban solas**, los umbrales de
 * T2 y T3 no los miraba nadie, y `notification_deliveries` acumulaba
 * envíos que ningún proceso sacaba de la cola.
 *
 * Qué hace y qué no:
 *
 *   · Llena la cola antes de vaciarla (`enqueue_due_scheduled_jobs()`).
 *     No es un detalle: hasta la migración 52 nadie la llenaba, así que
 *     este proceso reclamaba trabajos de una tabla vacía y se iba.
 *   · Los barridos que solo necesitan la base de datos —mensualidades,
 *     impago, final de servicio, umbrales de consumo— los ejecuta SQL
 *     (`run_scheduled_job()`), y aquí solo se despachan.
 *   · Los umbrales de T2 y T3 los calcula ESTE proceso, porque el reloj
 *     laboral vive en `src/core/business-clock.ts` y CLAUDE.md prohíbe
 *     duplicar la lógica de dominio en SQL.
 *   · El envío de correo sale por un transporte inyectable. El de verdad
 *     es Resend; en los tests es uno falso. Por eso este archivo se puede
 *     probar entero sin clave de proveedor y sin base de datos.
 *
 * No decide nada por su cuenta: los umbrales salen de `src/core/sla-sweep.ts`,
 * la espera entre reintentos de `src/core/notifications.ts`, y la
 * idempotencia la impone la base de datos con las claves de deduplicación
 * (RN-NOT-05, CA-17). Si este proceso se ejecuta dos veces a la vez, el
 * `for update skip locked` de las funciones de reclamo hace que no se
 * pisen.
 */

import { contractualCalendar, holidaysKnownAsOf, type HolidayRecord } from "@/core/business-clock";
import { deliveryStatusAfterFailure, nextRetryDelayMinutes } from "@/core/notifications";
import { slaNotificationsDue } from "@/core/sla-sweep";
import { t2Status, t3Status } from "@/core/sla-timers";
import type { TimerEvent, TimerEventType } from "@/core/timer-events";
import type { ChangeCategory } from "@/core/classification-rules";

// ---------------------------------------------------------------------
// Lo que el proceso necesita del exterior, dicho como dos interfaces
// estrechas para poder probarlo sin Supabase y sin Resend.
// ---------------------------------------------------------------------

export interface ScheduledJobRow {
  readonly id: string;
  readonly space_id: string;
  readonly kind: string;
  readonly attempts: number;
}

export interface SlaCounterRow {
  readonly entity_type: "request" | "job";
  readonly entity_id: string;
  readonly job_id: string | null;
  readonly counter_kind: "t2" | "t3";
  readonly category: ChangeCategory | null;
  readonly start_sla_hours: number | null;
  readonly timezone: string;
  readonly events: readonly { readonly event_type: TimerEventType; readonly occurred_at: string }[];
}

export type DeliveryChannel = "email" | "push";

export interface DeliveryRow {
  readonly delivery_id: string;
  readonly notification_id: string;
  readonly attempts: number;
  /** Migración 94 (RN-MOV-04): correo o push. */
  readonly channel: DeliveryChannel;
  readonly recipient_email: string | null;
  /**
   * Los tokens vigentes del destinatario cuando el canal es push; nulo en
   * el correo. Los resuelve el reclamo en el momento del envío
   * (RN-MOV-05): un teléfono dado de baja entre el encolado y el envío ya
   * no aparece.
   */
  readonly push_tokens: readonly string[] | null;
  readonly event_type: string;
  readonly audience: string;
  readonly deep_link: string;
  readonly space_name: string;
}

export interface QueueGateway {
  /**
   * Llena la cola con los barridos de SQL que le tocan a cada espacio.
   * Deduplica por hora en la base, así que llamarla de más no encola de
   * más (CA-17).
   */
  enqueueDueJobs(): Promise<number>;
  claimScheduledJobs(limit: number): Promise<readonly ScheduledJobRow[]>;
  runScheduledJob(jobId: string): Promise<number>;
  finishScheduledJob(jobId: string, ok: boolean, error: string | null): Promise<void>;
  slaCounters(spaceId: string): Promise<readonly SlaCounterRow[]>;
  emitSlaNotification(jobId: string, event: string, thresholdPercent: number | null): Promise<number>;
  holidays(spaceId: string): Promise<readonly HolidayRecord[]>;
  claimDeliveries(limit: number): Promise<readonly DeliveryRow[]>;
  markDeliverySent(deliveryId: string, providerMessageId: string | null): Promise<void>;
  markDeliveryFailed(
    deliveryId: string,
    error: string,
    nextAttemptAt: Date,
    dead: boolean,
  ): Promise<void>;
  /**
   * RN-MOV-05 · el proveedor dice que el token ya no existe: se cierra con
   * su motivo y no se vuelve a intentar contra él.
   */
  revokePushToken(token: string, reason: "provider_rejected"): Promise<boolean>;
}

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

export interface MailTransport {
  /** Devuelve el identificador del proveedor, o lanza si el envío falla. */
  send(message: MailMessage): Promise<string | null>;
}

// ---------------------------------------------------------------------
// Push (RN-MOV-04). El mismo esquema que el correo: un mensaje compuesto
// desde i18n y un transporte inyectable. El de verdad es Expo, sobre FCM
// y APNs; en los tests es uno falso.
// ---------------------------------------------------------------------

export interface PushMessage {
  /** Todos los teléfonos vigentes del destinatario (RN-MOV-05). */
  readonly to: readonly string[];
  readonly title: string;
  readonly body: string;
  /** El enlace profundo del aviso (RN-NOT-04), que la app abre al tocarlo. */
  readonly deepLink: string;
}

/**
 * Lo que el proveedor contesta por cada token. `unregistered` es el único
 * fallo que no se reintenta: el teléfono ya no existe para el proveedor y
 * se da de baja (RN-MOV-05). Cualquier otro error es un fallo de envío
 * normal, con su espera creciente.
 */
export type PushTicket =
  | { readonly token: string; readonly status: "ok"; readonly providerId: string | null }
  | { readonly token: string; readonly status: "unregistered" }
  | { readonly token: string; readonly status: "error"; readonly message: string };

export interface PushTransport {
  /** Un ticket por token. Lanza solo si el proveedor entero no responde. */
  send(message: PushMessage): Promise<readonly PushTicket[]>;
}

export interface PushComposer {
  compose(delivery: DeliveryRow): PushMessage | null;
}

// ---------------------------------------------------------------------
// Barrido de plazos (T2 y T3).
// ---------------------------------------------------------------------

function toTimerEvents(row: SlaCounterRow): readonly TimerEvent[] {
  return row.events.map((e) => ({ type: e.event_type, occurredAt: new Date(e.occurred_at) }));
}

export interface SweepResult {
  readonly emitted: number;
  readonly skipped: number;
}

/**
 * RN-SLA-10 y RN-SLA-15. Un contador sin trabajo asociado se salta: los
 * avisos de plazo son de un trabajo concreto y `notify_job_event()` es
 * quien sabe a quién avisar (RN-NOT-01).
 *
 * RN-CLK-10: el calendario se construye con los festivos **conocidos
 * cuando arrancó el contador**, no con los de hoy. Cambiar un festivo hoy
 * no puede mover hacia atrás un plazo que ya corría.
 */
export async function runSlaSweep(
  gateway: QueueGateway,
  spaceId: string,
  now: Date = new Date(),
): Promise<SweepResult> {
  const [counters, holidayRecords] = await Promise.all([
    gateway.slaCounters(spaceId),
    gateway.holidays(spaceId),
  ]);

  let emitted = 0;
  let skipped = 0;

  for (const row of counters) {
    if (row.job_id === null) {
      skipped += 1;
      continue;
    }

    const events = toTimerEvents(row);
    if (events.length === 0) {
      skipped += 1;
      continue;
    }

    const startedAt = events
      .map((e) => e.occurredAt)
      .reduce((a, b) => (a < b ? a : b));
    const calendar = contractualCalendar(
      row.timezone,
      holidaysKnownAsOf(holidayRecords, startedAt),
    );

    let status;
    if (row.counter_kind === "t2") {
      // RN-SLA-02 y RN-COM-12: sin plan, 48 h; con Impulso o Premium, 24 h.
      // El número sale de la suscripción o del que se congeló al aceptar
      // (RN-COM-15), nunca de una suposición del cliente.
      status = t2Status(events, calendar, now, row.start_sla_hours === 24);
    } else {
      if (row.category === null) {
        skipped += 1;
        continue;
      }
      status = t3Status(events, calendar, now, row.category);
    }

    for (const due of slaNotificationsDue(row.counter_kind, status)) {
      // Emitir de más es inofensivo: la clave de deduplicación hace que el
      // segundo intento no cree nada (RN-NOT-05). Emitir de menos no lo es.
      emitted += await gateway.emitSlaNotification(row.job_id, due.event, due.thresholdPercent);
    }
  }

  return { emitted, skipped };
}

// ---------------------------------------------------------------------
// Barridos de base de datos.
// ---------------------------------------------------------------------

export interface ScheduledJobsResult {
  readonly enqueued: number;
  readonly ran: number;
  readonly failed: number;
}

/**
 * Llena la cola y la vacía, en ese orden, y las dos cosas están aquí a
 * propósito.
 *
 * Durante toda la vida de la migración 41 esta función solo hacía lo
 * segundo: reclamaba trabajos de una tabla que nadie llenaba, así que
 * `scheduled_jobs` estaba vacía desde el primer día y el cron entraba cada
 * mañana a no hacer nada. La mensualidad de RN-FIN-01 no se habría emitido
 * jamás. Poner el llenado DENTRO —en vez de dejarlo como un paso más que
 * la ruta tiene que acordarse de dar— es lo que impide que vuelva a
 * pasar: no hay forma de vaciar la cola sin haberla llenado antes.
 *
 * Se reclama por tandas hasta agotarla, no una sola tanda: con cuatro
 * barridos por espacio, un `limit` de diez dejaba trabajos para el día
 * siguiente en cuanto hubiera tres espacios, y "el día siguiente" en un
 * cobro mensual es un día de retraso. El tope de `maxJobs` está para que
 * una cola atascada no convierta la tanda en infinita.
 *
 * Un trabajo que falla no puede tumbar a los demás ni quedarse en
 * `running` para siempre: se marca como fallido con su error.
 */
export async function runScheduledJobs(
  gateway: QueueGateway,
  limit = 10,
  maxJobs = 200,
): Promise<ScheduledJobsResult> {
  const enqueued = await gateway.enqueueDueJobs();

  let ran = 0;
  let failed = 0;

  while (ran + failed < maxJobs) {
    const jobs = await gateway.claimScheduledJobs(limit);
    if (jobs.length === 0) break;

    for (const job of jobs) {
      try {
        await gateway.runScheduledJob(job.id);
        ran += 1;
      } catch (error) {
        failed += 1;
        await gateway.finishScheduledJob(
          job.id,
          false,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  return { enqueued, ran, failed };
}

// ---------------------------------------------------------------------
// Cola de correo (RN-NOT-05).
// ---------------------------------------------------------------------

/**
 * El asunto y el cuerpo salen del catálogo de i18n de quien llame, no de
 * aquí: este módulo no escribe texto de producto. Lo que sí decide es que
 * un aviso sin dirección de correo no se reintenta eternamente — no hay
 * nada que reintentar.
 */
export interface MailComposer {
  compose(delivery: DeliveryRow): MailMessage | null;
}

export interface DrainResult {
  readonly sent: number;
  readonly retried: number;
  readonly dead: number;
}

export interface DeliveryTransports {
  readonly mail: MailTransport;
  readonly mailComposer: MailComposer;
  /** Sin transporte de push, las entregas push se reprograman: no se pierden ni se fingen. */
  readonly push: PushTransport | null;
  readonly pushComposer: PushComposer;
}

type Outcome = "sent" | "retried" | "dead";

/**
 * Una entrega, un resultado. Devuelve qué pasó para que el contador de la
 * tanda lo sume; escribir en la base lo hace aquí mismo, para que un fallo
 * a mitad de tanda no deje una fila reclamada y sin marcar.
 */
async function deliverOne(
  gateway: QueueGateway,
  transports: DeliveryTransports,
  delivery: DeliveryRow,
  now: Date,
): Promise<Outcome> {
  const fail = async (message: string): Promise<Outcome> => {
    // RN-NOT-05: espera creciente y techo de intentos, los de
    // src/core/notifications.ts, que es donde están sus tests.
    const status = deliveryStatusAfterFailure(delivery.attempts);
    const delayMinutes = nextRetryDelayMinutes(delivery.attempts);
    const nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000);
    await gateway.markDeliveryFailed(delivery.delivery_id, message, nextAttemptAt, status === "dead");
    return status === "dead" ? "dead" : "retried";
  };

  const dead = async (message: string): Promise<Outcome> => {
    await gateway.markDeliveryFailed(delivery.delivery_id, message, now, true);
    return "dead";
  };

  if (delivery.channel === "push") {
    const message = transports.pushComposer.compose(delivery);
    if (message === null) {
      // Sin teléfono vigente no hay a quién mandarlo: se cierra como
      // muerta, igual que un correo sin dirección (CA-18).
      return dead("El destinatario no tiene ningún dispositivo con push");
    }
    if (transports.push === null) {
      return fail("El transporte de push no está configurado: el aviso queda en cola");
    }

    let tickets: readonly PushTicket[];
    try {
      tickets = await transports.push.send(message);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    // RN-MOV-05 · los tokens que el proveedor da por inexistentes se
    // cierran ya, con o sin éxito en los demás: no hay nada que reintentar
    // contra ellos.
    for (const ticket of tickets) {
      if (ticket.status === "unregistered") {
        await gateway.revokePushToken(ticket.token, "provider_rejected");
      }
    }

    const ok = tickets.find((t): t is Extract<PushTicket, { status: "ok" }> => t.status === "ok");
    if (ok) {
      await gateway.markDeliverySent(delivery.delivery_id, ok.providerId);
      return "sent";
    }

    const errors = tickets.filter((t): t is Extract<PushTicket, { status: "error" }> => t.status === "error");
    if (errors.length > 0) {
      return fail(errors.map((t) => t.message).join("; "));
    }
    // Todos dados de baja por el proveedor: ya no queda ningún teléfono.
    return dead("Ningún dispositivo del destinatario existe ya para el proveedor de push");
  }

  const message = transports.mailComposer.compose(delivery);
  if (message === null) {
    // Sin destinatario no hay envío posible: se cierra como muerta en
    // vez de reintentarla cinco veces contra nada.
    return dead("El destinatario no tiene dirección de correo");
  }

  try {
    const providerId = await transports.mail.send(message);
    await gateway.markDeliverySent(delivery.delivery_id, providerId);
    return "sent";
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Vacía la cola de envíos, correo y push mezclados en el orden en que
 * vencen (RN-NOT-05, RN-MOV-04). Cada canal sale por su transporte.
 */
export async function drainDeliveryQueue(
  gateway: QueueGateway,
  transports: DeliveryTransports,
  limit = 20,
  now: Date = new Date(),
): Promise<DrainResult> {
  const deliveries = await gateway.claimDeliveries(limit);
  const result = { sent: 0, retried: 0, dead: 0 };

  for (const delivery of deliveries) {
    const outcome = await deliverOne(gateway, transports, delivery, now);
    result[outcome] += 1;
  }

  return result;
}

/**
 * La forma de antes de la migración 94: solo correo. Se conserva porque
 * es lo que prueban los tests de la Fase 1 y lo que llama cualquier
 * script que solo tenga transporte de correo; una entrega push que llegue
 * aquí se reprograma, no se pierde.
 */
export async function drainEmailQueue(
  gateway: QueueGateway,
  transport: MailTransport,
  composer: MailComposer,
  limit = 20,
  now: Date = new Date(),
): Promise<DrainResult> {
  return drainDeliveryQueue(
    gateway,
    { mail: transport, mailComposer: composer, push: null, pushComposer: { compose: () => null } },
    limit,
    now,
  );
}
