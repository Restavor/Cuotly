/**
 * El libro de auditoría, del lado del dominio (PRD §21.2, HU-36).
 *
 * Aquí no hay ni una consulta: quién ve qué lo decide la política de RLS
 * de `audit_log` (migración 49), y el nombre en español de cada acción
 * vive en `src/i18n/es.ts`, una sola vez, como manda CA-21. Este archivo
 * es la lista canónica de lo que la base de datos puede escribir en la
 * columna `action` y la clasificación de cada familia — el mismo reparto
 * que hace `audit_action_capability()` en SQL.
 *
 * Que estén las dos copias es deliberado y tiene su vigilancia: la
 * pantalla necesita saber en español qué es `job.reassignment_requested`
 * sin preguntarle a la base, y `audit.test.ts` recorre las migraciones y
 * falla si aparece una acción que no esté aquí, si sobra una que ya nadie
 * escribe, o si el reparto por familias de este archivo deja de coincidir
 * con el de la migración. Es la misma lección de `state-catalogue.test.ts`:
 * dos listas escritas a mano se separan, y solo se enteran si algo las
 * compara.
 */

import { zoneOffsetMinutes } from "./finance";

/**
 * La capacidad que hace falta para VER una acción, que es la misma que
 * hace falta para ejecutarla (§21.2). `null` no significa "la ve
 * cualquiera": significa que su visibilidad no la decide una capacidad
 * sino la fila a la que apunta —un trabajo, una solicitud, un archivo—, y
 * en la base la resuelve `audit_entity_is_visible()`.
 */
export type AuditCapability =
  | "manage_space"
  | "invite_member"
  | "manage_finance"
  | "manage_clients"
  | "manage_holidays";

export const AUDIT_FAMILY_CAPABILITY: Readonly<Record<string, AuditCapability | null>> = {
  // Configuración del espacio y composición del equipo: del propietario.
  space: "manage_space",
  membership: "manage_space",
  supervision: "manage_space",
  invitation: "invite_member",
  // Dinero (RN-FIN, RN-ARC-05): propietario y administradores.
  charge: "manage_finance",
  payment: "manage_finance",
  subscription: "manage_finance",
  financial: "manage_finance",
  // Cartera de clientes.
  establishment: "manage_clients",
  establishment_access: "manage_clients",
  group_access: "manage_clients",
  // Festivos y cierres (§125, HU-32).
  holiday: "manage_holidays",
  // Las que decide la fila.
  request: null,
  job: null,
  task: null,
  file: null,
  absence: null,
  correction: null,
  session: null,
};

/**
 * Los tipos de entidad cuya visibilidad se resuelve preguntando por la
 * fila. Tiene que coincidir con el `case` de `audit_entity_is_visible()`:
 * una entidad que no esté en las dos listas solo la verían el propietario
 * y quien ejecutó la acción, y nadie se enteraría.
 */
export const AUDIT_ROW_VISIBLE_ENTITIES = [
  "request",
  "job",
  "task",
  "file",
  "absence",
  "correction",
] as const;

/**
 * Todo lo que la base de datos escribe hoy en `audit_log.action`. El orden
 * es alfabético a propósito: es una lista para buscar, no para leer.
 */
export const AUDIT_ACTIONS = [
  "absence.decided",
  "absence.requested",
  "charge.invoice_attached",
  "charge.issued",
  "charge.receipt_uploaded",
  "charge.refunded",
  "charge.waived",
  "correction.completed",
  "correction.requested",
  "correction.started",
  "correction.team_error_opened",
  "establishment.status_changed",
  "establishment_access.revoked",
  "file.archived",
  "file.deletion_requested",
  "file.registered",
  "file.shared_with_client",
  "file.version_added",
  "group_access.revoked",
  "holiday.created",
  "invitation.accepted",
  "job.assigned",
  "job.blocked",
  "job.completed",
  "job.published",
  "job.reassigned",
  "job.reassignment_requested",
  "job.required_specialty_changed",
  "job.started",
  "job.unblocked",
  "membership.perform_jobs_changed",
  "payment.registered",
  "payment.reversed",
  "request.accepted",
  "request.accepted_again",
  "request.cancelled",
  "request.classification_validated",
  "request.classified",
  "request.converted_from_conversation",
  "request.copied",
  "request.declined_by_client",
  "request.draft_created",
  "request.draft_file_attached",
  "request.draft_file_detached",
  "request.draft_updated",
  "request.information_provided",
  "request.information_requested",
  "request.new_acceptance_requested",
  "request.rejected",
  "request.submitted",
  "session.revoked",
  "space.created",
  "space.renamed",
  "space.timezone_changed",
  "subscription.plan_change_cancelled",
  "subscription.plan_change_scheduled",
  "subscription.plan_changed",
  "subscription.plan_created",
  "subscription.service_created",
  "supervision.principal_set",
  "supervision.revoked",
  "supervision.substitute_rescheduled",
  "supervision.substitute_set",
  "task.assigned",
  "task.cancelled",
  "task.created",
  "task.state_changed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** La familia de una acción: lo que va antes del punto. */
export function auditFamily(action: string): string {
  const punto = action.indexOf(".");
  return punto === -1 ? action : action.slice(0, punto);
}

/**
 * Las familias en el orden en que se ofrecen como filtro. Alfabético por
 * su nombre en español lo decide la pantalla; aquí el orden es el del
 * reparto de arriba, que agrupa lo que se parece.
 */
export const AUDIT_FAMILIES = Object.keys(AUDIT_FAMILY_CAPABILITY) as readonly string[];

export interface AuditChange {
  readonly field: string;
  readonly before: string | null;
  readonly after: string | null;
}

function comoTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return JSON.stringify(valor);
}

