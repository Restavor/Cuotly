/**
 * `src/core/support.ts` — el soporte de Cuotly, el centro de ayuda y la
 * página de estado (PRD §34, RN-SOP; §131, §132, §133 y §157 de la
 * maestra; Fase 4, Hito 21). Lógica de dominio pura, sin Supabase, sin
 * Next y sin React (CLAUDE.md).
 *
 * Qué decide este archivo:
 *
 *   · **Los catálogos** —tipos, categorías, impactos, estados, lados,
 *     componentes y gravedades— y **la tabla de transiciones** de una
 *     incidencia (RN-SOP-04). Están duplicados a propósito con la
 *     migración 93: son dos sistemas que no pueden importarse el uno al
 *     otro, y `listas-compartidas.test.ts` vigila que no se separen.
 *   · **La prioridad** (RN-SOP-05), la misma cuenta que
 *     `incident_priority_for()`.
 *   · **Qué se mide y qué no** en la página de estado (RN-SOP-12).
 *
 * Lo que NO está aquí:
 *
 *   · **El control de acceso.** Quién abre, quién contesta y quién mueve
 *     lo decide el servidor (migración 93). Lo de aquí es la misma cuenta
 *     para que la pantalla no ofrezca un botón que va a rechazar.
 *   · **El reloj humano.** Vive en `business-clock.ts` desde la Fase 1
 *     (`supportCalendar()`); aquí solo se le pone nombre a la zona.
 *   · **El texto.** Los nombres en español los escribe la pantalla desde
 *     `src/i18n/es.ts` (CLAUDE.md).
 */

import { type WorkCalendar, isWithinBusinessWindow, supportCalendar } from "./business-clock";

