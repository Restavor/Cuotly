/**
 * Punto de entrada del proceso de la cola. Lo llama un cron externo (o el
 * equipo, a mano) — no una pantalla.
 *
 * Por qué existe como ruta y no como script suelto: el runner necesita la
 * `service_role`, y la única forma de que esa clave viva en un solo sitio
 * de confianza es el servidor de la aplicación. La ruta se protege con un
 * secreto compartido (`QUEUE_RUNNER_SECRET`): sin él responde 401 y no
 * toca nada. Si el secreto no está configurado, responde 503 en vez de
 * quedarse abierta — CLAUDE.md: toda operación se valida en el servidor, y
 * "no hay secreto" nunca puede significar "pasa cualquiera".
 */
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createMailComposer,
  createResendTransport,
  createSupabaseQueueGateway,
} from "@/services/queue-gateway";
import { drainEmailQueue, runScheduledJobs, runSlaSweep } from "@/services/queue-runner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.QUEUE_RUNNER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "La cola no está configurada en este entorno" },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
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
