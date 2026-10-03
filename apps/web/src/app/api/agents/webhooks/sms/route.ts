import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createNoticeGateway, type RpcClient } from "@/services/agents/messaging/gateway";
import { handleSmsWebhook } from "@/services/agents/messaging/webhook-sms";

/**
 * El webhook de estado de los SMS (proveedor compatible con Twilio; PRD de agents §10.3, AVI-04).
 *
 * No hay sesión de nadie: la puerta es la firma `X-Twilio-Signature` (HMAC-SHA1 con `SMS_AUTH_TOKEN`). Se firma la
 * URL PÚBLICA —la de `NEXT_PUBLIC_SITE_URL` con su `?notice=<id>`—, no la que ve el servidor detrás de su proxy.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const url = new URL(request.url);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ?? "";
  const result = await handleSmsWebhook(
    {
      rawBody,
      signature: request.headers.get("x-twilio-signature"),
      authToken: process.env.SMS_AUTH_TOKEN?.trim() || undefined,
      publicUrl: siteUrl === "" ? undefined : `${siteUrl}/api/agents/webhooks/sms${url.search}`,
      noticeId: url.searchParams.get("notice"),
    },
    createNoticeGateway(createAdminClient() as unknown as RpcClient),
  );
  if (result.log) console.error(`[sms] ${result.log}`);
  return NextResponse.json(result.body, { status: result.status });
}
