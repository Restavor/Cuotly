"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  isSupportAccessLevel,
  successorsFromChoices,
  supportDurationIsValid,
} from "@/core/platform-admin";
import { accessRequestNeedsReason, isAccessRequestState } from "@/core/access-requests";
import { isSpaceRequestState, spaceRequestNeedsReason } from "@/core/space-requests";
import { isCuotlyPaymentMethod } from "@/core/cuotly-subscription";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import {
  accountDeletionPreview,
  deleteAccount,
  deleteEstablishment,
  deleteEstablishmentPermanently,
  deleteSpace,
  deleteSpacePermanently,
  endSupportSession,
  listArchived,
  recoverEstablishment,
  recoverSpace,
  restoreAccount,
  restoreEstablishment,
  restoreSpace,
  revokePlatformAdmin,
  setPlatformAdmin,
  startSupportSession,
} from "@/services/platform-gateway";

import type { AdminActionState } from "./action-state";

/**
 * Las acciones del panel de Administración de Cuotly (Fase 4, Hito 19).
 *
 * Ninguna autoriza nada. Cada función de la base comprueba quién llama y
 * con qué sesión —`is_platform_approver()`, `is_platform_subscription_manager()`,
 * `is_platform_supporter()`, `is_platform_owner()`, todas con la 2FA
 * dentro— y aquí solo se traduce la negativa a un mensaje en pantalla.
 */

