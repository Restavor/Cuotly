import { notFound, redirect } from "next/navigation";

import { agentsPageHref, entryPageForStatus } from "@/core/reservations/agents-routes";

import { loadAgentsRestaurant } from "../agents-context";

export const dynamic = "force-dynamic";

/** `/agents/<id>` no es una pantalla: lleva a la que le toca por el estado de Reservas (PRD §5.1). */
export default async function AgentRestaurantEntry({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const restaurant = await loadAgentsRestaurant(id);
  // El layout ya enseña el motivo cuando no se puede entrar: aquí solo se llega con restaurante.
  if (restaurant.state !== "ok") notFound();
  redirect(agentsPageHref(id, entryPageForStatus(restaurant.nav.serviceStatus)));
}
