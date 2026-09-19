"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  avatarPathFor,
  checkAvatarFile,
  uploadAvatar,
} from "@/services/avatar-storage";

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

/**
 * RN-GLO-09 · la persona cambia su foto.
 *
 * Tres cosas que conviene no deshacer:
 *
 *   1. **La ruta la compone el servidor**, con el uuid de la sesión. No
 *      llega del formulario. Aunque llegara, `set_my_avatar()` rechaza una
 *      que no empiece por el uuid de quien llama: son dos cerrojos y el de
 *      abajo es el que manda (CLAUDE.md — el cliente nunca es la
 *      autoridad).
 *   2. **La subida va por el cliente de servicio.** No es un atajo:
 *      `storage.objects` tiene RLS y cero políticas (migración 45), así
 *      que `authenticated` no escribe ahí por diseño. Subir el archivo en
 *      la propia petición —cabe, son 2 MB— hace además que esto funcione
 *      sin JavaScript (CA-22), al revés que los archivos de 25 MB, que sí
 *      necesitan el vale firmado.
 *   3. **Primero el objeto, después la fila.** Al revés habría un instante
 *      con el perfil apuntando a algo que no existe, y la pantalla
 *      enseñaría un hueco en vez de la cara. Si la subida falla, la fila
 *      no se toca y la foto de antes sigue puesta.
 */
export async function saveAvatar(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const archivo = formData.get("avatar");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: es.globalContext.account.avatarMissing, done: false };
  }

  const comprobado = checkAvatarFile({ size: archivo.size, type: archivo.type });
  if (!comprobado.ok) {
    return {
      error:
        comprobado.error === "too_large"
          ? es.globalContext.account.avatarTooLarge
          : es.globalContext.account.avatarWrongType,
      done: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: es.globalContext.account.avatarNoSession, done: false };

  const path = avatarPathFor(user.id, archivo.type);
  const subida = await uploadAvatar(
    createAdminClient().storage,
    path,
    await archivo.arrayBuffer(),
    archivo.type,
  );

  if (!subida.ok) {
    return { error: es.globalContext.account.avatarUploadFailed, done: false };
  }

  const { error } = await supabase.rpc("set_my_avatar", { p_path: path });
  if (error) return { error: error.message, done: false };

  revalidatePath("/cuenta");
  return { error: null, done: true };
}

/**
 * RN-GLO-09 · quitarla y volver a la inicial.
 *
 * No devuelve estado y no necesita `useActionState`: **el resultado se ve**
 * —donde había una cara aparece la inicial—, y un "Foto quitada" debajo de
 * eso sobra. Por eso tampoco recibe el estado anterior.
 *
 * El objeto se queda en el bucket y no pasa nada: nadie lo apunta, el
 * bucket es privado y no hay URL pública, así que no es alcanzable. Lo que
 * tiene que ser inmediato es que la fila deje de señalarlo, y eso es lo
 * que hace `clear_my_avatar()`. Borrar el objeto es limpieza, no
 * seguridad, y hacerlo aquí metería un fallo de almacenamiento en medio de
 * una operación que no lo necesita.
 */
export async function removeAvatar(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("clear_my_avatar");
  revalidatePath("/cuenta");
}
