"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import type { NewEstablishmentState } from "./action-state";

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

function campo(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor : "";
}

/**
 * Maqueta 02 · dar de alta un restaurante (RN-EST-06, §20.5).
 *
 * **No autoriza nada.** `create_establishment_with_data()` comprueba
 * `create_establishment` por su cuenta, crea el grupo y el establecimiento
 * en UNA transacción, deja el apunte en `audit_log` y desde la migración
 * 58 es la única puerta: `establishments` se quedó sin política de INSERT,
 * así que enviar este formulario con otra sesión —o llamar a la RPC a
 * pelo— falla igual (CLAUDE.md: ocultar un botón no es un control de
 * acceso).
 *
 * La clave de idempotencia la genera el navegador al pintar el formulario
 * y viaja en un campo oculto: un doble clic, o el reintento del propio
 * navegador, devuelve el restaurante que ya se creó en vez de crear un
 * segundo con otro código.
 */
export async function createEstablishmentWithData(
  spaceId: string,
  spaceSlug: string,
  _prev: NewEstablishmentState,
  formData: FormData,
): Promise<NewEstablishmentState> {
  const grupoElegido = campo(formData, "groupId");
  let establishmentId: string;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_establishment_with_data", {
      p_space_id: spaceId,
      p_name: campo(formData, "name"),
      // El desplegable manda el id de un grupo que ya existe; el campo de
      // texto, el nombre de uno nuevo. Nunca los dos: la opción "Crear un
      // grupo nuevo" del desplegable vale la cadena vacía.
      p_group_id: grupoElegido === "" ? undefined : grupoElegido,
      p_group_name: grupoElegido === "" ? campo(formData, "groupName") : undefined,
      p_plan_id: campo(formData, "planId") === "" ? undefined : campo(formData, "planId"),
      p_legal_name: campo(formData, "legalName"),
      p_tax_id: campo(formData, "taxId"),
      p_address: campo(formData, "address"),
      p_postal_code: campo(formData, "postalCode"),
      p_city: campo(formData, "city"),
      p_contact_name: campo(formData, "contactName"),
      p_contact_email: campo(formData, "contactEmail"),
      p_phone_primary: campo(formData, "phonePrimary"),
      p_website_url: campo(formData, "websiteUrl"),
      p_instagram: campo(formData, "instagram"),
      p_facebook_url: campo(formData, "facebookUrl"),
      p_idempotency_key: campo(formData, "idempotencyKey"),
    });

    if (error) {
      console.error("[alta] create_establishment_with_data devolvió error", {
        spaceId,
        message: error.message,
      });
      return { error: error.message };
    }

    establishmentId = data;
  } catch (fallo) {
    console.error("[alta] create_establishment_with_data lanzó", {
      spaceId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo) };
  }

  // El restaurante nuevo aparece en el listado, en el menú y en los
  // desplegables de todo el espacio, así que se revalida el armazón
  // entero. Y `redirect()` va FUERA del try: lanza a propósito, y
  // atraparlo lo convertiría en un error de la pantalla.
  revalidatePath("/espacios", "layout");
  redirect(`/espacios/${spaceSlug}/restaurantes/${establishmentId}`);
}
