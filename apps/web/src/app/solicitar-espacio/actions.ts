"use server";

import { revalidatePath } from "next/cache";

import { isCuotlyPlan } from "@/core/space-requests";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { SpaceRequestFormState } from "./form-state";

function texto(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function entero(formData: FormData, name: string): number | undefined {
  const valor = Number.parseInt(texto(formData, name), 10);
  return Number.isFinite(valor) && valor >= 0 ? valor : undefined;
}

/**
 * RN-PLA-02 · guardar el borrador o enviarlo. Las dos cosas pasan por
 * `save_space_request_draft()`, que devuelve siempre el mismo borrador de
 * la persona (uno por persona), y enviar añade `submit_space_request()`,
 * que comprueba la transición (RN-PLA-03). Nada se decide aquí.
 */
export async function saveSpaceRequest(
  _prev: SpaceRequestFormState,
  formData: FormData,
): Promise<SpaceRequestFormState> {
  const intent = texto(formData, "intent") === "submit" ? "submit" : "draft";
  const businessName = texto(formData, "businessName");
  const contactName = texto(formData, "contactName");
  const email = texto(formData, "email");
  const plan = texto(formData, "plan");

  if (!businessName || !contactName || !email) {
    return { error: es.spaceRequestForm.validation, saved: false, submitted: false };
  }
  if (!isCuotlyPlan(plan)) {
    return { error: es.spaceRequestForm.invalidPlan, saved: false, submitted: false };
  }

  const supabase = await createClient();
  const { data: requestId, error } = await supabase.rpc("save_space_request_draft", {
    p_business_name: businessName,
    p_contact_name: contactName,
    p_email: email,
    p_plan: plan,
    p_phone: texto(formData, "phone") || undefined,
    p_estimated_establishments: entero(formData, "estimatedEstablishments"),
    p_estimated_users: entero(formData, "estimatedUsers"),
    p_intended_use: texto(formData, "intendedUse") || undefined,
    p_tax_name: texto(formData, "taxName") || undefined,
    p_tax_id: texto(formData, "taxId") || undefined,
    p_tax_address: texto(formData, "taxAddress") || undefined,
  });
  if (error) return { error: error.message, saved: false, submitted: false };

  if (intent === "submit") {
    const { error: submitError } = await supabase.rpc("submit_space_request", {
      p_request_id: requestId,
    });
    if (submitError) return { error: submitError.message, saved: true, submitted: false };
  }

  revalidatePath("/solicitar-espacio");
  revalidatePath("/");
  return { error: null, saved: true, submitted: intent === "submit" };
}
