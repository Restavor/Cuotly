/**
 * Reglas de aviso (PRD §18, RN-NOT-01 a RN-NOT-05).
 *
 * Lógica de dominio pura: sin Supabase, sin React, sin red (CLAUDE.md).
 * El servidor guarda el EVENTO y a qué apunta; quién debe recibirlo y si
 * puede desactivarse se decide aquí, con tests, y no en cada pantalla.
 *
 * El catálogo de eventos está duplicado a propósito entre este archivo y
 * el CHECK de `notifications.event_type` (lo fijó la migración
 * 20260830000035 y lo ensancharon la 20260912000071, la 20260912000076 y
 * la 20260913000077, que trajo los cinco eventos de Menú Diario, y la
 * 20260913000079, con el recordatorio de las 20:00 y el aviso de las
 * 08:00, la 20260913000080, con los tres de un presupuesto, y la
 * 20260913000081, con los dos de una integración). Son dos sistemas
 * distintos y ninguno puede importar del otro, así que la duplicación se
 * compensa con `listas-compartidas.test.ts`, que lee la última definición
 * del CHECK en las migraciones y la compara con esta lista.
 *
 * Ese test no existía hasta el 12/09/2026: este comentario prometía desde
 * el Hito 8 una comprobación que no estaba escrita en ninguna parte, y se
 * vio al añadir los dos eventos de reasignación.
 */

export const NOTIFICATION_EVENTS = [
  "request_submitted",
  // RN-REQ-08 (migración 132) · el equipo creó una solicitud en nombre del
  // restaurante; se avisa a quien responde por él.
  "request_created_on_behalf",
  "job_unassigned",
  "job_assigned",
  "job_started",
  "job_published",
  "correction_requested",
  "job_reassignment_requested",
  "task_reassignment_requested",
  "terms_version_published",
  // RN-COM-23 (migración 131) · una versión nueva del plan o servicio.
  "plan_revision_published",
  "menu_publication_requested",
  "menu_assigned",
  "menu_needs_information",
  "menu_published",
  "menu_publication_error",
  "menu_not_prepared_reminder",
  "menu_publication_overdue",
  "quote_sent",
  "quote_accepted",
  "quote_rejected",
  // Migración 81 (RN-INT-04): el fallo va al equipo, una vez por racha; la
  // reautorización también a los propietarios del restaurante.
  "integration_sync_failed",
  "integration_reauthorization_required",
  // Migración 85 · los dos avisos de §95 y §93: el que avisa de que la
  // fecha programada se acerca y el envío del informe al restaurante.
  "report_schedule_due_soon",
  "report_sent",
  // Migración 90 (Fase 4, Hito 18) · los cinco avisos de §4.5 a los
  // propietarios del espacio, y los dos del modo del espacio (RN-SUB-07).
  "cuotly_payment_due_soon",
  "cuotly_payment_due_today",
  "cuotly_payment_overdue_24h",
  "cuotly_payment_overdue_48h",
  "cuotly_payment_final_notice",
  "cuotly_space_archived",
  "cuotly_space_reactivated",
  // Migración 91 (Fase 4, Hito 19) · alguien de Cuotly ha entrado en el
  // espacio en Modo soporte (RN-ADM-08). A los propietarios, obligatorio.
  "support_session_started",
  // Migración 92 (Fase 4, Hito 20) · el espacio cambia de dueño, o su
  // dueño lo archiva (RN-CIC-15). Los dos, obligatorios.
  "space_ownership_transferred",
  "space_archived_by_owner",
  // Migración 93 (Fase 4, Hito 21) · una incidencia a Cuotly abierta,
  // movida de estado o contestada (RN-SOP-15). Ninguno obligatorio: no
  // son seguridad ni pérdida de acceso.
  "incident_opened",
  "incident_updated",
  "incident_replied",
  // Migración 95 (Fase 4, después del Hito 22; decisión 38) · el
  // almacenamiento incluido en el plan de Cuotly al 80 % y al 100 %
  // (RN-SUB-13; al 100 % también a Cuotly, porque lo que pasa de lo
  // incluido se presupuesta aparte), y el incidente de seguridad de §142
  // (RN-ADM-13), obligatorio.
  "storage_threshold_80",
  "storage_threshold_100",
  "security_incident",
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
  // Migración 100 (§38, RN-REC-02) · el primero de los tres avisos de
  // cobro de M52, y el único nuevo: los otros dos son los que ya emiten la
  // pausa y la suspensión por impago.
  "charge_due_today",
  "absence_requested",
  "absence_decided",
  "absence_uncovered_jobs",
  // Migración 105 (§40.1, RN-PAN-12) · "se enviará una invitación con las
  // instrucciones de acceso" de la página 56 del diseño. Antes se daba
  // acceso a un restaurante en silencio y quien lo recibía se enteraba
  // entrando.
  "establishment_access_granted",
  // Migración 114 (RN-ACC-13, RN-PAN-14) · la invitación al panel. Son dos
  // avisos con dos audiencias distintas: al EQUIPO se le dice que hay una
  // que mirar, y a quien invitó, en qué quedó. Ninguno de los dos dice
  // quién la revisó (RN-PAN-15).
  "panel_invitation_pending_review",
  "panel_invitation_decided",
  // Migración 117 (RN-INT-10 a 12) · las reseñas de Google. Son dos y no
  // uno porque el aviso de una reseña de 2 estrellas no se lee igual que
  // el de una de 5, y porque solo el primero cruza al restaurante.
  "review_received",
  "low_review_received",
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
  // RN-SUB-07: el último aviso antes del corte es un impago grave, y el
  // archivado es una pérdida de acceso. Los otros cuatro son
  // recordatorios y se pueden apagar.
  "cuotly_payment_final_notice",
  "cuotly_space_archived",
  // RN-ADM-08: que alguien de Cuotly haya entrado en tu espacio es
  // seguridad (§137, "cambios sensibles").
  "support_session_started",
  // RN-CIC-15: cambiar de dueño es un cambio sensible de §137, y el
  // archivado del propietario deja a todo el equipo sin poder escribir,
  // que es una pérdida de acceso. Ninguna de las dos se puede apagar.
  "space_ownership_transferred",
  "space_archived_by_owner",
  // RN-ADM-13: un incidente de seguridad de §142 es, literalmente, la
  // primera palabra de RN-NOT-03. Los dos avisos de almacenamiento no:
  // pasarse no bloquea nada (decisión 38).
  "security_incident",
];

