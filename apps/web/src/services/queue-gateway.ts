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
import type {
  DeliveryRow,
  MailComposer,
  MailTransport,
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