/** RN-SOP-02 · §133: "sugerencias de funciones separadas de errores". */
export const INCIDENT_KINDS = ["error", "suggestion"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export function isIncidentKind(value: string): value is IncidentKind {
  return (INCIDENT_KINDS as readonly string[]).includes(value);
}

/** §133 · los ocho temas del centro de ayuda, en su orden. */
export const HELP_TOPICS = [
  "first_steps",
  "requests",
  "jobs",
  "menus",
  "payments",
  "users",
  "integrations",
  "security",
] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

/**
 * RN-SOP-03 · las categorías de una incidencia son los ocho temas más
 * "otra": la guía y la incidencia hablan el mismo idioma, y una búsqueda
 * sin solución (RN-SOP-11) ya sabe de qué va.
 */
export const INCIDENT_CATEGORIES = [...HELP_TOPICS, "other"] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export function isIncidentCategory(value: string): value is IncidentCategory {
  return (INCIDENT_CATEGORIES as readonly string[]).includes(value);
}

/** RN-SOP-03 · cuatro niveles; §131 solo nombra el crítico. */
export const INCIDENT_IMPACTS = ["low", "medium", "high", "critical"] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

export function isIncidentImpact(value: string): value is IncidentImpact {
  return (INCIDENT_IMPACTS as readonly string[]).includes(value);
}

/** §131 · los seis estados, en el orden en que se recorren. */
export const INCIDENT_STATES = [
  "open",
  "in_review",
  "needs_information",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

export function isIncidentState(value: string): value is IncidentState {
  return (INCIDENT_STATES as readonly string[]).includes(value);
}

/** Los dos lados de una incidencia: el espacio que la abre y Cuotly. */
export const INCIDENT_SIDES = ["space", "platform"] as const;
export type IncidentSide = (typeof INCIDENT_SIDES)[number];

/**
 * RN-SOP-04 · la misma tabla que `incident_transition_allowed()`.
 *
 *   · Cuotly lleva la incidencia por los estados de trabajo.
 *   · "Necesita información" devuelve la pelota al espacio, que al
 *     contestar la deja en revisión.
 *   · De "resuelta" el espacio cierra (conforme) o reabre.
 *   · "Cerrada" es final, y **nadie cierra sola**: §131 no da plazo.
 */
const TRANSITIONS: Readonly<
  Record<IncidentState, Readonly<Record<IncidentState, readonly IncidentSide[]>>>
> = {
  open: {
    open: [],
    in_review: ["platform"],
    needs_information: ["platform"],
    in_progress: ["platform"],
    resolved: ["platform"],
    closed: ["platform"],
  },
  in_review: {
    open: [],
    in_review: [],
    needs_information: ["platform"],
    in_progress: ["platform"],
    resolved: ["platform"],
    closed: ["platform"],
  },
  needs_information: {
    open: [],
    in_review: ["space", "platform"],
    needs_information: [],
    in_progress: [],
    resolved: [],
    closed: ["platform"],
  },
  in_progress: {
    open: [],
    in_review: ["platform"],
    needs_information: ["platform"],
    in_progress: [],
    resolved: ["platform"],
    closed: ["platform"],
  },
  resolved: {
    open: [],
    in_review: ["space"],
    needs_information: [],
    in_progress: ["platform"],
    resolved: [],
    closed: ["space", "platform"],
  },
  closed: {
    open: [],
    in_review: [],
    needs_information: [],
    in_progress: [],
    resolved: [],
    closed: [],
  },
};

export function incidentTransitionAllowed(
  from: IncidentState,
  to: IncidentState,
  side: IncidentSide,
): boolean {
  return TRANSITIONS[from][to].includes(side);
}

/** RN-SOP-04 · pedir información sin decir cuál, y cerrar sin resolver. */
export function incidentNeedsReason(from: IncidentState, to: IncidentState): boolean {
  return to === "needs_information" || (to === "closed" && from !== "resolved");
}

export function isIncidentFinal(state: IncidentState): boolean {
  return state === "closed";
}

/** Las que esperan algo del espacio: contestar, o dar por buena la solución (§20.4). */
export function incidentAwaitsSpace(state: IncidentState): boolean {
  return state === "needs_information" || state === "resolved";
}

/** RN-SOP-05 · crítica > Agency > estándar. Una sugerencia no tiene prioridad. */
export const INCIDENT_PRIORITIES = ["critical", "high", "standard"] as const;
export type IncidentPriority = (typeof INCIDENT_PRIORITIES)[number];

export function incidentPriorityFor(
  kind: IncidentKind,
  impact: IncidentImpact | null,
  cuotlyPlan: string | null,
): IncidentPriority | null {
  if (kind !== "error") return null;
  if (impact === "critical") return "critical";
  if (cuotlyPlan === "agency") return "high";
  return "standard";
}

/** El orden de la bandeja de Cuotly: primero lo que más urge. */
export function incidentPriorityRank(priority: IncidentPriority | null): number {
  switch (priority) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "standard":
      return 2;
    case null:
      return 3;
  }
}

/**
 * §131 · lo que "Cuotly puede recoger informando al usuario". Las cuatro
 * claves, y ninguna más: `open_incident()` descarta el resto aunque
 * llegue. La pantalla enseña estos cuatro valores ANTES de enviar.
 */
export const CLIENT_CONTEXT_KEYS = ["browser", "os", "screen", "error"] as const;
export type ClientContextKey = (typeof CLIENT_CONTEXT_KEYS)[number];
export type ClientContext = Readonly<Partial<Record<ClientContextKey, string>>>;

export function pickClientContext(raw: Readonly<Record<string, unknown>>): ClientContext {
  const out: Partial<Record<ClientContextKey, string>> = {};
  for (const key of CLIENT_CONTEXT_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim();
  }
  return out;
}

/** RN-SOP-06 · §132 es el horario de Bosco: la zona es la de Cuotly, no la del espacio. */
export const SUPPORT_TIMEZONE = "Europe/Madrid";

/**
 * El reloj humano, con los festivos de Cuotly (RN-SOP-06). Es el
 * `supportCalendar()` de la Fase 1 con la zona ya puesta: la lista de
 * festivos la trae quien llama, del servidor, y nace vacía.
 */
export function cuotlySupportCalendar(holidays: readonly string[] = []): WorkCalendar {
  return supportCalendar(SUPPORT_TIMEZONE, holidays);
}

export function supportIsOpenAt(at: Date, holidays: readonly string[] = []): boolean {
  return isWithinBusinessWindow(at, cuotlySupportCalendar(holidays));
}

/** §133 · los cinco componentes de la página de estado, en su orden. */
export const STATUS_COMPONENTS = ["app", "auth", "files", "notifications", "integrations"] as const;
export type StatusComponent = (typeof STATUS_COMPONENTS)[number];

/** RN-SOP-13 · lo que Cuotly puede declarar sobre un componente. */
export const STATUS_SEVERITIES = ["degraded", "outage", "maintenance"] as const;
export type StatusSeverity = (typeof STATUS_SEVERITIES)[number];

export function isStatusComponent(value: string): value is StatusComponent {
  return (STATUS_COMPONENTS as readonly string[]).includes(value);
}

export function isStatusSeverity(value: string): value is StatusSeverity {
  return (STATUS_SEVERITIES as readonly string[]).includes(value);
}

/**
 * RN-SOP-12 · qué se mide desde la base y qué no. Autenticación y archivos
 * NO: la página lo dice en vez de suponer un "todo operativo".
 */
export const MEASURED_COMPONENTS: readonly StatusComponent[] = ["app", "notifications", "integrations"];

export function componentIsMeasured(component: StatusComponent): boolean {
  return MEASURED_COMPONENTS.includes(component);
}

/** Lo que enseña la página por componente, ya resuelto entre lo medido y lo declarado. */
export type ComponentDisplayState = "operational" | "degraded" | "outage" | "maintenance" | "unmeasured";

export interface ComponentSnapshot {
  readonly component: StatusComponent;
  readonly measured: boolean;
  readonly measuredState: "operational" | "degraded" | null;
  readonly declared: readonly { readonly severity: StatusSeverity }[];
}

/**
 * Lo declarado manda sobre lo medido: si Cuotly dice que hay una caída,
 * hay una caída aunque el contador diga otra cosa. Sin declaración y sin
 * medición, "sin medición automática" — nunca "operativo" por defecto.
 */
export function componentDisplayState(snapshot: ComponentSnapshot): ComponentDisplayState {
  const worst = worstSeverity(snapshot.declared.map((d) => d.severity));
  if (worst !== null) return worst;
  if (!snapshot.measured || snapshot.measuredState === null) return "unmeasured";
  return snapshot.measuredState;
}

const SEVERITY_ORDER: readonly StatusSeverity[] = ["outage", "degraded", "maintenance"];

export function worstSeverity(severities: readonly StatusSeverity[]): StatusSeverity | null {
  for (const candidate of SEVERITY_ORDER) {
    if (severities.includes(candidate)) return candidate;
  }
  return null;
}

/** §133 · "guías por rol": a qué audiencia pertenece cada rol del armazón. */
export const HELP_AUDIENCES = ["owner", "admin", "worker", "client"] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];

export function helpAudienceFor(role: string): HelpAudience {
  switch (role) {
    case "owner":
    case "admin":
    case "worker":
      return role;
    default:
      // Los dos roles de restaurante del armazón (`client` y
      // `client_daily_menu`) y cualquier rol futuro caen del lado del
      // cliente: es el lado que menos ve, y por tanto el seguro.
      return "client";
  }
}