export function isMandatoryEvent(event: NotificationEvent): boolean {
  return MANDATORY_EVENTS.includes(event);
}

/** Audiencia del aviso: el texto no se redacta igual para un lado que para el otro. */
export type NotificationAudience = "staff" | "client";

export type NotificationChannel = "in_app" | "email" | "push";

export interface NotificationPreference {
  readonly event: NotificationEvent;
  readonly inApp: boolean;
  readonly email: boolean;
  /**
   * Migración 94 (RN-MOV-06): el tercer canal. Opcional porque las filas
   * anteriores a la app móvil no lo tenían; ausente significa activado.
   */
  readonly push?: boolean;
}

/**
 * RN-NOT-02 ("los propietarios reciben todo por defecto") + RN-NOT-03.
 * La ausencia de preferencia significa activado: no hace falta sembrar una
 * fila por persona y evento para que el sistema avise.
 */
export function shouldDeliver(
  event: NotificationEvent,
  channel: NotificationChannel,
  preference: NotificationPreference | undefined,
): boolean {
  if (isMandatoryEvent(event)) return true;
  if (!preference) return true;
  switch (channel) {
    case "in_app":
      return preference.inApp;
    case "email":
      return preference.email;
    case "push":
      return preference.push ?? true;
  }
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
export type DeepLinkEntity =
  | "request"
  | "job"
  | "establishment"
  | "charge"
  | "absence"
  | "menu"
  | "quote"
  | "cuotly_charge"
  | "incident"
  | "review";

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
    case "menu":
      return `/espacios/${spaceSlug}/menu-diario/${entityId}`;
    case "quote":
      // La ficha del equipo; al restaurante lo reenvía a su facturación.
      return `/espacios/${spaceSlug}/finanzas/presupuestos/${entityId}`;
    case "cuotly_charge":
      // La suscripción de Cuotly del espacio, en sus ajustes (Hito 18). La
      // pantalla llega con el panel del Hito 19.
      return `/espacios/${spaceSlug}/ajustes/suscripcion`;
    case "incident":
      // La incidencia en el centro de ayuda del espacio (Hito 21). A la
      // plataforma le llega con su propio enlace, al panel.
      return `/espacios/${spaceSlug}/ayuda/incidencias/${entityId}`;
    case "review":
      // RN-INT-10 · las reseñas del restaurante. El enlace va a su lista y
      // no a una reseña suelta: se leen en contexto, con las de al lado.
      // Es el mismo que escribe `record_establishment_reviews()`.
      return `/espacios/${spaceSlug}/restaurantes/${entityId}/resenas`;
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
 * El remitente del correo saliente, comprobado antes de intentar nada.
 *
 * Esto existe por un fallo real: del 10/09 al 21/09/2026, `RESEND_FROM` en
 * producción tenía un valor que Resend rechaza con un 422 de formato, y los
 * 211 avisos que había en cola fallaron uno por uno sin que nadie se
 * enterara. El aviso dentro de Cuotly sí llegaba, así que nada parecía
 * roto.
 *
 * Lo que convierte ese despiste en pérdida de datos es la combinación con
 * los reintentos: `claim_notification_deliveries` gasta un intento **al
 * reclamar la fila**, antes de que el transporte opine, y al quinto la fila
 * queda `dead` para siempre. Un remitente mal escrito no se arregla
 * reintentando; lo único que consigue cada pasada del cron es acercar 211
 * avisos reales a la muerte. Por eso quien llama comprueba esto **antes de
 * reclamar**: un error de configuración no es un fallo transitorio de
 * entrega, y no debe gastar el crédito de nadie.
 *
 * Formatos que Resend acepta, y por tanto los únicos que valen aquí:
 * `correo@dominio.com` o `Nombre <correo@dominio.com>`.
 *
 * Se recorta el espacio de los extremos porque una variable de entorno
 * copiada a mano arrastra saltos de línea con una facilidad pasmosa, y eso
 * es un despiste de copiar y pegar, no una decisión de nadie. Lo que NO se
 * hace es adivinar más allá: unas comillas alrededor del valor o un `<`
 * sin cerrar se rechazan y se dicen, en vez de "corregirse" suponiendo qué
 * quiso poner quien lo escribió.
 */
const DIRECCION_DE_CORREO = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;".]+$/;

export function normalizeMailFrom(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;

  const limpio = raw.trim();
  if (limpio === "") return null;

  const conNombre = /^(.+?)\s*<([^<>]+)>$/.exec(limpio);
  if (conNombre) {
    // No hace falta comprobar que el nombre no esté vacío: `^(.+?)` tiene
    // que consumir el primer carácter, y después del `trim()` ese carácter
    // ya no es un espacio. Se probó a poner esa comprobación y sobrevivió
    // a la mutación que la borraba, que es como se supo que no podía
    // dispararse nunca.
    const nombre = conNombre[1].trim();
    const direccion = conNombre[2].trim();
    if (!DIRECCION_DE_CORREO.test(direccion)) return null;
    return `${nombre} <${direccion}>`;
  }

  return DIRECCION_DE_CORREO.test(limpio) ? limpio : null;
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

/**
 * Eventos que solo cruzan al CLIENTE: nadie del equipo los recibe nunca.
 *
 * Hoy es uno: las condiciones nuevas de un plan o servicio (migración 76,
 * decisión de Bosco del 12/09/2026) avisan a quien puede aceptarlas por
 * el restaurante, y quien las publica es el equipo. Enseñarle a un
 * trabajador una casilla para apagar un aviso que no va a recibir es
 * una preferencia sobre nada, así que la pantalla de Ajustes los deja
 * fuera con `staffPreferenceEvents()`.
 */
export const CLIENT_ONLY_EVENTS: readonly NotificationEvent[] = [
  "terms_version_published",
  // RN-REQ-08 (migración 132): la crea el equipo y se avisa al restaurante,
  // que no la escribió. El equipo ya lo sabe: la acaba de crear.
  "request_created_on_behalf",
  // RN-COM-23 (migración 131): lo publica el propietario del espacio y se
  // avisa a quien puede aceptarla por el restaurante.
  "plan_revision_published",
  // Migración 77: pedirle información al restaurante es pedírsela a él.
  "menu_needs_information",
  // Migración 100 (RN-REC-05): quien tiene que pagar es quien tiene que
  // saber que hoy vence. Los dos avisos de impago que SÍ van al equipo son
  // los otros, los que cuentan que el servicio se ha parado.
  "charge_due_today",
  // RN-PAN-12 · a quien se le da el acceso es a alguien del restaurante.
  // El equipo ya sabe que lo ha dado: acaba de pulsarlo, y queda en la
  // auditoría.
  "establishment_access_granted",
  // RN-PAN-14 · a quien invitó se le dice en qué quedó su invitación, y
  // quien invitó es del restaurante. El otro aviso de la pareja
  // —`panel_invitation_pending_review`— es del EQUIPO y por eso no está
  // en esta lista.
  "panel_invitation_decided",
  // RN-INT-12 · al restaurante solo le llega la reseña BAJA. Las demás
  // las tiene igual en su pantalla y en su informe: un aviso que llega
  // todos los días deja de leerse, y entonces no sirve el día que
  // importa. `review_received` es del equipo y por eso no está aquí.
  "low_review_received",
];

/**
 * §18 aplicado a Menú Diario (migración 77, RN-MEN-06). De los cinco
 * eventos de un menú, solo dos cruzan al cliente: que le falta
 * información (es a él a quien se le pide) y que su menú está publicado
 * ("Publicación → cliente y supervisión"). Que no hay nadie asignado, a
 * quién se asignó o que LandingSite falló es organización interna (P7).
 */
export const CLIENT_VISIBLE_MENU_EVENTS: readonly NotificationEvent[] = [
  "menu_needs_information",
  "menu_published",
];

export function menuEventClientRecipients(
  event: NotificationEvent,
  establishmentMemberIds: readonly string[],
): readonly string[] {
  if (!CLIENT_VISIBLE_MENU_EVENTS.includes(event)) return [];
  return [...new Set(establishmentMemberIds)];
}

/** Los eventos sobre los que alguien del equipo puede tener preferencia (RN-NOT-02). */
export function staffPreferenceEvents(): readonly NotificationEvent[] {
  return NOTIFICATION_EVENTS.filter((event) => !CLIENT_ONLY_EVENTS.includes(event));
}

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

/**
 * RN-NOT-06 (decisión 65) · la hora a la que sale el resumen diario, **en
 * la zona del espacio**.
 *
 * Está aquí, y no escrita en la pantalla, porque es la MISMA hora que
 * comprueba `run_notification_digests()` en la base de datos. Son dos
 * copias inevitables —una en SQL y otra en TypeScript— y al menos esta
 * está en un sitio, con su nombre, para que quien cambie una sepa que hay
 * otra. `notifications.test.ts` falla si dejan de coincidir.
 *
 * No es configurable, y tampoco es un aplazamiento: una hora por persona
 * multiplica los casos y no resuelve nada que no resuelva ya elegir entre
 * las dos frecuencias.
 */
export const DIGEST_HOUR = 8;

/** "08:00", que es como se escribe una hora en español. */
export function digestHourLabel(hour: number = DIGEST_HOUR): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
