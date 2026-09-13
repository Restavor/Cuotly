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
import type { MenuState } from "./menu-states";

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

/** "14,50" o "14.50" o "14" → 1450. Vacío → null. Cualquier otra cosa → undefined (no se entiende). */
export function parsePriceToCents(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === "") return null;
  const match = /^(\d{1,5})(?:[,.](\d{1,2}))?\s*€?$/.exec(text);
  if (!match) return undefined;
  const euros = Number(match[1]);
  const cents = match[2] === undefined ? 0 : Number(match[2].padEnd(2, "0"));
  return euros * 100 + cents;
}

/** Un plato por línea (§58): se quitan las vacías y los espacios de los bordes. */
export function linesToItems(raw: string): readonly string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------
// Hito 11 · el recordatorio de las 20:00 (RN-MEN-08), el aviso de las
// 08:00 (§62) y la corrección mínima de Menú Diario (RN-COR-10).
// La migración 79 hace lo mismo en el servidor (`run_daily_menu_sweep()`,
// `request_menu_correction()`); esto existe para que la pantalla lo diga
// con las mismas reglas y para que las reglas tengan tests con su número.
// ---------------------------------------------------------------------

/** §62: "A las 20:00 se recuerda al propietario y Editores si no existe menú preparado para el día siguiente." */
export const MENU_REMINDER_HOUR = 20;

/**
 * RN-MEN-08 · "menú preparado" es cualquier menú de mañana que no sea un
 * borrador ni esté cancelado: preparado, pedido, asignado o publicado
 * cuentan; un borrador a medias, no.
 */
export function countsAsPreparedForReminder(state: MenuState): boolean {
  return state !== "draft" && state !== "cancelled";
}

function localParts(at: Date, timezone: string): { readonly date: string; readonly hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function nextDay(date: string): string {
  const { year, month, day } = parseDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return d.toISOString().slice(0, 10);
}

export interface MenuReminderInput {
  readonly now: Date;
  readonly timezone: string;
  /** Los estados de los menús cuya fecha objetivo es MAÑANA en la zona del espacio. */
  readonly tomorrowMenuStates: readonly MenuState[];
}

export interface MenuReminderDecision {
  /** Si a esta hora, en este día, toca recordar (RN-MEN-08). */
  readonly due: boolean;
  /** El día del que falta el menú, `AAAA-MM-DD` en la zona del espacio. */
  readonly targetDate: string;
}

/**
 * RN-MEN-08 · a partir de las 20:00 en la zona del espacio (RN-CLK-06),
 * todos los días del año (RN-CLK-09: ningún festivo ni domingo lo apaga),
 * si no hay ningún menú preparado para mañana. "A partir de" y no "a las":
 * el barrido no sabe a qué hora lo van a ejecutar, y la clave de
 * deduplicación lleva la fecha para que corra las veces que haga falta.
 */
export function menuReminderDecision(input: MenuReminderInput): MenuReminderDecision {
  const { date, hour } = localParts(input.now, input.timezone);
  const targetDate = nextDay(date);
  const prepared = input.tomorrowMenuStates.some(countsAsPreparedForReminder);
  return { due: hour >= MENU_REMINDER_HOUR && !prepared, targetDate };
}

/**
 * §62 · una publicación garantizada (RN-MEN-07: pedida antes del corte y
 * sin versión tardía) se publica antes de las 08:00 del día objetivo.
 * Pasada esa hora sin publicar, es un incumplimiento y el equipo tiene
 * que verlo.
 */
export function isPublicationOverdue(input: {
  readonly now: Date;
  readonly targetDate: string;
  readonly timezone: string;
  /** Lo que deriva `isPublicationGuaranteed()` / `menu_deadlines()`; null si no se pidió. */
  readonly guaranteed: boolean | null;
  readonly published: boolean;
}): boolean {
  if (input.published || input.guaranteed !== true) return false;
  return input.now.getTime() >= menuPublishByAt(input.targetDate, input.timezone).getTime();
}

/**
 * RN-COR-02 aplicada a Menú Diario: 72 h posteriores a la publicación.
 * Son horas de reloj y no del calendario contractual porque Menú Diario
 * tiene el suyo propio y opera todos los días del año (RN-CLK-09); en ese
 * calendario no hay horas no laborables que descontar.
 */
export const MENU_CORRECTION_WINDOW_HOURS = 72;

export function menuCorrectionWindowEndsAt(publishedAt: Date): Date {
  return new Date(publishedAt.getTime() + MENU_CORRECTION_WINDOW_HOURS * 60 * 60 * 1000);
}

/**
 * RN-COR-10 · la corrección existe, "pero no se garantiza su ejecución si
 * la edición o la petición de cambio llega después de las 21:00 del día
 * anterior". Es el mismo corte que la publicación (RN-MEN-07), y el corte
 * lo da el servidor (`menu_deadlines()`, RN-DAT-05): el cliente no lee la
 * zona del espacio, y no hace falta que la lea.
 */
export function isMenuCorrectionGuaranteed(requestedAt: Date, cutoffAt: Date): boolean {
  return requestedAt.getTime() <= cutoffAt.getTime();
}

export type MenuCorrectionAvailability =
  | { readonly available: true; readonly guaranteed: boolean }
  | { readonly available: false; readonly reason: "not_published" | "already_used" | "window_closed" };

export interface MenuCorrectionInput {
  readonly state: MenuState;
  readonly publishedAt: Date | null;
  /** Si la publicación ya tiene su corrección mínima pedida (RN-COR-01). */
  readonly alreadyRequested: boolean;
  /** El corte de las 21:00 del día anterior, tal como lo deriva el servidor. */
  readonly cutoffAt: Date;
  readonly now: Date;
}

/**
 * Si el restaurante puede pedir su corrección mínima, y si esta llegaría
 * garantizada. Lo que entra o no en su alcance (RN-COR-03/04) lo juzga
 * una persona al leerla: aquí no hay ninguna heurística.
 */
export function menuCorrectionAvailability(input: MenuCorrectionInput): MenuCorrectionAvailability {
  if (input.state !== "published" || input.publishedAt === null) {
    return { available: false, reason: "not_published" };
  }
  // RN-COR-01: una sola por publicación.
  if (input.alreadyRequested) return { available: false, reason: "already_used" };
  // RN-COR-02: la ventana posterior a la publicación.
  if (input.now.getTime() > menuCorrectionWindowEndsAt(input.publishedAt).getTime()) {
    return { available: false, reason: "window_closed" };
  }
  return { available: true, guaranteed: isMenuCorrectionGuaranteed(input.now, input.cutoffAt) };
}
