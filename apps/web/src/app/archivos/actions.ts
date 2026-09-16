"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import {
  prepararSubidaCon,
  registrarArchivoCon,
  type ResultadoPreparacion,
  type ResultadoRegistro,
} from "@/services/file-upload";

/**
 * Subir un archivo, en dos pasos y con el navegador subiendo los bytes
 * directamente al bucket. Las comprobaciones —quién puede subir qué, y
 * que el objeto real vale— viven en `src/services/file-upload.ts`, que es
 * el mismo código que usa la app móvil por `/api/movil/archivos`
 * (RN-MOV-07): aquí solo se le pasa la sesión de las cookies.
 */
export async function prepararSubida(entrada: {
  establishmentId: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ResultadoPreparacion> {
  return prepararSubidaCon(await createClient(), createAdminClient(), entrada);
}

export async function registrarArchivo(entrada: {
  establishmentId: string;
  category: string;
  name: string;
  path: string;
  fileName: string;
  visibility?: string;
}): Promise<ResultadoRegistro> {
  return registrarArchivoCon(await createClient(), createAdminClient(), entrada);
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
