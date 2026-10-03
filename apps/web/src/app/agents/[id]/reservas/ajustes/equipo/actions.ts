"use server";

import { revalidatePath } from "next/cache";

import { agentsDb } from "@/app/agents/db";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { decodeDeviceAuthFailure, isPin } from "@/core/reservations/device";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { clearDeviceCookie, loadDevice, renewElevation } from "@/services/agents/device";
import { pinHmac, PinSecretMissingError } from "@/services/agents/pin";
import { addStaff, removeStaff, revokeDevice, setMyPin, setStaffPin } from "@/services/agents/team-gateway";

import type { TeamFeedback } from "./action-state";

/**
 * Las acciones de Ajustes › Equipo (Fase D, EQU-01; PRD de agents §3.2 y §3.3). Ninguna autoriza nada: quién puede
 * añadir, cambiar o quitar a alguien y quién activa o desactiva un dispositivo lo deciden las funciones de la base
 * de datos (`add_reservation_staff()`…). Aquí se validan los campos, se calcula el HMAC del PIN (la base nunca ve un
 * PIN en claro) y se traduce lo que contesta a un mensaje.
 *
 * Funcionan igual con una cuenta que con la tablet del local con los Ajustes abiertos con PIN (`agentsDb`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function failure(error: unknown): TeamFeedback {
  const t = es.agents.team.errors;
  if (error instanceof PinSecretMissingError) return { ok: false, message: t.pinSecretMissing };
  const text = error instanceof Error ? error.message : "";
  const device = decodeDeviceAuthFailure(text);
  if (device !== null) return { ok: false, message: device.code === "forbidden" ? t.noPermission : es.agents.device.denied.identityInvalid };
  if (/^Tiene que quedar al menos un propietario/.test(text)) return { ok: false, message: t.lastOwner };
  if (/^(No tienes permiso|Solo un Propietario|Solo el propietario|El propietario|Operación no permitida)/.test(text)) return { ok: false, message: t.noPermission };
  return { ok: false, message: t.failed };
}

/**
 * Lo que es de una cuenta (su PIN, invitar, quitar a un Encargado) no se hace desde la tablet del local aunque en ese
 * navegador quede una sesión personal: la tablet manda y la sesión personal se ignora (PRD §3.3). Ocultar el botón no
 * basta (CLAUDE.md): se comprueba aquí.
 */
async function refusedOnDevice(): Promise<TeamFeedback | null> {
  if ((await loadDevice()).kind !== "active") return null;
  return { ok: false, message: es.agents.team.errors.noPermission };
}

function refresh(establishmentId: string) {
  revalidatePath(agentsPageHref(establishmentId, "team"));
}

/** Añadir a alguien del Equipo: nombre y PIN de 4 cifras, repetido. Pulsar dos veces con la misma clave no duplica. */
export async function addStaffAction(input: {
  establishmentId: string;
  name: string;
  pin: string;
  pinRepeat: string;
  idempotencyKey: string;
}): Promise<TeamFeedback> {
  const t = es.agents.team;
  const name = input.name.trim();
  if (!UUID.test(input.establishmentId)) return { ok: false, message: t.errors.failed };
  if (name === "" || name.length > 80) return { ok: false, message: t.errors.name, field: "name" };
  if (!isPin(input.pin)) return { ok: false, message: t.errors.pin, field: "pin" };
  if (input.pin !== input.pinRepeat) return { ok: false, message: t.errors.pinsDiffer, field: "pinRepeat" };
  try {
    const client = await agentsDb(input.establishmentId);
    const outcome = await addStaff(client, {
      establishmentId: input.establishmentId,
      name,
      pinHmac: pinHmac(input.pin),
      idempotencyKey: /^[\w-]{8,100}$/.test(input.idempotencyKey) ? input.idempotencyKey : null,
    });
    if (outcome === "pin_in_use") return { ok: false, message: t.errors.pinInUse, field: "pin" };
    if (outcome === "pin_probes_locked") return { ok: false, message: t.errors.pinProbesLocked, field: "pin" };
    await renewElevation(input.establishmentId);
    refresh(input.establishmentId);
    return { ok: true, message: t.added };
  } catch (error) {
    return failure(error);
  }
}

