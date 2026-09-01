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

export interface DeliveryRow {
  readonly delivery_id: string;
  readonly notification_id: string;
  readonly attempts: number;
  readonly recipient_email: string | null;
  readonly event_type: string;
  readonly audience: string;
  readonly deep_link: string;
  readonly space_name: string;
}

export interface QueueGateway {
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
  readonly ran: number;
  readonly failed: number;
}

/**
 * Reclama y ejecuta los trabajos de cola pendientes. Un trabajo que falla
 * no puede tumbar a los demás ni quedarse en `running` para siempre: se
 * marca como fallido con su error.
 */
export async function runScheduledJobs(
  gateway: QueueGateway,
  limit = 10,
): Promise<ScheduledJobsResult> {
  const jobs = await gateway.claimScheduledJobs(limit);
  let ran = 0;
  let failed = 0;

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

  return { ran, failed };
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

export async function drainEmailQueue(
  gateway: QueueGateway,
  transport: MailTransport,
  composer: MailComposer,
  limit = 20,
  now: Date = new Date(),
): Promise<DrainResult> {
  const deliveries = await gateway.claimDeliveries(limit);
  let sent = 0;
  let retried = 0;
  let dead = 0;

  for (const delivery of deliveries) {
    const message = composer.compose(delivery);

    if (message === null) {
      // Sin destinatario no hay envío posible: se cierra como muerta en
      // vez de reintentarla cinco veces contra nada.
      dead += 1;
      await gateway.markDeliveryFailed(
        delivery.delivery_id,
        "El destinatario no tiene dirección de correo",
        now,
        true,
      );
      continue;
    }

    try {
      const providerId = await transport.send(message);
      sent += 1;
      await gateway.markDeliverySent(delivery.delivery_id, providerId);
    } catch (error) {
      // RN-NOT-05: espera creciente y techo de intentos, los de
      // src/core/notifications.ts, que es donde están sus tests.
      const status = deliveryStatusAfterFailure(delivery.attempts);
      const delayMinutes = nextRetryDelayMinutes(delivery.attempts);
      const nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000);

      if (status === "dead") {
        dead += 1;
      } else {
        retried += 1;
      }

      await gateway.markDeliveryFailed(
        delivery.delivery_id,
        error instanceof Error ? error.message : String(error),
        nextAttemptAt,
        status === "dead",
      );
    }
  }

  return { sent, retried, dead };
}
