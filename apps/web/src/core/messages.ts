/**
 * `src/core/messages.ts` — reglas de las conversaciones y los mensajes
 * (PRD §16 RN-MSG, §15.2 RN-EST-13, HU-35). Lógica de dominio pura: sin
 * Supabase, sin Next.js, sin React (CLAUDE.md, regla de estilo de código).
 *
 * La autoridad real es la base de datos
 * (supabase/migrations/20260830000025_hito7_mensajes_archivos_finanzas.sql:
 * `post_message()`, `edit_message()`, `list_conversation_messages()` y las
 * políticas de RLS), que hace cumplir exactamente estas mismas reglas en
 * el servidor. Este módulo existe para poder probarlas como lógica pura y
 * para que cualquier pantalla que decida si un botón "Editar" se muestra
 * use el mismo cálculo que el servidor — nunca uno propio (CLAUDE.md:
 * "ocultar un botón NO es un control de acceso"; esto es lo contrario:
 * el cliente puede anticipar la decisión, pero no la toma).
 */

import { err, ok, type Result } from "./result";

/** §66: los tres tipos de conversación, sin ninguno más. */
export type ConversationType = "request" | "job_internal" | "establishment";

/** Quién escribe. El cliente nunca ve más granularidad que esto (RN-MSG-02). */
export type SenderRole = "staff" | "client";

/** Desde qué lado se está leyendo la conversación. */
export type Audience = "staff" | "client";

/**
 * RN-MSG-04: "las notas internas están estrictamente separadas de los
 * mensajes con el cliente. Un fallo aquí es un fallo grave." La separación
 * es estructural —las notas internas son otra tabla (`internal_notes`), no
 * un mensaje con una marca—, y además la conversación interna de trabajo
 * (§66.2, "coordinación... entre miembros del espacio") no es visible para
 * el cliente en ningún caso.
 */
export function isClientVisibleConversation(type: ConversationType): boolean {
  return type === "request" || type === "establishment";
}

/**
 * RN-MSG-02 / HU-35 / CLAUDE.md MUST NOT: el cliente ve "Equipo de
 * mantenimiento", nunca una persona. Se devuelve un identificador de
 * interlocutor, no un texto: el literal en español vive en `src/i18n/es.ts`
 * (`space.messages.maintenanceTeam`), nunca aquí.
 *
 * `person` solo aparece cuando quien lee es del equipo. El servidor hace
 * cumplir lo mismo por su cuenta: `messages.sender_id` no es legible con
 * un SELECT normal y `list_conversation_messages()` no lo devuelve cuando
 * quien pregunta es el cliente.
 */
export type SenderIdentity =
  | { readonly kind: "maintenance_team" }
  | { readonly kind: "client" }
  | { readonly kind: "person"; readonly profileId: string };

export function resolveSenderIdentity(
  sender: { readonly role: SenderRole; readonly profileId: string },
  audience: Audience,
): SenderIdentity {
  if (sender.role === "client") return { kind: "client" };
  return audience === "client" ? { kind: "maintenance_team" } : { kind: "person", profileId: sender.profileId };
}

/** RN-MSG-07: la ventana de edición son 10 minutos naturales, no laborables. */
export const MESSAGE_EDIT_WINDOW_MINUTES = 10;

export type MessageEditRejection = "not_author" | "window_closed" | "conversation_read_only";

export type EditableMessage = {
  readonly senderId: string;
  readonly createdAt: Date;
};

/**
 * RN-MSG-07: "un mensaje puede editarse durante 10 minutos; después
 * aparece la marca `Editado` y se conserva la versión anterior."
 *
 * Solo lo edita quien lo escribió: el PRD habla de editar *tu* mensaje, y
 * dejar que otra persona reescriba lo que dijo un tercero rompería el
 * historial que P4 exige. La versión anterior no se pierde nunca
 * (`message_edits`), y RN-MSG-08 sigue valiendo: no hay borrado, ni aquí
 * ni en la base de datos, que no tiene política de DELETE para mensajes.
 */
