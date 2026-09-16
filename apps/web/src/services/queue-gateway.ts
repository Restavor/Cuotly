/**
 * `src/services/queue-gateway.ts` — la mitad de Supabase del proceso de la
 * cola. Todo lo que hay aquí son llamadas a funciones que solo puede
 * ejecutar `service_role` (migración 20260830000041): reclamar trabajos,
 * ejecutarlos, reclamar envíos y marcarlos.
 *
 * Está separado de `queue-runner.ts` a propósito: el runner es el que
 * decide, y se prueba entero con dos interfaces falsas, sin base de datos
 * ni proveedor de correo. Aquí solo se traduce.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { HolidayRecord } from "@/core/business-clock";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";
import type {
  DeliveryRow,
  MailComposer,
  MailTransport,
  PushComposer,
  PushTicket,
  PushTransport,
  QueueGateway,
  ScheduledJobRow,
  SlaCounterRow,
} from "./queue-runner";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Las funciones de la cola son SECURITY DEFINER reservadas a service_role y
   no están en `Database` (los tipos generados solo describen lo que puede
   tocar una sesión de usuario). Se aísla el `any` en este archivo, que es
   la frontera, en vez de esparcirlo por el runner. */
type AnyClient = SupabaseClient<any, any, any>;

async function rpc<T>(client: AnyClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export function createSupabaseQueueGateway(client: AnyClient): QueueGateway {
  return {
    // La pieza que faltaba desde la migración 41: sin esta llamada
    // `scheduled_jobs` se quedaba vacía y reclamar no devolvía nunca nada.
    enqueueDueJobs: () => rpc<number>(client, "enqueue_due_scheduled_jobs", {}),

    claimScheduledJobs: (limit) =>
      rpc<readonly ScheduledJobRow[]>(client, "claim_scheduled_jobs", { p_limit: limit }),

    runScheduledJob: (jobId) => rpc<number>(client, "run_scheduled_job", { p_job_id: jobId }),

    finishScheduledJob: (jobId, ok, error) =>
      rpc<void>(client, "finish_scheduled_job", { p_job_id: jobId, p_ok: ok, p_error: error }),

    slaCounters: (spaceId) =>
      rpc<readonly SlaCounterRow[]>(client, "sla_sweep_counters", { p_space_id: spaceId }),

    emitSlaNotification: (jobId, event, thresholdPercent) =>
      rpc<number>(client, "emit_sla_notification", {
        p_job_id: jobId,
        p_event_type: event,
        p_threshold_percent: thresholdPercent,
      }),

    async holidays(spaceId) {
      // RN-CLK-10: hace falta también `created_at`, porque el calendario se
      // reconstruye con los festivos que se conocían cuando arrancó el
      // contador, no con los de hoy.
      const { data, error } = await client
        .from("holidays")
        .select("holiday_date, created_at")
        .eq("space_id", spaceId);
      if (error) throw new Error(`holidays: ${error.message}`);
      return (data ?? []).map(
        (row: { holiday_date: string; created_at: string }): HolidayRecord => ({
          date: row.holiday_date,
          configuredAt: new Date(row.created_at),
        }),
      );
    },

    claimDeliveries: (limit) =>
      rpc<readonly DeliveryRow[]>(client, "claim_notification_deliveries", { p_limit: limit }),

    markDeliverySent: (deliveryId, providerMessageId) =>
      rpc<void>(client, "mark_delivery_sent", {
        p_delivery_id: deliveryId,
        p_provider_message_id: providerMessageId,
      }),

    markDeliveryFailed: (deliveryId, error, nextAttemptAt, dead) =>
      rpc<void>(client, "mark_delivery_failed", {
        p_delivery_id: deliveryId,
        p_error: error,
        p_next_attempt_at: nextAttemptAt.toISOString(),
        p_dead: dead,
      }),

    // Migración 94 (RN-MOV-05): reservada a service_role, como el resto.
    revokePushToken: (token, reason) =>
      rpc<boolean>(client, "revoke_push_token", { p_expo_push_token: token, p_reason: reason }),
  };
}

/**
 * El texto del correo sale del catálogo de i18n, como el de cualquier otra
 * superficie (CLAUDE.md: nunca literales de UI). El enlace es absoluto
 * porque un correo no tiene origen desde el que resolver una ruta.
 */
export function createMailComposer(baseUrl: string): MailComposer {
  return {
    compose(delivery: DeliveryRow) {
      if (!delivery.recipient_email) return null;

      const events = es.notifications.events as Record<string, string | undefined>;
      const label = events[delivery.event_type] ?? es.notifications.title;
      const link = `${baseUrl.replace(/\/$/, "")}${delivery.deep_link}`;

      return {
        to: delivery.recipient_email,
        subject: es.notifications.email.subject(label, delivery.space_name),
        body: es.notifications.email.body(label, delivery.space_name, link),
      };
    },
  };
}

/**
 * Transporte de Resend. Si no hay clave configurada **lanza**, y eso es
 * deliberado: la fila se reintenta con espera creciente en vez de quedar
 * marcada como enviada sin haber salido nunca. Un envío que se da por
 * bueno y no ocurre es peor que uno que falla ruidosamente.
 */
export function createResendTransport(
  apiKey: string | undefined,
  from: string,
  fetchImpl: typeof fetch = fetch,
): MailTransport {
  return {
    async send(message) {
      if (!apiKey) {
        throw new Error("RESEND_API_KEY no está configurada: el aviso queda en cola");
      }

      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
        }),
      });

      if (!response.ok) {
        throw new Error(`Resend respondió ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as { id?: string };
      return payload.id ?? null;
    },
  };
}

/**
 * RN-MOV-04 (decisión 36) · el push dice qué ha pasado y dónde: el nombre
 * del evento y el restaurante en el título; el espacio, la cifra o el
 * umbral si los hay, y una frase de lo que se pide («Quiero cambiar el
 * precio…») en el cuerpo. Todo sale de la fila del reclamo, que lo
 * resuelve el servidor desde la entidad del aviso; aquí no se consulta
 * nada más. Nunca el nombre de nadie del equipo: la fila no lo trae.
 */
export function createPushComposer(): PushComposer {
  return {
    compose(delivery: DeliveryRow) {
      const tokens = delivery.push_tokens ?? [];
      if (tokens.length === 0) return null;

      const events = es.notifications.events as Record<string, string | undefined>;
      const label = events[delivery.event_type] ?? es.notifications.title;

      return {
        to: tokens,
        title: es.notifications.push.title(label, delivery.establishment_name),
        body: es.notifications.push.body({
          espacio: delivery.space_name,
          importe: delivery.amount_cents !== null ? euros(delivery.amount_cents) : null,
          umbral: delivery.threshold_percent,
          asunto: delivery.subject,
        }),
        deepLink: delivery.deep_link,
      };
    },
  };
}

/**
 * La respuesta del servicio de push de Expo: un ticket por mensaje, en el
 * mismo orden. El único error que se trata aparte es `DeviceNotRegistered`
 * (RN-MOV-05); el resto se reintenta como cualquier fallo.
 */
interface ExpoTicket {
  readonly status: "ok" | "error";
  readonly id?: string;
  readonly message?: string;
  readonly details?: { readonly error?: string };
}

export const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/**
 * Transporte de Expo sobre FCM y APNs. No necesita clave para funcionar;
 * el token de acceso es opcional y solo hace falta si el proyecto de Expo
 * activa la seguridad de push. A diferencia del correo, no lanza por
 * falta de configuración: el servicio es público.
 */
export function createExpoPushTransport(
  accessToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
): PushTransport {
  return {
    async send(message) {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetchImpl(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(
          message.to.map((token) => ({
            to: token,
            title: message.title,
            body: message.body,
            data: { deepLink: message.deepLink },
            sound: "default",
            priority: "high",
          })),
        ),
      });

      if (!response.ok) {
        throw new Error(`Expo push respondió ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = payload.data ?? [];

      return message.to.map((token, index): PushTicket => {
        const ticket = tickets[index];
        if (!ticket) return { token, status: "error", message: "Expo no devolvió ticket para este token" };
        if (ticket.status === "ok") return { token, status: "ok", providerId: ticket.id ?? null };
        if (ticket.details?.error === "DeviceNotRegistered") return { token, status: "unregistered" };
        return { token, status: "error", message: ticket.message ?? ticket.details?.error ?? "Expo devolvió un error" };
      });
    },
  };
}
