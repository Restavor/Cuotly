/**
 * Punto de entrada del proceso de la cola. Lo llama un cron externo (o el
 * equipo, a mano) — no una pantalla.
 *
 * Por qué existe como ruta y no como script suelto: el runner necesita la
 * `service_role`, y la única forma de que esa clave viva en un solo sitio
 * de confianza es el servidor de la aplicación. La ruta se protege con un
 * secreto compartido: sin él responde 503 y no toca nada, en vez de
 * quedarse abierta — CLAUDE.md: toda operación se valida en el servidor, y
 * "no hay secreto" nunca puede significar "pasa cualquiera".
 *
 * **GET y POST hacen lo mismo, y no es un descuido.** El cron de Vercel
 * invoca la ruta con GET, así que sin GET no habría cron; POST se queda
 * porque es lo que se llama a mano y lo que espera cualquier otro
 * programador de tareas. Que un GET tenga efectos no es ortodoxo, pero la
 * alternativa —un GET que no hace nada y un cron que no dispara— es peor,
 * y la ruta no es navegable: sin la cabecera correcta responde 401.
 */
import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createMailComposer,
  createResendTransport,
  createSupabaseQueueGateway,
} from "@/services/queue-gateway";
import { drainEmailQueue, runScheduledJobs, runSlaSweep } from "@/services/queue-runner";

export const dynamic = "force-dynamic";

/**
 * Una tanda puede recorrer varios espacios y enviar hasta veinte correos,
 * así que no cabe en los diez segundos de serie. Ojo: el tope real lo pone
 * el plan de Vercel, y si este número lo supera, manda el plan.
 */
export const maxDuration = 60;

/**
 * Comparación en tiempo constante. Un `===` sobre un secreto se puede
 * medir: dice cuántos caracteres acertaste por lo que tarda en fallar.
 */
function igualdadSegura(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Dos nombres para el mismo permiso, y el motivo es de Vercel: cuando hay
 * una variable `CRON_SECRET`, su cron manda `Authorization: Bearer
 * <CRON_SECRET>` él solo, sin que se pueda configurar otra cabecera. Si
 * solo se aceptara `QUEUE_RUNNER_SECRET` habría que copiar el mismo valor
 * en dos variables y mantenerlas iguales para siempre, que es una avería
 * esperando fecha.
 *
 * Se acepta cualquiera de las dos, y basta con poner UNA.
 */
function autorizacion(request: Request): "ok" | "sin-configurar" | "rechazado" {
  const secretos = [process.env.QUEUE_RUNNER_SECRET, process.env.CRON_SECRET].filter(
    (valor): valor is string => Boolean(valor),
  );

  if (secretos.length === 0) return "sin-configurar";

  const cabecera = request.headers.get("authorization") ?? "";
  return secretos.some((secreto) => igualdadSegura(cabecera, `Bearer ${secreto}`))
    ? "ok"
    : "rechazado";
}

async function ejecutarTanda(request: Request) {
  const permiso = autorizacion(request);

  if (permiso === "sin-configurar") {
    return NextResponse.json(
      { error: "La cola no está configurada en este entorno" },
      { status: 503 },
    );
  }

  if (permiso === "rechazado") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const client = createAdminClient();
  const gateway = createSupabaseQueueGateway(client);

  const scheduled = await runScheduledJobs(gateway);

  // Los umbrales de T2 y T3 se calculan espacio por espacio, porque el
  // reloj laboral es del espacio (RN-CLK-06).
  const { data: spaces, error } = await client.from("spaces").select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let emitted = 0;
  for (const space of spaces ?? []) {
    const result = await runSlaSweep(gateway, space.id);
    emitted += result.emitted;
  }

  const mail = await drainEmailQueue(
    gateway,
    createResendTransport(
      process.env.RESEND_API_KEY,
      process.env.RESEND_FROM ?? "Cuotly <avisos@cuotly.com>",
    ),
    createMailComposer(process.env.NEXT_PUBLIC_SITE_URL ?? ""),
  );

  return NextResponse.json({ scheduled, slaNotifications: emitted, mail });
}

export async function POST(request: Request) {
  return ejecutarTanda(request);
}

export async function GET(request: Request) {
  return ejecutarTanda(request);
}
