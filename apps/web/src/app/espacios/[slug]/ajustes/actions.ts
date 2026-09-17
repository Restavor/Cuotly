"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { SettingsState } from "./action-state";

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

/**
 * HU-36 · las acciones de Ajustes (§124, §125 y las preferencias de aviso).
 *
 * Ninguna autoriza nada. `manage_space` lo hacen cumplir `set_space_name()`
 * y `set_space_timezone()`, que además son la ÚNICA puerta: desde la
 * migración 49 `spaces` no tiene política de UPDATE, así que ni siquiera
 * un propietario puede cambiar el nombre o la zona horaria por PostgREST
 * saltándose la auditoría. Aquí solo se traduce la negativa del servidor a
 * un mensaje en pantalla.
 */
export async function saveSpaceName(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const name = String(formData.get("name") ?? "");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_space_name", {
      p_space_id: spaceId,
      p_name: name,
    });
    if (error) {
      console.error("[ajustes] set_space_name devolvió error", {
        spaceId,
        message: error.message,
      });
      return { error: error.message, done: false, unchanged: false };
    }

    revalidatePath("/espacios", "layout");
    return { error: null, done: data === true, unchanged: data !== true };
  } catch (fallo) {
    console.error("[ajustes] set_space_name lanzó", { spaceId, message: mensajeDeFallo(fallo) });
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}

/**
 * §125 · la zona horaria contractual. El motivo no es decoración: viaja a
 * la columna `reason` de la auditoría, y el servidor rechaza el cambio sin
 * él (§21.1, acciones sensibles).
 */
