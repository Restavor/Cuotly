import Link from "next/link";

import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { es } from "@/i18n/es";

import { AgentsShell } from "../AgentsShell";
import { loadAgentsRestaurant } from "../agents-context";

/**
 * Un restaurante dentro de Restavor agents. Aquí se sabe cuál es y quién es quien mira, y
 * con eso el armazón pinta el menú de §5.1. Si no se puede entrar —no es de los suyos, aún
 * no tiene Reservas o no se ha podido mirar— se dice con su motivo y no se pinta nada más.
 */
export default async function AgentRestaurantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const restaurant = await loadAgentsRestaurant(id);
  const t = es.agents.selector;

  if (restaurant.state === "ok") {
    return <AgentsShell nav={restaurant.nav}>{children}</AgentsShell>;
  }

  return (
    <AgentsShell>
      <div className="space-y-6">
        <PageHeader title={es.agents.home.title} />
        {restaurant.state === "failed" ? (
          <ErrorState title={es.app.home.failedTitle} description={es.app.home.failedReason} />
        ) : restaurant.state === "not_contracted" ? (
          <EmptyState title={es.agents.home.emptyTitle} description={es.agents.home.emptyReason} />
        ) : (
          <EmptyState title={t.noAccessTitle} description={t.noAccessReason} />
        )}
        <Link href="/agents" className="text-sm font-medium text-cuotly-green hover:underline">
          {t.backToList}
        </Link>
      </div>
    </AgentsShell>
  );
}
