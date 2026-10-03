import { Card, ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { exportReservationsHref } from "@/core/reservations/agents-routes";
import { daysLeftToDownload } from "@/core/reservations/lifecycle";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadServiceDates } from "@/services/agents/billing-gateway";

import { requireAgentsPage } from "@/app/agents/agents-context";

export const dynamic = "force-dynamic";

/**
 * «Reservas cerrada» (`CuentaCerrada`, PRD de agents §6.12 y §11.1): solo el Propietario entra, durante los 30 días
 * siguientes al cierre, a descargar todas sus reservas en Excel. Después se anonimizan los datos personales
 * (§6.13). No hay nada más que hacer aquí: la agenda, el agente y los ajustes ya no se abren.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "closed");
  const t = es.agents.billing.closed;
  const title = es.agents.states.closedTitle;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={title} />
        <NoPermissionState />
      </div>
    );
  }

  let dates;
  try {
    dates = await loadServiceDates(await createClient(), id);
  } catch {
    dates = null;
  }
  if (!dates) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={access.nav.name} />
        <ErrorState title={es.agents.billing.failedTitle} description={es.agents.billing.failedReason} />
      </div>
    );
  }

  const purged = dates.dataPurgedAt !== null;
  const daysLeft = dates.closedAt ? daysLeftToDownload(new Date(dates.closedAt), new Date()) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={title} subtitle={access.nav.name} />
      <Card>
        <p className="text-[15px] text-text">{t.intro}</p>
        {purged ? (
          <p className="mt-3 text-sm text-text-secondary" data-testid="closed-purged">
            {t.purged}
          </p>
        ) : (
          <>
            {daysLeft !== null ? (
              <p className="mt-3 text-sm font-semibold text-pending-text" data-testid="closed-days-left">
                {t.daysLeft(daysLeft)}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-text-secondary">{t.after}</p>
          </>
        )}
        {/* Una descarga, no una pantalla: un enlace normal, no `next/link`. */}
        <a
          href={exportReservationsHref(id)}
          className="mt-4 inline-flex min-h-11 items-center rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
          data-testid="download-reservations"
        >
          {t.download}
        </a>
        <p className="mt-4 text-sm text-text-secondary">{t.reactivateHint}</p>
      </Card>
    </div>
  );
}