/** Cambiar el PIN de alguien del Equipo. */
export async function setStaffPinAction(input: {
  establishmentId: string;
  staffId: string;
  pin: string;
  pinRepeat: string;
}): Promise<TeamFeedback> {
  const t = es.agents.team;
  if (!UUID.test(input.establishmentId) || !UUID.test(input.staffId)) return { ok: false, message: t.errors.failed };
  if (!isPin(input.pin)) return { ok: false, message: t.errors.pin, field: "pin" };
  if (input.pin !== input.pinRepeat) return { ok: false, message: t.errors.pinsDiffer, field: "pinRepeat" };
  try {
    const client = await agentsDb(input.establishmentId);
    const outcome = await setStaffPin(client, { establishmentId: input.establishmentId, staffId: input.staffId, pinHmac: pinHmac(input.pin) });
    if (outcome === "pin_in_use") return { ok: false, message: t.errors.pinInUse, field: "pin" };
    if (outcome === "pin_probes_locked") return { ok: false, message: t.errors.pinProbesLocked, field: "pin" };
    await renewElevation(input.establishmentId);
    refresh(input.establishmentId);
    return { ok: true, message: t.pinChanged };
  } catch (error) {
    return failure(error);
  }
}

/** Quitar a alguien del Equipo: se desactiva y se conserva su historial; su PIN deja de valer. */
export async function removeStaffAction(input: { establishmentId: string; staffId: string }): Promise<TeamFeedback> {
  const t = es.agents.team;
  if (!UUID.test(input.establishmentId) || !UUID.test(input.staffId)) return { ok: false, message: t.errors.failed };
  try {
    const client = await agentsDb(input.establishmentId);
    await removeStaff(client, input);
    await renewElevation(input.establishmentId);
    refresh(input.establishmentId);
    return { ok: true, message: t.removed };
  } catch (error) {
    return failure(error);
  }
}

