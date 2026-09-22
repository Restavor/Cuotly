import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { readAccessRequestValues, submitAccessRequest } from "@/services/access-request";
import { checkVies } from "@/services/vies";

/**
 * RN-ACC-02 y decisión 68 · la solicitud de acceso desde la app móvil.
 *
 * El teléfono llamaba a `submit_access_request()` por RPC con la clave
 * anónima. Desde la migración 126 esa función solo la llama el servidor
 * (`service_role`), porque el documento se comprueba aquí —cálculo de
 * control y VIES— y una función abierta dejaría saltárselo. Así que el
 * teléfono manda el formulario a esta ruta, que **pasa por el mismo
 * código** que el formulario web (`src/services/access-request.ts`).
 *
 * Sin sesión, como el formulario web: quien pide acceso no tiene cuenta.
 * Cuerpo: `{ contact_name, business_name, phone, email, tax_id,
 * tax_country, comments? }`. Respuesta: `{ ok: true, done: true }`, o
 * `{ ok: false, problems, error }` con el motivo en español.
 *
 * RN-ACC-12 · la respuesta buena es siempre la misma, tenga ese correo
 * cuenta o no.
 */
export const dynamic = "force-dynamic";

/*
 * CORS · la app móvil exportada para el navegador (`cuotly-movil`) vive en
 * otra dirección que la web, y el navegador no deja mandar un JSON a otra
 * dirección si esta no lo permite: antes de la petición pregunta con un
 * `OPTIONS`. La app nativa no pregunta nada.
 *
 * Se permite cualquier origen a propósito, y es seguro aquí: la ruta es
 * pública (quien pide acceso no tiene cuenta), no lee cookies ni sesión,
 * y lo único que hace es lo mismo que el formulario público de la web.
 * No se copia este `*` a una ruta que dependa de la sesión del navegador.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, problems: {}, error: "Petición mal formada." },
      { status: 400, headers: CORS },
    );
  }

  const values = readAccessRequestValues((clave) => cuerpo[clave]);
  const resultado = await submitAccessRequest(values, {
    submit: async (args) => {
      const { error } = await createAdminClient().rpc("submit_access_request", args);
      return { error };
    },
    vies: (pais, numero) => checkVies(pais, numero),
  });

  if (resultado.done) return NextResponse.json({ ok: true, done: true }, { headers: CORS });
  return NextResponse.json(
    { ok: false, problems: resultado.problems, error: resultado.error },
    { headers: CORS },
  );
}
