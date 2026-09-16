"use server";

import { revalidatePath } from "next/cache";

import { isStatusComponent, isStatusSeverity } from "@/core/support";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import { listSpaces } from "@/services/platform-gateway";
import {
  addPlatformHoliday,
  declareSecurityIncident as declareSecurityIncidentRpc,
  declareStatusEvent,
  resolveStatusEvent,
  retirePlatformHoliday,
} from "@/services/support-gateway";

import type { AdminActionState } from "../action-state";

/**
 * Las acciones del estado de Cuotly y sus festivos (RN-SOP-06, RN-SOP-13).
 * Ninguna autoriza nada: las cuatro funciones exigen `is_platform_member()`
 * con la 2FA dentro, y aquí solo se traduce la negativa.
 */
function mensaje(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

function texto(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function declareEvent(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const component = texto(formData, "component");
  const severity = texto(formData, "severity");
  const title = texto(formData, "title");
  const body = texto(formData, "body");
  if (!isStatusComponent(component) || !isStatusSeverity(severity) || !title) {
    return { error: "Componente, gravedad y título son obligatorios", done: false };
  }
  try {
    const supabase = await createClient();
    await declareStatusEvent(supabase, { component, severity, title, body: body || null });
    revalidatePath("/administracion/estado");
    revalidatePath("/estado");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}

/**
 * RN-ADM-13 · el incidente de seguridad. Los espacios afectados llegan
 * como slugs (uno por línea) y se traducen a ids con la lista del panel,
 * que ya exige la sesión de plataforma; un slug desconocido para todo.
 */
export async function declareSecurityIncident(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const component = texto(formData, "component");
  const severity = texto(formData, "severity");
  const title = texto(formData, "title");
  const body = texto(formData, "body");
  const slugs = texto(formData, "slugs")
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/^\//, ""))
    .filter((s) => s.length > 0);
  if (!isStatusComponent(component) || !isStatusSeverity(severity) || !title) {
    return { error: "Componente, gravedad y título son obligatorios", done: false };
  }
  try {
    const supabase = await createClient();
    let spaceIds: readonly string[] | null = null;
    if (slugs.length > 0) {
      const spaces = await listSpaces(supabase);
      const ids: string[] = [];
      for (const slug of slugs) {
        const space = spaces.find((s) => s.slug === slug);
        if (!space) return { error: es.platformAdmin.status.unknownSlug(slug), done: false };
        ids.push(space.id);
      }
      spaceIds = ids;
    }
    await declareSecurityIncidentRpc(supabase, { component, severity, title, body: body || null, spaceIds });
    revalidatePath("/administracion/estado");
    revalidatePath("/estado");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}

export async function resolveEvent(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const id = texto(formData, "eventId");
  const note = texto(formData, "note");
  if (!id) return { error: "Evento desconocido", done: false };
  try {
    const supabase = await createClient();
    await resolveStatusEvent(supabase, id, note || null);
    revalidatePath("/administracion/estado");
    revalidatePath("/estado");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}

export async function addHoliday(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const date = texto(formData, "date");
  const name = texto(formData, "name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return { error: "Fecha y nombre son obligatorios", done: false };
  try {
    const supabase = await createClient();
    await addPlatformHoliday(supabase, date, name);
    revalidatePath("/administracion/estado");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}

export async function retireHoliday(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const id = texto(formData, "holidayId");
  const reason = texto(formData, "reason");
  if (!id || !reason) return { error: "Hace falta el motivo", done: false };
  try {
    const supabase = await createClient();
    await retirePlatformHoliday(supabase, id, reason);
    revalidatePath("/administracion/estado");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}
