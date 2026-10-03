/**
 * `src/services/reservations-realtime.ts` · el canal de tiempo real de la agenda, del lado
 * del servidor (RES-11, RN-RES-13; PRD de agents §6.14).
 *
 * Supabase Broadcast, un canal por restaurante cuyo NOMBRE es secreto: un HMAC del
 * restaurante con `RESERVATIONS_BROADCAST_SECRET`, que solo viaja a las sesiones y
 * dispositivos autorizados dentro de la página. Lo que viaja por el canal es lo de
 * `core/reservations/realtime.ts`: la fecha que cambió, nada más.
 *
 * **La versión falsa en local** (PRD: «con la versión falsa en local»): sin
 * `RESERVATIONS_BROADCAST_SECRET` no hay canal y `realtimeChannelFor()` devuelve `null`.
 * Entonces el navegador usa `BroadcastChannel` —avisa a las demás pestañas del mismo
 * navegador— y el servidor no emite nada. Es suficiente para probar a mano con dos
 * pestañas y no simula un canal que no existe: dice «sin canal» y lo hace honestamente
 * entre pestañas.
 *
 * Un fallo al emitir no estropea la operación: la reserva ya está guardada y la pantalla
 * de quien la hizo ya se refresca; a los demás les llegará en la siguiente carga.
 */
import { createHmac } from "node:crypto";

import {
  changePayload,
  REALTIME_EVENT,
  type ReservationsChange,
} from "@/core/reservations/realtime";

/** El nombre del canal, o `null` si no hay clave del servidor (versión falsa). */
export function realtimeChannelFor(
  establishmentId: string,
  secret: string | undefined = process.env.RESERVATIONS_BROADCAST_SECRET,
): string | null {
  if (!secret) return null;
  const digest = createHmac("sha256", secret).update(`reservas:${establishmentId}`).digest("hex").slice(0, 32);
  return `reservas-${digest}`;
}

export type BroadcastOutcome = { readonly sent: true } | { readonly sent: false; readonly reason: "no_channel" | "not_configured" | "failed" };

/**
 * Avisa a los dispositivos abiertos de un restaurante. Es la API REST de Broadcast
 * (`/realtime/v1/api/broadcast`) con la clave de servicio, así que funciona desde una
 * acción de servidor sin abrir un websocket.
 */
export async function broadcastChange(
  establishmentId: string,
  change: ReservationsChange,
  fetchImpl: typeof fetch = fetch,
): Promise<BroadcastOutcome> {
  const channel = realtimeChannelFor(establishmentId);
  if (channel === null) return { sent: false, reason: "no_channel" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { sent: false, reason: "not_configured" };
  try {
    const response = await fetchImpl(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: channel, event: REALTIME_EVENT, payload: changePayload(change), private: false }] }),
    });
    return response.ok ? { sent: true } : { sent: false, reason: "failed" };
  } catch {
    return { sent: false, reason: "failed" };
  }
}
