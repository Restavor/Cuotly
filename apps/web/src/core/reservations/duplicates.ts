/**
 * `src/core/reservations/duplicates.ts` · posibles duplicadas (RN-RES-06; PRD de agents §6.7).
 *
 * Dos reservas ACTIVAS (pendiente o confirmada) del mismo restaurante, el mismo día y el
 * mismo teléfono normalizado forman un par, salvo que el par esté descartado ("No es
 * duplicada"). La marca se recalcula al crear, editar o cancelar cualquiera de las dos:
 * al cancelar una, la otra vuelve a no estar marcada si no tiene otro par. La app nunca
 * une ni cancela sola.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import type { LocalDate } from "./dates";
import { countsTowardCapacity } from "./types";
import type { ReservationStatus } from "./types";

export interface DuplicateCandidate {
  readonly id: string;
  readonly date: LocalDate;
  /** E.164 normalizado, o `null` (una reserva solo con email no forma pares). */
  readonly phoneE164: string | null;
  readonly status: ReservationStatus;
}

/** El par se guarda ordenado (`reservation_a < reservation_b`), como en `reservation_duplicate_dismissals`. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Los ids que están marcados como posible duplicada. */
export function duplicateIds(
  reservations: readonly DuplicateCandidate[],
  dismissedPairs: ReadonlySet<string>,
): ReadonlySet<string> {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const r of reservations) {
    if (!countsTowardCapacity(r.status) || r.phoneE164 === null) continue;
    const key = `${r.date}|${r.phoneE164}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const marked = new Set<string>();
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (dismissedPairs.has(pairKey(list[i].id, list[j].id))) continue;
        marked.add(list[i].id);
        marked.add(list[j].id);
      }
    }
  }
  return marked;
}

/** Con quién forma pareja una reserva (para "Cancelar una" y "No es duplicada"). */
export function duplicatePartners(
  id: string,
  reservations: readonly DuplicateCandidate[],
  dismissedPairs: ReadonlySet<string>,
): readonly DuplicateCandidate[] {
  const me = reservations.find((r) => r.id === id);
  if (!me || !countsTowardCapacity(me.status) || me.phoneE164 === null) return [];
  return reservations.filter(
    (r) =>
      r.id !== id &&
      countsTowardCapacity(r.status) &&
      r.date === me.date &&
      r.phoneE164 === me.phoneE164 &&
      !dismissedPairs.has(pairKey(id, r.id)),
  );
}
