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
  /**
   * RN-SLA-18 (migración 118) · el plazo de realización que el trabajo
   * congeló al aceptarse. `null` en los aceptados antes de la 118, y ahí
   * significa el valor por omisión de RN-SLA-12.
   */
  readonly execution_sla_hours: number | null;
  readonly timezone: string;
  readonly events: readonly { readonly event_type: TimerEventType; readonly occurred_at: string }[];
}

export type DeliveryChannel = "email" | "push";

export interface DeliveryRow {
  readonly delivery_id: string;
  /**
   * `null` cuando esta entrega es un **resumen diario** y no un aviso
   * suelto (migración 122, RN-NOT-06). Las dos viajan por la misma cola
   * —la que ya sabe reintentar y no duplicar— y se distinguen por cuál de
   * los dos identificadores viene relleno.
   */
  readonly notification_id: string | null;
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
  /**
   * Migración 94 (RN-MOV-04, decisión 36): lo que el push dice además del
   * evento y el espacio. El restaurante y la frase de lo que se pide los
   * resuelve el reclamo desde la entidad del aviso; la cifra y el umbral
   * son los del propio aviso. Nunca el nombre de nadie del equipo.
   */
  readonly entity_type: string;
  readonly establishment_name: string | null;
  readonly amount_cents: number | null;
  readonly threshold_percent: number | null;
  readonly subject: string | null;
  /**
   * RN-NOT-06 · los tres datos del resumen. Nulos en una entrega de aviso.
   *
   * `digest_count` es lo único que el correo necesita decir además del
   * espacio: el detalle de qué entró se consulta desde la aplicación, no
   * se mete en el cuerpo del correo — copiarlo ahí sacaría el contenido de
   * los avisos fuera de las políticas que lo protegen.
   */
  readonly digest_id: string | null;
  readonly digest_date: string | null;
  readonly digest_count: number | null;
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
  /**
   * Por qué este transporte no puede enviar **nada**, o `null` si puede.
   *
   * Es para los fallos de configuración, que no son fallos de entrega: un
   * remitente mal escrito no se arregla reintentando. Quien vacía la cola
   * lo pregunta **antes de reclamar ninguna fila**, porque reclamar ya
   * gasta un intento (`claim_notification_deliveries` hace
   * `attempts + 1`), y al quinto la fila muere. Sin esto, cada pasada del
   * cron acerca a la muerte avisos que no tienen nada de malo.
   *
   * Opcional: un transporte de prueba que siempre puede enviar lo omite.
   */
  unusableReason?(): string | null;
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
      // RN-SLA-02 y RN-COM-12: sin plan, Básico o Impulso, 48 h; con Impulso+, Premium o Premium+, 24 h.
      // El número sale de la suscripción o del que se congeló al aceptar
      // (RN-COM-15), nunca de una suposición del cliente.
      status = t2Status(events, calendar, now, row.start_sla_hours === 24);
    } else {
      if (row.category === null) {
        skipped += 1;
        continue;
      }
      // RN-SLA-18 · el plazo CONGELADO del trabajo, no el de la tabla.
      // Sin esto un Premium+ no recibiría ningún aviso hasta pasarse de
      // largo: el 100 % de 72 h llega cuando las 48 reales ya vencieron.
      status = t3Status(events, calendar, now, row.category, row.execution_sla_hours);
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
  /**
   * Por qué no se intentó **nada** en esta tanda, o `null` si se intentó.
   *
   * Con un valor aquí, los otros tres contadores valen cero y en la base
   * no se ha tocado una sola fila: ni reclamada, ni con un intento gastado,
   * ni marcada. Es lo que hay que mirar cuando la cola dice que envió cero
   * y no se entiende por qué.
   */
  readonly blockedBy: string | null;
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
  // ANTES de reclamar: reclamar gasta un intento de cada fila que toca, y
  // son cinco en total. Si el transporte de correo no puede enviar por
  // cómo está configurado, reclamar no acerca el envío ni un milímetro —
  // solo mata avisos buenos, veinte por pasada.
  const motivo = transports.mail.unusableReason?.() ?? null;
  if (motivo !== null) {
    // La cola mezcla correo y push, y `claimDeliveries` no distingue el
    // canal: reclamar para salvar el push gastaría igualmente el intento
    // de las filas de correo que vinieran en la misma tanda. Así que la
    // tanda entera espera. Es el lado seguro, y además hace la avería
    // imposible de no ver, que es justo lo que falló durante once días.
    return { sent: 0, retried: 0, dead: 0, blockedBy: motivo };
  }

  const deliveries = await gateway.claimDeliveries(limit);
  const result = { sent: 0, retried: 0, dead: 0 };

  for (const delivery of deliveries) {
    const outcome = await deliverOne(gateway, transports, delivery, now);
    result[outcome] += 1;
  }

  return { ...result, blockedBy: null };
}

