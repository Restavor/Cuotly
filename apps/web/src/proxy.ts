import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Se ejecuta en el servidor antes de cada página. Su único trabajo aquí es
 * mantener la sesión de Supabase actualizada (refrescar el token cuando
 * hace falta) para que las páginas del servidor siempre vean al usuario
 * correcto. En Next.js 16 este archivo se llama "proxy.ts", no
 * "middleware.ts" (ver docs/PLAN-H1-H2.md y el aviso de node_modules/next
 * — es una versión reciente con nombres distintos a los habituales).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresca la sesión si hace falta. No usamos aquí el resultado para
  // proteger rutas todavía (eso llega con las pantallas del Hito 1); de
  // momento solo mantiene la cookie de sesión al día.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
