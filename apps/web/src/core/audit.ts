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
  // Las condiciones de planes y servicios (migración 75): configuración
  // contractual del espacio, del propietario (§16.1 de la maestra).
  plan: "manage_space",
  service: "manage_space",
  invitation: "invite_member",
  // Dinero (RN-FIN, RN-ARC-05): propietario y administradores.
  charge: "manage_finance",
  payment: "manage_finance",
  subscription: "manage_finance",
  financial: "manage_finance",
  // Cartera de clientes.
  establishment: "manage_clients",
  establishment_access: "manage_clients",
  // Las notas internas del restaurante (RN-EST-13, migración 66). Quién
  // escribió una y cuándo es de la misma cartera; el CUERPO de la nota no
  // está en el apunte, y es a propósito: copiarlo aquí lo sacaría de la
  // política que lo protege.
  establishment_note: "manage_clients",
  // El alta de un restaurante crea el grupo si no existía (migración 58) y
  // eso es un apunte propio: quién dio de alta a este cliente y cuándo.
  // Misma capacidad que el establecimiento — es la misma cartera.
  group: "manage_clients",
  group_access: "manage_clients",
  // Festivos y cierres (§125, HU-32).
  holiday: "manage_holidays",
  // Las integraciones analíticas (RN-INT-06, migración 81): conectar,
  // desconectar y sus fallos son de la cartera de clientes, como el
  // establecimiento al que pertenecen.
  integration: "manage_clients",
  // Las plantillas de Menú Diario (RN-COM-10, migración 77): quién las
  // creó o archivó es de la misma cartera que contratar el servicio.
  menu_template: "manage_clients",
  // Las oportunidades (§96 a §101, migración 84): quién detectó, aprobó,
  // descartó o editó una es de la cartera, como el establecimiento. No se
  // decide por la fila aunque el restaurante vea la oportunidad aprobada:
  // lo que el apunte cuenta es la decisión del equipo (P7).
  opportunity: "manage_clients",
  // Los informes (§89 a §95, migración 85): quién lo preparó, lo aprobó,
  // lo programó o lo envió es de la cartera. No se decide por la fila
  // aunque el restaurante vea el informe enviado: lo que el apunte cuenta
  // es la decisión del equipo (P7, RN-REP-13).
  report: "manage_clients",
  // Las que decide la fila.
  request: null,
  job: null,
  task: null,
  file: null,
  absence: null,
  correction: null,
  session: null,
  // Fase 4, Hito 17 · la solicitud de creación de espacio ocurre ANTES de
  // que el espacio exista, así que sus apuntes llevan `space_id` nulo y
  // **ninguna capacidad de espacio los alcanza**. Tampoco los decide la
  // fila: los decide la TERCERA rama de `audit_log_select`, la que dice
  // `space_id is null and actor_id = auth.uid()`, más el propietario de la
  // plataforma. O sea, hoy los ven Bosco y quien hizo la acción, y nadie
  // más. Es la misma situación que `session`, y por eso comparte su
  // exención en `audit.test.ts` — que además comprueba que esa rama de la
  // política sigue existiendo, para que la exención no sea una promesa.
  space_request: null,
  // Fase 4, Hito 18 · lo que el espacio le paga a Cuotly (migración 90).
  // Del propietario, como `space`: §4.2.1 dice que es él quien paga. No
  // `manage_finance`, que es el dinero de los restaurantes y lo tienen los
  // administradores.
  cuotly_charge: "manage_space",
  cuotly_payment: "manage_space",
  // Fase 4, Hito 19 · Modo soporte (migración 91). Quién de Cuotly entró
  // en el espacio, con qué nivel y qué hizo es del propietario, como la
  // composición de su equipo (§129: "identidad visible en auditoría").
  support: "manage_space",
  // Fase 4, Hito 19 · nombrar y retirar Administradores de Cuotly. Sin
  // espacio, como `space_request`: lo ven Bosco y quien hizo la acción por
  // la tercera rama de `audit_log_select`.
  platform: null,
  // Fase 4, Hito 20 · las exportaciones de §139 (migración 92). La decide
  // la FILA, y no una capacidad fija, porque §141 las reparte entre dos
  // audiencias: el propietario del espacio exporta el espacio y el
  // propietario de un restaurante exporta lo suyo. Con `manage_space` el
  // restaurante no vería la exportación que él mismo pidió; con
  // `manage_clients` el propietario no vería las suyas. Quién ve el
  // apunte es quién ve la fila de `space_exports`, y eso ya lo decide su
  // política.
  export: null,
  // Los menús de Menú Diario (migración 77): operación, como los trabajos.
  menu: null,
  // Los presupuestos (§84, migración 80): los decide la fila, como las
  // solicitudes. El restaurante ve los apuntes de los suyos (los aceptó
  // él) y el equipo que gestiona, todos.
  quote: null,
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
  "menu",
  "quote",
  // Fase 4, Hito 20 · `audit_entity_is_visible()` resuelve `export`
  // contra `space_exports`, cuya política ya reparte las dos audiencias
  // de §141.
  "export",
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
  // Hito 18 · los cobros y los pagos a Cuotly (migración 90).
  "cuotly_charge.issued",
  "cuotly_payment.confirmed",
  "cuotly_payment.declared",
  "cuotly_payment.rejected",
  "cuotly_payment.reversed",
  "correction.requested",
  "correction.started",
  "correction.team_error_opened",
  "establishment.created",
  "establishment.data_changed",
  "establishment.status_changed",
  "establishment_access.granted",
  "establishment_access.revoked",
  "establishment_note.archived",
  "establishment_note.created",
  "file.archived",
  "file.deletion_requested",
  "file.registered",
  "file.shared_with_client",
  "file.version_added",
  "group.created",
  "group_access.granted",
  "group_access.revoked",
  "holiday.created",
  "integration.check_requested",
  "integration.checked",
  "integration.connected",
  "integration.connection_cancelled",
  "integration.connection_started",
  "integration.credential_replaced",
  "integration.disconnected",
  "integration.reauthorization_required",
  "integration.sync_failed",
  "integration.revocation_done",
  "integration.revocation_failed",
  "invitation.accepted",
  "job.assigned",
  "job.blocked",
  "job.completed",
  "job.evidence_attached",
  "job.published",
  "job.reassigned",
  "job.reassignment_requested",
  "job.required_specialty_changed",
  "job.started",
  "job.unblocked",
  // Fase 3, Hito 15 · "Aprobar informes", concedida persona a persona
  // (§97, migración 84), igual que `perform_jobs` en el Hito 6.
  "membership.approve_reports_changed",
  "membership.perform_jobs_changed",
  // Fase 2, Hito 9 · Menú Diario (migración 77); las correcciones, del Hito 11 (79).
  "menu.assigned",
  "menu.cancelled",
  "menu.copied",
  "menu.correction_completed",
  "menu.correction_requested",
  "menu.created",
  "menu.details_updated",
  "menu.downloaded",
  "menu.information_provided",
  "menu.information_requested",
  "menu.prepared",
  "menu.publication_error",
  "menu.publication_requested",
  "menu.published",
  "menu.ready_to_publish",
  "menu.reassigned",
  "menu.team_error_correction_opened",
  "menu.update_refunded",
  "menu.version_saved",
  "menu_template.archived",
  "menu_template.created",
  "menu_template.design_updated",
  // Fase 3, Hito 15 · oportunidades (§96 a §101, migración 84). Detectar
  // y reabrir no llevan actor: las escribe el barrido de la cola, no una
  // persona, y el apunte lo dice dejando `actor_id` nulo.
  "opportunity.added_manually",
  "opportunity.client_action",
  "opportunity.detected",
  "opportunity.note_added",
  "opportunity.proposal_edited",
  "opportunity.reopened",
  "opportunity.status_changed",
  "payment.registered",
  "payment.reversed",
  // Fase 4, Hito 19 · Administradores de Cuotly (migración 91).
  "platform.admin_granted",
  "platform.admin_revoked",
  "platform.admin_updated",
  "plan.conditions_published",
  // Fase 2, Hito 12 · presupuestos adicionales (§84, migración 80).
  "quote.accepted",
  "quote.created",
  "quote.rejected",
  "quote.sent",
  "quote.start_authorized",
  "quote.updated",
  // Fase 3, Hito 16 · informes (§89 a §95, migración 85). El envío
  // programado y el aviso los escribe la cola, no una persona: su apunte
  // lo dice dejando `actor_id` nulo, como el de la detección.
  "report.created",
  "report.renamed",
  "report.scheduled",
  "report.sections_changed",
  "report.send_blocked",
  "report.sent",
  "report.status_changed",
  "report.version_generated",
  "request.accepted",
  "request.accepted_again",
  "request.cancelled",
  "request.classification_validated",
  "request.classified",
  "request.converted_from_conversation",
  "request.copied",
  "request.created_from_quote",
  "request.declined_by_client",
  "request.draft_created",
  "request.draft_file_attached",
  "request.draft_file_detached",
  "request.draft_updated",
  "request.information_provided",
  "request.information_requested",
  "request.new_acceptance_requested",
  "request.priority_set",
  "request.rejected",
  "request.submitted",
  "service.conditions_published",
  "session.revoked",
  // Hito 20 · la exportación de §141 (migración 92).
  "export.requested",
  // Hito 18 · el modo del espacio respecto a Cuotly (migración 90):
  // activarse con el primer pago, archivarse por prueba sin pago o por
  // impago, reactivarse, y los cambios de plan y de adicionales.
  // Hito 20 · y el archivado, la restauración, el cambio de dueño y el
  // final del asistente de §9 (migración 92).
  "space.activated",
  "space.archived_by_owner",
  "space.archived_nonpayment",
  "space.archived_trial_ended",
  "space.created",
  "space.extras_changed",
  "space.payment_term_changed",
  "space.plan_change_cancelled",
  "space.plan_change_scheduled",
  "space.onboarding_completed",
  "space.ownership_transferred",
  "space.plan_changed",
  "space.reactivated",
  "space.renamed",
  "space.restored_by_owner",
  "space.timezone_changed",
  // Las cinco de la solicitud de espacio (migración 89), con el nombre
  // literal en cada INSERT para que el barrido que lee las migraciones las
  // encuentre.
  "space_request.approved",
  "space_request.in_review",
  "space_request.needs_information",
  "space_request.rejected",
  "space_request.submitted",
  "subscription.plan_change_cancelled",
  "subscription.plan_change_scheduled",
  "subscription.plan_changed",
  "subscription.plan_created",
  "subscription.service_created",
  // Maqueta 13 · las dos maneras de aceptar las condiciones (decisión del
  // 12/09/2026, opción c): el restaurante en Cuotly, o el equipo
  // registrando una aceptación de fuera con su contrato.
  "subscription.terms_accepted",
  "subscription.terms_recorded",
  // Fase 4, Hito 19 · Modo soporte (migración 91): abrir y cerrar. Las
  // acciones hechas DENTRO no son una familia: son los apuntes de siempre
  // con `support_session_id` estampado.
  "support.session_ended",
  "support.session_started",
  "supervision.principal_set",
  "supervision.revoked",
  "supervision.substitute_rescheduled",
  "supervision.substitute_set",
  "task.assigned",
  "task.cancelled",
  "task.created",
  // Maqueta 07 · la planificación y las tres de la reasignación
  // (RN-ASG-07/08/09). `task.reassigned` es la aprobada y
  // `task.reassignment_rejected` la denegada: las dos se conservan, porque
  // que alguien pidiera salirse de una tarea y se le dijera que no es
  // información de la que un día hará falta acordarse.
  "task.planned_date_set",
  "task.reassigned",
  "task.reassignment_rejected",
  "task.reassignment_requested",
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
