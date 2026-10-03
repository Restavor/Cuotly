"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { dinerCancelEstablishment, parseDinerCancel } from "@/core/reservations/diner-link";
import { isNoticeToken } from "@/core/reservations/notices";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchDinerNotices } from "@/services/agents/messaging/dispatch";
import { createNoticeGateway, type RpcClient } from "@/services/agents/messaging/gateway";

/**
 * Cancelar desde el enlace del comensal (PRD de agents §6.9, decisión 154). Sin sesión de nadie: la puerta es el token del
 * enlace (128 bits), y quien decide si se puede cancelar —el plazo exacto, el estado, Reservas cerrada— es la base de
 * datos (`reservation_customer_cancel`). Aquí solo se limita el abuso y se vuelve a la página, que cuenta lo que pasó.
 *
 * Abrir el enlace (GET) no escribe nada ni se limita: lo abren los escáneres de los correos y las vistas previas. Cancelar
 * solo ocurre al enviar este formulario (POST).
 */

/** Cuántas peticiones de cancelar admite una dirección en diez minutos; un token que no existe cuenta doble. */
const MAX_ATTEMPTS = 20;
const WINDOW_SECONDS = 600;
/** Cubos fijos: la tabla de límites no crece con cada dirección que llegue. */
const BUCKETS = 4096;

async function bucketOfCaller(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip")?.trim() || "unknown";
  const slot = createHash("sha256").update(`c:${forwarded}`).digest().readUInt32BE(0) % BUCKETS;
  return `cancel:${slot}`;
}

function back(token: string, language: "es" | "en", error?: "rate" | "failed"): never {
  redirect(`/c/${token}?lang=${language}${error ? `&error=${error}` : ""}`);
}

export async function cancelByLinkAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const language = formData.get("lang") === "en" ? "en" : "es";
  if (!isNoticeToken(token)) redirect("/c/enlace-no-valido");

  const gateway = createNoticeGateway(createAdminClient() as unknown as RpcClient);
  let result: "cancelled" | "rate" | "failed" | "done";
  try {
    const bucket = await bucketOfCaller();
    if (!(await gateway.rateLimitHit(bucket, MAX_ATTEMPTS, WINDOW_SECONDS))) {
      result = "rate";
    } else {
      const raw = await gateway.customerCancel(token);
      const outcome = parseDinerCancel(raw);
      if (outcome === null) {
        result = "failed";
      } else {
        if (outcome === "not_found") await gateway.rateLimitHit(bucket, MAX_ATTEMPTS, WINDOW_SECONDS);
        const establishmentId = dinerCancelEstablishment(raw);
        // El aviso de «reserva cancelada» sale al momento, después de contestar (mejor esfuerzo: la tarea de cada
        // minuto es la red de seguridad).
        if (establishmentId !== null) after(() => dispatchDinerNotices(establishmentId));
        result = "done";
      }
    }
  } catch {
    result = "failed";
  }
  // La página cuenta lo que pasó (cancelada, ya cancelada, fuera de plazo…) leyendo de la base de datos.
  if (result === "rate" || result === "failed") back(token, language, result);
  back(token, language);
}