// ---------------------------------------------------------------------
// RN-ACC-04 · la cola de correo hacia direcciones que todavía no son de
// nadie (migración 97).
//
// No cabe en `notification_deliveries`: aquella exige `space_id` y una
// fila de `notifications`, y aquí no hay ni espacio ni destinatario
// registrado —el caso entero es "alguien que no tiene cuenta"—. Lo que sí
// se copia es la disciplina: mismo techo de intentos y misma espera
// creciente de `src/core/notifications.ts`, mismo transporte de correo.
// ---------------------------------------------------------------------

export interface PlatformEmailRow {
  readonly email_id: string;
  readonly kind: string;
  readonly to_email: string;
  readonly payload: Record<string, unknown>;
  readonly attempts: number;
}

export interface PlatformEmailGateway {
  claimPlatformEmails(limit: number): Promise<readonly PlatformEmailRow[]>;
  markPlatformEmailSent(emailId: string, providerMessageId: string | null): Promise<void>;
  markPlatformEmailFailed(
    emailId: string,
    error: string,
    nextAttemptAt: Date,
    dead: boolean,
  ): Promise<void>;
}

export interface PlatformEmailComposer {
  /** `null` cuando no hay nada que mandar: se cierra, no se reintenta. */
  compose(row: PlatformEmailRow): MailMessage | null;
}

/**
 * Vacía la cola de correo de plataforma. Un correo que no se puede
 * componer —un `kind` que este proceso no conoce, o un enlace que falta—
 * se cierra como muerto en vez de reintentarse cinco veces contra nada
 * (CA-18), y el motivo queda escrito en la fila.
 */
export async function drainPlatformEmailQueue(
  gateway: PlatformEmailGateway,
  transport: MailTransport,
  composer: PlatformEmailComposer,
  limit = 20,
  now: Date = new Date(),
): Promise<DrainResult> {
  // Lo mismo que arriba: `claim_platform_emails` también hace
  // `attempts + 1` al reclamar, así que la comprobación va antes.
  const motivo = transport.unusableReason?.() ?? null;
  if (motivo !== null) {
    return { sent: 0, retried: 0, dead: 0, blockedBy: motivo };
  }

  const filas = await gateway.claimPlatformEmails(limit);
  const result = { sent: 0, retried: 0, dead: 0 };

  for (const fila of filas) {
    const message = composer.compose(fila);
    if (message === null) {
      await gateway.markPlatformEmailFailed(
        fila.email_id,
        `No se sabe componer un correo de tipo "${fila.kind}"`,
        now,
        true,
      );
      result.dead += 1;
      continue;
    }

    try {
      const providerId = await transport.send(message);
      await gateway.markPlatformEmailSent(fila.email_id, providerId);
      result.sent += 1;
    } catch (error) {
      const status = deliveryStatusAfterFailure(fila.attempts);
      const delayMinutes = nextRetryDelayMinutes(fila.attempts);
      await gateway.markPlatformEmailFailed(
        fila.email_id,
        error instanceof Error ? error.message : String(error),
        new Date(now.getTime() + delayMinutes * 60_000),
        status === "dead",
      );
      result[status === "dead" ? "dead" : "retried"] += 1;
    }
  }

  return { ...result, blockedBy: null };
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
