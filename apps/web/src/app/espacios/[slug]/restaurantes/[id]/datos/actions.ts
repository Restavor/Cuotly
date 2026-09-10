"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import type { EstablishmentDataState } from "./action-state";

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

/**
 * Un campo del formulario, tal como llega. Se manda **vacío** cuando está
 * vacío y no se omite: `set_establishment_data()` recibe la ficha completa
 * y un campo vacío vacía el dato, que es lo que quiere quien borra un
 * teléfono secundario que se apuntó mal. Omitirlo dejaría el valor viejo
 * puesto y el formulario mentiría al recargarse.
 */
function campo(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor : "";
}

/**
 * §15.2 · guardar los datos del restaurante.
 *
 * **No autoriza nada.** RN-EST-11 lo hace cumplir `set_establishment_data()`,
 * que además es la ÚNICA puerta: desde la migración 57 `establishments` no
 * tiene política de UPDATE y un disparador rechaza cualquier escritura de
 * estas columnas que no venga de la función. Enviar este formulario con
 * otra sesión, o llamar a la RPC a pelo, falla igual — y con el mismo
 * mensaje.
 *
 * RN-EST-12 · esto no toca el contenido público de ninguna web. La
 * pantalla lo dice antes de guardar y lo repite al confirmar, porque es
 * justo lo que un propietario da por hecho al corregir aquí su teléfono.
 */
export async function saveEstablishmentData(
  _prev: EstablishmentDataState,
  formData: FormData,
): Promise<EstablishmentDataState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_establishment_data", {
      p_establishment_id: establishmentId,
      p_name: campo(formData, "name"),
      p_legal_name: campo(formData, "legalName"),
      p_tax_id: campo(formData, "taxId"),
      p_address: campo(formData, "address"),
      p_postal_code: campo(formData, "postalCode"),
      p_city: campo(formData, "city"),
      p_contact_name: campo(formData, "contactName"),
      p_contact_email: campo(formData, "contactEmail"),
      p_phone_primary: campo(formData, "phonePrimary"),
      p_phone_secondary: campo(formData, "phoneSecondary"),
      p_website_url: campo(formData, "websiteUrl"),
      p_instagram: campo(formData, "instagram"),
      p_facebook_url: campo(formData, "facebookUrl"),
      p_domain: campo(formData, "domain"),
      p_opening_hours: campo(formData, "openingHours"),
      p_web_platform: campo(formData, "webPlatform"),
    });

    if (error) {
      console.error("[ficha] set_establishment_data devolvió error", {
        establishmentId,
        message: error.message,
      });
      return { error: error.message, done: false, unchanged: false };
    }

    // El nombre comercial se enseña en el armazón, en el listado y en los
    // mensajes, así que se revalida el espacio entero y no solo esta
    // pantalla: si no, el menú seguiría llamando al restaurante como antes.
    revalidatePath("/espacios", "layout");
    return { error: null, done: data === true, unchanged: data !== true };
  } catch (fallo) {
    console.error("[ficha] set_establishment_data lanzó", {
      establishmentId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}
