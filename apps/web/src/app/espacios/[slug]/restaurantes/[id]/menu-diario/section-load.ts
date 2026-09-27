import type { SupabaseClient } from "@supabase/supabase-js";

import { enZona } from "@/i18n/dates";
import type { Database } from "@/lib/supabase/database.types";

import { loadEstablishmentTimezone } from "../timezone-load";

/** RN-CRE-21 · de dónde le viene Menú Diario: incluido en su plan o contratado aparte. */
export type DailyMenuAccess = "plan" | "service";

/**
 * Lo que comparten R13, R15 y R19: el restaurante, de dónde le viene Menú
 * Diario y la zona del espacio. `access` es `null` cuando el restaurante no
 * lo tiene, ni en su plan ni contratado aparte
 * (`establishment_daily_menu_access()`, migración 152), y cada pantalla lo
 * dice en vez de enseñar un menú vacío (CA-20). Desde la decisión 85 no hay
 * contador de actualizaciones (RN-CRE-22).
 */
export async function loadMenuSection(supabase: SupabaseClient<Database>, establishmentId: string) {
  const [{ data: establishment }, { data: acceso }, timezone] = await Promise.all([
    supabase.from("establishments").select("id, name, code").eq("id", establishmentId).maybeSingle(),
    supabase.rpc("establishment_daily_menu_access", { p_establishment_id: establishmentId }),
    loadEstablishmentTimezone(supabase, establishmentId),
  ]);
  const access: DailyMenuAccess | null = acceso === "plan" || acceso === "service" ? acceso : null;
  const fecha = (iso: string) => enZona(iso, timezone, { day: "numeric", month: "short", year: "numeric" });
  return { establishment, access, timezone, fecha };
}
