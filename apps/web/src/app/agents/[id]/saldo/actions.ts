"use server";

import { headers } from "next/headers";

import { MIN_TOPUP_CENTS } from "@/core/agents/balance";
import { es } from "@/i18n/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadDevice } from "@/services/agents/device";
import { startTopup, TopupError } from "@/services/agents/balance-gateway";
import { stripeStatus } from "@/services/agents/stripe";

import type { TopupFeedback } from "./action-state";

/**
 * «Pagar con tarjeta» (SAL-02; PRD de agents §5.2 RN-AGT-04): crea la recarga, pide la página de pago a Stripe
 * y devuelve su dirección. Quién puede recargar (solo el Propietario), el IVA y el mínimo de 10 € los decide
 * `create_agent_topup()` en la base de datos; aquí solo se traduce lo que contesta. El saldo NO sube aquí: sube
 * cuando Stripe avisa del pago al webhook (`/api/agents/webhooks/stripe`).
 *
 * Sin `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` no se hace nada: las recargas con tarjeta están
 * «Próximamente» (decisión 144). La tablet del local nunca recarga, aunque en ese navegador quede una sesión.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function siteUrl(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

export async function startTopupAction(input: { establishmentId: string; netCents: number; formKey: string }): Promise<TopupFeedback> {
  const t = es.agents.balance.topup;
  if (!UUID.test(input.establishmentId) || !/^[\w-]{8,64}$/.test(input.formKey)) return { ok: false, message: t.failed };
  if (!Number.isInteger(input.netCents) || input.netCents < MIN_TOPUP_CENTS) return { ok: false, message: t.tooSmall };
  if ((await loadDevice()).kind === "active") return { ok: false, message: t.notOwner };

  const stripe = stripeStatus();
  if (!stripe.ready) return { ok: false, message: t.soonBody };
  const base = await siteUrl();
  if (!base) return { ok: false, message: t.failed };

  try {
    const user = await createClient();
    const { data } = await user.auth.getUser();
    const { url } = await startTopup(
      {
        establishmentId: input.establishmentId,
        netCents: input.netCents,
        // El mismo formulario con el mismo importe es una sola recarga; otro importe, otra recarga.
        idempotencyKey: `${input.formKey}:${input.netCents}`,
        successUrl: `${base}/agents/${input.establishmentId}/saldo?recarga=ok`,
        cancelUrl: `${base}/agents/${input.establishmentId}/saldo?recarga=cancelada`,
        customerEmail: data.user?.email ?? null,
        labels: { product: es.agents.balance.stripe.product, vat: es.agents.balance.stripe.vat },
        secretKey: process.env.STRIPE_SECRET_KEY!.trim(),
      },
      { user, admin: createAdminClient() },
    );
    return { ok: true, url };
  } catch (error) {
    if (error instanceof TopupError) {
      switch (error.kind) {
        case "not_owner":
          return { ok: false, message: t.notOwner };
        case "too_small":
          return { ok: false, message: t.tooSmall };
        case "closed":
          return { ok: false, message: t.closed };
        case "stripe":
          return { ok: false, message: t.stripeFailed };
        default:
          return { ok: false, message: t.failed };
      }
    }
    return { ok: false, message: t.failed };
  }
}
