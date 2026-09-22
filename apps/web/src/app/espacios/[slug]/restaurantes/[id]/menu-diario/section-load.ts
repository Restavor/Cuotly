import type { SupabaseClient } from "@supabase/supabase-js";

import { enZona } from "@/i18n/dates";
import type { Database } from "@/lib/supabase/database.types";

import { loadEstablishmentTimezone } from "../timezone-load";

/**
 * Lo que comparten R13, R15 y R19: el restaurante, el saldo del ciclo y la
 * zona del espacio. `balance` es `null` cuando el restaurante no tiene el
 * servicio (`menu_update_balance()` no devuelve fila), y cada pantalla lo
 * dice en vez de enseñar ceros (CA-20).
 */
export async function loadMenuSection(supabase: SupabaseClient<Database>, establishmentId: string) {
  const [{ data: establishment }, { data: balanceRows }, timezone] = await Promise.all([
    supabase.from("establishments").select("id, name, code").eq("id", establishmentId).maybeSingle(),
    supabase.rpc("menu_update_balance", { p_establishment_id: establishmentId }),
    loadEstablishmentTimezone(supabase, establishmentId),
  ]);
  const balance = balanceRows?.[0] ?? null;
  const fecha = (iso: string) => enZona(iso, timezone, { day: "numeric", month: "short", year: "numeric" });
  const cycleLabel = balance === null ? null : `${fecha(balance.cycle_start)} – ${fecha(balance.cycle_end)}`;
  return { establishment, balance, timezone, cycleLabel, fecha };
}
