import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { isLifecycleSweepHour } from "@/core/reservations/lifecycle";
import { CUOTLY_TIMEZONE } from "@/i18n/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverNoticesNow, establishmentOfKey } from "@/services/agents/lifecycle-delivery";

/**
 * El barrido diario del ciclo de vida de Reservas (PRD de agents §6.12 y §10.6, RN-RES-11):
 * `active → past_due → paused`, `ending → closed`, el recordatorio de descarga y la
 * anonimización a los 30 días del cierre, con sus avisos. Lo decide
 * `reservations_lifecycle_sweep()` en la base de datos (que es la que conoce los cobros, los
 * plazos y no repite avisos); esto solo la lanza y manda al momento lo que lo pide: los push,
 * y los dos correos importantes (decisión 137).
 *
 * La lanza `pg_cron` + `pg_net` cada hora (`supabase/operaciones/agents-cron.sql`; `pg_cron`
 * va en UTC) y solo a las 08:00 de Madrid hace el barrido; con `?force=1` lo hace a cualquier
 * hora (para lanzarla a mano). Es idempotente: repetirla no avisa dos veces.
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

interface SweepResult {
  readonly changes: readonly { establishment_id: string; from: string; to: string }[];
  readonly keys: readonly string[];
  readonly email_now_keys: readonly string[];
  readonly errors: readonly { establishment_id: string; error: string }[];
}

async function ejecutar(request: Request) {
  const permiso = autorizacion(request);
  if (permiso === "sin-configurar") {
    return NextResponse.json({ error: "Las tareas de Reservas no están configuradas en este entorno" }, { status: 503 });
  }
  if (permiso === "rechazado") return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const forzada = new URL(request.url).searchParams.get("force") === "1";
  if (!forzada && !isLifecycleSweepHour(new Date(), CUOTLY_TIMEZONE)) {
    return NextResponse.json({ ran: false, reason: "No es la hora del barrido (08:00 de Madrid)" });
  }

  const { data, error } = await createAdminClient().rpc("reservations_lifecycle_sweep");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as unknown as SweepResult;
  await deliverNoticesNow({
    pushKeys: result.keys,
    emailKeys: result.email_now_keys,
    establishmentIds: result.email_now_keys.map(establishmentOfKey).filter((id): id is string => id !== null),
  });

  return NextResponse.json({
    ran: true,
    changes: result.changes.length,
    notices: result.keys.length,
    errors: result.errors,
  });
}

export async function GET(request: Request) {
  return ejecutar(request);
}

export async function POST(request: Request) {
  return ejecutar(request);
}
