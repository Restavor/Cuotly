import type { BackupRow } from "@/components/establishment/BackupsBlock";
import type { PendingTransfer } from "@/components/establishment/TransferForms";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * §38 · lo que la ficha necesita de la transferencia y de las copias.
 *
 * Las dos lecturas van juntas porque las pinta el mismo bloque de la ficha
 * y porque las dos son del mismo par de reglas nuevas.
 *
 * **Aquí no se comprueba ningún permiso.** La política de
 * `establishment_transfers` deja leer a los dos espacios y la de
 * `establishment_backups` solo a quien gestiona clientes: si esta función
 * devuelve una lista vacía, es que no había nada que enseñar a quien
 * preguntó.
 */
export async function loadPendingTransfer(
  supabase: Supabase,
  establishmentId: string,
  spaceId: string,
): Promise<PendingTransfer | null> {
  const { data } = await supabase
    .from("establishment_transfers")
    .select("id, reason, proposed_at, from_space_id")
    .eq("establishment_id", establishmentId)
    .eq("state", "pending")
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    reason: data.reason,
    proposedAt: data.proposed_at,
    // De qué lado está quien mira. Lo decide el espacio desde el que se
    // abrió la ficha, no el usuario: la misma persona puede ser
    // propietaria de los dos espacios, y entonces la propuesta se ve de
    // una manera desde cada ficha.
    iProposed: data.from_space_id === spaceId,
  };
}

interface Counts {
  requests?: number;
  menus?: number;
  files?: number;
  conversations?: number;
}

export async function loadBackups(
  supabase: Supabase,
  establishmentId: string,
): Promise<readonly BackupRow[]> {
  // `content` NO se pide: son las copias enteras, y traerlas todas para
  // pintar una lista de fechas sería descargar el restaurante entero
  // treinta veces. El contenido se sirve al descargar una (RN-BCK-05).
  const { data } = await supabase
    .from("establishment_backups")
    .select("id, taken_at, size_bytes, item_counts, created_by")
    .eq("establishment_id", establishmentId)
    .order("taken_at", { ascending: false });

  /*
    M83 · la columna "Autor". Las copias solo las lee el equipo con
    `manage_clients` (RN-BCK-07), así que el nombre de quien la generó es
    de puertas adentro. `created_by` vacío es la copia del barrido diario
    (RN-BCK-02), que no la pide nadie; un autor cuyo perfil no se puede
    leer se queda sin nombre, no con un uuid.
  */
  const autores = [...new Set((data ?? []).flatMap((fila) => (fila.created_by ? [fila.created_by] : [])))];
  const nombres = new Map<string, string>();
  if (autores.length > 0) {
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", autores);
    for (const perfil of perfiles ?? []) {
      const nombre = (perfil.full_name ?? "").trim() || perfil.email;
      if (nombre) nombres.set(perfil.id, nombre);
    }
  }

  return (data ?? []).map((fila) => ({
    id: fila.id,
    takenAt: fila.taken_at,
    sizeBytes: fila.size_bytes,
    counts: (fila.item_counts ?? {}) as Counts,
    automatic: fila.created_by === null,
    authorName: fila.created_by === null ? null : (nombres.get(fila.created_by) ?? null),
  }));
}
