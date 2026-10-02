import Link from "next/link";
import { redirect } from "next/navigation";

import { AgentsShell } from "./AgentsShell";
import { ButtonLink, Card, EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import { isReservationServiceStatus } from "@/core/app/products";
import { agentsEntry, agentsPageHref, entryPageForStatus, type AgentsRestaurantRef } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myProducts } from "@/services/app-gateway";

/**
 * Restavor agents · `/agents` (PRD de agents §5.1). Con un solo restaurante con Reservas,
 * directo a la pantalla que le toca por su estado; con varios, el selector; sin ninguno,
 * el vacío con su motivo. Lo decide `agentsEntry()`, con tests.
 */
export const dynamic = "force-dynamic";

export default async function AgentsHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await myProducts(supabase).catch(() => null);
  const t = es.agents.home;

  if (rows === null) {
    return (
      <AgentsShell>
        <div className="space-y-6">
          <PageHeader title={t.title} subtitle={t.subtitle} />
          <ErrorState title={es.app.home.failedTitle} description={es.app.home.failedReason} />
        </div>
      </AgentsShell>
    );
  }

  const restaurants = rows.flatMap((row) =>
    row.kind === "agents" && row.establishmentId !== null && isReservationServiceStatus(row.detail)
      ? [{ establishmentId: row.establishmentId, name: row.establishmentName ?? "", status: row.detail }]
      : [],
  );
  const refs: readonly AgentsRestaurantRef[] = restaurants;
  const entry = agentsEntry(refs);

  if (entry.kind === "redirect") redirect(entry.href);

  return (
    <AgentsShell>
      <div className="space-y-6">
        <PageHeader
          title={entry.kind === "selector" ? es.agents.selector.title : t.title}
          subtitle={entry.kind === "selector" ? es.agents.selector.subtitle : t.subtitle}
          actions={
            <ButtonLink href="/" variant="secondary">
              {t.backToApp}
            </ButtonLink>
          }
        />

        {entry.kind === "empty" ? (
          <Card title={t.listTitle}>
            <EmptyState title={t.emptyTitle} description={t.emptyReason} />
          </Card>
        ) : (
          <Card title={t.listTitle}>
            <ul className="divide-y divide-border">
              {restaurants.map((row) => (
                <li key={row.establishmentId} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">
                    {es.app.home.agents.reservationsOf(row.name)}
                  </span>
                  <StatusBadge tone={row.status === "active" ? "success" : "warning"}>
                    {es.app.home.agents.status[row.status]}
                  </StatusBadge>
                  <ButtonLink
                    href={agentsPageHref(row.establishmentId, entryPageForStatus(row.status))}
                    variant="secondary"
                  >
                    {es.agents.selector.open}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <p className="text-sm">
          <Link href="/" className="font-medium text-cuotly-green hover:underline">
            {t.backToApp}
          </Link>
        </p>
      </div>
    </AgentsShell>
  );
}
