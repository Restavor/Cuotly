import { changePayload, type ReservationsChange } from "@/core/reservations/realtime";

/** El evento del navegador con el que una acción de esta pestaña avisa a `RealtimeRefresh`. */
export const LOCAL_CHANGE_EVENT = "restavor:reservas-cambio";

/** El canal del navegador de la versión falsa en local: el mismo nombre para quien avisa y para quien escucha. */
export function localBusName(establishmentId: string): string {
  return `restavor-reservas-${establishmentId}`;
}

/**
 * Avisa de que cambió una reserva: a la propia pestaña (para que se refresque) y, por
 * `BroadcastChannel`, a las demás pestañas del mismo navegador. Con canal de servidor, quien
 * escucha ignora el `BroadcastChannel` porque el servidor ya avisa a todos; sin él (la
 * versión falsa en local) es lo único que hay. Se avisa desde donde se actúa —Nueva, la ficha,
 * una fila de Hoy— aunque esa pantalla no escuche.
 */
export function announceLocalChange(establishmentId: string, change: ReservationsChange): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ReservationsChange>(LOCAL_CHANGE_EVENT, { detail: change }));
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const bus = new BroadcastChannel(localBusName(establishmentId));
    bus.postMessage(changePayload(change));
    bus.close();
  } catch {
    /* sin BroadcastChannel: queda el aviso de esta pestaña */
  }
}
