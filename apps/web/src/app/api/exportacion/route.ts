import { NextResponse } from "next/server";

import { EXPORT_SCOPES, type ExportScope } from "@/core/space-lifecycle";
import { createClient } from "@/lib/supabase/server";

/**
 * §141 · RN-CIC-10/11 · la descarga de una exportación.
 *
 * Por qué es una ruta y no el valor de un formulario: una exportación es
 * el `select` más grande del producto y puede pesar megabytes. Devolverla
 * a la pantalla para armar un enlace `data:` la mete entera en la memoria
 * del navegador y en el HTML, y los navegadores cortan esas URL por
 * tamaño. Aquí se sirve como lo que es: un archivo.
 *
 * **Lo que esta ruta NO hace es autorizar.** `export_space()` corre con la
 * sesión de quien pide —`security invoker`— así que la RLS elige las
 * filas y el privilegio de columna elige las columnas, y además la
 * función comprueba `can_export_scope()` antes de nada. Si dice que no,
 * aquí se responde 404 y no 403, por el mismo motivo que la descarga de
 * archivos: un 403 confirma que ese espacio o ese grupo existen.
 */
export const dynamic = "force-dynamic";

function esAlcance(valor: string | null): valor is ExportScope {
  return valor !== null && (EXPORT_SCOPES as readonly string[]).includes(valor);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const spaceId = params.get("espacio");
  const scope = params.get("alcance");
  const groupId = params.get("grupo");
  const establishmentId = params.get("establecimiento");

  // Lo que no se entiende no se contesta con otra cosa: 404.
  if (spaceId === null || !UUID.test(spaceId) || !esAlcance(scope)) {
    return new NextResponse(null, { status: 404 });
  }
  if (groupId !== null && !UUID.test(groupId)) return new NextResponse(null, { status: 404 });
  if (establishmentId !== null && !UUID.test(establishmentId)) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 404 });

  const { data, error } = await supabase.rpc("export_space", {
    p_space_id: spaceId,
    p_scope: scope,
    p_group_id: groupId ?? undefined,
    p_establishment_id: establishmentId ?? undefined,
  });
  if (error || data === null) return new NextResponse(null, { status: 404 });

  const sello = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="cuotly-${scope}-${sello}.json"`,
      // Una exportación lleva dentro todo lo que alguien puede ver: no se
      // guarda en ninguna caché intermedia.
      "cache-control": "no-store, private",
    },
  });
}
