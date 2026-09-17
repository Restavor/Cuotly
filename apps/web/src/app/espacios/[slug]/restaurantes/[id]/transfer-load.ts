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
    .select("id, taken_at, size_bytes, item_counts")
    .eq("establishment_id", establishmentId)
    .order("taken_at", { ascending: false });

  return (data ?? []).map((fila) => ({
    id: fila.id,
    takenAt: fila.taken_at,
    sizeBytes: fila.size_bytes,
    counts: (fila.item_counts ?? {}) as Counts,
  }));
}
