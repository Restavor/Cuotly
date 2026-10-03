import { NextResponse } from "next/server";

import { dispatchEveryDue } from "@/services/agents/messaging/dispatch";

import { autorizacionDeTarea } from "../cron-auth";

/**
 * La tarea de cada minuto de los avisos a los comensales (PRD de agents §6.11 y §10.6, AVI-01): recorre los
 * restaurantes con avisos por enviar —los reintentos de 1, 5 y 15 minutos y los que se quedaron sin enviar porque el
 * servidor se cayó— y los envía; después consulta el precio real de los SMS que aún no lo tienen (AVI-06).
 *
 * El primer intento de cada aviso sale al guardar la reserva (`after()` de las acciones de la agenda); esta tarea es
 * la red de seguridad. La lanza `pg_cron` + `pg_net` con `supabase/operaciones/agents-cron.sql`. En local y en los
 * tests se llama a esta ruta directamente. Es idempotente: cada aviso se reclama con un arriendo de cinco minutos y se
 * cobra una sola vez, así que repetirla (o dos a la vez) no envía ni cobra dos veces.
 *
 * La puerta es la misma que la de `/api/cola`: `Authorization: Bearer <CRON_SECRET>` (o `QUEUE_RUNNER_SECRET`), y sin
 * ninguno configurado la ruta NO se queda abierta. La respuesta lleva solo cuentas, nunca datos de un comensal.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function ejecutar(request: Request) {
  const permiso = autorizacionDeTarea(request);
  if (permiso === "sin-configurar") {
    return NextResponse.json({ error: "Las tareas de Reservas no están configuradas en este entorno" }, { status: 503 });
  }
  if (permiso === "rechazado") return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    return NextResponse.json(await dispatchEveryDue());
  } catch (error) {
    console.error(`[avisos] la tarea de avisos falló: ${error instanceof Error ? error.message.slice(0, 120) : "error"}`);
    return NextResponse.json({ error: "No se pudieron procesar los avisos" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return ejecutar(request);
}

export async function POST(request: Request) {
  return ejecutar(request);
}
