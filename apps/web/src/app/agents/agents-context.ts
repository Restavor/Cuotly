import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { AgentsNavContext } from "@/components/shell/navigation";
import { isReservationServiceStatus } from "@/core/app/products";
import {
  agentsPageHref,
  guardAgentsPage,
  type AgentsPage,
} from "@/core/reservations/agents-routes";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { canSeeAmounts, type ReservationsActor } from "@/core/reservations/permissions";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AgentsRestaurant =
  /** Puede entrar: es Propietario o Encargado y el restaurante tiene Reservas. */
  | { readonly state: "ok"; readonly nav: AgentsNavContext }
  /** No es Propietario ni Encargado de este restaurante (o no existe: no se distingue). */
  | { readonly state: "no_access" }
  /** Es de los suyos, pero todavía no tiene Reservas. */
  | { readonly state: "not_contracted" }
  /** No se ha podido mirar: no es lo mismo que «no hay». */
  | { readonly state: "failed" };

/**
 * Quién es quien mira en este restaurante y cómo está su Reservas (PRD de agents §3.1 y
 * §5.1). Una sola lectura por petición: el layout y la página la comparten.
 *
 * **No autoriza nada**: decide qué se pinta. `reservations_my_role()`, las políticas de
 * RLS y las RPC contestan por su cuenta a cada lectura y a cada escritura. En la Fase B el
 * único actor con cuenta es el Propietario o el Encargado; el Equipo con PIN, la tablet y el
 * soporte llegan en la Fase D.
 */
export const loadAgentsRestaurant = cache(async (establishmentId: string): Promise<AgentsRestaurant> => {
  if (!UUID.test(establishmentId)) return { state: "no_access" };

  const supabase = await createClient();
  const [{ data: establishment, error: estError }, { data: role, error: roleError }, { data: settings, error: setError }] =
    await Promise.all([
      supabase.from("establishments").select("id, name, city").eq("id", establishmentId).maybeSingle(),
      supabase.rpc("reservations_my_role", { p_establishment_id: establishmentId }),
      supabase
        .from("reservation_settings")
        .select("service_status")
        .eq("establishment_id", establishmentId)
        .maybeSingle(),
    ]);

  if (estError !== null || roleError !== null || setError !== null) return { state: "failed" };
  if (!establishment || (role !== "owner" && role !== "manager")) return { state: "no_access" };
  if (!settings || !isReservationServiceStatus(settings.service_status)) return { state: "not_contracted" };

  const actor: ReservationsActor = { kind: role };
  const serviceStatus = settings.service_status;

  // El saldo del menú es un importe: solo a quien se le enseñan importes (RN-APP-05).
  let balanceLabel: string | null = null;
  if (canSeeAmounts(actor, { serviceStatus })) {
    const { data: cents } = await supabase.rpc("agent_balance_cents", { p_establishment_id: establishmentId });
    // Si no se ha podido leer, no se pinta un cero: se omite la cifra (CLAUDE.md, no inventar).
    if (typeof cents === "number") balanceLabel = formatCentsAsEuros(cents);
  }

  return {
    state: "ok",
    nav: {
      establishmentId,
      name: establishment.name,
      locality: establishment.city,
      actor,
      serviceStatus,
      balanceLabel,
    },
  };
});

export type AgentsPageAccess =
  | { readonly kind: "ok"; readonly nav: AgentsNavContext }
  | { readonly kind: "denied"; readonly nav: AgentsNavContext };

/**
 * La puerta de cada pantalla de `/agents/[id]`: se abre en este estado y para esta
 * persona, o se le lleva a la que le toca (aprobada y sin pagar, cerrada…), o se le dice
 * que no puede. Cada página la llama la primera.
 */
export async function requireAgentsPage(establishmentId: string, page: AgentsPage): Promise<AgentsPageAccess> {
  const restaurant = await loadAgentsRestaurant(establishmentId);
  // El layout ya enseñó el motivo; una página que llegue aquí sin restaurante no existe.
  if (restaurant.state !== "ok") notFound();

  const guard = guardAgentsPage(establishmentId, restaurant.nav.actor, restaurant.nav.serviceStatus, page);
  if (guard.kind === "redirect") redirect(guard.href);
  return { kind: guard.kind === "allow" ? "ok" : "denied", nav: restaurant.nav };
}

/** La dirección de una pantalla del restaurante; atajo para quien ya tiene su contexto. */
export function hrefOf(nav: AgentsNavContext, page: AgentsPage): string {
  return agentsPageHref(nav.establishmentId, page);
}
