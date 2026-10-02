import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tarea de cada 15 minutos de Reservas (PRD de agents §6.6 y §10.6): los grupos pendientes
 * con más de 2 horas sin respuesta reciben UN aviso más, en la campana del Propietario y del
 * Encargado. Nunca caducan solos. Lo decide `reservations_remind_pending()` en la base de datos
 * (que es la que sabe de zonas, estados del servicio y de no repetir); esto solo la lanza.
 *
 * La lanza `pg_cron` + `pg_net` con `supabase/operaciones/agents-cron.sql`. En local y en los
 * tests se llama a esta ruta directamente. Es idempotente: repetirla no avisa dos veces.
 *
 * Quien pase de aquí ejecuta una función reservada a `service_role`, así que la puerta es la
 * misma que la de `/api/cola`: `Authorization: Bearer <CRON_SECRET>` (o `QUEUE_RUNNER_SECRET`),
 * y sin ninguno configurado la ruta NO se queda abierta.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function igualdadSegura(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function autorizacion(request: Request): "ok" | "sin-configurar" | "rechazado" {
  const secretos = [process.env.QUEUE_RUNNER_SECRET, process.env.CRON_SECRET].filter((valor): valor is string => Boolean(valor));
  if (secretos.length === 0) return "sin-configurar";
  const cabecera = request.headers.get("authorization") ?? "";
  return secretos.some((secreto) => igualdadSegura(cabecera, `Bearer ${secreto}`)) ? "ok" : "rechazado";
}

async function ejecutar(request: Request) {
  const permiso = autorizacion(request);
  if (permiso === "sin-configurar") {
    return NextResponse.json({ error: "Las tareas de Reservas no están configuradas en este entorno" }, { status: 503 });
  }
  if (permiso === "rechazado") return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data, error } = await createAdminClient().rpc("reservations_remind_pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminded: data ?? 0 });
}

export async function GET(request: Request) {
  return ejecutar(request);
}

export async function POST(request: Request) {
  return ejecutar(request);
}
