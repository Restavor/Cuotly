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

  // Refresca la sesión si hace falta y mantiene la cookie al día.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // §137, RN-ADM-02 · el segundo paso en cada inicio de sesión. Quien tiene
  // la 2FA activada y todavía no ha pasado el código (`aal1` con `aal2`
  // disponible) no ve ninguna pantalla hasta pasarlo. Es una comodidad, no
  // el control: las funciones de plataforma exigen `aal2` por su cuenta en
  // la base, y un usuario normal sin 2FA no cambia de sitio.
  if (user && !SIN_SEGUNDO_PASO.some((prefijo) => request.nextUrl.pathname.startsWith(prefijo))) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
      const destino = request.nextUrl.clone();
      destino.pathname = "/cuenta/verificar";
      destino.search = "";
      return NextResponse.redirect(destino);
    }
  }

  return response;
}

/** Las rutas que no piden el segundo paso: la que lo pide, y salir. */
const SIN_SEGUNDO_PASO = ["/cuenta/verificar", "/login", "/signup", "/auth/", "/api/"];

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
