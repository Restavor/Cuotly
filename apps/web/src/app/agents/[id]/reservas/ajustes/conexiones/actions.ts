"use server";

import { revalidatePath } from "next/cache";

import { restaurantBase } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadDevice } from "@/services/agents/device";
import { saveNoticeChannels } from "@/services/agents/notice-channels-gateway";

import type { NoticeChannelsFeedback } from "./action-state";

/**
 * Guardar los canales de «Avisos a tus clientes» (Fase F; decisión 152). Ninguna comprobación de permiso vive aquí:
 * `set_notice_channels()` decide quién puede (Propietario, Encargado, Restavor y el soporte dentro de su sesión) y lo
 * deja en la auditoría. Es de una **cuenta**, nunca de la tablet del local (decisión 152): se comprueba aquí aunque en
 * ese navegador quede una sesión personal.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setNoticeChannelsAction(input: {
  readonly establishmentId: string;
  readonly email: boolean;
  readonly whatsapp: boolean;
  readonly sms: boolean;
}): Promise<NoticeChannelsFeedback> {
  const t = es.agents.notices;
  if (!UUID.test(input.establishmentId)) return { ok: false, message: t.failed };
  if ((await loadDevice()).kind === "active") return { ok: false, message: t.deviceNote };
  try {
    await saveNoticeChannels(await createClient(), input.establishmentId, { email: input.email === true, whatsapp: input.whatsapp === true, sms: input.sms === true });
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    return { ok: false, message: /^No tienes permiso/i.test(text) ? t.readOnlyNote : t.failed };
  }
  revalidatePath(restaurantBase(input.establishmentId), "layout");
  return { ok: true };
}
