/**
 * `src/services/file-storage.ts` — adaptador de almacenamiento de archivos
 * (CLAUDE.md: "los adaptadores externos viven en `src/services/`").
 *
 * RN-ARC-08: "enlaces privados y temporales para la descarga". El
 * catálogo (`files`/`file_versions`) guarda la **ruta** del objeto, nunca
 * una URL pública: un archivo compartido con el restaurante sigue siendo
 * privado, y quien tenga el enlace solo puede usarlo durante unos minutos.
 * Quien decide *si* alguien puede descargar es el servidor —
 * `can_read_file()` y las políticas de RLS— y este módulo solo firma el
 * enlace después de esa decisión: pedir una firma no comprueba permisos.
 *
 * La segunda mitad de RN-ARC-08 ("se optimiza la versión visual
 * conservando el original") **no** está implementada: exige una tubería de
 * transformación de imágenes que la Fase 1 no monta. No se simula con un
 * redimensionado en el navegador ni con nada parecido — el original es lo
 * único que hoy se guarda y lo único que se sirve.
 */

import { err, ok, type Result } from "@/core/result";

/**
 * Caducidad por defecto del enlace, en segundos. Cinco minutos: suficiente
 * para que el navegador empiece la descarga, corto para que un enlace
 * reenviado por error deje de servir enseguida.
 */
export const DOWNLOAD_LINK_TTL_SECONDS = 300;

/** El bucket privado donde viven todos los archivos del catálogo. */
export const FILES_BUCKET = "files";

/**
 * La forma mínima de `supabase.storage` que este módulo necesita. Se
 * declara aquí en vez de importar el tipo del SDK para que la lógica sea
 * probable con un doble, sin levantar Supabase.
 */
export type SignedUrlResponse = {
  readonly data: { readonly signedUrl: string } | null;
  readonly error: { readonly message: string } | null;
};

export type StorageClient = {
  from(bucket: string): {
    createSignedUrl(path: string, expiresInSeconds: number): Promise<SignedUrlResponse>;
  };
};

export type DownloadLinkError = "link_unavailable";

/**
 * Devuelve un enlace privado y temporal a una versión concreta de un
 * archivo. Error de negocio explícito, no excepción (CLAUDE.md): que el
 * almacenamiento no conteste es un caso previsto, y la pantalla debe poder
 * decir "no se ha podido preparar la descarga" en vez de romperse.
 */
export async function createPrivateDownloadLink(
  storage: StorageClient,
  storagePath: string,
  expiresInSeconds: number = DOWNLOAD_LINK_TTL_SECONDS,
): Promise<Result<string, DownloadLinkError>> {
  try {
    const response = await storage.from(FILES_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
    if (response.error !== null || response.data === null) {
      return err("link_unavailable");
    }
    return ok(response.data.signedUrl);
  } catch {
    return err("link_unavailable");
  }
}

// ---------------------------------------------------------------------
// La otra mitad: subir.
//
// **Por qué los bytes no pasan por el servidor de la aplicación.** Lo
// cómodo sería recibir el archivo en una server action y subirlo desde
// ahí, pero RN-ARC-06 permite 25 MB y el cuerpo de una server action va
// por la función de Vercel, cuyo límite es bastante menor. Así que el
// navegador sube **directamente** al bucket con una URL firmada que emite
// el servidor después de comprobar el permiso: la autorización sigue
// siendo del servidor y lo único que se ahorra es el rodeo de los bytes.
//
// El precio, dicho en claro: entre firmar la URL y registrar el archivo,
// quien abandone a mitad deja un objeto sin fila en `files`. Es un
// huérfano invisible para la aplicación —los listados salen de `files`—
// que ocupa sitio. No hay recogida de huérfanos todavía y no me la
// invento aquí.
// ---------------------------------------------------------------------

export type SignedUploadResponse = {
  readonly data: { readonly path: string; readonly token: string } | null;
  readonly error: { readonly message: string } | null;
};

export type ObjectInfoResponse = {
  readonly data: { readonly size?: number; readonly contentType?: string } | null;
  readonly error: { readonly message: string } | null;
};

/**
 * La parte de `supabase.storage` que necesita la subida, declarada aparte
 * de `StorageClient` para no obligar a los dobles de la descarga a fingir
 * métodos que no usan. El cliente real cumple las dos formas.
 */
export type UploadStorageClient = {
  from(bucket: string): {
    createSignedUploadUrl(path: string): Promise<SignedUploadResponse>;
    info(path: string): Promise<ObjectInfoResponse>;
    remove(paths: string[]): Promise<unknown>;
  };
};

export type UploadTicket = { readonly path: string; readonly token: string };
export type SignedUploadError = "upload_unavailable";

/**
 * La URL firmada de subida autoriza **una ruta concreta** y nada más: no
 * sirve para leer, ni para escribir en otro sitio, ni para volver a subir
 * encima (sin `upsert`, una segunda subida a la misma ruta falla). Es la
 * única llave que se le da al navegador, y se le da tras comprobar
 * `can_write_file()`.
 */
export async function createSignedUpload(
  storage: UploadStorageClient,
  storagePath: string,
): Promise<Result<UploadTicket, SignedUploadError>> {
  try {
    const response = await storage.from(FILES_BUCKET).createSignedUploadUrl(storagePath);
    if (response.error !== null || response.data === null) {
      return err("upload_unavailable");
    }
    return ok({ path: response.data.path, token: response.data.token });
  } catch {
    return err("upload_unavailable");
  }
}

export type ObjectMetadata = {
  readonly sizeBytes: number;
  readonly mimeType: string;
};

export type ObjectMetadataError = "object_missing";

/**
 * El tamaño y el tipo **del objeto que hay realmente en el bucket**, no
 * los que declaró el navegador. Es la diferencia entre validar y creerse
 * lo que le cuentan: quien sube controla los dos valores que envía en el
 * formulario, así que el registro del archivo se comprueba contra esto.
 */
export async function readObjectMetadata(
  storage: UploadStorageClient,
  storagePath: string,
): Promise<Result<ObjectMetadata, ObjectMetadataError>> {
  try {
    const response = await storage.from(FILES_BUCKET).info(storagePath);
    if (response.error !== null || response.data === null) {
      return err("object_missing");
    }
    return ok({
      sizeBytes: response.data.size ?? 0,
      mimeType: response.data.contentType ?? "",
    });
  } catch {
    return err("object_missing");
  }
}

/**
 * Retirar los bytes de una subida que **no llegó a ser un archivo de
 * Cuotly** porque su registro se rechazó. No contradice a CLAUDE.md ("no
 * se borran registros de negocio"): sin fila en `files` no hay registro
 * que conservar, y dejarlo sería guardar basura, no historial.
 *
 * No devuelve nada ni lanza: se llama cuando ya se está devolviendo un
 * error a quien subía, y que además falle la limpieza no cambia lo que
 * hay que contarle.
 */
export async function discardObject(
  storage: UploadStorageClient,
  storagePath: string,
): Promise<void> {
  try {
    await storage.from(FILES_BUCKET).remove([storagePath]);
  } catch {
    // Queda un huérfano. Es lo mismo que si nadie hubiera registrado el
    // archivo, y no hay nada mejor que hacer desde aquí.
  }
}
