"use server";

import { revalidatePath } from "next/cache";

import { isOnboardingStep } from "@/core/space-lifecycle";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { SettingsState } from "../ajustes/action-state";

/**
 * RN-CIC-02 · el propietario da un paso por bueno. Quién puede lo
 * comprueba `confirm_onboarding_step()` (`manage_space`, RN-CIC-03); aquí
 * solo se recoge el paso y se traduce la negativa.
 *
 * El paso se valida también aquí, contra la misma lista de §9 que usa el
 * servidor, para que un formulario manipulado no llegue a la base con un
 * paso inventado — que la rechazaría igual, pero con un mensaje suyo.
 */
export async function confirmOnboardingStep(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "").trim();
  const step = String(formData.get("step") ?? "").trim();

  if (!spaceId || !isOnboardingStep(step)) {
    return { error: es.onboarding.unknownStep, done: false, unchanged: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_onboarding_step", {
    p_space_id: spaceId,
    p_step: step,
  });
  if (error) return { error: error.message, done: false, unchanged: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}
