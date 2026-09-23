/**
 * `src/core/request-on-behalf.ts` — crear una solicitud en nombre del
 * restaurante (M77; PRD RN-REQ-08, decisión 73). Lógica de dominio pura:
 * sin Supabase, sin Next.js, sin React (CLAUDE.md, regla de estilo de
 * código).
 *
 * La autoridad es `create_request_on_behalf()`
 * (supabase/migrations/20260923000132_solicitud_en_nombre_del_restaurante.sql),
 * que vuelve a comprobar cada cosa con la sesión de quien la ejecuta. Este
 * módulo existe para que la pantalla diga QUÉ falta antes de mandar una
 * llamada que ya se sabe que va a fallar, nunca para decidir (CLAUDE.md:
 * "ocultar un botón NO es un control de acceso").
 */

import { isChangeCategory, type ChangeCategory } from "./classification-rules";
import { err, ok, type Result } from "./result";

/** RN-REQ-05 · los tres niveles, en el orden en que se ofrecen. */
export const REQUEST_PRIORITIES = ["high", "medium", "low"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

/** RN-REQ-05 · el motivo de la prioridad cabe en 200. */
export const PRIORITY_REASON_MAX = 200;

/** Decisión 73 · cómo y cuándo lo pidió el restaurante, en 500. */
export const ON_BEHALF_REASON_MAX = 500;

/**
 * RN-REQ-08 · quién puede: el propietario y los administradores del
 * espacio, que son los que tienen `manage_requests`. Un trabajador no, y
 * el restaurante tampoco: el suyo es su propio formulario.
 */
export function canCreateOnBehalf(role: string): boolean {
  return role === "owner" || role === "admin";
}

export type OnBehalfInput = {
  readonly establishmentId: string;
  readonly description: string;
  readonly priority: string;
  readonly priorityReason: string;
  readonly onBehalfReason: string;
  /** Vacío = la clasifica la IA, como cualquier otra. */
  readonly category: string;
};

export type OnBehalfRejection =
  | "establishment_required"
  | "description_required"
  | "priority_required"
  | "priority_reason_required"
  | "priority_reason_too_long"
  | "on_behalf_reason_required"
  | "on_behalf_reason_too_long"
  | "category_invalid";

export type OnBehalfRequest = {
  readonly establishmentId: string;
  readonly description: string;
  readonly priority: RequestPriority;
  readonly priorityReason: string;
  readonly onBehalfReason: string;
  readonly category: ChangeCategory | null;
};

function isPriority(value: string): value is RequestPriority {
  return (REQUEST_PRIORITIES as readonly string[]).includes(value);
}

/**
 * Las mismas comprobaciones que hace el servidor, en el orden en que la
 * pantalla las pinta: restaurante, descripción, prioridad y su motivo, y
 * al final cómo lo pidió. Devuelve el primer motivo, no un booleano:
 * cuando no se puede enviar, hay que decir por qué (CA-20).
 */
export function checkOnBehalfRequest(input: OnBehalfInput): Result<OnBehalfRequest, OnBehalfRejection> {
  const establishmentId = input.establishmentId.trim();
  const description = input.description.trim();
  const priority = input.priority.trim();
  const priorityReason = input.priorityReason.trim();
  const onBehalfReason = input.onBehalfReason.trim();
  const category = input.category.trim();

  if (establishmentId === "") return err("establishment_required");
  if (description === "") return err("description_required");
  if (!isPriority(priority)) return err("priority_required");
  if (priorityReason === "") return err("priority_reason_required");
  if (priorityReason.length > PRIORITY_REASON_MAX) return err("priority_reason_too_long");
  if (onBehalfReason === "") return err("on_behalf_reason_required");
  if (onBehalfReason.length > ON_BEHALF_REASON_MAX) return err("on_behalf_reason_too_long");
  if (category !== "" && !isChangeCategory(category)) return err("category_invalid");

  return ok({
    establishmentId,
    description,
    priority,
    priorityReason,
    onBehalfReason,
    category: category === "" ? null : category,
  });
}

/**
 * Decisión 73 · la categoría del equipo SUSTITUYE a la IA: si la eligió,
 * la propuesta ya existe y no hay que preguntarle a nadie. Si no, la
 * clasifica la IA como con cualquier otra solicitud.
 */
export function needsAiClassification(request: Pick<OnBehalfRequest, "category">): boolean {
  return request.category === null;
}
