/**
 * `src/services/agents/lifecycle-delivery.ts` · lo que sale al momento tras una acción o un
 * barrido del ciclo de vida de Reservas (decisiones 99 y 137).
 *
 * Los push van siempre al momento. De los correos, solo «Aprobado: datos para pagar» y
 * «Reservas está en pausa»; el resto espera sus dos tandas. Es un mejor esfuerzo: si algo
 * falla, la entrega queda en la cola de siempre y la acción —que ya está hecha— no se ve
 * afectada. Nunca lanza.
 */
import type { PaymentInfo } from "@/core/agents/payment-info";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  createExpoPushTransport,
  createMailComposer,
  createPushComposer,
  createResendTransport,
  createSupabaseQueueGateway,
} from "../queue-gateway";
import { sendEmailNow, sendPushNow } from "../queue-runner";

export interface NoticesToSend {
  /** Claves de deduplicación de los avisos cuyo push sale ya. */
  readonly pushKeys: readonly string[];
  /** Claves de los que, además, salen por correo ya. */
  readonly emailKeys: readonly string[];
  /** Restaurantes de esos correos: de ellos se leen los datos de pago. */
  readonly establishmentIds: readonly string[];
}

/** `reservations_paused:<restaurante>:<época>` → el restaurante. */
export function establishmentOfKey(key: string): string | null {
  const parts = key.split(":");
  return parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1] ?? "") ? parts[1]!.toLowerCase() : null;
}

async function loadPaymentInfo(
  admin: ReturnType<typeof createAdminClient>,
  establishmentIds: readonly string[],
): Promise<Map<string, PaymentInfo>> {
  const map = new Map<string, PaymentInfo>();
  for (const id of new Set(establishmentIds)) {
    const { data } = await admin.rpc("reservation_payment_info", { p_establishment_id: id });
    const row = data?.[0];
    if (!row) continue;
    map.set(id.toLowerCase(), {
      chargeId: row.charge_id,
      concept: row.concept,
      reference: row.reference,
      baseCents: row.base_cents,
      taxCents: row.tax_cents,
      totalCents: row.total_cents,
      outstandingCents: row.outstanding_cents,
      dueAt: row.due_at,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      iban: row.iban,
      bizumPhone: row.bizum_phone,
      paymentNote: row.payment_note,
      payeeName: row.payee_name,
    });
  }
  return map;
}

export async function deliverNoticesNow(notices: NoticesToSend): Promise<void> {
  if (notices.pushKeys.length === 0 && notices.emailKeys.length === 0) return;
  try {
    const admin = createAdminClient();
    const gateway = createSupabaseQueueGateway(admin);

    await sendPushNow(
      gateway,
      { push: createExpoPushTransport(process.env.EXPO_PUSH_ACCESS_TOKEN), pushComposer: createPushComposer() },
      notices.pushKeys,
    );

    if (notices.emailKeys.length > 0) {
      const paymentByEstablishment = await loadPaymentInfo(admin, notices.establishmentIds);
      const result = await sendEmailNow(
        gateway,
        {
          mail: createResendTransport(process.env.RESEND_API_KEY, process.env.RESEND_FROM ?? "Restavor web <avisos@cuotly.com>"),
          mailComposer: createMailComposer(process.env.NEXT_PUBLIC_SITE_URL ?? "", { paymentByEstablishment }),
        },
        notices.emailKeys,
      );
      if (result.blockedBy) {
        console.error(`[correo] el correo al momento queda en su tanda: ${result.blockedBy}`);
      }
    }
  } catch (error) {
    console.error(
      `[avisos] no se pudieron mandar al momento los avisos de Reservas: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