/** «Mi PIN para la tablet» de un Propietario o Encargado: solo con su cuenta, nunca desde la tablet. */
export async function setMyPinAction(input: {
  establishmentId: string;
  pin: string;
  pinRepeat: string;
}): Promise<TeamFeedback> {
  const t = es.agents.team;
  if (!UUID.test(input.establishmentId)) return { ok: false, message: t.errors.failed };
  if (!isPin(input.pin)) return { ok: false, message: t.errors.pin, field: "pin" };
  if (input.pin !== input.pinRepeat) return { ok: false, message: t.errors.pinsDiffer, field: "pinRepeat" };
  const onDevice = await refusedOnDevice();
  if (onDevice) return onDevice;
  try {
    const client = await createClient();
    const outcome = await setMyPin(client, { establishmentId: input.establishmentId, pinHmac: pinHmac(input.pin) });
    if (outcome === "pin_in_use") return { ok: false, message: t.errors.pinInUse, field: "pin" };
    if (outcome === "pin_probes_locked") return { ok: false, message: t.errors.pinProbesLocked, field: "pin" };
    refresh(input.establishmentId);
    return { ok: true, message: t.myPin.done };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Quitar a un Encargado de Reservas: le quita «Gestionar Reservas» y conserva el resto de sus accesos (su PIN deja de
 * valer en ese momento). Lo decide `set_establishment_permissions()`: solo el propietario del restaurante o el equipo
 * del espacio, nunca un Editor con «Usuarios y accesos» (decisión 110).
 */
export async function removeManagerAction(input: { establishmentId: string; userId: string }): Promise<TeamFeedback> {
  const t = es.agents.team;
  if (!UUID.test(input.establishmentId) || !UUID.test(input.userId)) return { ok: false, message: t.errors.failed };
  const onDevice = await refusedOnDevice();
  if (onDevice) return onDevice;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("establishment_panel_users", { p_establishment_id: input.establishmentId });
    if (error) throw new Error(error.message);
    const row = (data ?? []).find((u) => u.user_id === input.userId && u.source === "establishment");
    if (!row) return { ok: false, message: t.errors.failed };
    const { error: setError } = await supabase.rpc("set_establishment_permissions", {
      p_establishment_id: input.establishmentId,
      p_user_id: input.userId,
      p_permissions: {
        create_requests: row.create_requests,
        edit_menus: row.edit_menus,
        use_messages: row.use_messages,
        upload_files: row.upload_files,
        view_reports: row.view_reports,
        view_billing: row.view_billing,
        manage_users: row.manage_users,
        manage_reservations: false,
      },
    });
    if (setError) throw new Error(setError.message);
    refresh(input.establishmentId);
    return { ok: true, message: t.managerRemoved };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Quitar a un Propietario del restaurante (decisión 131): lo hace otro Propietario de este restaurante o el equipo del
 * espacio, nunca un Encargado. Le retira el acceso al restaurante entero (también en Restavor web) y su PIN deja de
 * valer; siempre tiene que quedar un Propietario. Lo decide `revoke_establishment_access()`. Solo con cuenta.
 */
export async function removeOwnerAction(input: { establishmentId: string; userId: string }): Promise<TeamFeedback> {
  const t = es.agents.team;
  if (!UUID.test(input.establishmentId) || !UUID.test(input.userId)) return { ok: false, message: t.errors.failed };
  const onDevice = await refusedOnDevice();
  if (onDevice) return onDevice;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_establishment_access", {
      p_establishment_id: input.establishmentId,
      p_user_id: input.userId,
      p_reason: "Quitado desde Reservas › Equipo",
    });
    if (error) throw new Error(error.message);
    refresh(input.establishmentId);
    return { ok: true, message: t.ownerRemoved };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Invitar a un Propietario o a un Encargado por email, con la invitación de siempre del panel
 * (`invite_to_establishment_panel()`): si ya tiene cuenta, entra al momento; si no, el equipo del espacio la
 * aprueba antes. Un Encargado es un Editor con «Gestionar Reservas». Solo con cuenta.
 */
export async function inviteAction(input: {
  establishmentId: string;
  email: string;
  role: "manager" | "owner";
  idempotencyKey: string;
}): Promise<TeamFeedback> {
  const t = es.agents.team;
  const email = input.email.trim().toLowerCase();
  if (!UUID.test(input.establishmentId)) return { ok: false, message: t.errors.failed };
  if (!EMAIL.test(email)) return { ok: false, message: t.invite.errors.email, field: "email" };
  const onDevice = await refusedOnDevice();
  if (onDevice) return onDevice;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("invite_to_establishment_panel", {
      p_establishment_id: input.establishmentId,
      p_email: email,
      p_role: input.role === "owner" ? "local_owner" : "editor",
      p_idempotency_key: /^[\w-]{8,100}$/.test(input.idempotencyKey) ? input.idempotencyKey : undefined,
      p_manage_reservations: input.role === "manager",
    });
    if (error) throw new Error(error.message);
    refresh(input.establishmentId);
    // Sin identificador de invitación: ya tenía cuenta y tiene acceso desde ahora.
    return { ok: true, message: data === null ? t.invite.direct : t.invite.sent };
  } catch (error) {
    return failure(error);
  }
}

/** Desactivar un dispositivo del local. Si es el propio dispositivo desde el que se pide, vuelve a ser un navegador normal. */
export async function revokeDeviceAction(input: { establishmentId: string; deviceId: string }): Promise<TeamFeedback> {
  const t = es.agents.team;
  if (!UUID.test(input.establishmentId) || !UUID.test(input.deviceId)) return { ok: false, message: t.errors.failed };
  try {
    const own = await loadDevice();
    const client = await agentsDb(input.establishmentId);
    await revokeDevice(client, input);
    if (own.kind === "active" && own.deviceId === input.deviceId) await clearDeviceCookie();
    else await renewElevation(input.establishmentId);
    refresh(input.establishmentId);
    return { ok: true, message: t.devices.deactivated };
  } catch (error) {
    return failure(error);
  }
}
