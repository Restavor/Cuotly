import { timingSafeEqual } from "node:crypto";

/**
 * La puerta de las tareas de `/api/agents/cron/*` (PRD de agents §10.6): `Authorization: Bearer <CRON_SECRET>` (o
 * `QUEUE_RUNNER_SECRET`, el de `/api/cola`). Sin ninguno configurado la ruta NO se queda abierta (503). Es la misma
 * regla que las rutas `pendientes` y `ciclo`.
 */
function igualdadSegura(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function autorizacionDeTarea(request: Request): "ok" | "sin-configurar" | "rechazado" {
  const secretos = [process.env.QUEUE_RUNNER_SECRET, process.env.CRON_SECRET].filter((valor): valor is string => Boolean(valor));
  if (secretos.length === 0) return "sin-configurar";
  const cabecera = request.headers.get("authorization") ?? "";
  return secretos.some((secreto) => igualdadSegura(cabecera, `Bearer ${secreto}`)) ? "ok" : "rechazado";
}
