/**
 * `src/core/files.ts` — catálogo de archivos: categorías, versiones,
 * visibilidad y límites de subida (PRD §19 RN-ARC, §16 RN-MSG-09).
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React (CLAUDE.md).
 *
 * La autoridad real vuelve a ser el servidor
 * (supabase/migrations/20260830000025_hito7_mensajes_archivos_finanzas.sql:
 * los CHECK de `file_versions`, las políticas de `files` y las funciones
 * `register_file()`/`add_file_version()`/`share_file_with_client()`), que
 * repite estas mismas reglas. Comprobar el tamaño o el tipo en el
 * navegador es una cortesía para no subir 30 MB en vano, nunca el control.
 */

import { err, ok, type Result } from "./result";

/** RN-ARC-01: las ocho categorías, sin inventar ninguna más. */
export const FILE_CATEGORIES = [
  "logos",
  "photos",
  "menus",
  "documents",
  "reports",
  "billing",
  "requests_and_jobs",
  "other",
] as const;

export type FileCategory = (typeof FILE_CATEGORIES)[number];

/** RN-ARC-04: todo archivo está marcado como una de estas dos cosas. */
export type FileVisibility = "internal" | "shared_with_client";

/** RN-ARC-03: "en fotografía se separan original, retocada y publicada". */
export type PhotoVariant = "original" | "retouched" | "published";

/** RN-ARC-06: máximo 25 MB por archivo. */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * RN-ARC-06 / RN-MSG-09: imágenes, PDF, Word, Excel y texto. **No** vídeos
 * ni ejecutables — y la comprobación es una lista blanca, no una lista
 * negra de extensiones peligrosas: lo que no está aquí no se sube. La
 * misma lista está en el CHECK de `file_versions.mime_type` y ya estaba en
 * `request_attachments` desde el Hito 4.
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export type UploadRejection = "type_not_allowed" | "too_large" | "empty";

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** RN-ARC-06: el motivo del rechazo es explícito, nunca un booleano suelto. */
export function validateUpload(file: {
  readonly mimeType: string;
  readonly sizeBytes: number;
}): Result<void, UploadRejection> {
  if (!isAllowedMimeType(file.mimeType)) return err("type_not_allowed");
  if (file.sizeBytes <= 0) return err("empty");
  if (file.sizeBytes > MAX_FILE_SIZE_BYTES) return err("too_large");
  return ok(undefined);
}

/**
 * RN-ARC-03: "sustituir un archivo crea una versión nueva; la anterior
 * permanece". El número de versión es el siguiente al mayor existente —
 * nunca se reutiliza el hueco de una versión, porque ninguna desaparece.
 */
export function nextVersionNumber(existingVersionNumbers: readonly number[]): number {
  return existingVersionNumbers.reduce((max, version) => Math.max(max, version), 0) + 1;
}

/** Quién mira el archivo: los tres roles del espacio (§4.2) o el cliente. */
export type FileViewer =
  | {
      readonly side: "space";
      readonly role: "owner" | "admin" | "worker";
      /** Solo lo consulta el trabajador (RN-ASG-01 y §4.3, "establecimientos asignados"). */
      readonly isAuthorizedForEstablishment: boolean;
    }
  | {
      readonly side: "client";
      /** RN-FIN-07: propietario local/global siempre; Editor solo con `view_billing`. */
      readonly canViewBilling: boolean;
    };

/**
 * RN-ARC-05 + §110: quién puede ver un archivo.
 *
 * - Propietario y administradores: todo el espacio.
 * - Trabajador: archivos operativos de sus establecimientos autorizados y
 *   **nunca** facturación (RN-ARC-05 dice "nunca", sin excepciones — ni
 *   siquiera para el justificante que él mismo adjuntó al registrar un
 *   cobro, RN-FIN-05; ver la nota de `register_payment()` en la migración).
 * - Cliente: solo lo marcado "Compartido con el restaurante", y la
 *   facturación solo si además tiene visibilidad financiera (RN-FIN-07).
 */
export function canViewFile(
  viewer: FileViewer,
  file: { readonly category: FileCategory; readonly visibility: FileVisibility },
): boolean {
  if (viewer.side === "space") {
    if (viewer.role === "owner" || viewer.role === "admin") return true;
    if (file.category === "billing") return false;
    return viewer.isAuthorizedForEstablishment;
  }

  if (file.visibility !== "shared_with_client") return false;
  return file.category === "billing" ? viewer.canViewBilling : true;
}

export type DeletionRejection =
  | "not_space_owner"
  | "message_attachment"
  | "linked_to_operational_record";

/**
 * RN-ARC-07: "los adjuntos de mensajes no se eliminan. El resto se
 * archiva, no se borra. Solo el propietario puede solicitar borrado
 * definitivo, y únicamente si el archivo no está vinculado a operación,
 * factura, aceptación o registro obligatorio."
 *
 * Devuelve si se puede *solicitar* el borrado — que es lo que dice la
 * regla. Ni esta función ni el servidor borran una fila: `archive_file()`
 * archiva y `request_file_permanent_deletion()` deja constancia de la
 * solicitud (CLAUDE.md MUST NOT: no se borra físicamente un registro de
 * negocio).
 */
export function canRequestPermanentDeletion(input: {
  readonly viewerRole: "owner" | "admin" | "worker" | "client";
  readonly isMessageAttachment: boolean;
  readonly linkedEntityTypes: readonly string[];
}): Result<void, DeletionRejection> {
  if (input.viewerRole !== "owner") return err("not_space_owner");
  if (input.isMessageAttachment) return err("message_attachment");
  if (input.linkedEntityTypes.length > 0) return err("linked_to_operational_record");
  return ok(undefined);
}
