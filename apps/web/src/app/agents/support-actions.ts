"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { agentsPageHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { SUPPORT_RETURN_COOKIE, safeReturnPath } from "./support-return";
import type { SupportFeedback } from "./support-state";

/**
 * Abrir y cerrar la sesión de Reservas como soporte (Fase D, SOP-01; PRD de agents §3.4, decisión 92). La
 * base de datos comprueba todo: la marca de soporte, el segundo paso (`aal2`), el motivo y la duración. Aquí solo
 * se traduce lo que contesta y se recuerda de dónde viene quien entra, para devolverle allí al salir.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function openSupportSessionAction(input: {
  establishmentId: string;
  reason: string;
  minutes: number;
  /** De dónde viene (la ficha del espacio o `/administracion`), para volver al salir. */
  returnTo: string;
}): Promise<SupportFeedback> {
  const t = es.agents.support.errors;
  const reason = input.reason.trim();
  if (!UUID.test(input.establishmentId)) return { ok: false, message: t.failed };
  if (reason === "") return { ok: false, message: t.reason };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_reservation_support_session", {
    p_establishment_id: input.establishmentId,
    p_reason: reason,
    p_minutes: input.minutes,
  });
  if (error) {
    if (/segundo paso/i.test(error.message)) return { ok: false, message: t.twoFactor };
    if (/no estás marcado/i.test(error.message)) return { ok: false, message: t.notMarked };
    if (/motivo/i.test(error.message)) return { ok: false, message: t.reason };
    return { ok: false, message: t.failed };
  }
  const outcome = typeof data === "object" && data !== null && !Array.isArray(data) ? data.outcome : undefined;
  if (outcome !== "open") return { ok: false, message: t.failed };

  const jar = await cookies();
  jar.set(SUPPORT_RETURN_COOKIE, safeReturnPath(input.returnTo), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 4 * 60 * 60,
  });
  return { ok: true, message: null, href: agentsPageHref(input.establishmentId, "today") };
}

/** «Salir» de la barra de soporte: cierra la sesión y vuelve a la ficha del espacio. */
export async function leaveSupportSessionAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const jar = await cookies();
  const back = safeReturnPath(jar.get(SUPPORT_RETURN_COOKIE)?.value ?? "");
  if (UUID.test(sessionId)) {
    const supabase = await createClient();
    await supabase.rpc("close_reservation_support_session", { p_session_id: sessionId });
  }
  jar.delete(SUPPORT_RETURN_COOKIE);
  redirect(back);
}
