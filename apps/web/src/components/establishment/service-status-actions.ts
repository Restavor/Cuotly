"use server";

/**
 * M84, M47 y M83/M84 del §38 · las acciones del bloque "Estado del
 * servicio" de la ficha: archivar, reactivar, la baja, la transferencia
 * entre espacios y las copias de seguridad.
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

/**
 * RN-TRA-02 · el propietario del origen propone la transferencia.
 *
 * `propose_establishment_transfer()` comprueba que quien llama sea el
 * propietario —no `manage_clients`: esto saca al restaurante del espacio
 * entero, no lo administra dentro—, que no haya deuda vencida (RN-TRA-05) y
 * que no haya otra propuesta abierta (RN-TRA-06). Aquí no se repite nada de
 * eso.
 *
 * El espacio de destino se escribe por su identificador y no se elige de una
 * lista, y es deliberado: **no existe ninguna pantalla que enseñe los
 * espacios ajenos**, y hacer una para esto sería abrir un directorio de
 * clientes de la competencia. Quien transfiere lo hace hablando con el otro
 * espacio, que es como pasa de verdad.
 */
export async function proposeEstablishmentTransfer(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const toSpaceId = String(formData.get("toSpaceId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!toSpaceId) return { error: es.establishmentSheet.transferSpaceRequired, done: false };
  if (!reason) return { error: es.establishmentSheet.serviceReasonRequired, done: false };

  return run((s) =>
    s.rpc("propose_establishment_transfer", {
      p_establishment_id: establishmentId,
      p_to_space_id: toSpaceId,
      p_reason: reason,
    }),
  );
}

/** RN-TRA-07 · quien la propuso puede retirarla, con motivo. */
export async function withdrawEstablishmentTransfer(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const transferId = String(formData.get("transferId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  return run((s) =>
    s.rpc("withdraw_establishment_transfer", {
      p_transfer_id: transferId,
      p_reason: reason || undefined,
    }),
  );
}

/** RN-TRA-07 · el destino puede rechazarla, con motivo. */
export async function rejectEstablishmentTransfer(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const transferId = String(formData.get("transferId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) return { error: es.establishmentSheet.serviceReasonRequired, done: false };

  return run((s) =>
    s.rpc("reject_establishment_transfer", {
      p_transfer_id: transferId,
      p_reason: reason,
    }),
  );
}

/**
 * RN-TRA-02 · el destino acepta, y entonces sí se mueve todo.
 *
 * Es la operación menos reversible del producto: mueve un restaurante
 * entero con su historial de un espacio a otro. No hay "deshacer", y la
 * pantalla lo dice antes del botón — lo que hay es otra transferencia en
 * sentido contrario, que el otro espacio tendría que aceptar.
 */
export async function acceptEstablishmentTransfer(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const transferId = String(formData.get("transferId") ?? "");
  return run((s) => s.rpc("accept_establishment_transfer", { p_transfer_id: transferId }));
}

/**
 * RN-BCK · generar una copia a mano, además de la diaria del barrido.
 *
 * `create_establishment_backup()` exige `manage_clients` (RN-BCK-07).
 */
export async function createEstablishmentBackup(
  _prev: ServiceStatusState,
  formData: FormData,
): Promise<ServiceStatusState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  return run((s) => s.rpc("create_establishment_backup", { p_establishment_id: establishmentId }));
}
