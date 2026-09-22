import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { isSupabaseAuthCookie, sessionExpired } from "@/core/session-expiry";

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

  const cookiesDeSesion = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter(isSupabaseAuthCookie);

  // Refresca la sesión si hace falta y mantiene la cookie al día.
  const {
    data: { user },
    error: errorDeSesion,
  } = await supabase.auth.getUser();

  // A08 · el navegador trae una sesión que el servidor ya no acepta: se
  // dice que ha caducado, y se borra, para que la próxima vez sea la
  // pantalla de entrar de siempre.
  if (
    sessionExpired({
      method: request.method,
      pathname: request.nextUrl.pathname,
      hadAuthCookie: cookiesDeSesion.length > 0,
      hasUser: user !== null,
      errorStatus: errorDeSesion?.status,
    })
  ) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/sesion-caducada";
    destino.search = "";
    const aviso = NextResponse.redirect(destino);
    for (const nombre of cookiesDeSesion) aviso.cookies.delete(nombre);
    return aviso;
  }

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
// `/estado` es pública (§157): se lee sin sesión y también a medio segundo paso.
const SIN_SEGUNDO_PASO = ["/cuenta/verificar", "/login", "/signup", "/auth/", "/api/", "/estado"];

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
