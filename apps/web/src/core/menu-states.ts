/**
 * `src/core/menu-states.ts` — la máquina de estados de un menú de Menú
 * Diario (PRD §25, RN-MEN-09; §63 de la especificación maestra; Fase 2,
 * Hito 9). Lógica de dominio pura, sin Supabase ni React (CLAUDE.md).
 * Mismo patrón que `job-states.ts`: la tabla de transiciones es el dato, y
 * la migración 77 hace cumplir en el servidor exactamente estas mismas
 * transiciones. Este módulo no es un control de acceso: es la definición
 * compartida que la pantalla usa para saber qué botón enseñar.
 *
 * Los once estados son los de §63, en su orden. Dos matices que conviene
 * saber al leer la tabla:
 *
 *   · "Publicación solicitada" y "Pendiente de asignación" son dos estados
 *     por los que pasa UNA misma llamada (`request_menu_publication`): el
 *     primero deja constancia de que el restaurante pidió, el
 *     segundo de que el equipo aún no tiene a nadie. Si hay un único
 *     candidato, la misma llamada sigue hasta "Asignado" (RN-ASG-04).
 *   · No hay "Comenzar" (§61): de asignado se va a pedir información, a
 *     listo para publicar o directamente a publicado.
 *   · Desde la decisión 85 pedir la publicación no consume (RN-CRE-22) y
 *     el menú del día publicado vuelve a borrador al editarlo (RN-CRE-30).
 */

/** §63, en el orden del documento. `state-catalogue.test.ts` lo compara con el CHECK de `menus.state`. */
export const MENU_STATES = [
  "draft",
  "prepared",
  "publication_requested",
  "pending_assignment",
  "assigned",
  "needs_information",
  "reviewing",
  "ready_to_publish",
  "published",
  "cancelled",
  "publication_error",
] as const;

export type MenuState = (typeof MENU_STATES)[number];

export function isMenuState(value: string): value is MenuState {
  return (MENU_STATES as readonly string[]).includes(value);
}

/**
 * Quién dispara la transición:
 * - `client`: quien prepara el menú por el restaurante (propietario local,
 *   Editor, propietario global; o el equipo con `manage_requests` en su
 *   nombre).
 * - `worker`: el trabajador de Menú Diario asignado (o quien gestiona, en
 *   su lugar).
 * - `staff`: propietario o administrador del espacio (`assign_jobs`).
 * - `system`: el paso automático dentro de la misma llamada.
 */
export type MenuActor = "client" | "worker" | "staff" | "system";

export interface MenuTransition {
  readonly from: MenuState;
  readonly to: MenuState;
  readonly actor: MenuActor;
  /**
   * Qué le pasa al contador de actualizaciones. Desde la decisión 85 no hay
   * contador (RN-CRE-22): siempre `null`. Una publicación antigua que sí
   * consumió la devuelve el servidor al cancelarla (`cancel_menu()`), por
   * el apunte que tiene, no por esta tabla.
   */
  readonly updates: "debit" | "return" | null;
}

/** Estados en los que hay una publicación viva que el equipo tiene entre manos. */
export const IN_FLIGHT_MENU_STATES: readonly MenuState[] = [
  "publication_requested",
  "pending_assignment",
  "assigned",
  "needs_information",
  "reviewing",
  "ready_to_publish",
  "publication_error",
];

/**
 * Estados finales: ni se cancelan ni, salvo el menú del día publicado
 * (RN-CRE-30, `canSaveMenuVersion()`), se editan; se copian (§59).
 */
export const FINAL_MENU_STATES: readonly MenuState[] = ["published", "cancelled"];