export function canEditMessage(input: {
  readonly message: EditableMessage;
  readonly actorId: string;
  readonly now: Date;
  readonly conversationIsReadOnly: boolean;
}): Result<void, MessageEditRejection> {
  if (input.message.senderId !== input.actorId) return err("not_author");
  if (input.conversationIsReadOnly) return err("conversation_read_only");

  const elapsedMinutes = (input.now.getTime() - input.message.createdAt.getTime()) / 60_000;
  if (elapsedMinutes > MESSAGE_EDIT_WINDOW_MINUTES) return err("window_closed");

  return ok(undefined);
}

/** RN-MSG-07: la marca `Editado` aparece en cuanto existe una versión anterior. */
export function isEdited(message: { readonly editCount: number }): boolean {
  return message.editCount > 0;
}

/** Roles del lado cliente (§4.3). */
export type ClientRole = "global_owner" | "local_owner" | "editor" | "consulta";

/**
 * RN-MSG-05: "el rol Consulta puede leer pero no responder". Los demás
 * roles de cliente sí responden — la misma frontera que
 * `can_write_establishment()` en la base de datos.
 */
export function canClientReply(role: ClientRole): boolean {
  return role !== "consulta";
}

/**
 * RN-COR-08 (PRD §13) y §67 de la especificación maestra: "al terminar la
 * ventana de corrección, la conversación de esa solicitud pasa a solo
 * lectura. Una necesidad nueva exige una solicitud nueva."
 *
 * La conversación de una solicitud se cierra por dos caminos, y los dos
 * cuentan: que la solicitud llegue a un estado terminal (el que ya hacía
 * cumplir el Hito 6), o que venza la ventana de corrección aunque nadie
 * haya movido el estado todavía.
 *
 * `correctionWindowEndsAt` es `jobs.correction_window_ends_at`, el instante
 * que `publish_job()` calculó con el reloj laborable en el Hito 6
 * (RN-COR-02): este módulo no vuelve a calcularlo, lo recibe ya resuelto.
 * `null` = la solicitud todavía no tiene trabajo publicado.
 */
export const READ_ONLY_REQUEST_STATES = [
  "closed",
  "rejected",
  "cancelled_before_start",
  "cancelled_after_start",
] as const;

export function isConversationReadOnly(input: {
  readonly type: ConversationType;
  readonly requestState: string | null;
  readonly correctionWindowEndsAt: Date | null;
  readonly now: Date;
}): boolean {
  if (input.type !== "request") return false;

  if (input.requestState !== null && (READ_ONLY_REQUEST_STATES as readonly string[]).includes(input.requestState)) {
    return true;
  }

  if (input.correctionWindowEndsAt === null) return false;
  return input.now.getTime() > input.correctionWindowEndsAt.getTime();
}

/**
 * RN-MSG-06: "se muestran los estados leído y no leído". El servidor
 * guarda un único instante por persona y conversación
 * (`conversation_reads.last_read_at`); lo que está sin leer es lo que llegó
 * después, escrito por otra persona.
 */
export function unreadCount(
  messages: readonly { readonly senderId: string; readonly createdAt: Date }[],
  viewer: { readonly userId: string; readonly lastReadAt: Date | null },
): number {
  return messages.filter(
    (message) =>
      message.senderId !== viewer.userId &&
      (viewer.lastReadAt === null || message.createdAt.getTime() > viewer.lastReadAt.getTime()),
  ).length;
}

/** RN-EST-13: las notas internas operativas son las únicas que ve un trabajador. */
export type InternalNoteKind = "operational" | "management";

/** Rol de quien lee dentro del espacio de mantenimiento (§4.2). */
export type SpaceRole = "owner" | "admin" | "worker";

/**
 * RN-EST-13: "las notas internas las ven propietario y administradores en
 * su totalidad; los trabajadores solo las notas operativas de sus
 * establecimientos autorizados; **los clientes nunca**". Que el cliente no
 * aparezca en la firma de esta función no es un olvido: no hay ningún
 * parámetro con el que un cliente pueda llegar aquí, igual que en la base
 * de datos `internal_notes` no tiene ninguna política que lo alcance.
 */
export function canReadInternalNote(
  viewer: { readonly role: SpaceRole; readonly isAuthorizedForEstablishment: boolean },
  note: { readonly kind: InternalNoteKind },
): boolean {
  if (viewer.role === "owner" || viewer.role === "admin") return true;
  return note.kind === "operational" && viewer.isAuthorizedForEstablishment;
}
