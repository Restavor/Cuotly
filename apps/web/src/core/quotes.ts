/**
 * `src/core/quotes.ts` — presupuestos adicionales (PRD §26, RN-QUO; §84 de
 * la especificación maestra; Fase 2, Hito 12). Lógica de dominio pura, sin
 * Supabase ni React (CLAUDE.md).
 *
 * La autoridad es la migración 80: `quotes.state` guarda cuatro valores
 * (borrador, enviado, aceptado, rechazado) y `quote_status()` deriva los
 * cinco que ve una persona, porque "pendiente de pago" y "pagado" no son
 * una columna sino lo que dice el libro del cobro que emitió la
 * aceptación (RN-DAT-05). Este archivo es esa misma cuenta, probable sin
 * Postgres, y la puerta de Comenzar de un trabajo presupuestado
 * (RN-JOB-06): no es un control de acceso —`start_job()` lo vuelve a
 * comprobar—, es lo que la pantalla usa para decir por qué no se puede.
 */

/** Lo que la base guarda en `quotes.state`. */
export const QUOTE_STORED_STATES = ["draft", "sent", "accepted", "rejected"] as const;
export type QuoteStoredState = (typeof QUOTE_STORED_STATES)[number];

/**
 * §84, en el orden del documento: borrador, enviado, aceptado o rechazado,
 * pendiente de pago, pagado. "Aceptado" a secas no se enseña: aceptar es
 * el instante en que nace el cobro, y desde ese instante el presupuesto
 * está pendiente de pago o pagado. `state-catalogue.test.ts` lo tiene en
 * DERIVADOS por eso mismo.
 */
export const QUOTE_STATES = ["draft", "sent", "rejected", "pending_payment", "paid"] as const;
export type QuoteState = (typeof QUOTE_STATES)[number];

export function isQuoteState(value: string): value is QuoteState {
  return (QUOTE_STATES as readonly string[]).includes(value);
}

/** §84 · qué crea la aceptación: un trabajo, o nada porque es una plantilla de Menú Diario (RN-MEN-11). */
export const QUOTE_OUTCOMES = ["job", "menu_template"] as const;
export type QuoteOutcome = (typeof QUOTE_OUTCOMES)[number];

/**
 * El estado visible, derivado como lo deriva `quote_status()`: un
 * presupuesto aceptado está pendiente de pago mientras su cobro tenga
 * deuda viva, y pagado cuando el libro la deja a cero.
 */
export function quoteDisplayState(stored: QuoteStoredState, outstandingCents: number): QuoteState {
  if (stored === "accepted") return outstandingCents > 0 ? "pending_payment" : "paid";
  return stored;
}

/**
 * RN-JOB-06 / §84 · "Puede exigirse pago previo o autorizar inicio antes
 * del pago". Un trabajo presupuestado se puede comenzar si el presupuesto
 * no exige pago previo, o si el cobro ya está saldado, o si alguien con
 * `manage_finance` autorizó el inicio (y eso quedó registrado).
 */
export interface QuoteStartGate {
  readonly requiresPaymentBeforeStart: boolean;
  readonly outstandingCents: number;
  readonly startAuthorized: boolean;
}

export type QuoteStartBlocker = "payment_pending";

export function quotedJobCanStart(gate: QuoteStartGate): { ok: true } | { ok: false; blocker: QuoteStartBlocker } {
  if (!gate.requiresPaymentBeforeStart) return { ok: true };
  if (gate.outstandingCents <= 0) return { ok: true };
  if (gate.startAuthorized) return { ok: true };
  return { ok: false, blocker: "payment_pending" };
}

/** El tono de la insignia de un presupuesto, uno por estado (CA-21). */
export function quoteTone(state: QuoteState): "success" | "warning" | "danger" | "neutral" {
  switch (state) {
    case "paid":
      return "success";
    case "pending_payment":
    case "sent":
      return "warning";
    case "rejected":
      return "danger";
    case "draft":
      return "neutral";
  }
}

/**
 * Lo que el restaurante puede hacer con un presupuesto: responder solo a
 * uno enviado, y solo si es quien representa al restaurante (la misma
 * lista que acepta las condiciones: propietario local o global). El
 * servidor lo vuelve a comprobar en `accept_quote()` y `reject_quote()`.
 */
export function clientCanAnswerQuote(state: QuoteState, isEstablishmentOwner: boolean): boolean {
  return state === "sent" && isEstablishmentOwner;
}

/**
 * Decisión 21 (13/09/2026) · el propietario o un administrador del espacio
 * (`manage_requests`) pueden REGISTRAR la respuesta que el restaurante dio
 * fuera de Cuotly, en su nombre y con motivo obligatorio. Solo sobre uno
 * enviado, como el restaurante. El servidor lo vuelve a comprobar y es
 * quien exige el motivo; aquí solo se decide si se enseña el formulario.
 */
export function teamCanAnswerQuoteForClient(state: QuoteState, canManageRequests: boolean): boolean {
  return state === "sent" && canManageRequests;
}

/**
 * El motivo de una respuesta registrada en nombre del restaurante no puede
 * ir en blanco: es lo único que cuenta cómo y cuándo la dio. La misma
 * regla que aplica `accept_quote()` / `reject_quote()` (`btrim` y nulo).
 */
export function onBehalfReasonIsValid(reason: string): boolean {
  return reason.trim() !== "";
}
