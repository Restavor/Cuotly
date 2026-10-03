/**
 * Estados de una tarea del agente (PRD §6.1), con códigos en inglés (CLAUDE.md: identificadores en inglés).
 * La etiqueta en español que ve el equipo vive en `src/i18n/es.ts`.
 *
 *   preparando → preparing        esperando → waiting       lista → ready
 *   publicando → publishing       verificando → verifying   publicada → published
 *   error → error                 bloqueada_sesion → session_blocked
 *   cancelada → cancelled         devuelta → returned
 */
export const TASK_STATES = [
  "preparing",
  "waiting",
  "ready",
  "publishing",
  "verifying",
  "published",
  "error",
  "session_blocked",
  "cancelled",
  "returned",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

/**
 * Estados que cuentan como «la web ya está ocupada por esa fecha» en la regla de orden (RA-01).
 *
 * ABIERTO (no se inventa regla, queda para las Fases 2 y 5, decisión de Bosco): una tarea atascada en
 * `publishing` o `verifying` tras un corte de la ejecución bloquearía para siempre a las anteriores del mismo
 * restaurante, y no está decidido si una tarea en `error` DESPUÉS de haber subido la imagen cuenta como ocupada.
 */
export const WEB_OCCUPYING_STATES: readonly TaskState[] = ["publishing", "verifying", "published"];
