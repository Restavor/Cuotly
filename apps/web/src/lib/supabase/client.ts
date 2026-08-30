import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase para usar en componentes que corren en el navegador
 * ("use client"). Lee la URL y la clave pública del proyecto desde las
 * variables de entorno NEXT_PUBLIC_* (ver .env.example en la raíz del repo).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
