import type { SheetFrameData } from "@/components/establishment/SheetHeader";
import type { CycleBag } from "@/core/establishments";
import type { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhoto } from "@/services/establishment-photo";

import { loadSheetHeader } from "./sheet-load";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Lo justo para pintar el marco de la ficha encima de una pantalla de
 * detalle (M26, M28, M30, M32, M39): la cabecera, la bolsa del ciclo para la
 * línea del plan, la foto y si quien mira puede editar los datos.
 *
 * No es la ficha entera: una solicitud abierta no necesita los pagos, los
 * archivos ni el historial del restaurante, y cargarlos sería una docena
 * de consultas por nada.
 *
 * Todo pasa por RLS. Si el restaurante no se puede leer, devuelve `null` y
 * la pantalla va sin marco: mejor eso que un marco a medias. Tampoco lanza:
 * que falle la foto o la bolsa no puede tumbar el detalle que se abrió.
 *
 * `canEditData` solo decide si se pinta "Editar restaurante": quien puede
 * de verdad lo decide `set_establishment_data()` (RN-EST-11).
 */
export async function loadSheetFrame(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetFrameData | null> {
  const header = await loadSheetHeader(supabase, establishmentId).catch(() => null);
  if (header === null) return null;

  const [{ data: allowance }, photoUrl, { data: establishment }] = await Promise.all([
    supabase.rpc("establishment_cycle_allowance", { p_establishment_id: establishmentId }),
    loadEstablishmentPhoto(supabase, supabase.storage, establishmentId).catch(() => null),
    supabase.from("establishments").select("space_id").eq("id", establishmentId).maybeSingle(),
  ]);

  const { data: canEdit } =
    establishment === null
      ? { data: false }
      : await supabase.rpc("has_capability", {
          p_space_id: establishment.space_id,
          p_capability: "manage_clients",
        });

  return {
    header,
    bags: (allowance ?? []).map((line) => ({
      category: line.category as CycleBag["category"],
      included: line.included,
      remaining: line.remaining,
    })),
    photoUrl,
    canEditData: canEdit === true,
  };
}
