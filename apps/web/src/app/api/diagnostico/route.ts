/**
 * Qué variables de entorno VE el servidor que está atendiendo, en
 * desarrollo y solo en desarrollo.
 *
 * Existe porque la pregunta "¿está puesta la clave?" y la pregunta "¿la ve
 * el proceso que atiende la petición?" son distintas, y confundirlas costó
 * tres ejecuciones de los tests de CA-19: la clave estaba en
 * `apps/web/.env.local`, pero Next.js lee ese archivo AL ARRANCAR, así que
 * un servidor levantado antes de añadirla sigue sin verla y la
 * clasificación se saltaba en silencio. Desde el navegador o desde un test
 * no había forma de saberlo.
 *
 * Devuelve **booleanos, nunca valores**: decir si algo está configurado no
 * es lo mismo que enseñarlo. Y fuera de desarrollo responde 404, así que
 * en producción esta ruta no existe.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // En desarrollo, siempre. Fuera de desarrollo solo si alguien la
  // enciende a propósito con `E2E_DIAGNOSTICO=1`: los tests con datos
  // corren contra una compilación de producción (`next build && next
  // start`), donde `NODE_ENV` es "production" y esta ruta, sin la
  // variable, no existiría. La variable no está puesta en ningún
  // despliegue real, y aun encendida esto solo dice SI hay valor, nunca
  // cuál.
  const permitida =
    process.env.NODE_ENV !== "production" || process.env.E2E_DIAGNOSTICO === "1";

  if (!permitida) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json({
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropicApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    queueRunnerSecret: Boolean(process.env.QUEUE_RUNNER_SECRET),
    resendApiKey: Boolean(process.env.RESEND_API_KEY),

    // Un booleano en `false` no distingue tres averías muy distintas: que
    // la variable no esté, que esté con otro nombre (un dedazo, un
    // NEXT_PUBLIC_ de más) o que esté con el valor vacío porque el valor
    // se quedó en la línea siguiente. Los NOMBRES de las variables no son
    // secretos y su longitud tampoco; el valor no sale de aquí.
    detectadas: Object.keys(process.env)
      .filter((nombre) => /SUPABASE|ANTHROPIC|RESEND|QUEUE|CUOTLY/i.test(nombre))
      .sort()
      .map((nombre) => `${nombre} (${(process.env[nombre] ?? "").length} caracteres)`),
  });
}
