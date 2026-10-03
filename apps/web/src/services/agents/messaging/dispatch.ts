/**
 * `src/services/agents/messaging/dispatch.ts` · el motor de avisos con la configuración del entorno (Fase F).
 *
 * Es lo que llaman las acciones de la agenda (`after()`, tras guardar), la tarea de cada minuto y los botones de
 * Pruebas. Construye los proveedores (`selectProviders`), los límites de envío (`dispatchPolicy`) y el cliente de
 * servicio, y llama al dispatcher. **Nunca lanza**: un aviso que no sale es lo secundario, y lo que importa —guardar
 * la reserva— ya está hecho; si algo falla, el aviso vuelve a la cola y la tarea de cada minuto lo recoge.
 */
import { createAdminClient } from "@/lib/supabase/admin";

import {
  checkSmsPrices,
  dispatchAllDue,
  dispatchEstablishmentNotices,
  type DispatchAllSummary,
  type DispatchDeps,
  type DispatchSummary,
} from "./dispatcher";
import { createNoticeGateway, type NoticeGateway, type RpcClient } from "./gateway";
import { dispatchPolicy, fakeMessagingBlocked, selectProviders, type MessagingEnv } from "./providers";

export function buildDispatchDeps(env: MessagingEnv = process.env as MessagingEnv, gateway?: NoticeGateway): DispatchDeps {
  const providers = selectProviders(env);
  return {
    gateway: gateway ?? createNoticeGateway(createAdminClient() as unknown as RpcClient),
    providers,
    policy: dispatchPolicy(env, providers.mode),
    siteUrl: env.NEXT_PUBLIC_SITE_URL?.trim() ?? "",
    privacyUrl: env.LEGAL_PRIVACY_URL?.trim() || undefined,
  };
}

let warnedFakeInProduction = false;

function warnIfFakeBlocked(env: MessagingEnv): void {
  if (!warnedFakeInProduction && fakeMessagingBlocked(env)) {
    warnedFakeInProduction = true;
    console.error("[avisos] ENABLE_FAKE_MESSAGING=true se ignora en producción: los avisos salen por los proveedores reales");
  }
}

/** Envía ya los avisos de un restaurante (el primer intento tras guardar). Mejor esfuerzo: nunca lanza. */
export async function dispatchDinerNotices(establishmentId: string, env: MessagingEnv = process.env as MessagingEnv): Promise<DispatchSummary | null> {
  try {
    warnIfFakeBlocked(env);
    return await dispatchEstablishmentNotices(buildDispatchDeps(env), establishmentId);
  } catch (error) {
    console.error(`[avisos] no se pudieron enviar los avisos de ${establishmentId}: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
    return null;
  }
}

/** La tarea de cada minuto. Lanza si la base de datos no contesta, para que la ruta responda 500. */
export async function dispatchEveryDue(env: MessagingEnv = process.env as MessagingEnv): Promise<DispatchAllSummary> {
  warnIfFakeBlocked(env);
  return dispatchAllDue(buildDispatchDeps(env));
}

/** Solo los precios reales de los SMS (para pruebas). */
export async function checkPricesNow(env: MessagingEnv = process.env as MessagingEnv) {
  return checkSmsPrices(buildDispatchDeps(env));
}
