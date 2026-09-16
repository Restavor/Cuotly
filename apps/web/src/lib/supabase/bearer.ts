import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * La sesión de la app móvil no viaja en cookies: viaja en la cabecera
 * `Authorization: Bearer <token de acceso>` de cada llamada a `/api/movil/…`
 * (RN-MOV-01: la misma API que la web, con la sesión de quien mira).
 *
 * El cliente que sale de aquí lleva la clave pública y el token de la
 * persona, así que RLS y las funciones del servidor ven exactamente la
 * misma identidad que verían desde el teléfono. **No salta nada.**
 */
export function bearerToken(request: Request): string | null {
  const cabecera = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!cabecera) return null;
  const partes = cabecera.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0].toLowerCase() !== "bearer") return null;
  // Un JWT son tres partes en base64url separadas por puntos. Lo que no
  // tenga esa forma no se manda a Supabase: se responde 401 sin más.
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(partes[1]) ? partes[1] : null;
}

export function createBearerClient(token: string) {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    },
  );
}
