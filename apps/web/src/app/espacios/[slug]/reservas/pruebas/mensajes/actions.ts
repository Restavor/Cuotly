"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { dispatchDinerNotices } from "@/services/agents/messaging/dispatch";
import { fakeMessagingAllowed } from "@/services/agents/messaging/providers";

import type { FakeMessagesFeedback } from "./action-state";

/**
 * Las acciones de Pruebas › Mensajes (Fase F; decisión 159): enviar ya los avisos pendientes de los restaurantes del
 * espacio y simular lo que contaría el proveedor (entregado, no entregable, precio real, no cobrado). Solo con
 * `ENABLE_FAKE_MESSAGING=true` y fuera de producción, y solo para quien gestiona clientes en Restavor: lo comprueba aquí
 * y lo vuelve a comprobar la base de datos (`reservation_fake_notice_event()` y `reservation_notices…`).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTS = ["delivered", "undeliverable", "price", "not_charged"] as const;
type SimulatedEvent = (typeof EVENTS)[number];

/** El importe con el que se simula el «precio real» de un SMS: 0,05 €. */
const SIMULATED_PRICE_EUR = 0.05;

async function authorized(slug: string): Promise<{ spaceId: string; supabase: Awaited<ReturnType<typeof createClient>> } | null> {
  if (!fakeMessagingAllowed()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: space } = await supabase.from("spaces").select("id").eq("slug", slug).maybeSingle();
  if (!space) return null;
  const { data: allowed } = await supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_clients" });
  return allowed === true ? { spaceId: space.id, supabase } : null;
}

/** «Procesar avisos pendientes ahora»: lo que haría la tarea de cada minuto, para los restaurantes de este espacio. */
export async function processPendingAction(slug: string): Promise<FakeMessagesFeedback> {
  const t = es.agents.fakeMessages;
  const access = await authorized(slug);
  if (!access) return { ok: false, message: t.processFailed };
  const { data: establishments, error } = await access.supabase.from("establishments").select("id").eq("space_id", access.spaceId);
  if (error) return { ok: false, message: t.processFailed };
  let processed = 0;
  for (const establishment of establishments ?? []) {
    const summary = await dispatchDinerNotices(establishment.id);
    processed += summary?.claimed ?? 0;
  }
  revalidatePath(`/espacios/${slug}/reservas/pruebas/mensajes`);
  return { ok: true, message: processed === 0 ? t.processedNothing : t.processed(processed) };
}

/** Simular un suceso del proveedor sobre un mensaje de prueba. La base de datos comprueba que es de proveedor falso. */
export async function simulateEventAction(slug: string, noticeId: string, event: SimulatedEvent): Promise<FakeMessagesFeedback> {
  const t = es.agents.fakeMessages;
  if (!UUID.test(noticeId) || !EVENTS.includes(event)) return { ok: false, message: t.actionFailed };
  const access = await authorized(slug);
  if (!access) return { ok: false, message: t.actionFailed };
  const { error } = await access.supabase.rpc("reservation_fake_notice_event", {
    p_notice_id: noticeId,
    p_event: event,
    ...(event === "price" ? { p_price_amount: SIMULATED_PRICE_EUR } : {}),
  });
  if (error) return { ok: false, message: t.actionFailed };
  revalidatePath(`/espacios/${slug}/reservas/pruebas/mensajes`);
  return { ok: true, message: t.actionDone };
}
