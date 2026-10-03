/**
 * `src/core/reservations/realtime.ts` · el aviso de tiempo real de la agenda (RES-11,
 * RN-RES-13; PRD de agents §6.14).
 *
 * El canal solo avisa «hay cambios en la fecha X» o «cambió el estado del agente»: **sin
 * datos personales** (ni nombre, ni teléfono, ni nota, ni siquiera el identificador de la
 * reserva). La pantalla, al recibirlo, vuelve a pedir los datos al servidor, que es quien
 * decide qué ve cada persona. Así el canal, que no puede autorizar nada, tampoco puede
 * filtrar nada.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { isValidLocalDate } from "./dates";
import type { LocalDate } from "./dates";

/** Por qué cambió la fecha: una reserva nueva suena y se avisa; el resto solo refresca. */
export type ChangeReason = "new" | "changed";

export type ReservationsChange =
  | { readonly kind: "date"; readonly date: LocalDate; readonly reason: ChangeReason }
  | { readonly kind: "agent" };

/** El nombre del evento de Broadcast. */
export const REALTIME_EVENT = "change";

/** Lee un mensaje de fuera: lo que no tiene exactamente esta forma se ignora, no se interpreta. */
export function parseChange(payload: unknown): ReservationsChange | null {
  if (payload === null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.kind === "agent") return { kind: "agent" };
  if (p.kind === "date" && typeof p.date === "string" && isValidLocalDate(p.date)) {
    return { kind: "date", date: p.date, reason: p.reason === "new" ? "new" : "changed" };
  }
  return null;
}

/** ¿Hay que volver a pedir los datos? Si cambió la fecha que se está mirando o el agente. */
export function shouldReload(change: ReservationsChange, viewingDate: LocalDate | null): boolean {
  if (change.kind === "agent") return true;
  return viewingDate === null || change.date === viewingDate;
}

/** ¿Suena y se enseña la barra «Reserva nueva»? Solo con una reserva nueva y en la fecha que se mira (o en Calendario, sin fecha). */
export function shouldAnnounce(change: ReservationsChange, viewingDate: LocalDate | null): boolean {
  return change.kind === "date" && change.reason === "new" && (viewingDate === null || change.date === viewingDate);
}

/**
 * El mensaje de red tal como sale. Se arma aquí, con las dos claves y nada más, para que
 * un dato personal no pueda colarse por una futura comodidad.
 */
export function changePayload(change: ReservationsChange): Record<string, string> {
  return change.kind === "agent" ? { kind: "agent" } : { kind: "date", date: change.date, reason: change.reason };
}
