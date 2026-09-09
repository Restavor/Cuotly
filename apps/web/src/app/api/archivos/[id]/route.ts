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
 *
 * `?version=` pide una versión concreta. Sin él se sirve la vigente, que
 * es lo que quiere quien pulsa "Descargar" en una lista de archivos. Con
 * él se sirve **esa**, que es lo que quiere quien está mirando el panel de
 * versiones de §15.2: hasta ahora las tres filas de un archivo
 * —original, retocada y publicada— enlazaban las tres a la última, así
 * que pedir la original bajaba la publicada. El permiso es el mismo en
 * los dos casos: `can_read_file()` es del archivo, no de la versión.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Una versión que no es un número entero positivo no es "la vigente":
  // es una petición que no se entiende, y se responde 404 en vez de
  // servir otra cosa que quien pide no ha pedido.
  const pedida = new URL(request.url).searchParams.get("version");
  let version: number | null = null;
  if (pedida !== null) {
    if (!/^[1-9][0-9]*$/.test(pedida)) return new NextResponse(null, { status: 404 });
    version = Number(pedida);
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 404 });

  const { data: puedeLeer, error: permisoError } = await supabase.rpc("can_read_file", {
    p_file_id: id,
  });

  if (permisoError || !puedeLeer) return new NextResponse(null, { status: 404 });

  // Sin `?version=`, la vigente es la de número mayor: RN-ARC-03 dice que
  // las anteriores permanecen, así que hay varias y la última manda. Las
  // columnas se enumeran porque `file_versions` tiene privilegios de
  // columna y `select *` daría 403 (CLAUDE.md).
  const consulta = supabase
    .from("file_versions")
    .select("storage_path, file_name, version_number")
    .eq("file_id", id);

  const { data: fila } =
    version === null
      ? await consulta.order("version_number", { ascending: false }).limit(1).maybeSingle()
      : await consulta.eq("version_number", version).maybeSingle();

  if (!fila) return new NextResponse(null, { status: 404 });

  const enlace = await createPrivateDownloadLink(createAdminClient().storage, fila.storage_path);

  if (!enlace.ok) return new NextResponse(null, { status: 502 });

  // 302 y no 301: el enlace firmado caduca, así que no debe quedarse en
  // ninguna caché como destino permanente de esta ruta.
  return NextResponse.redirect(enlace.value, { status: 302 });
}