function mensaje(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

function texto(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** RN-PLA-03/06 · revisar, pedir información o rechazar. */
export async function decideSpaceRequest(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const requestId = texto(formData, "requestId");
  const status = texto(formData, "status");
  const reason = texto(formData, "reason");

  if (!isSpaceRequestState(status)) return { error: es.platformAdmin.requests.reasonRequired, done: false };
  if (spaceRequestNeedsReason(status) && reason === "") {
    return { error: es.platformAdmin.requests.reasonRequired, done: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_space_request", {
    p_request_id: requestId,
    p_status: status,
    p_reason: reason || undefined,
  });
  if (error) return { error: error.message, done: false };

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/** RN-PLA-05 · aprobar es una sola operación con clave de idempotencia. */
export async function approveSpaceRequest(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const requestId = texto(formData, "requestId");
  const idempotencyKey = texto(formData, "idempotencyKey");

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_space_request", {
    p_request_id: requestId,
    p_idempotency_key: idempotencyKey || undefined,
  });
  if (error) return { error: error.message, done: false };

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/**
 * RN-ACC-05/06 · pedir información o no aprobar una solicitud de ACCESO.
 * Aprobar no pasa por aquí: hace más cosas y tiene su propia función con
 * clave de idempotencia, igual que en las de creación de espacio.
 */
export async function decideAccessRequest(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const requestId = texto(formData, "requestId");
  const status = texto(formData, "status");
  const reason = texto(formData, "reason");

  if (!isAccessRequestState(status)) {
    return { error: es.platformAdmin.access.reasonRequired, done: false };
  }
  if (accessRequestNeedsReason(status) && reason === "") {
    return { error: es.platformAdmin.access.reasonRequired, done: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_access_request", {
    p_request_id: requestId,
    p_status: status,
    p_reason: reason || undefined,
  });
  if (error) return { error: error.message, done: false };

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/**
 * RN-ACC-03/04/08 · aprobar crea el derecho a la cuenta y encola el correo
 * con el enlace de un solo uso. El enlace que devuelve la función **no se
 * enseña en pantalla**: es una credencial, y su sitio es el buzón de quien
 * la pidió, no el navegador de quien aprueba.
 */
export async function approveAccessRequest(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const requestId = texto(formData, "requestId");
  const idempotencyKey = texto(formData, "idempotencyKey");

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_access_request", {
    p_request_id: requestId,
    p_idempotency_key: idempotencyKey || undefined,
  });
  if (error) return { error: error.message, done: false };

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/** RN-SUB-06 · confirmar un pago declarado. */
export async function confirmCuotlyPayment(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const paymentId = texto(formData, "paymentId");
  const note = texto(formData, "note");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_cuotly_payment", {
    p_payment_id: paymentId,
    p_note: note || undefined,
  });
  if (error) return { error: error.message, done: false };

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/** RN-SUB-06 · rechazar un pago declarado, con motivo. */
export async function rejectCuotlyPayment(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const paymentId = texto(formData, "paymentId");
  const reason = texto(formData, "reason");
  if (reason === "") return { error: es.platformAdmin.charges.reasonRequired, done: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_cuotly_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) return { error: error.message, done: false };

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/** RN-SUB-06 · registrar un pago visto en el banco sin declaración previa. */
export async function recordCuotlyPayment(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const chargeId = texto(formData, "chargeId");
  const method = texto(formData, "method");
  const amountEuros = Number.parseFloat(texto(formData, "amount").replace(",", "."));
  const paidAt = texto(formData, "paidAt");
  const note = texto(formData, "note");
  const idempotencyKey = texto(formData, "idempotencyKey");

  if (!isCuotlyPaymentMethod(method) || !Number.isFinite(amountEuros) || amountEuros <= 0) {
    return { error: es.platformAdmin.charges.invalidAmount, done: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_cuotly_payment", {
    p_charge_id: chargeId,
    p_amount_cents: Math.round(amountEuros * 100),
    p_method: method,
    p_paid_at: paidAt ? new Date(paidAt).toISOString() : undefined,
    p_note: note || undefined,
    p_idempotency_key: idempotencyKey || undefined,
  });
  if (error) return { error: error.message, done: false };

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/** RN-SUB-09 · reactivar desde la plataforma, con motivo. */
export async function reactivateSpace(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const spaceId = texto(formData, "spaceId");
  const reason = texto(formData, "reason");
  if (reason === "") return { error: es.platformAdmin.charges.reasonRequired, done: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_reactivate_space", {
    p_space_id: spaceId,
    p_reason: reason,
  });
  if (error) return { error: error.message, done: false };

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/**
 * RN-ADM-06 · abrir Modo soporte y entrar en el espacio. La clave de
 * idempotencia la genera el formulario al pintarse: pulsar dos veces
 * devuelve la misma sesión.
 */
export async function openSupportSession(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const spaceId = texto(formData, "spaceId");
  const spaceSlug = texto(formData, "spaceSlug");
  const reason = texto(formData, "reason");
  const level = texto(formData, "level");
  const minutes = Number.parseInt(texto(formData, "minutes"), 10);
  const idempotencyKey = texto(formData, "idempotencyKey");

  if (reason === "" || !isSupportAccessLevel(level) || !supportDurationIsValid(minutes)) {
    return { error: es.platformAdmin.support.startValidation, done: false };
  }

  const supabase = await createClient();
  try {
    await startSupportSession(supabase, {
      spaceId,
      reason,
      accessLevel: level,
      minutes,
      idempotencyKey,
    });
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath("/administracion", "layout");
  redirect(`/espacios/${spaceSlug}`);
}

/** RN-ADM-06 · cerrar una sesión antes de que caduque. */
export async function closeSupportSession(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const sessionId = texto(formData, "sessionId");
  const note = texto(formData, "note");

  const supabase = await createClient();
  try {
    await endSupportSession(supabase, sessionId, note || null);
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath("/administracion", "layout");
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/** RN-ADM-03 · nombrar o cambiar los permisos de un Administrador de Cuotly. */
export async function savePlatformAdmin(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const userId = texto(formData, "userId");

  const supabase = await createClient();
  try {
    await setPlatformAdmin(supabase, {
      userId,
      canApproveSpaces: formData.get("canApproveSpaces") === "on",
      canManageSubscriptions: formData.get("canManageSubscriptions") === "on",
      canSupport: formData.get("canSupport") === "on",
      canDeleteAccounts: formData.get("canDeleteAccounts") === "on",
    });
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/** RN-ADM-03 · retirar el rol. */
export async function removePlatformAdmin(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const userId = texto(formData, "userId");

  const supabase = await createClient();
  try {
    await revokePlatformAdmin(supabase, userId);
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath("/administracion", "layout");
  return { error: null, done: true };
}

/**
 * RN-ADM-06 · salir de Modo soporte desde la banda del espacio: cierra la
 * sesión y vuelve al panel, porque con la puerta cerrada el espacio ya no
 * se puede ver.
 */
export async function leaveSupportSession(formData: FormData): Promise<void> {
  const sessionId = texto(formData, "sessionId");
  const supabase = await createClient();
  try {
    await endSupportSession(supabase, sessionId, null);
  } catch {
    // Si no se pudo cerrar —ya caducada, ya cerrada— el destino es el mismo.
  }
  revalidatePath("/espacios", "layout");
  redirect("/administracion/espacios");
}

/*
 * RN-ADM-14 a 20 (decisión 81) · eliminar y recuperar cuentas, espacios y
 * restaurantes. Nada se borra: la base archiva, marca y bloquea, y solo
 * Cuotly lo deshace. Quién puede lo decide `is_platform_account_manager()`
 * en cada función; aquí se exige el motivo (§140) y, para eliminar, que
 * se escriba el nombre de lo que se elimina.
 */

type Eliminable = "account" | "space" | "establishment";

/**
 * §140 · la confirmación adicional: escribir lo que se va a eliminar tal
 * como aparece. Se compara con lo que dice la base, no con lo que el
 * formulario dijo que había.
 */
async function nombreEnLaBase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tipo: Eliminable,
  id: string,
): Promise<string | null> {
  if (tipo === "account") return (await accountDeletionPreview(supabase, id)).email || null;
  const { data, error } =
    tipo === "space"
      ? await supabase.rpc("platform_list_spaces")
      : await supabase.rpc("platform_list_establishments");
  if (error || !Array.isArray(data)) return null;
  const fila = (data as { id: string; name: string }[]).find((row) => row.id === id);
  return fila?.name ?? null;
}

export async function platformDelete(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const tipo = texto(formData, "kind") as Eliminable;
  const id = texto(formData, "id");
  const reason = texto(formData, "reason");
  const confirmation = texto(formData, "confirmation");
  const t = es.platformAdmin.deletion;

  if (!["account", "space", "establishment"].includes(tipo) || id === "") {
    return { error: t.invalid, done: false };
  }
  if (reason === "") return { error: t.reasonRequired, done: false };

  const supabase = await createClient();
  try {
    const nombre = await nombreEnLaBase(supabase, tipo, id);
    if (nombre === null || confirmation !== nombre) return { error: t.confirmationMismatch, done: false };

    if (tipo === "account") {
      const preview = await accountDeletionPreview(supabase, id);
      const choices: Record<string, string> = {};
      for (const space of preview.soleOwnerSpaces) {
        choices[space.spaceId] = texto(formData, `successor:${space.spaceId}`);
      }
      await deleteAccount(supabase, {
        userId: id,
        reason,
        successors: successorsFromChoices(preview.soleOwnerSpaces, choices),
      });
    } else if (tipo === "space") {
      await deleteSpace(supabase, id, reason);
    } else {
      await deleteEstablishment(supabase, id, reason);
    }
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath("/administracion", "layout");
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

export async function platformRestore(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const tipo = texto(formData, "kind") as Eliminable;
  const id = texto(formData, "id");
  const reason = texto(formData, "reason");
  const t = es.platformAdmin.deletion;

  if (!["account", "space", "establishment"].includes(tipo) || id === "") {
    return { error: t.invalid, done: false };
  }
  if (reason === "") return { error: t.reasonRequired, done: false };

  const supabase = await createClient();
  try {
    if (tipo === "account") await restoreAccount(supabase, id, reason);
    else if (tipo === "space") await restoreSpace(supabase, id, reason);
    else await restoreEstablishment(supabase, id, reason);
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath("/administracion", "layout");
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/*
 * Decisión 82 · Archivados (RN-ADM-22 a 24). Recuperar es un clic: el
 * motivo lo pone la base, fijo. Eliminar definitivamente pide motivo y
 * escribir el nombre, que se compara con el de Archivados: si ya no está
 * ahí, no se elimina.
 */
type Archivable = "space" | "establishment";

function archivable(valor: string): valor is Archivable {
  return valor === "space" || valor === "establishment";
}

export async function platformRecover(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const tipo = texto(formData, "kind");
  const id = texto(formData, "id");
  const t = es.platformAdmin.archived;

  if (!archivable(tipo) || id === "") return { error: es.platformAdmin.deletion.invalid, done: false };

  const supabase = await createClient();
  let hecho: boolean;
  try {
    hecho = tipo === "space" ? await recoverSpace(supabase, id) : await recoverEstablishment(supabase, id);
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath("/administracion", "layout");
  revalidatePath("/espacios", "layout");
  // CA-17 · el segundo clic no encuentra nada archivado y lo dice.
  return hecho ? { error: null, done: true } : { error: t.recoverNothing, done: false };
}

export async function platformDeletePermanently(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const tipo = texto(formData, "kind");
  const id = texto(formData, "id");
  const reason = texto(formData, "reason");
  const confirmation = texto(formData, "confirmation");
  const t = es.platformAdmin.deletion;

  if (!archivable(tipo) || id === "") return { error: t.invalid, done: false };
  if (reason === "") return { error: t.reasonRequired, done: false };

  const supabase = await createClient();
  try {
    const fila = (await listArchived(supabase)).find((row) => row.kind === tipo && row.id === id);
    if (!fila || confirmation !== fila.name) return { error: t.confirmationMismatch, done: false };

    if (tipo === "space") await deleteSpacePermanently(supabase, id, reason);
    else await deleteEstablishmentPermanently(supabase, id, reason);
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath("/administracion", "layout");
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}
