/**
 * `src/core/reservations/diner-link.ts` · qué ve el comensal en su enlace `/c/[token]` (Fase F; PRD de agents §6.9,
 * AVI-05, decisiones 154 y 158).
 *
 * La base de datos decide todo lo que tiene que ver con la hora y el permiso (`reservation_customer_view()` devuelve
 * `can_cancel` con el plazo exacto). Aquí solo se traduce eso en el estado que pinta la página: «puedes cancelar»,
 * «ya no se puede cancelar desde aquí», «ya está cancelada», «el restaurante no ha aceptado el grupo»…
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import type { NoticeLanguage } from "./notices";

export interface DinerLinkRestaurant {
  readonly name: string;
  readonly city: string | null;
  readonly address: string | null;
  readonly phone: string | null;
}

/** Lo que devuelve `reservation_customer_view()` cuando el enlace es válido. Nada del contacto del comensal. */
export interface DinerLinkView {
  readonly status: "pending" | "confirmed" | "cancelled" | "no_show";
  readonly cancelReason: string | null;
  readonly date: string;
  readonly time: string;
  readonly startsAt: Date;
  readonly partySize: number;
  readonly customerName: string;
  readonly language: NoticeLanguage;
  readonly serviceStatus: string;
  readonly timezone: string;
  readonly cancelDeadline: Date;
  readonly serverNow: Date;
  readonly canCancel: boolean;
  readonly restaurant: DinerLinkRestaurant;
}

export type DinerLinkState =
  | "ok" // confirmada y se puede cancelar
  | "pending" // solicitud de grupo sin respuesta: se puede cancelar la solicitud
  | "deadline_passed" // ya no se puede cancelar desde aquí: llama al restaurante
  | "past" // la hora ya pasó
  | "cancelled" // ya cancelada
  | "rejected" // el restaurante no pudo atender la solicitud
  | "closed"; // Reservas cerrada: llama al restaurante

const STATUSES = ["pending", "confirmed", "cancelled", "no_show"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function instant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Lo que devuelve la base de datos, o `null` si el enlace no vale (no existe, mal formado, plataforma…). */
export function parseDinerView(raw: unknown): DinerLinkView | null {
  if (!isRecord(raw) || raw.found !== true) return null;
  const status = STATUSES.find((s) => s === raw.status);
  const restaurant = isRecord(raw.restaurant) ? raw.restaurant : null;
  const startsAt = instant(raw.starts_at);
  const deadline = instant(raw.cancel_deadline);
  const serverNow = instant(raw.server_now);
  const date = text(raw.date);
  const time = text(raw.time);
  const name = text(raw.customer_name);
  const restaurantName = restaurant === null ? null : text(restaurant.name);
  if (!status || !restaurant || !startsAt || !deadline || !serverNow || !date || !time || !name || !restaurantName) return null;
  if (typeof raw.party_size !== "number" || (raw.language !== "es" && raw.language !== "en")) return null;
  return {
    status,
    cancelReason: text(raw.cancel_reason),
    date,
    time,
    startsAt,
    partySize: raw.party_size,
    customerName: name,
    language: raw.language,
    serviceStatus: text(raw.service_status) ?? "closed",
    timezone: text(raw.timezone) ?? "Europe/Madrid",
    cancelDeadline: deadline,
    serverNow,
    canCancel: raw.can_cancel === true,
    restaurant: { name: restaurantName, city: text(restaurant.city), address: text(restaurant.address), phone: text(restaurant.phone) },
  };
}

/** El estado de la página. La hora la pone la base de datos (`serverNow`): el reloj del comensal no decide nada. */
export function dinerLinkState(view: DinerLinkView): DinerLinkState {
  if (view.status === "cancelled") return view.cancelReason === "rejected" ? "rejected" : "cancelled";
  if (view.serviceStatus === "closed") return "closed";
  if (view.status === "no_show" || view.startsAt.getTime() <= view.serverNow.getTime()) return "past";
  if (view.canCancel) return view.status === "pending" ? "pending" : "ok";
  return "deadline_passed";
}

/** Los resultados de `reservation_customer_cancel()`. */
export type DinerCancelOutcome = "cancelled" | "already_cancelled" | "deadline_passed" | "closed" | "not_cancellable" | "not_found";

const OUTCOMES: readonly DinerCancelOutcome[] = ["cancelled", "already_cancelled", "deadline_passed", "closed", "not_cancellable", "not_found"];

export function parseDinerCancel(raw: unknown): DinerCancelOutcome | null {
  if (!isRecord(raw)) return null;
  return OUTCOMES.find((o) => o === raw.outcome) ?? null;
}

/** El restaurante de una cancelación hecha, para que el servidor envíe al momento el aviso de «cancelada». Nunca se enseña. */
export function dinerCancelEstablishment(raw: unknown): string | null {
  return isRecord(raw) && raw.outcome === "cancelled" && typeof raw.establishment_id === "string" ? raw.establishment_id : null;
}
