/**
 * Reglas de aviso (PRD §18, RN-NOT-01 a RN-NOT-05).
 *
 * Lógica de dominio pura: sin Supabase, sin React, sin red (CLAUDE.md).
 * El servidor guarda el EVENTO y a qué apunta; quién debe recibirlo y si
 * puede desactivarse se decide aquí, con tests, y no en cada pantalla.
 *
 * El catálogo de eventos está duplicado a propósito entre este archivo y
 * el CHECK de `notifications.event_type` (migración 20260830000035). Son
 * dos sistemas distintos y ninguno puede importar del otro, así que la
 * duplicación se compensa con un test que compara los dos ficheros y falla
 * si se separan.
 */

export const NOTIFICATION_EVENTS = [
  "request_submitted",
  "job_unassigned",
  "job_assigned",
  "job_started",
  "job_published",
  "correction_requested",
  "consumption_threshold_80",
  "consumption_threshold_100",
  "t2_threshold_50",
  "t2_threshold_80",
  "t2_threshold_100",
  "t2_critical_alert",
  "t2_reassignment_suggestion",
  "t3_threshold_75",
  "t3_threshold_90",
  "t3_threshold_100",
  "establishment_paused_nonpayment",
  "establishment_suspended_nonpayment",
  "establishment_reactivated",
  "absence_requested",
  "absence_decided",
  "absence_uncovered_jobs",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/**
 * RN-NOT-03: "seguridad, pérdida de acceso, impagos graves y vencimientos
 * críticos **no pueden desactivarse** dentro de Cuotly".
 *
 * Los vencimientos críticos son los plazos al 100 %: pasado ese punto el
 * incumplimiento ya ocurrió. Los impagos graves son los dos estados en los
 * que el servicio se detiene (RN-FIN-10 y RN-FIN-11).
 *
 * La lista es corta a propósito: hacerla larga vaciaría de sentido
 * RN-NOT-02 ("pueden desactivar avisos secundarios").
 */
export const MANDATORY_EVENTS: readonly NotificationEvent[] = [
  "t2_threshold_100",
  "t3_threshold_100",
  "establishment_paused_nonpayment",
  "establishment_suspended_nonpayment",
];

export function isMandatoryEvent(event: NotificationEvent): boolean {
  return MANDATORY_EVENTS.includes(event);
}

/** Audiencia del aviso: el texto no se redacta igual para un lado que para el otro. */
export type NotificationAudience = "staff" | "client";

export interface NotificationPreference {
  readonly event: NotificationEvent;
  readonly inApp: boolean;
  readonly email: boolean;
}

/**
 * RN-NOT-02 ("los propietarios reciben todo por defecto") + RN-NOT-03.
 * La ausencia de preferencia significa activado: no hace falta sembrar una
 * fila por persona y evento para que el sistema avise.
 */
export function shouldDeliver(
  event: NotificationEvent,
  channel: "in_app" | "email",
  preference: NotificationPreference | undefined,
): boolean {
  if (isMandatoryEvent(event)) return true;
  if (!preference) return true;
  return channel === "in_app" ? preference.inApp : preference.email;
}

/**
 * RN-NOT-03 desde el otro lado: intentar apagar un aviso obligatorio no es
 * una preferencia que se guarda a medias, es un error explícito.
 */
export function canDisable(event: NotificationEvent): boolean {
  return !isMandatoryEvent(event);
}

export interface SpaceMemberForNotification {
  readonly userId: string;
  readonly role: "owner" | "admin" | "worker";
}

export interface JobNotificationContext {
  readonly assigneeId: string | null;
  readonly members: readonly SpaceMemberForNotification[];
  /** Administradores que supervisan al responsable (RN-JOB-11). */
  readonly supervisorIds: readonly string[];
}

/**
 * RN-NOT-01: **"no se avisa a trabajadores que no estén asignados"**.
 *
 * Es la regla que decide la lista de destinatarios de un evento de
 * trabajo, y la que hace que el centro de notificaciones no sea un altavoz
 * para todo el equipo. Propietarios y administradores sí reciben (§20.4:
 * su inicio es el resumen de la operación); de los trabajadores, solo el
 * responsable asignado.
 */
export function jobEventRecipients(context: JobNotificationContext): readonly string[] {
  const recipients = new Set<string>();

  for (const member of context.members) {
    if (member.role === "owner" || member.role === "admin") {
      recipients.add(member.userId);
    }
  }

  for (const supervisorId of context.supervisorIds) {
    recipients.add(supervisorId);
  }

  if (context.assigneeId !== null) {
    // El responsable, aunque sea trabajador: está asignado.
    recipients.add(context.assigneeId);
  }

  return [...recipients];
}

/**
 * RN-NOT-04: "cada aviso lleva un enlace profundo que abre el elemento
 * exacto, cambiando de espacio o establecimiento si hace falta y
 * **verificando el acceso antes**".
 *
 * Esta función construye la ruta; el acceso lo comprueba la pantalla de
 * destino con las mismas políticas que cualquier otra. La ruta guardada no
 * autoriza nada por sí misma — por eso el enlace nunca lleva un token ni
 * un "ya validado".
 */
export type DeepLinkEntity = "request" | "job" | "establishment" | "charge" | "absence";

export function deepLinkFor(spaceSlug: string, entity: DeepLinkEntity, entityId: string): string {
  switch (entity) {
    case "request":
      return `/espacios/${spaceSlug}/solicitudes/${entityId}`;
    case "job":
      return `/espacios/${spaceSlug}/trabajos/${entityId}`;
    case "establishment":
      return `/espacios/${spaceSlug}/restaurantes/${entityId}`;
    case "charge":
      return `/espacios/${spaceSlug}/finanzas`;
    case "absence":
      return `/espacios/${spaceSlug}/calendario`;
  }
}

/**
 * CA-17 y RN-NOT-05: "pulsar dos veces produce un único efecto **y una
 * única notificación**". La clave es determinista, así que la unicidad la
 * impone la base de datos y no una comprobación previa que dos peticiones
 * simultáneas podrían pasar a la vez.
 */
export function dedupeKey(event: NotificationEvent, entityId: string, threshold?: number): string {
  return threshold === undefined
    ? `${event}:${entityId}`
    : `${event}:${entityId}:${threshold}`;
}

/**
 * RN-NOT-05: "los envíos van por cola con reintentos". Espera creciente
 * para no martillear a un proveedor caído, y un techo de intentos a partir
 * del cual la fila queda como `dead` en vez de reintentarse para siempre.
 */
export const MAX_DELIVERY_ATTEMPTS = 5;

export function nextRetryDelayMinutes(attempts: number): number {
  if (attempts <= 0) return 1;
  return Math.min(2 ** (attempts - 1), 60);
}

export function deliveryStatusAfterFailure(attempts: number): "pending" | "dead" {
  return attempts >= MAX_DELIVERY_ATTEMPTS ? "dead" : "pending";
}

/**
 * §18, filas 3 y 4 · el cliente también recibe avisos, y no los mismos que
 * el equipo.
 *
 *   · "Inicio de un trabajo → visible **dentro** de Cuotly para el
 *     cliente, sin correo ni push".
 *   · "Publicación → cliente y supervisión" (esta sí sale por correo).
 *
 * De los eventos de trabajo, solo esos dos cruzan al cliente: los demás
 * son organización interna del equipo y P7 dice que el cliente no la ve.
 */
export const CLIENT_VISIBLE_JOB_EVENTS: readonly NotificationEvent[] = [
  "job_started",
  "job_published",
];

export function jobEventClientRecipients(
  event: NotificationEvent,
  establishmentMemberIds: readonly string[],
): readonly string[] {
  if (!CLIENT_VISIBLE_JOB_EVENTS.includes(event)) return [];
  return [...new Set(establishmentMemberIds)];
}

/**
 * §18 distingue entre "visible dentro de Cuotly" y "visible + correo". Hoy
 * la única fila que pide lo primero sin lo segundo es el inicio de un
 * trabajo mirado desde el lado del cliente; para el equipo ese mismo
 * evento sí sale por correo.
 */
export function shouldQueueEmail(
  event: NotificationEvent,
  audience: NotificationAudience,
): boolean {
  return !(audience === "client" && event === "job_started");
}

/**
 * §18, fila 1: "Nueva solicitud sin asignar → propietario y todos los
 * administradores". Ningún trabajador, porque todavía no es de nadie
 * (RN-NOT-01).
 */
export function requestSubmittedRecipients(
  members: readonly SpaceMemberForNotification[],
): readonly string[] {
  return [
    ...new Set(
      members
        .filter((member) => member.role === "owner" || member.role === "admin")
        .map((member) => member.userId),
    ),
  ];
}
