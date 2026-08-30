import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Google redirige aquí después de que la persona inicie sesión en su
 * cuenta de Google. Intercambiamos el código temporal por una sesión real
 * de Cuotly y la llevamos a Inicio.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=google`);
}
