"use server";

import { randomUUID } from "node:crypto";
import { megabytesMaximos } from "@/core/files";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  FILE_CATEGORIES,
  FILE_VISIBILITIES,
  storageObjectPath,
  storagePrefixFor,
  validateUpload,
  type FileCategory,
  type FileVisibility,
} from "@/core/files";
import { es } from "@/i18n/es";
import { createSignedUpload, discardObject, readObjectMetadata } from "@/services/file-storage";

/**
 * Subir un archivo, en dos pasos y con el navegador subiendo los bytes
 * directamente al bucket (ver `src/services/file-storage.ts` para el
 * porqué). Estas dos acciones son las que ponen las comprobaciones:
 *
 * 1. `prepararSubida()` decide **si** esta persona puede subir a este
 *    establecimiento con esta categoría —lo dice `can_write_file()` en la
 *    base de datos— y solo entonces firma una URL para una ruta concreta.
 * 2. `registrarArchivo()` mira **el objeto que ha quedado en el bucket**,
 *    no lo que diga el formulario, y solo si el tamaño y el tipo reales
 *    valen llama a `register_file()`, que vuelve a comprobar el permiso.
 *
 * Que la comprobación esté repetida en los dos pasos no es descuido: el
 * navegador puede llamar al segundo sin pasar por el primero, así que el
 * segundo no puede fiarse de que el primero ocurriera (CLAUDE.md MUST).
 */

export type ResultadoPreparacion =
  | { readonly ok: true; readonly path: string; readonly token: string }
  | { readonly ok: false; readonly motivo: string };

export type ResultadoRegistro =
  | { readonly ok: true; readonly fileId: string }
  | { readonly ok: false; readonly motivo: string };

function esCategoria(valor: string): valor is FileCategory {
  return (FILE_CATEGORIES as readonly string[]).includes(valor);
}

function esVisibilidad(valor: string): valor is FileVisibility {
  return (FILE_VISIBILITIES as readonly string[]).includes(valor);
}

/** RN-ARC-06: el motivo del rechazo se dice, no se devuelve un booleano. */
function motivoDeRechazo(rechazo: "type_not_allowed" | "too_large" | "empty"): string {
  if (rechazo === "type_not_allowed") return es.files.rejectedType;
  if (rechazo === "too_large") return es.files.rejectedSize(megabytesMaximos());
  return es.files.rejectedEmpty;
}

