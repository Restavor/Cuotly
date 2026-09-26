/**
 * `src/core/incidents.ts` — cambios e incidencias (decisión 83, PRD
 * RN-REQ-09 a RN-REQ-12). Lógica de dominio pura: sin Supabase, sin Next
 * y sin React (CLAUDE.md).
 *
 * La autoridad es la base (migración 147: `set_request_kind()`,
 * `resolve_incident()` y `accept_request()`), que vuelve a decidir cada
 * operación con la sesión de quien la hace. Esto existe para que la
 * pantalla ofrezca lo que se puede hacer y diga por qué no cuando no se
 * puede, nunca para decidirlo (CLAUDE.md: ocultar un botón no es un
 * control de acceso).
 */

import type { ChangeCategory } from "./classification-rules";
import { err, ok, type Result } from "./result";

/** RN-REQ-09 · una solicitud es un cambio en la web o algo que no funciona. */
export const REQUEST_KINDS = ["change", "incident"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export function isRequestKind(value: unknown): value is RequestKind {
  return typeof value === "string" && (REQUEST_KINDS as readonly string[]).includes(value);
}

/**
 * RN-REQ-11 · las cuatro salidas del diagnóstico, en el orden en que se
 * ofrecen: primero lo que no cuesta nada al restaurante.
 */
export const INCIDENT_OUTCOMES = ["restavor_error", "external", "quote", "change"] as const;
export type IncidentOutcome = (typeof INCIDENT_OUTCOMES)[number];

export function isIncidentOutcome(value: unknown): value is IncidentOutcome {
  return typeof value === "string" && (INCIDENT_OUTCOMES as readonly string[]).includes(value);
}

/**
 * Las dos salidas que acaban en un trabajo necesitan su tamaño: de él sale
 * el plazo de realización (RN-SLA-12). Las otras dos no crean trabajo.
 */
export function outcomeNeedsCategory(outcome: IncidentOutcome): boolean {
  return outcome === "restavor_error" || outcome === "quote";
}

/** La explicación la lee el restaurante; el servidor corta en el mismo sitio. */
export const INCIDENT_NOTE_MAX = 1000;

const CATEGORIES: readonly ChangeCategory[] = ["small", "photo", "medium", "large"];

export type IncidentResolution = {
  readonly outcome: IncidentOutcome;
  readonly note: string;
  readonly category: ChangeCategory | null;
};

export type IncidentResolutionError = "outcome" | "note" | "noteTooLong" | "category";

type FormLike = { get(name: string): unknown };

function texto(form: FormLike, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Lee el formulario del diagnóstico. Solo la forma: si la incidencia se
 * puede resolver, y quién, lo decide `resolve_incident()`.
 */
export function readIncidentResolution(form: FormLike): Result<IncidentResolution, IncidentResolutionError> {
  const outcome = texto(form, "outcome");
  if (!isIncidentOutcome(outcome)) return err("outcome");

  const note = texto(form, "note");
  if (note === "") return err("note");
  if (note.length > INCIDENT_NOTE_MAX) return err("noteTooLong");

  if (!outcomeNeedsCategory(outcome)) return ok({ outcome, note, category: null });

  const category = texto(form, "category");
  if (!(CATEGORIES as readonly string[]).includes(category)) return err("category");
  return ok({ outcome, note, category: category as ChangeCategory });
}

/**
 * RN-REQ-11 · se diagnostica una incidencia pendiente de validación
 * interna que todavía no tiene salida. Antes (recibida, en análisis) no
 * hay nada que resolver; después, ya está resuelta.
 */
export function canResolveIncident(request: {
  readonly kind: string;
  readonly state: string;
  readonly incidentOutcome: string | null;
}): boolean {
  return (
    request.kind === "incident" &&
    request.state === "pending_internal_validation" &&
    request.incidentOutcome === null
  );
}

/**
 * RN-REQ-09 · quién cambia el tipo y cuándo. El restaurante, en su
 * borrador; el equipo, enviada y antes de validarla. Una incidencia ya
 * resuelta no vuelve atrás.
 */
export function canChangeKind(request: {
  readonly state: string;
  readonly incidentOutcome: string | null;
}, as: "client" | "team"): boolean {
  if (as === "client") return request.state === "draft";
  return (
    ["received", "analyzing", "pending_internal_validation"].includes(request.state) &&
    request.incidentOutcome === null
  );
}

/**
 * RN-REQ-10 · lo que gasta una solicitud del plan. Una incidencia nunca:
 * o es sin coste, o va presupuestada, o dejó de ser incidencia.
 */
export function spendsFromPlan(kind: RequestKind): boolean {
  return kind === "change";
}
