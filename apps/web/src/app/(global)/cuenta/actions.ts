"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { AccountFormState } from "./form-state";

/**
 * RN-GLO-06 · las dos escrituras de Mi cuenta.
 *
 * Ninguna autoriza nada: `set_my_profile()` solo toca la fila de quien
 * llama, y `set_my_notification_preference()` comprueba RN-NOT-03 en el
 * servidor —los avisos obligatorios no se apagan tampoco desde aquí, y si
 * se pudieran apagar desde la cuenta se apagarían en todos los espacios de
 * una vez, que es justo lo contrario de lo que esa regla protege—.
 */
export async function saveProfile(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const given = String(formData.get("given_name") ?? "").trim();
  const family = String(formData.get("family_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const timezone = String(formData.get("display_timezone") ?? "").trim();

  if (given === "") {
    return { error: es.globalContext.account.nameRequired, done: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_profile", {
    p_given_name: given,
    p_family_name: family,
    p_phone: phone || undefined,
    p_display_timezone: timezone || undefined,
  });

  if (error) return { error: error.message, done: false };

  revalidatePath("/cuenta");
  return { error: null, done: true };
}

export async function saveNotificationPreference(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_notification_preference", {
    p_event_type: String(formData.get("event_type") ?? ""),
    p_in_app: formData.get("in_app") === "on",
    p_email: formData.get("email") === "on",
    p_push: formData.get("push") === "on",
  });

  if (error) return { error: error.message, done: false };

  revalidatePath("/cuenta");
  return { error: null, done: true };
}
