import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createNoticeGateway, type RpcClient } from "@/services/agents/messaging/gateway";
import { selectProviders } from "@/services/agents/messaging/providers";
import { handleWhatsAppVerification, handleWhatsAppWebhook } from "@/services/agents/messaging/webhook-whatsapp";

/**
 * El webhook de WhatsApp (Cloud API de Meta; PRD de agents §10.3, AVI-03).
 *
 *   · GET: la verificación de Meta al configurar el webhook (`hub.challenge`). Devuelve el reto como texto.
 *   · POST: estados de los avisos (entregado, fallido, cobrado o no) y mensajes que escriben los comensales, a los
 *     que se responde con el texto automático.
 *
 * No hay sesión de nadie: la puerta es la firma `X-Hub-Signature-256` (`WHATSAPP_APP_SECRET`). El cuerpo se lee en
 * bruto porque la firma es del texto exacto. Lo que se hace con cada evento está en
 * `services/agents/messaging/webhook-whatsapp.ts`; las funciones de la base de datos son reservadas a
 * `service_role` e idempotentes.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const result = handleWhatsAppVerification(new URL(request.url).searchParams, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || undefined);
  return new Response(result.text, { status: result.status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleWhatsAppWebhook(
    { rawBody, signature: request.headers.get("x-hub-signature-256"), appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || undefined },
    { gateway: createNoticeGateway(createAdminClient() as unknown as RpcClient), whatsapp: selectProviders().whatsapp },
  );
  if (result.log) console.error(`[whatsapp] ${result.log}`);
  return NextResponse.json(result.body, { status: result.status });
}
