/**
 * `src/core/request-draft.ts` — el borrador de solicitud y su revisión
 * (PRD §16 RN-MSG-10, Especificación Maestra §68, RN-DAT-07). Lógica de
 * dominio pura: sin Supabase, sin Next.js, sin React (CLAUDE.md, regla de
 * estilo de código).
 *
 * §68, literal: "`Convertir en solicitud` crea un borrador con mensajes y
 * adjuntos relevantes. Antes de enviar se revisa alcance, destinatario y
 * archivos."
 *
 * La autoridad real es la base de datos
 * (supabase/migrations/20260904000051_borrador_de_solicitud.sql:
 * `convert_conversation_to_request()`, `update_request_draft()`,
 * `attach_file_to_request_draft()`, `detach_file_from_request_draft()` y
 * `submit_request()`), que vuelve a decidir cada operación con la sesión
 * de quien la ejecuta. Este módulo existe para que la pantalla pueda
 * ANTICIPAR esa decisión y explicarla, nunca para tomarla (CLAUDE.md:
 * "ocultar un botón NO es un control de acceso").
 */

import { err, ok, type Result } from "./result";

/**
 * Los tres puntos que §68 manda revisar antes de enviar, en el orden del
 * documento. Son un dato y no tres títulos sueltos en una plantilla: la
 * pantalla de revisión se construye recorriéndolos, así que no puede
 * olvidarse ninguno ni añadir uno inventado.
 */
export const DRAFT_REVIEW_POINTS = ["scope", "recipient", "files"] as const;

export type DraftReviewPoint = (typeof DRAFT_REVIEW_POINTS)[number];

/**
 * Un borrador es una solicitud en estado `draft` y solo ahí se revisa:
 * enviada, el alcance ya no se reescribe (lo que cambia el alcance después
 * es otra cosa, RN-SLA-08: el equipo lo cambia y el cliente vuelve a
 * aceptar) y los archivos pasan a estar "vinculados a una operación"
 * (RN-ARC-07).
 */
export function isDraft(state: string): boolean {
  return state === "draft";
}

export type DraftSubmissionRejection = "not_a_draft" | "empty_scope";

/**
 * §68 · qué impide enviar el borrador. Las dos razones son las mismas que
 * hace cumplir el servidor, y por eso se devuelve el motivo en vez de un
 * booleano: cuando no se puede enviar, la pantalla tiene que decir por qué
 * (CA-20, "si no hay dato, se dice cuál es el motivo"), no esconder el
 * botón.
 *
 * Lo que NO se comprueba aquí, a propósito: quién eres. Eso es
 * `can_write_establishment()` en el servidor —el lado del restaurante, no
 * el equipo— y no se puede decidir sin la sesión.
 */
export function canSubmitDraft(draft: {
  readonly state: string;
  readonly description: string;
}): Result<void, DraftSubmissionRejection> {
  if (!isDraft(draft.state)) return err("not_a_draft");
  if (draft.description.trim() === "") return err("empty_scope");
  return ok(undefined);
}

export type DraftScope = {
  readonly description: string;
  readonly context: string | null;
};

/**
 * RN-DAT-07 · si el alcance cambió de verdad. El servidor no versiona un
 * guardado que no cambia nada —un historial lleno de versiones idénticas
 * no dice nada—, y la pantalla usa esta misma respuesta para no prometer
 * "guardado" cuando no había nada que guardar.
 *
 * El contexto se compara ya normalizado: un campo vacío y un campo con
 * espacios son lo mismo que "sin contexto", igual que hace
 * `update_request_draft()` con su `nullif(btrim(...), '')`.
 */
export function normalizeScopeField(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function draftScopeChanged(current: DraftScope, next: DraftScope): boolean {
  return (
    current.description.trim() !== next.description.trim() ||
    normalizeScopeField(current.context) !== normalizeScopeField(next.context)
  );
}
