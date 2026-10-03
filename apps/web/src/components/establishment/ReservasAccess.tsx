import Link from "next/link";

import { StatusBadge } from "@/components/ui";
import { isReservationServiceStatus } from "@/core/app/products";
import { es } from "@/i18n/es";

/**
 * El acceso a Reservas desde la ficha del restaurante (RVR-01; decisión 136): una subruta de la ficha, no una sexta
 * pestaña (la ficha tiene exactamente cinco y dos tests lo exigen). Solo se pinta si el espacio ofrece Reservas y el
 * restaurante las tiene (o las tuvo). Mostrarlo no autoriza nada: la pantalla a la que lleva repite todos los permisos.
 */
export function ReservasAccess({ href, status }: { href: string; status: string }) {
  const t = es.reservationsSpace.sheet;
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-3 rounded-field border border-border bg-surface px-4 py-3"
      data-testid="reservas-access"
    >
      <span className="text-[15px] font-semibold text-text">{t.accessTitle}</span>
      {isReservationServiceStatus(status) ? (
        <StatusBadge tone={status === "active" ? "success" : "warning"}>{es.app.home.agents.status[status]}</StatusBadge>
      ) : null}
      <Link href={href} className="ml-auto inline-flex min-h-11 items-center text-sm font-semibold text-cuotly-green underline">
        {t.accessOpen}
      </Link>
    </div>
  );
}