export async function prepararSubida(entrada: {
  establishmentId: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ResultadoPreparacion> {
  if (!esCategoria(entrada.category)) {
    return { ok: false, motivo: es.files.rejectedCategory };
  }

  // Comprobar aquí el tipo y el tamaño ahorra subir 25 MB en vano; no es
  // el control. El control son el bucket (que los rechaza), el CHECK de
  // `file_versions` y el segundo paso.
  const validacion = validateUpload({ mimeType: entrada.mimeType, sizeBytes: entrada.sizeBytes });
  if (!validacion.ok) {
    return { ok: false, motivo: motivoDeRechazo(validacion.error) };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: es.actions.notAuthenticated };

  // El espacio sale de la base, no del formulario: la ruta dice a quién
  // pertenece el objeto y no puede componerla quien sube.
  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, space_id")
    .eq("id", entrada.establishmentId)
    .maybeSingle();

  if (!establishment) return { ok: false, motivo: es.files.noEstablishment };

  const { data: puedeEscribir, error: permisoError } = await supabase.rpc("can_write_file", {
    p_establishment_id: entrada.establishmentId,
    p_category: entrada.category,
  });

  if (permisoError || !puedeEscribir) {
    return { ok: false, motivo: es.files.noWritePermission };
  }

  const path = storageObjectPath({
    spaceId: establishment.space_id,
    establishmentId: establishment.id,
    uniqueId: randomUUID(),
    fileName: entrada.fileName,
  });

  const firma = await createSignedUpload(createAdminClient().storage, path);
  if (!firma.ok) return { ok: false, motivo: es.files.uploadUnavailable };

  return { ok: true, path: firma.value.path, token: firma.value.token };
}

export async function registrarArchivo(entrada: {
  establishmentId: string;
  category: string;
  name: string;
  path: string;
  fileName: string;
  /**
   * RN-ARC-04 · con qué marca nace el archivo. Sin ella nace **interno**,
   * que es el valor por defecto de `register_file()` y lo prudente: un
   * archivo que se comparte sin querer ya lo ha visto el restaurante.
   *
   * Lo que llegue de aquí no manda del todo: a lo que sube el propio
   * restaurante, `register_file()` le pone "compartido" pase lo que pase
   * —marcarle como interno lo suyo lo escondería de quien lo subió— y a
   * la facturación la sigue guardando `can_write_file()`.
   */
  visibility?: string;
}): Promise<ResultadoRegistro> {
  if (!esCategoria(entrada.category)) {
    return { ok: false, motivo: es.files.rejectedCategory };
  }

  // Llega del navegador, así que se comprueba: un valor que no sea uno de
  // los dos reventaría contra el CHECK de `files.visibility` con un error
  // de base de datos en vez de con un motivo legible.
  if (entrada.visibility !== undefined && !esVisibilidad(entrada.visibility)) {
    return { ok: false, motivo: es.files.rejectedVisibility };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: es.actions.notAuthenticated };

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, space_id")
    .eq("id", entrada.establishmentId)
    .maybeSingle();

  if (!establishment) return { ok: false, motivo: es.files.noEstablishment };

  // La ruta llega del navegador, así que se comprueba que cae donde a esta
  // persona se le dio permiso. Sin esto, alguien podría registrar en su
  // catálogo un objeto de otro establecimiento con solo saber su ruta.
  if (!entrada.path.startsWith(storagePrefixFor(establishment.space_id, establishment.id))) {
    return { ok: false, motivo: es.files.pathMismatch };
  }

  const metadatos = await readObjectMetadata(admin.storage, entrada.path);
  if (!metadatos.ok) return { ok: false, motivo: es.files.objectMissing };

  // Lo que se valida es el objeto real. Si no vale, los bytes se retiran:
  // nunca llegaron a ser un archivo de Cuotly.
  const validacion = validateUpload(metadatos.value);
  if (!validacion.ok) {
    await discardObject(admin.storage, entrada.path);
    return { ok: false, motivo: motivoDeRechazo(validacion.error) };
  }

  const { data: fileId, error } = await supabase.rpc("register_file", {
    p_establishment_id: entrada.establishmentId,
    p_category: entrada.category,
    p_name: entrada.name.trim() || entrada.fileName,
    p_storage_path: entrada.path,
    p_file_name: entrada.fileName,
    p_mime_type: metadatos.value.mimeType,
    p_size_bytes: metadatos.value.sizeBytes,
    p_visibility: entrada.visibility ?? "internal",
  });

  if (error || !fileId) {
    // `register_file()` vuelve a comprobar el permiso y puede negarse
    // aunque el primer paso dijera que sí: entre uno y otro pueden haberle
    // quitado el establecimiento a un trabajador.
    await discardObject(admin.storage, entrada.path);
    return { ok: false, motivo: error?.message ?? es.files.registerFailed };
  }

  return { ok: true, fileId };
}

export type ResultadoCompartir = { readonly ok: true } | { readonly ok: false; readonly motivo: string };

/**
 * RN-ARC-04 · compartir con el restaurante un archivo interno.
 *
 * La acción no decide nada: quien decide es `share_file_with_client()`,
 * que exige la capacidad `manage_files` **y** poder ver el archivo
 * (`can_read_file()`, que es lo que deja fuera al trabajador para la
 * facturación, RN-ARC-05). Aquí solo se traduce lo que conteste. Que el
 * botón se pinte no autoriza a nadie: llamando a esta acción desde la
 * consola, la respuesta es la misma (CLAUDE.md MUST).
 *
 * Es idempotente en el servidor —compartir dos veces no escribe un
 * segundo apunte de auditoría— así que un doble clic no duplica nada y no
 * hace falta ninguna clave aquí.
 *
 * No se revalida ninguna ruta desde aquí: la pantalla que llama refresca
 * la suya, y esta acción la usan dos (la ficha del equipo y, el día que
 * haga falta, cualquier otra que enseñe el catálogo).
 */
export async function compartirArchivo(fileId: string): Promise<ResultadoCompartir> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, motivo: es.actions.notAuthenticated };

  const { error } = await supabase.rpc("share_file_with_client", { p_file_id: fileId });

  // El mensaje viene de la función, en español y diciendo el motivo real
  // ("No tienes permiso para compartir este archivo con el restaurante").
  // Traducirlo aquí sería inventar un segundo motivo que puede discrepar.
  if (error) return { ok: false, motivo: error.message };

  return { ok: true };
}
