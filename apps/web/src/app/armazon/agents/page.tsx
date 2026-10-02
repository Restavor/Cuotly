import type { AgentsNavContext } from "@/components/shell/navigation";
import type { ReservationServiceStatus, ReservationsActor } from "@/core/reservations/permissions";

import { es } from "@/i18n/es";

import { ArmazonAgents } from "./ArmazonAgents";

/**
 * La hermana de `/armazon` para **Restavor agents** (PRD de agents §5.1).
 *
 * Existe por lo mismo que aquella: el armazón de agents solo se ve tras identificarse y
 * con un restaurante con Reservas detrás, así que sin esta página no había forma de mirarlo
 * —ni de comprobar su navegación por teclado, el ancho de tablet y de teléfono, ni lo que
 * ve cada actor— sin una sesión y una base de datos delante.
 *
 * NO es una pantalla de producto y no enseña ningún dato: sin importes, sin reservas, y el
 * restaurante es una etiqueta de referencia. `?actor=` elige quién mira (`owner`,
 * `manager`, `staff`, `device`) y `?estado=`, el estado del servicio.
 */
const ACTORS: Readonly<Record<string, ReservationsActor>> = {
  owner: { kind: "owner" },
  manager: { kind: "manager" },
  staff: { kind: "staff" },
  device: { kind: "device" },
};

const STATUSES: readonly ReservationServiceStatus[] = [
  "approved_pending_payment",
  "active",
  "past_due",
  "paused",
  "ending",
  "closed",
];

export default async function ArmazonAgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor, estado } = await searchParams;
  const quien = ACTORS[typeof actor === "string" ? actor : "owner"] ?? ACTORS.owner;
  const status = STATUSES.find((s) => s === estado) ?? "active";

  const nav: AgentsNavContext = {
    establishmentId: "00000000-0000-4000-8000-00000000a9e1",
    name: es.agents.reference.restaurant,
    locality: null,
    actor: quien,
    serviceStatus: status,
    // Sin importe: un saldo de relleno sería un dato inventado.
    balanceLabel: null,
  };

  return <ArmazonAgents nav={nav} />;
}