export async function changeSpaceTimezone(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const timezone = String(formData.get("timezone") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_space_timezone", {
      p_space_id: spaceId,
      p_timezone: timezone,
      p_reason: reason,
    });
    if (error) {
      console.error("[ajustes] set_space_timezone devolvió error", {
        spaceId,
        message: error.message,
      });
      return { error: error.message, done: false, unchanged: false };
    }

    revalidatePath("/espacios", "layout");
    return { error: null, done: data === true, unchanged: data !== true };
  } catch (fallo) {
    console.error("[ajustes] set_space_timezone lanzó", {
      spaceId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}

/**
 * RN-FIN-01b · el plazo de pago del espacio. No pide motivo, a diferencia
 * de la zona horaria: no mueve ningún plazo vivo, porque `charges.due_at`
 * se congela al emitir y las mensualidades ya emitidas conservan el suyo.
 */
export async function changeSpacePaymentTerm(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const days = Number(formData.get("paymentTermDays"));

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_space_payment_term", {
      p_space_id: spaceId,
      p_days: Number.isFinite(days) ? days : -1,
    });
    if (error) {
      console.error("[ajustes] set_space_payment_term devolvió error", {
        spaceId,
        message: error.message,
      });
      return { error: error.message, done: false, unchanged: false };
    }

    revalidatePath("/espacios", "layout");
    return { error: null, done: data === true, unchanged: data !== true };
  } catch (fallo) {
    console.error("[ajustes] set_space_payment_term lanzó", {
      spaceId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}

/**
 * Las preferencias de aviso de quien mira (§123 · Notificaciones). Son
 * suyas y de este espacio, no del espacio entero: por eso
 * `set_notification_preference()` no admite un tercero como destinatario y
 * escribe siempre sobre `auth.uid()`.
 *
 * Se llama una vez por aviso CAMBIADO, no por los veintidós: el formulario
 * trae el valor anterior de cada uno y aquí se comparan. Guardar lo mismo
 * veintidós veces no rompería nada —la función es un upsert— pero serían
 * veintidós viajes para no cambiar nada.
 *
 * RN-NOT-03 (los avisos que no se pueden desactivar) lo hace cumplir la
 * función del servidor, que rechaza el intento. El formulario los pinta
 * bloqueados por cortesía, no por seguridad.
 */
export async function saveNotificationPreferences(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const eventTypes = formData.getAll("eventType").map(String);

  try {
    const supabase = await createClient();

    for (const eventType of eventTypes) {
      const inApp = formData.get(`inApp:${eventType}`) === "on";
      const email = formData.get(`email:${eventType}`) === "on";
      const anterior = String(formData.get(`previous:${eventType}`) ?? "");

      if (anterior === `${inApp ? "1" : "0"}${email ? "1" : "0"}`) continue;

      const { error } = await supabase.rpc("set_notification_preference", {
        p_space_id: spaceId,
        p_event_type: eventType,
        p_in_app: inApp,
        p_email: email,
      });
      if (error) {
        console.error("[ajustes] set_notification_preference devolvió error", {
          eventType,
          message: error.message,
        });
        return { error: error.message, done: false, unchanged: false };
      }
    }
  } catch (fallo) {
    console.error("[ajustes] set_notification_preference lanzó", {
      spaceId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}

/**
 * §9 paso 1, §125 · los datos fiscales del espacio. Como el nombre y la
 * zona horaria, pasan por función: `spaces` no tiene política de UPDATE.
 *
 * **No se valida ningún identificador fiscal**, y es a propósito: el
 * bloque legal sigue aplazado (§170.1) y una validación inventada sería
 * peor que ninguna. Se guardan como los escribe quien los escribe, igual
 * que en la solicitud de espacio (RN-PLA-01).
 */
export async function saveSpaceDetails(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_space_details", {
      p_space_id: spaceId,
      p_legal_name: String(formData.get("legalName") ?? ""),
      p_tax_id: String(formData.get("taxId") ?? ""),
      p_address: String(formData.get("address") ?? ""),
    });
    if (error) return { error: error.message, done: false, unchanged: false };

    revalidatePath("/espacios", "layout");
    return { error: null, done: data === true, unchanged: data === false };
  } catch (fallo) {
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}

/**
 * M58 · el IVA por defecto del espacio (migración 99).
 *
 * RN-FIN-08 lo congela en cada cobro al emitirlo, así que esto mueve los
 * cobros **futuros** y ninguno de los ya emitidos. La pantalla lo dice: un
 * cambio de tipo impositivo que pareciera retroactivo sería una corrección
 * contable que nadie ha pedido.
 */
export async function saveSpaceTaxRate(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const bruto = String(formData.get("taxRate") ?? "").trim().replace(",", ".");
  const percent = Number(bruto);

  if (bruto === "" || !Number.isFinite(percent)) {
    return { error: es.settings.taxRateInvalid, done: false, unchanged: false };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_space_tax_rate", {
      p_space_id: spaceId,
      p_percent: percent,
    });
    if (error) return { error: error.message, done: false, unchanged: false };

    revalidatePath("/espacios", "layout");
    return { error: null, done: true, unchanged: false };
  } catch (fallo) {
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}

/**
 * §9 paso 2, §124 · el logotipo del espacio. Los bytes van al mismo bucket
 * privado que los archivos y la fila solo guarda la ruta.
 *
 * La subida la hace el servidor con la clave de servicio, y **no antes de
 * comprobar el permiso**: primero `set_space_logo()` —que exige
 * `manage_space` y deja auditoría— y solo si acepta se suben los bytes.
 * Al revés, cualquiera con sesión podría dejar archivos en el bucket.
 *
 * El tipo y el tamaño se comprueban aquí contra lo que el bucket admite
 * para un logotipo: imágenes, y de las pequeñas.
 */
const LOGO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export async function saveSpaceLogo(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const file = formData.get("logo");

  if (!(file instanceof File) || file.size === 0) {
    return { error: es.settings.logoMissing, done: false, unchanged: false };
  }
  if (!LOGO_MIME.has(file.type)) {
    return { error: es.settings.logoWrongType, done: false, unchanged: false };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: es.settings.logoTooBig, done: false, unchanged: false };
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const ruta = `spaces/${spaceId}/logo-${Date.now()}.${extension}`;

  try {
    const supabase = await createClient();
    // Primero el permiso y la auditoría; después los bytes.
    const { error } = await supabase.rpc("set_space_logo", {
      p_space_id: spaceId,
      p_storage_path: ruta,
    });
    if (error) return { error: error.message, done: false, unchanged: false };

    const admin = createAdminClient();
    const subida = await admin.storage
      .from("files")
      .upload(ruta, file, { contentType: file.type, upsert: false });

    if (subida.error) {
      // La fila apunta a una ruta que no existe. Se deshace en vez de
      // dejar un logotipo roto: es una ruta, no un registro de negocio.
      await supabase.rpc("set_space_logo", { p_space_id: spaceId, p_storage_path: "" });
      return { error: es.settings.logoUploadFailed, done: false, unchanged: false };
    }

    revalidatePath("/espacios", "layout");
    return { error: null, done: true, unchanged: false };
  } catch (fallo) {
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}
