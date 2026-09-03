import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createPrivateDownloadLink } from "@/services/file-storage";

/**
 * RN-ARC-08 · la descarga de un archivo, privada y temporal.
 *
 * El bucket no es público, así que no existe ninguna URL permanente de
 * ningún archivo: esta ruta comprueba el permiso con la sesión de quien
 * pide —`can_read_file()`, que es donde viven RN-ARC-04, RN-ARC-05 y
 * RN-FIN-07— y solo entonces firma un enlace de unos minutos y redirige.
 *
 * A quien no puede verlo se le responde **404 y no 403**: un 403 confirma
 * que el archivo existe, y para un trabajador que husmea la facturación
 * de un restaurante (RN-ARC-05) eso ya es información. Un archivo que no
 * puedes ver y uno que no existe se responden igual.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 404 });

  const { data: puedeLeer, error: permisoError } = await supabase.rpc("can_read_file", {
    p_file_id: id,
  });

  if (permisoError || !puedeLeer) return new NextResponse(null, { status: 404 });

  // La versión vigente es la de número mayor: RN-ARC-03 dice que las
  // anteriores permanecen, así que hay varias y la última manda. Las
  // columnas se enumeran porque `file_versions` tiene privilegios de
  // columna y `select *` daría 403 (CLAUDE.md).
  const { data: version } = await supabase
    .from("file_versions")
    .select("storage_path, file_name, version_number")
    .eq("file_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!version) return new NextResponse(null, { status: 404 });

  const enlace = await createPrivateDownloadLink(
    createAdminClient().storage,
    version.storage_path,
  );

  if (!enlace.ok) return new NextResponse(null, { status: 502 });

  // 302 y no 301: el enlace firmado caduca, así que no debe quedarse en
  // ninguna caché como destino permanente de esta ruta.
  return NextResponse.redirect(enlace.value, { status: 302 });
}
