/**
 * `src/core/free-correction.ts` — la corrección mínima gratuita (PRD §13
 * RN-COR, HU-23). Lógica de dominio pura: sin Supabase, sin Next.js, sin
 * React (CLAUDE.md, regla de estilo de código).
 *
 * > 1 cambio realizado → 1 corrección mínima gratuita sobre ese mismo
 * > cambio → 0 créditos adicionales.
 *
 * Este módulo decide **si la corrección está disponible**, que es lo único
 * mecanizable. Lo que entra o no entra en su alcance (RN-COR-03/04:
 * corregir una errata sí, añadir contenido nuevo no) lo juzga una persona
 * al leer la petición — no hay ninguna heurística automática aquí, y no se
 * inventa ninguna.
 */

import { businessMinutesBetween, type WorkCalendar } from "./business-clock";

/**
 * RN-COR-02: la ventana posterior a la publicación son **72 h laborables**,
 * medidas con el reloj contractual (RN-CLK), no con horas naturales.
 */
export const FREE_CORRECTION_WINDOW_BUSINESS_HOURS = 72;

export type FreeCorrectionInput = {
  /**
   * Estado publicado del trabajo: `null` mientras no se ha publicado
   * (RN-COR-02: la corrección "puede usarse durante la ejecución").
   */
  readonly publishedAt: Date | null;
  /**
   * Cuándo se usó ya la corrección mínima de este trabajo, si se usó
   * (RN-COR-01: una sola en total por trabajo; RN-COR-02: si se usa durante
   * la ejecución, no vuelve a estar disponible después).
   */
  readonly usedAt: Date | null;
  readonly now: Date;
  readonly calendar: WorkCalendar;
};

/**
 * Por qué no está disponible, para poder explicarlo con un motivo concreto
 * en la interfaz en vez de un botón desactivado sin explicación (PRD §20.7:
 * "confirmaciones descriptivas"; CLAUDE.md MUST NOT: si no hay dato, se
 * dice cuál es el motivo).
 */
export type FreeCorrectionAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: "already_used" | "window_closed" };

export function freeCorrectionAvailability(input: FreeCorrectionInput): FreeCorrectionAvailability {
  // RN-COR-01/02: una sola corrección en total por trabajo, se haya usado
  // durante la ejecución o después de publicar.
  if (input.usedAt !== null) return { available: false, reason: "already_used" };

  // RN-COR-02, primera mitad: "puede usarse durante la ejecución". Antes de
  // publicar no hay ventana que agotar.
  if (input.publishedAt === null) return { available: true };

  const elapsed = businessMinutesBetween(input.publishedAt, input.now, input.calendar);
  if (elapsed > FREE_CORRECTION_WINDOW_BUSINESS_HOURS * 60) {
    return { available: false, reason: "window_closed" };
  }

  return { available: true };
}

/**
 * RN-COR-08: al terminar la ventana de corrección, la conversación de esa
 * solicitud pasa a **solo lectura**; una necesidad nueva exige una
 * solicitud nueva. RN-COR-09: no hay recordatorio automático de expiración
 * — por eso esto es una condición que se calcula al mirar, no un aviso
 * programado.
 */
export function isCorrectionWindowClosed(input: Omit<FreeCorrectionInput, "usedAt">): boolean {
  if (input.publishedAt === null) return false;
  return businessMinutesBetween(input.publishedAt, input.now, input.calendar) > FREE_CORRECTION_WINDOW_BUSINESS_HOURS * 60;
}

/**
 * RN-COR-07 · RN-JOB-12: un error imputable al equipo se corrige **sin**
 * consumir esta corrección ni créditos. Por eso el tipo de corrección es un
 * dato explícito del registro, no una interpretación posterior: solo
 * `client_request` gasta la corrección mínima.
 */
export type CorrectionKind = "client_request" | "team_error";

export function consumesFreeCorrection(kind: CorrectionKind): boolean {
  return kind === "client_request";
}
