/**
 * `src/core/reservations/capacity.ts` · el aforo de un turno tal como se enseña
 * (RN-RES-02; PRD de agents §6.3). Lo que decide si una reserva cabe (agente y web, no;
 * plataforma, siempre; manual, con aviso) es de la agenda (Fase C): aquí solo está la
 * medida y el estado de la barra.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */

/** A partir de este porcentaje de ocupación, la barra pasa de verde a mostaza (§6.3). */
export const CAPACITY_WARN_RATIO = 0.85;

export type CapacityState = "ok" | "warn" | "over";

/** Plazas libres: aforo menos ocupación. Puede ser negativa (una plataforma puede pasarse). */
export function freeSeats(capacity: number, occupied: number): number {
  return capacity - occupied;
}

/**
 * El estado de la barra de aforo: verde por debajo del 85 %, mostaza («Casi lleno») desde
 * el 85 % hasta el 100 % incluido, y rojo («Aforo superado») por encima del 100 %.
 */
export function capacityState(capacity: number, occupied: number): CapacityState {
  if (!(capacity > 0)) throw new RangeError(`Aforo no válido: ${capacity}`);
  if (occupied > capacity) return "over";
  return occupied / capacity >= CAPACITY_WARN_RATIO ? "warn" : "ok";
}

/** El relleno de la barra, de 0 a 100: una ocupación superior al aforo se recorta al 100 %. */
export function capacityFillPercent(capacity: number, occupied: number): number {
  if (!(capacity > 0)) throw new RangeError(`Aforo no válido: ${capacity}`);
  return Math.max(0, Math.min(100, (occupied / capacity) * 100));
}

/** Cuántas personas se pasa una reserva del aforo, o 0 si cabe (el aviso de §6.3: «Te pasas del aforo en N personas»). */
export function overflowBy(capacity: number, occupied: number, partySize: number): number {
  return Math.max(0, occupied + partySize - capacity);
}
