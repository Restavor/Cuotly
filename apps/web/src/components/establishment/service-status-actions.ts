"use server";

/**
 * M84 y M47 · las acciones del bloque "Estado del servicio" de la ficha.
 *
 * Ninguna decide nada. `set_establishment_status()` exige `manage_clients`
 * y, dentro, la guarda de RN-FIN-13: de una parada por impago se sale
 * cobrando, no cambiando el estado a mano. `request_service_termination()`
 * comprueba quién puede y que el restaurante siga teniendo servicio. Lo que
 * estas funciones hacen es traducir el motivo y refrescar la pantalla.
 */

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { ServiceStatusState } from "./service-status-action-state";

async function run(
  llamada: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string } | null }>,
): Promise<ServiceStatusState> {
  try {
    const supabase = await createClient();
    const { error } = await llamada(supabase);
    if (error) return { error: error.message, done: false };
    revalidatePath("/espacios", "layout");
    return { error: null, done: true };
  } catch (fallo) {
    console.error("[estado del servicio] la llamada falló", { message: String(fallo) });
    return { error: es.states.errorDescription, done: false };
  }
}

/**
 * RN-EST-08 · archivar un restaurante, con su motivo.
 *
 * El motivo es obligatorio en la pantalla aunque la función lo admita
 * vacío: archivar es la única acción de esta ficha que saca al restaurante
 * de la vista de todos los días, y dentro de seis meses alguien va a
 * preguntar por qué. Un motivo en blanco no responde.
 */
export async function archiveEstablishment(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: es.establishmentSheet.serviceReasonRequired, done: false };

  return run((s) =>
    s.rpc("set_establishment_status", {
      p_establishment_id: establishmentId,
      p_status: "archived",
      p_reason: reason,
    }),
  );
}

/**
 * M84 · reactivar. Vuelve a `active`, que es el estado del que se archivó.
 *
 * No hay "volver al estado que tenía antes": el estado anterior está en la
 * auditoría, pero devolver a un restaurante a `paused` o a `ending` porque
 * es de donde venía sería resucitar una situación que ya no se sabe si
 * sigue siendo verdad. Reactivar es darle servicio; si vuelve a haber deuda
 * vencida, la guarda de RN-FIN-13 lo para aquí mismo.
 */
export async function reactivateEstablishment(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: es.establishmentSheet.serviceReasonRequired, done: false };

  return run((s) =>
    s.rpc("set_establishment_status", {
      p_establishment_id: establishmentId,
      p_status: "active",
      p_reason: reason,
    }),
  );
}

/**
 * M47 · registrar la baja que llegó por fuera de Cuotly —una llamada, un
 * correo—. Es la misma función que usa el restaurante desde su panel
 * (R24): el hecho es el mismo y `requested_by_client` distingue quién lo
 * comunicó, que es lo que hace falta saber después.
 *
 * No adelanta ninguna fecha: pasar a `ending` dice que no se renueva.
 * Cuándo se corta el servicio lo decide RN-EST-09 con el periodo pagado y
 * la permanencia.
 */
export async function registerTerminationFromOutside(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: es.establishmentSheet.serviceReasonRequired, done: false };

  return run((s) =>
    s.rpc("request_service_termination", {
      p_establishment_id: establishmentId,
      p_reason: reason,
      p_requested_by_client: false,
    }),
  );
}
