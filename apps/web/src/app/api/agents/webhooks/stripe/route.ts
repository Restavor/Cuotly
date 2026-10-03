import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { deliverNoticesNow } from "@/services/agents/lifecycle-delivery";
import { handleStripeWebhook, type TopupGateway, type TopupOutcome } from "@/services/agents/stripe-webhook";

/**
 * El webhook de Stripe para las recargas de saldo de Restavor agents (PRD de agents §5.2 RN-AGT-04 y
 * §10.5; D-C). Stripe lo llama con `checkout.session.completed` y `checkout.session.expired`.
 *
 * No hay sesión de nadie: la puerta es la firma (`STRIPE_WEBHOOK_SECRET`). El cuerpo se lee en bruto
 * (`request.text()`) porque la firma es del texto exacto. Lo que se hace con cada evento está en
 * `services/agents/stripe-webhook.ts`; las funciones de la base de datos que apuntan la recarga son
 * reservadas a `service_role` e idempotentes por sesión.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function gateway(): TopupGateway {
  const admin = createAdminClient();
  return {
    async completeTopup(sessionId, amountTotalCents, currency) {
      const { data, error } = await admin.rpc("complete_agent_topup", {
        p_session_id: sessionId,
        p_amount_total_cents: amountTotalCents,
        p_currency: currency,
      });
      if (error) throw new Error(error.message);
      return data as unknown as TopupOutcome;
    },
    async expireTopup(sessionId) {
      const { data, error } = await admin.rpc("expire_agent_topup", { p_session_id: sessionId });
      if (error) throw new Error(error.message);
      return data === true;
    },
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleStripeWebhook(
    {
      rawBody,
      signature: request.headers.get("stripe-signature"),
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    },
    gateway(),
  );

  if (result.log) console.error(`[stripe] ${result.log}`);
  if (result.receiptKey) {
    // El push del recibo, al momento; el correo sale en su tanda (decisión 137).
    await deliverNoticesNow({ pushKeys: [result.receiptKey], emailKeys: [], establishmentIds: [] });
  }
  return NextResponse.json(result.body, { status: result.status });
}
