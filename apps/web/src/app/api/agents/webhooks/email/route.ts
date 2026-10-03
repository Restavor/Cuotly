import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createNoticeGateway, type RpcClient } from "@/services/agents/messaging/gateway";
import { handleEmailWebhook } from "@/services/agents/messaging/webhook-email";

/**
 * El webhook de correo (Resend; PRD de agents §10.4: «Rebotes → incidente»).
 *
 * No hay sesión de nadie: la puerta es la firma de Svix (`svix-id`, `svix-timestamp`, `svix-signature`) con
 * `RESEND_WEBHOOK_SECRET` (`whsec_…`). Un rebote permanente deja el aviso como «no entregable» y un incidente con el
 * correo enmascarado.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleEmailWebhook(
    {
      rawBody,
      svixId: request.headers.get("svix-id"),
      svixTimestamp: request.headers.get("svix-timestamp"),
      svixSignature: request.headers.get("svix-signature"),
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET?.trim() || undefined,
    },
    createNoticeGateway(createAdminClient() as unknown as RpcClient),
  );
  if (result.log) console.error(`[correo] ${result.log}`);
  return NextResponse.json(result.body, { status: result.status });
}