/**
 * De los dos `jsonb` de una fila a la lista de campos que cambiaron, con
 * su valor anterior y el nuevo. Es el principio P4 puesto en pantalla:
 * "nunca se pierde el valor anterior".
 *
 * Tres detalles que no son evidentes:
 *
 * · se recorren las claves de LOS DOS lados, porque una acción puede
 *   añadir un campo que antes no existía (o quitarlo), y enseñar solo las
 *   del nuevo lo escondería;
 * · un campo que no cambió no se lista: en `job.assigned` el valor nuevo
 *   trae el trabajo entero y enseñar veinte líneas iguales para ver la que
 *   cambió es peor que no enseñar nada;
 * · si los dos lados son nulos no hay nada que contar, y la pantalla dice
 *   entonces que esa acción no guarda valores (P6), en vez de fingir una
 *   tabla vacía.
 */
export function auditChanges(before: unknown, after: unknown): readonly AuditChange[] {
  const antes = (before ?? {}) as Record<string, unknown>;
  const despues = (after ?? {}) as Record<string, unknown>;

  if (typeof antes !== "object" || typeof despues !== "object") return [];

  const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].sort();

  return claves
    .map((field) => ({
      field,
      before: comoTexto(antes[field]),
      after: comoTexto(despues[field]),
    }))
    .filter((cambio) => cambio.before !== cambio.after);
}

/**
 * El filtro por fechas de la auditoría, de días naturales a instantes.
 *
 * `audit_log.created_at` es `timestamptz` (CLAUDE.md MUST) y el filtro se
 * escribe en días sueltos ("2026-09-03"), así que alguien tiene que decir
 * qué instante es el principio de ese día — y tiene que ser en la zona del
 * ESPACIO, no en la del servidor: si no, un espacio en México pide "hoy" y
 * se le devuelven las siete primeras horas de ayer.
 *
 * El límite superior es exclusivo y cae en el principio del día siguiente,
 * que es la única forma de incluir el día entero sin escribir un
 * `23:59:59` que se deja el último segundo fuera.
 *
 * El desplazamiento se toma al mediodía del día pedido, igual que en
 * `paymentDayToTimestamp()`: los cambios de hora ocurren de madrugada, y
 * el mediodía es el único momento del día que existe una sola vez en todas
 * las zonas.
 */
export function auditDayWindow(
  fromDay: string | null,
  toDay: string | null,
  timeZone: string,
): { readonly from: string | null; readonly to: string | null } {
  return {
    from: fromDay === null ? null : startOfDayInstant(fromDay, timeZone),
    to: toDay === null ? null : startOfDayInstant(nextDay(toDay), timeZone),
  };
}

function startOfDayInstant(day: string, timeZone: string): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!partes) return null;

  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const mediodiaComoUtc = Date.UTC(anio, mes - 1, dia, 12, 0, 0);
  if (new Date(mediodiaComoUtc).toISOString().slice(0, 10) !== day) return null;

  let desplazamiento: number;
  try {
    desplazamiento = zoneOffsetMinutes(new Date(mediodiaComoUtc), timeZone);
  } catch {
    return null;
  }

  return new Date(mediodiaComoUtc - desplazamiento * 60_000 - 12 * 60 * 60_000).toISOString();
}

/** El día natural siguiente, sin arrastrar zonas: aritmética de calendario. */
function nextDay(day: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!partes) return day;
  const siguiente = new Date(
    Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]) + 1),
  );
  return siguiente.toISOString().slice(0, 10);
}
