/**
 * `src/services/avatar-storage.ts` — adaptador de la foto de perfil
 * (RN-GLO-09, CLAUDE.md: "los adaptadores externos viven en
 * `src/services/`").
 *
 * Es hermano de `file-storage.ts` y con la misma idea detrás: el bucket es
 * **privado**, así que nunca hay una URL pública de una cara. La ruta se
 * guarda en `profiles.avatar_path` y el enlace se firma cada vez, con
 * caducidad corta.
 *
 * **Bucket aparte, no `files`.** `files.space_id` es `NOT NULL` y una cara
 * no es de ningún espacio. Ver la cabecera de la migración 109.
 *
 * Quién puede ver la foto de quién NO se decide aquí: lo decide
 * `profiles_select`, que es la que impide que un cliente lea la fila —y
 * con ella la ruta— de alguien del equipo. Este módulo solo firma un
 * enlace a una ruta que ya se ha podido leer.
 */

import { err, ok, type Result } from "@/core/result";
import type { StorageClient } from "@/services/file-storage";

/** El bucket privado de las fotos de perfil. */
export const AVATARS_BUCKET = "avatars";

/**
 * Caducidad del enlace de la foto, en segundos. Una hora, no los cinco
 * minutos de una descarga: una foto se pinta en cada pantalla que enseña a
 * esa persona, y firmar una URL por avatar y por vista sería una llamada
 * al almacenamiento por cara. Sigue siendo temporal, que es lo que RN-ARC-08
 * pide del bucket privado.
 */
export const AVATAR_LINK_TTL_SECONDS = 3600;

/**
 * Los formatos y el tamaño que admite el bucket. **Son técnicos**, no una
 * regla de producto: el mismo número está en la migración 109, que es
 * quien de verdad manda —esto es cortesía para el navegador, para no
 * mandar 8 MB y que los rechace el servidor—.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarUploadError = "too_large" | "wrong_type" | "upload_failed";

/**
 * La ruta donde vive la foto de una persona.
 *
 * El uuid delante **no es decorativo**: `set_my_avatar()` rechaza una ruta
 * que no empiece por el uuid de quien llama, así que esta función y esa
 * comprobación tienen que decir lo mismo. El sufijo con la hora hace que
 * una foto nueva no reutilice la ruta de la anterior, que es lo que evita
 * que un navegador siga enseñando la vieja desde su caché.
 */
export function avatarPathFor(userId: string, mimeType: string, now: Date = new Date()): string {
  const extension =
    mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return `${userId}/${now.getTime()}.${extension}`;
}

/**
 * Comprueba el archivo antes de subirlo. Resultado explícito, no
 * excepción (CLAUDE.md): "esa imagen pesa demasiado" es un caso previsto y
 * la pantalla tiene que poder decirlo.
 */
export function checkAvatarFile(file: {
  readonly size: number;
  readonly type: string;
}): Result<true, AvatarUploadError> {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) return err("wrong_type");
  if (file.size > AVATAR_MAX_BYTES) return err("too_large");
  return ok(true);
}

export type AvatarStorageClient = StorageClient & {
  from(bucket: string): {
    createSignedUrl(
      path: string,
      expiresInSeconds: number,
    ): Promise<{
      readonly data: { readonly signedUrl: string } | null;
      readonly error: { readonly message: string } | null;
    }>;
  };
};

/**
 * La forma mínima del cliente que SUBE. Se declara aquí, y no se importa
 * del SDK, para que la lógica sea probable con un doble.
 */
export type AvatarUploadClient = {
  from(bucket: string): {
    upload(
      path: string,
      body: ArrayBuffer | Uint8Array | Blob,
      options?: { readonly contentType?: string },
    ): Promise<{ readonly error: { readonly message: string } | null }>;
  };
};

/**
 * Sube la foto al bucket privado.
 *
 * Va por el cliente de **servicio**, no por la sesión de la persona, y no
 * es un atajo: `storage.objects` tiene RLS activado y **cero políticas**
 * (migración 45), así que `authenticated` no puede escribir ni un byte ahí
 * por diseño. Las dos puertas son el servicio y una URL firmada.
 *
 * Aquí se usa la primera porque una foto de perfil cabe en una petición
 * —2 MB— y así el formulario funciona **sin JavaScript** (CA-22): no hace
 * falta el baile de pedir un vale, subir desde el navegador y confirmar,
 * que es lo que sí hacen los archivos de 25 MB.
 *
 * Quién puede subir no se decide aquí: la ruta la compone `avatarPathFor`
 * con el uuid de quien llama, y `set_my_avatar()` la vuelve a comprobar
 * antes de guardarla. Subir un objeto que nadie apunta no le da acceso a
 * nada a nadie.
 */
export async function uploadAvatar(
  storage: AvatarUploadClient,
  path: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<Result<true, AvatarUploadError>> {
  try {
    const response = await storage
      .from(AVATARS_BUCKET)
      .upload(path, body, { contentType });
    if (response.error !== null) return err("upload_failed");
    return ok(true);
  } catch {
    return err("upload_failed");
  }
}

/**
 * Un enlace privado y temporal a la foto de alguien. Devuelve `null` en
 * vez de romper: una pantalla sin foto enseña la inicial, que es
 * exactamente lo que enseña quien no tiene foto, y no hay nada que
 * explicarle a nadie.
 */
export async function avatarLink(
  storage: AvatarStorageClient,
  avatarPath: string | null,
  expiresInSeconds: number = AVATAR_LINK_TTL_SECONDS,
): Promise<string | null> {
  if (avatarPath === null || avatarPath.trim() === "") return null;
  try {
    const response = await storage
      .from(AVATARS_BUCKET)
      .createSignedUrl(avatarPath, expiresInSeconds);
    if (response.error !== null || response.data === null) return null;
    return response.data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * La inicial que se pinta cuando no hay foto: la primera letra del nombre,
 * o la del correo si todavía no hay nombre. Nunca un hueco redondo vacío.
 */
export function avatarInitial(displayName: string | null, email: string): string {
  const fuente = (displayName ?? "").trim() !== "" ? (displayName as string).trim() : email.trim();
  return fuente.slice(0, 1).toUpperCase();
}
