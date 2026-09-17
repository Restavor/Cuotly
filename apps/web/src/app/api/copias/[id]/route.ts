import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * RN-BCK-05 y RN-BCK-06 · descargar una copia de seguridad.
 *
 * Misma forma que `/api/archivos/[id]`: el enlace NO apunta al dato, apunta
 * a una ruta que comprueba el permiso antes de servirlo. La diferencia con
 * un archivo es que una copia no vive en Storage sino en su tabla, así que
 * aquí no hay URL firmada que devolver: se sirve el documento.
 *
 * Quién puede lo decide `download_establishment_backup()`, que exige
 * `manage_clients` (RN-BCK-07) y deja el apunte de quién se la llevó
 * (RN-BCK-06). Esta ruta no comprueba nada por su cuenta: si lo hiciera,
 * habría dos reglas que un día discreparían.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("download_establishment_backup", {
    p_backup_id: id,
  });

  if (error || data === null) {
    // El mismo cuerpo para "no existe" y "no es tuya": distinguirlos diría
    // si existe una copia de un restaurante que no puedes ver.
    return NextResponse.json({ error: "no_disponible" }, { status: 404 });
  }

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="copia-${id}.json"`,
      // Una copia lleva dentro todo lo del restaurante: no se guarda en
      // ninguna caché intermedia.
      "cache-control": "private, no-store",
    },
  });
}
