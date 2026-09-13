/**
 * `src/core/daily-menu.ts` — reglas del servicio Menú Diario que no son la
 * máquina de estados (esa está en `menu-states.ts`): el corte de las
 * 21:00 y la garantía de las 08:00 (RN-MEN-07, §62), la devolución del
 * consumo (RN-MEN-05, RN-CON-08/10), el saldo de actualizaciones
 * (RN-COM-09, RN-CON-02) y el tope de plantillas incluidas (RN-COM-10).
 *
 * Lógica de dominio pura (CLAUDE.md). La migración 77 hace lo mismo en el
 * servidor, que es quien manda (`menu_cutoff_at()`, `menu_deadlines()`,
 * `credit_menu_update()`, `menu_update_balance()`); esto existe para que
 * la pantalla pueda decir "tienes hasta las 21:00 de mañana" ANTES de que
 * el menú exista, y para tener las reglas con tests que citan su número.
 */

import { zonedTimeToUtc } from "./business-clock";
import { calculateConsumptionBalance, type LedgerEntry } from "./consumption-ledger";

/** §57: "diario, Navidad, infantil, grupos o evento especial". Ni uno más. */
export const MENU_KINDS = ["daily", "christmas", "kids", "groups", "special_event"] as const;
export type MenuKind = (typeof MENU_KINDS)[number];

/** RN-COM-10: tres plantillas personalizadas iniciales, una sola vez. */
export const INCLUDED_TEMPLATE_LIMIT = 3;

/**
 * RN-COM-10 · "una sola vez": archivar una incluida no libera su plaza, así
 * que se cuentan todas las incluidas que hubo, archivadas o no.
 */
export function canCreateIncludedTemplate(includedEverCreated: number): boolean {
  return includedEverCreated < INCLUDED_TEMPLATE_LIMIT;
}

/** §62: "hasta las 21:00 del día anterior" y "antes de las 08:00". */
export const MENU_CUTOFF_HOUR = 21;
export const MENU_PUBLISH_BY_HOUR = 8;

function parseDate(targetDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!match) {
    throw new Error(`Fecha objetivo inválida: ${targetDate}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function previousDay(date: { year: number; month: number; day: number }): {
  year: number;
  month: number;
  day: number;
} {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day - 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * RN-MEN-07 · el corte: las 21:00 del día anterior a la fecha objetivo, en
 * la zona horaria del espacio (RN-CLK-06). Menú Diario opera todos los
 * días del año (RN-CLK-09): un festivo o un domingo no mueven el corte.
 */
export function menuCutoffAt(targetDate: string, timezone: string): Date {
  const { year, month, day } = previousDay(parseDate(targetDate));
  return zonedTimeToUtc(year, month, day, MENU_CUTOFF_HOUR, 0, timezone);
}

/** RN-MEN-07 · si la versión definitiva llegó antes del corte, se publica antes de las 08:00 del día objetivo. */
export function menuPublishByAt(targetDate: string, timezone: string): Date {
  const { year, month, day } = parseDate(targetDate);
  return zonedTimeToUtc(year, month, day, MENU_PUBLISH_BY_HOUR, 0, timezone);
}

/** Una versión guardada después del corte queda marcada (`menu_versions.after_cutoff`). */
export function isAfterCutoff(savedAt: Date, targetDate: string, timezone: string): boolean {
  return savedAt.getTime() > menuCutoffAt(targetDate, timezone).getTime();
}

export interface GuaranteeInput {
  readonly targetDate: string;
  readonly timezone: string;
  /** Cuándo pidió el restaurante la publicación; null si aún no la pidió. */
  readonly requestedAt: Date | null;
  /** Cuándo se guardó cada versión posterior o igual a la petición. */
  readonly versionSavedAt: readonly Date[];
}

/**
 * RN-MEN-07 · garantizada si la petición Y toda versión guardada desde
 * entonces llegaron antes del corte. "Cambios después de las 21:00 se
 * aceptan, pero no se garantiza que entren": aceptar sí, garantizar no.
 * Null mientras no hay publicación pedida: no hay nada que garantizar.
 */
export function isPublicationGuaranteed(input: GuaranteeInput): boolean | null {
  if (input.requestedAt === null) return null;
  const cutoff = menuCutoffAt(input.targetDate, input.timezone).getTime();
  if (input.requestedAt.getTime() > cutoff) return false;
  return input.versionSavedAt.every((at) => at.getTime() <= cutoff);
}

export type MenuCancellationOutcome =
  /** Nunca se pidió la publicación: no hay consumo que devolver. */
  | { readonly kind: "nothing_consumed" }
  /** RN-CON-08 aplicado (§60): antes de Publicado, se devuelve al ciclo del consumo. */
  | { readonly kind: "return" }
  /** RN-CON-10: el ciclo del consumo ya cerró; crédito compensatorio en el vigente. */
  | { readonly kind: "compensatory_credit" }
  /** §60: después de Publicado no se devuelve (salvo error del equipo, que es otra operación). */
  | { readonly kind: "not_allowed"; readonly reason: "already_published" };

export interface MenuCancellationInput {
  readonly published: boolean;
  /** Si hubo consumo, cuándo termina el ciclo en el que se apuntó. */
  readonly consumptionCycleEnd: Date | null;
  readonly now: Date;
}

export function menuCancellationOutcome(input: MenuCancellationInput): MenuCancellationOutcome {
  if (input.published) return { kind: "not_allowed", reason: "already_published" };
  if (input.consumptionCycleEnd === null) return { kind: "nothing_consumed" };
  return input.now.getTime() < input.consumptionCycleEnd.getTime()
    ? { kind: "return" }
    : { kind: "compensatory_credit" };
}

/**
 * RN-COM-09 / RN-CON-02 · saldo de actualizaciones del ciclo: las
 * incluidas más la suma del libro. Mismo cálculo que el de cambios; el
 * contador es otro, la regla es la misma.
 */
export function updateBalance(includedUpdates: number, entries: readonly LedgerEntry[]): number {
  return calculateConsumptionBalance(includedUpdates, entries);
}

/** RN-CON-06 aplicado: solo hay crédito para pedir si el saldo es al menos 1. */
export function canRequestPublication(includedUpdates: number, entries: readonly LedgerEntry[]): boolean {
  return updateBalance(includedUpdates, entries) >= 1;
}
