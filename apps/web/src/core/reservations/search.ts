/**
 * `src/core/reservations/search.ts` · Buscar reserva (RES-09; PRD de agents §11.1).
 *
 * Por nombre o por teléfono (bastan los 3 últimos números), en los últimos 30 días y en
 * todas las futuras. Los resultados salen en dos grupos, "Próximas" y "Últimos 30
 * días", con la coincidencia resaltada.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { addDays, localDateOf } from "./dates";
import type { LocalDate, LocalTime } from "./dates";
import { phoneEndsWith } from "./phone";
import type { ReservationStatus } from "./types";

export const SEARCH_PAST_DAYS = 30;
export const MIN_NAME_CHARS = 2;
export const MIN_PHONE_DIGITS = 3;

export interface SearchableReservation {
  readonly id: string;
  readonly date: LocalDate;
  readonly time: LocalTime;
  readonly customerName: string;
  readonly phoneE164: string | null;
  readonly status: ReservationStatus;
}

export type SearchQuery =
  | { readonly kind: "empty" }
  | { readonly kind: "too_short" }
  | { readonly kind: "name"; readonly text: string }
  | { readonly kind: "phone"; readonly digits: string };

/** Quita tildes y pasa a minúsculas, conservando la longitud (para poder resaltar sobre el original). */
function fold(text: string): string {
  return text
    .split("")
    .map((ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() || ch.toLowerCase())
    .join("");
}

/** Decide si lo escrito es un teléfono (solo cifras y separadores) o un nombre. */
export function parseSearchQuery(raw: string): SearchQuery {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (/^[+\d\s.\-()]+$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    return digits.length >= MIN_PHONE_DIGITS ? { kind: "phone", digits } : { kind: "too_short" };
  }
  return text.length >= MIN_NAME_CHARS ? { kind: "name", text } : { kind: "too_short" };
}

/** Dónde resaltar en el nombre: [inicio, fin) sobre el texto original. */
export function highlightRange(name: string, text: string): readonly [number, number] | null {
  const at = fold(name).indexOf(fold(text.trim()));
  return at < 0 ? null : [at, at + text.trim().length];
}

export interface SearchHit<T extends SearchableReservation> {
  readonly reservation: T;
  readonly matchedBy: "name" | "phone";
  readonly nameRange: readonly [number, number] | null;
}

export interface SearchResults<T extends SearchableReservation> {
  readonly upcoming: readonly SearchHit<T>[];
  readonly past: readonly SearchHit<T>[];
}

/** El primer día que entra en la búsqueda: hoy menos 30 días, en la zona del restaurante. */
export function searchWindowStart(now: Date, timeZone: string): LocalDate {
  return addDays(localDateOf(now, timeZone), -SEARCH_PAST_DAYS);
}

/**
 * Busca y reparte. "Próximas" (de hoy en adelante) de la más cercana a la más lejana;
 * "Últimos 30 días" de la más reciente a la más antigua. Las anonimizadas no tienen
 * nombre ni teléfono que buscar, así que no aparecen.
 */
export function searchReservations<T extends SearchableReservation>(
  query: SearchQuery,
  reservations: readonly T[],
  now: Date,
  timeZone: string,
): SearchResults<T> {
  if (query.kind !== "name" && query.kind !== "phone") return { upcoming: [], past: [] };
  const today = localDateOf(now, timeZone);
  const from = searchWindowStart(now, timeZone);
  const hits: SearchHit<T>[] = [];
  for (const r of reservations) {
    if (r.date < from) continue;
    if (query.kind === "phone") {
      if (r.phoneE164 !== null && phoneEndsWith(r.phoneE164, query.digits)) hits.push({ reservation: r, matchedBy: "phone", nameRange: null });
    } else {
      const range = highlightRange(r.customerName, query.text);
      if (range) hits.push({ reservation: r, matchedBy: "name", nameRange: range });
    }
  }
  const key = (h: SearchHit<T>) => `${h.reservation.date} ${h.reservation.time}`;
  const upcoming = hits.filter((h) => h.reservation.date >= today).sort((a, b) => key(a).localeCompare(key(b)));
  const past = hits.filter((h) => h.reservation.date < today).sort((a, b) => key(b).localeCompare(key(a)));
  return { upcoming, past };
}
