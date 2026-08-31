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
