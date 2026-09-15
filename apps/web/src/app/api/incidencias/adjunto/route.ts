import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createPrivateDownloadLink } from "@/services/file-storage";

/**
 * RN-SOP-08, RN-ARC-08 · la descarga de un adjunto de una incidencia: un
 * enlace privado y temporal al bucket, como cualquier archivo.
 *
 * **Quién puede** lo decide la RLS de `incident_attachments` con la sesión
 * de quien pide: si la fila no se ve, aquí no hay adjunto, y se responde
 * 404 y no 403 por el mismo motivo que la descarga de archivos —un 403
 * confirma que existe—. La clave de servicio solo firma el enlace de una
 * ruta que esa sesión ya podía leer.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (id === null || !UUID.test(id)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 404 });

  const { data: fila } = await supabase
    .from("incident_attachments")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!fila) return new NextResponse(null, { status: 404 });

  const enlace = await createPrivateDownloadLink(createAdminClient().storage, fila.storage_path);
  if (!enlace.ok) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(enlace.value, { status: 302, headers: { "cache-control": "no-store, private" } });
}
