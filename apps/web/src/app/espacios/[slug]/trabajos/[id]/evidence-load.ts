import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * La evidencia de un trabajo: **una sola definición**, de la que leen las
 * dos pantallas que la enseñan (RN-JOB-10, RN-ARC-02).
 *
 * Es el mismo motivo por el que `loadJobTasks()` vive en su archivo. Hasta
 * el 21/09/2026 esta consulta estaba escrita a mano dentro de la ficha del
 * trabajo, y al traer la evidencia al panel de la solicitud (RN-REQ-07,
 * decisión 64) habría habido dos copias: primero divergirían en el orden,
 * después en qué columnas se piden, y un día en cuál es la versión
 * vigente de un archivo.
 *
 * **Aquí no se autoriza nada.** `file_links_select` llama a
 * `can_read_file()`: quien no puede ver un archivo no lo ve aquí tampoco,
 * y al restaurante solo le llega lo marcado "Compartido con el
 * restaurante" (RN-ARC-04).
 *
 * `files` y `file_versions` tienen privilegios de columna para tapar la
 * identidad del equipo, así que las columnas se enumeran — un `select *`
 * devolvería 403 (CLAUDE.md).
 */
export interface EvidenceFile {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number | null;
  readonly mimeType: string | null;
  readonly attachedAt: string;
}

export async function loadJobEvidence(
  supabase: SupabaseClient<Database>,
  jobId: string,
): Promise<readonly EvidenceFile[]> {
  const { data: enlaces } = await supabase
    .from("file_links")
    .select("file_id, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: false });

  const ids = (enlaces ?? []).map((enlace) => enlace.file_id);
  if (ids.length === 0) return [];

  const [{ data: archivos }, { data: versiones }] = await Promise.all([
    supabase.from("files").select("id, name").in("id", ids),
    supabase
      .from("file_versions")
      .select("file_id, size_bytes, mime_type, version_number")
      .in("file_id", ids)
      .order("version_number", { ascending: false }),
  ]);

  /*
    La versión VIGENTE de cada archivo es la de número más alto, y las
    filas llegan ordenadas: la primera que se ve de cada archivo es la
    buena (RN-ARC-03, sustituir crea versión y la anterior permanece).
  */
  const vigente = new Map<string, { size: number | null; mime: string | null }>();
  for (const version of versiones ?? []) {
    if (!vigente.has(version.file_id)) {
      vigente.set(version.file_id, { size: version.size_bytes, mime: version.mime_type });
    }
  }

  const nombre = new Map((archivos ?? []).map((archivo) => [archivo.id, archivo.name]));

  return (enlaces ?? [])
    // Un enlace cuyo archivo no se puede leer no se enseña como un hueco:
    // simplemente no está, que es lo que `can_read_file()` ha decidido.
    .filter((enlace) => nombre.has(enlace.file_id))
    .map((enlace) => ({
      id: enlace.file_id,
      name: nombre.get(enlace.file_id)!,
      sizeBytes: vigente.get(enlace.file_id)?.size ?? null,
      mimeType: vigente.get(enlace.file_id)?.mime ?? null,
      attachedAt: enlace.created_at,
    }));
}
