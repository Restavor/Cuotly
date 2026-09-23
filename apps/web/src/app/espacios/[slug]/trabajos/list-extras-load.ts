import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * M09 · las columnas Evidencia y Comentarios de la bandeja: cuántos
 * archivos tiene enlazados cada trabajo y cuántos mensajes su
 * conversación interna. Dos consultas para todo el espacio, no dos por
 * fila.
 *
 * **Aquí no se autoriza nada.** `file_links` pasa por `can_read_file()`
 * (RN-ARC-04/05, RN-FIN-07): quien no puede ver un archivo tampoco lo
 * cuenta. Los mensajes, por la política de su conversación. Las dos
 * tablas tienen privilegios de columna (CLAUDE.md), así que se enumeran:
 * `entity_id` de uno y el recuento del otro, sin ninguna identidad.
 *
 * `null` en un mapa quiere decir que la consulta falló, y la columna lo
 * dice en vez de pintar ceros que nadie ha contado (CA-20).
 */
export interface JobListExtras {
  readonly evidence: ReadonlyMap<string, number> | null;
  readonly comments: ReadonlyMap<string, number> | null;
}

export async function loadJobListExtras(
  supabase: Supabase,
  spaceId: string,
): Promise<JobListExtras> {
  const [enlaces, conversaciones] = await Promise.all([
    supabase
      .from("file_links")
      .select("entity_id")
      .eq("space_id", spaceId)
      .eq("entity_type", "job"),
    // La conversación interna del trabajo (§66.2), la que abre "Mensajes"
    // en su ficha. Hay una por trabajo como mucho.
    supabase
      .from("conversations")
      .select("job_id, messages(count)")
      .eq("space_id", spaceId)
      .eq("type", "job_internal")
      .not("job_id", "is", null),
  ]);

  let evidence: Map<string, number> | null = null;
  if (enlaces.error === null) {
    evidence = new Map();
    for (const { entity_id } of enlaces.data ?? []) {
      evidence.set(entity_id, (evidence.get(entity_id) ?? 0) + 1);
    }
  }

  let comments: Map<string, number> | null = null;
  if (conversaciones.error === null) {
    comments = new Map();
    for (const fila of conversaciones.data ?? []) {
      if (fila.job_id === null) continue;
      const total = fila.messages[0]?.count ?? 0;
      comments.set(fila.job_id, (comments.get(fila.job_id) ?? 0) + total);
    }
  }

  return { evidence, comments };
}