export const MENU_TRANSITIONS: readonly MenuTransition[] = [
  // §59/§63 · el restaurante prepara.
  { from: "draft", to: "prepared", actor: "client", updates: null },
  // RN-CRE-22 · pedir la publicación ya no consume nada.
  { from: "prepared", to: "publication_requested", actor: "client", updates: null },
  { from: "publication_requested", to: "pending_assignment", actor: "system", updates: null },
  // RN-ASG-04 · único candidato → asignación automática; si no, a mano.
  { from: "pending_assignment", to: "assigned", actor: "system", updates: null },
  { from: "pending_assignment", to: "assigned", actor: "staff", updates: null },
  // El trabajador: pedir información, listo, publicar, error.
  { from: "assigned", to: "needs_information", actor: "worker", updates: null },
  { from: "reviewing", to: "needs_information", actor: "worker", updates: null },
  { from: "ready_to_publish", to: "needs_information", actor: "worker", updates: null },
  { from: "needs_information", to: "reviewing", actor: "client", updates: null },
  { from: "assigned", to: "ready_to_publish", actor: "worker", updates: null },
  { from: "reviewing", to: "ready_to_publish", actor: "worker", updates: null },
  { from: "assigned", to: "published", actor: "worker", updates: null },
  { from: "reviewing", to: "published", actor: "worker", updates: null },
  { from: "ready_to_publish", to: "published", actor: "worker", updates: null },
  { from: "publication_error", to: "published", actor: "worker", updates: null },
  { from: "assigned", to: "publication_error", actor: "worker", updates: null },
  { from: "reviewing", to: "publication_error", actor: "worker", updates: null },
  { from: "ready_to_publish", to: "publication_error", actor: "worker", updates: null },
  // §60 · se cancela antes de Publicado. Sin contador, no hay nada que
  // devolver (RN-CRE-22).
  { from: "draft", to: "cancelled", actor: "client", updates: null },
  { from: "prepared", to: "cancelled", actor: "client", updates: null },
  { from: "publication_requested", to: "cancelled", actor: "client", updates: null },
  { from: "pending_assignment", to: "cancelled", actor: "client", updates: null },
  { from: "assigned", to: "cancelled", actor: "client", updates: null },
  { from: "needs_information", to: "cancelled", actor: "client", updates: null },
  { from: "reviewing", to: "cancelled", actor: "client", updates: null },
  { from: "ready_to_publish", to: "cancelled", actor: "client", updates: null },
  { from: "publication_error", to: "cancelled", actor: "client", updates: null },
  // RN-CRE-30 · solo el menú del día: guardar una versión nueva lo devuelve
  // a borrador (`save_menu_version()`); los otros tipos, publicados, se copian.
  { from: "published", to: "draft", actor: "client", updates: null },
];

export function menuTransition(from: MenuState, to: MenuState, actor: MenuActor): MenuTransition | null {
  return MENU_TRANSITIONS.find((t) => t.from === from && t.to === to && t.actor === actor) ?? null;
}

export function canTransitionMenu(from: MenuState, to: MenuState, actor: MenuActor): boolean {
  return menuTransition(from, to, actor) !== null;
}

/** A qué estados puede llevar un actor un menú desde `from`. */
export function menuTransitionsFrom(from: MenuState, actor: MenuActor): readonly MenuState[] {
  return [...new Set(MENU_TRANSITIONS.filter((t) => t.from === from && t.actor === actor).map((t) => t.to))];
}

/** RN-MEN-03: se edita (versión nueva) mientras no esté publicado ni cancelado. */
export function isMenuEditable(state: MenuState): boolean {
  return !FINAL_MENU_STATES.includes(state);
}

/**
 * RN-CRE-30 (decisión 86) · se puede guardar una versión nueva: lo de
 * RN-MEN-03, y además el menú del día publicado, que se cambia editándolo
 * y vuelve a borrador. Los otros tipos, publicados, se copian.
 */
export function canSaveMenuVersion(state: MenuState, kind: string): boolean {
  return isMenuEditable(state) || (state === "published" && kind === "daily");
}

export function isMenuInFlight(state: MenuState): boolean {
  return IN_FLIGHT_MENU_STATES.includes(state);
}

/** El color de la insignia de un estado de menú, con el mismo criterio que trabajos y solicitudes. */
export function menuTone(state: MenuState): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (state) {
    case "published":
      return "success";
    case "needs_information":
    case "publication_error":
      return "warning";
    case "cancelled":
      return "danger";
    case "draft":
    case "prepared":
      return "neutral";
    default:
      return "info";
  }
}
