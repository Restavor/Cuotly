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
import { createCredentialVault, vaultIsConfigured } from "@/services/credential-vault";
import { googleOAuthIsConfigured, refreshAccessToken, revokeToken } from "@/services/google-oauth";
import { createSupabaseIntegrationGateway } from "@/services/integration-gateway";
import { runIntegrationSyncs, runPendingRevocations, type SyncDeps } from "@/services/integration-sync";
import { runOpportunityDetection } from "@/services/opportunity-detection";
import { createSupabaseOpportunityGateway } from "@/services/opportunity-gateway";
import { adapterFor } from "@/services/integrations";
import { runReportQueue } from "@/services/report-generation";
import { createSupabaseReportGateway } from "@/services/report-gateway";
import {
  createExpoPushTransport,
  createMailComposer,
  createPushComposer,
  createResendTransport,
  createSupabaseQueueGateway,
} from "@/services/queue-gateway";
import { drainDeliveryQueue, runScheduledJobs, runSlaSweep } from "@/services/queue-runner";

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

  /*
    Fase 3 · las integraciones (RN-INT-09): las comprobaciones pedidas y
    las sincronizaciones vencidas que `claim_integration_runs()` reparta,
    y la revocación remota pendiente (RN-INT-06). Van ANTES del correo
    porque un fallo de sincronización encola avisos que esta misma tanda
    puede enviar. Sin bóveda configurada no se reclama nada y la
    respuesta lo dice (`skipped`).
  */
  const integraciones = await ejecutarIntegraciones(client);

  /*
    Fase 3 · Hito 15 · las nueve reglas de §96 sobre lo que la
    sincronización de arriba acaba de traer (RN-OPP-02). Va DESPUÉS de
    ella a propósito: aplicar las reglas antes sería mirar los datos de
    ayer teniendo los de hoy a un paso.
  */
  const oportunidades = await runOpportunityDetection({
    gateway: createSupabaseOpportunityGateway(client),
    now: () => new Date(),
  });

  /*
    Fase 3 · Hito 16 · los informes programados (§95, RN-REP-10/11): el
    aviso de las 24 h y el envío de los que vencieron. Va DESPUÉS de las
    oportunidades a propósito: §95 no deja salir un informe con
    oportunidades pendientes, y las de esta misma tanda cuentan. Y ANTES
    del correo, porque el envío encola avisos que esta tanda puede sacar.
  */
  const informes = await runReportQueue({
    gateway: createSupabaseReportGateway(client),
    now: () => new Date(),
  });

  // Correo y push salen de la misma cola, cada uno por su transporte
  // (RN-NOT-05, RN-MOV-04). El de push no necesita clave: el servicio de
  // Expo es público, y el token de acceso solo hace falta si el proyecto
  // activa la seguridad de push.
  const mail = await drainDeliveryQueue(gateway, {
    mail: createResendTransport(
      process.env.RESEND_API_KEY,
      process.env.RESEND_FROM ?? "Cuotly <avisos@cuotly.com>",
    ),
    mailComposer: createMailComposer(process.env.NEXT_PUBLIC_SITE_URL ?? ""),
    push: createExpoPushTransport(process.env.EXPO_PUSH_ACCESS_TOKEN),
    pushComposer: createPushComposer(),
  });

  return NextResponse.json({
    scheduled,
    slaNotifications: emitted,
    integrations: integraciones,
    opportunities: oportunidades,
    reports: informes,
    mail,
  });
}

async function ejecutarIntegraciones(client: ReturnType<typeof createAdminClient>) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const oauth: SyncDeps["oauth"] =
    googleOAuthIsConfigured() && clientId && clientSecret
      ? {
          refresh: (refreshToken) => refreshAccessToken({ clientId, clientSecret }, refreshToken),
          revoke: (token) => revokeToken(token),
        }
      : null;

  const deps: SyncDeps = {
    gateway: createSupabaseIntegrationGateway(client),
    vault: vaultIsConfigured() ? createCredentialVault() : null,
    adapterFor,
    oauth,
    fetchImpl: fetch,
    now: () => new Date(),
  };

  const sync = await runIntegrationSyncs(deps);
  const revocations = await runPendingRevocations(deps);
  return { sync, revocations };
}

export async function POST(request: Request) {
  return ejecutarTanda(request);
}

export async function GET(request: Request) {
  return ejecutarTanda(request);
}
