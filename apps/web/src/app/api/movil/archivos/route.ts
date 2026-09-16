import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { bearerToken, createBearerClient } from "@/lib/supabase/bearer";
import { prepararSubidaCon, registrarArchivoCon } from "@/services/file-upload";

/**
 * RN-MOV-07 · la subida de archivos desde la app móvil.
 *
 * El bucket `files` no tiene políticas de Storage a propósito (migración
 * 45): los bytes solo entran por una URL firmada que prepara el servidor
 * después de preguntar a `can_write_file()`. En la web ese servidor son
 * dos acciones con la sesión de las cookies; el teléfono no tiene
 * cookies, así que llama a esta ruta con su token de acceso y **pasa por
 * el mismo código** (`src/services/file-upload.ts`): la misma comprobación
 * de permiso, la misma ruta de objeto, el mismo `register_file()`.
 *
 * Dos pasos, como en la web:
 *   · `{ paso: "preparar", establishmentId, category, fileName, mimeType, sizeBytes }`
 *     → `{ ok: true, path, token }`, y el teléfono sube los bytes con
 *     `uploadToSignedUrl`.
 *   · `{ paso: "registrar", establishmentId, category, name, path, fileName, visibility? }`
 *     → `{ ok: true, fileId }`, con el objeto real ya comprobado.
 *
 * Sin sesión válida se responde 401 con su motivo. Un fallo de negocio
 * (sin permiso, tipo no admitido, objeto que no llegó) es un 200 con
 * `ok: false` y el motivo en español, que es lo que la app enseña.
 */
export const dynamic = "force-dynamic";

type Cuerpo = Record<string, unknown>;

function texto(cuerpo: Cuerpo, clave: string): string | null {
  const valor = cuerpo[clave];
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function numero(cuerpo: Cuerpo, clave: string): number | null {
  const valor = cuerpo[clave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (token === null) {
    return NextResponse.json({ ok: false, motivo: "Hace falta una sesión." }, { status: 401 });
  }

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ ok: false, motivo: "Petición mal formada." }, { status: 400 });
  }

  const supabase = createBearerClient(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, motivo: "La sesión no es válida." }, { status: 401 });
  }

  const admin = createAdminClient();
  const paso = texto(cuerpo, "paso");
  const establishmentId = texto(cuerpo, "establishmentId");
  const category = texto(cuerpo, "category");
  const fileName = texto(cuerpo, "fileName");

  if (paso === "preparar") {
    const mimeType = texto(cuerpo, "mimeType");
    const sizeBytes = numero(cuerpo, "sizeBytes");
    if (!establishmentId || !category || !fileName || !mimeType || sizeBytes === null) {
      return NextResponse.json({ ok: false, motivo: "Faltan datos de la subida." }, { status: 400 });
    }
    const resultado = await prepararSubidaCon(supabase, admin, {
      establishmentId,
      category,
      fileName,
      mimeType,
      sizeBytes,
    });
    return NextResponse.json(resultado);
  }

  if (paso === "registrar") {
    const path = texto(cuerpo, "path");
    const name = texto(cuerpo, "name") ?? fileName;
    const visibility = texto(cuerpo, "visibility") ?? undefined;
    if (!establishmentId || !category || !fileName || !path || !name) {
      return NextResponse.json({ ok: false, motivo: "Faltan datos del registro." }, { status: 400 });
    }
    const resultado = await registrarArchivoCon(supabase, admin, {
      establishmentId,
      category,
      name,
      path,
      fileName,
      visibility,
    });
    return NextResponse.json(resultado);
  }

  return NextResponse.json({ ok: false, motivo: "Paso desconocido." }, { status: 400 });
}
