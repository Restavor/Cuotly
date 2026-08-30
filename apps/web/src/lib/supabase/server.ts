import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase para usar en el servidor (Server Components, Server
 * Actions, Route Handlers). En Next.js 16, `cookies()` es asíncrono, así que
 * esta función también lo es: hay que hacer `await createClient()`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` puede fallar si se llama desde un Server Component
            // (no puede escribir cookies). Si hay un `proxy.ts` refrescando
            // la sesión, esto no es un problema real: solo importa poder
            // leer las cookies aquí, no escribirlas.
          }
        },
      },
    },
  );
}
