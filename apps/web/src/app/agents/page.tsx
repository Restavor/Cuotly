import Link from "next/link";
import { redirect } from "next/navigation";

import { ButtonLink, Card, EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import { isReservationServiceStatus } from "@/core/app/products";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myProducts } from "@/services/app-gateway";

/**
 * Restavor agents · la página mínima de la Fase A (PRD de agents §15, APP-02).
 * Lista los restaurantes de quien entra que tienen Reservas y dice con
 * claridad que la agenda llega con la siguiente fase: lo que no existe no se
 * simula (CLAUDE.md). El selector de restaurante y «Hoy» son de la Fase B.
 */
export const dynamic = "force-dynamic";

export default async function AgentsHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = es.agents.home;
  const rows = await myProducts(supabase).catch(() => null);

  if (rows === null) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} subtitle={t.subtitle} />
        <ErrorState title={es.app.home.failedTitle} description={es.app.home.failedReason} />
      </div>
    );
  }

  const agents = rows.filter((row) => row.kind === "agents");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <ButtonLink href="/" variant="secondary">
            {t.backToApp}
          </ButtonLink>
        }
      />

      <Card title={t.listTitle}>
        {agents.length === 0 ? (
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        ) : (
          <ul className="divide-y divide-border">
            {agents.map((row) => (
              <li key={row.establishmentId} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">
                  {es.app.home.agents.reservationsOf(row.establishmentName ?? "")}
                </span>
                {isReservationServiceStatus(row.detail) ? (
                  <StatusBadge tone={row.detail === "active" ? "success" : "warning"}>
                    {es.app.home.agents.status[row.detail]}
                  </StatusBadge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t.comingTitle}>
        <p className="text-sm text-text-secondary">{t.comingReason}</p>
        <p className="mt-3 text-sm">
          <Link href="/" className="font-medium text-cuotly-green hover:underline">
            {t.backToApp}
          </Link>
        </p>
      </Card>
    </div>
  );
}
