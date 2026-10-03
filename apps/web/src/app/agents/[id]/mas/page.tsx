import Link from "next/link";

import { Card, PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { agentsPageHref, guardAgentsPage, type AgentsPage } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";

import { requireAgentsPage } from "../../agents-context";

export const dynamic = "force-dynamic";

/**
 * «Más» (móvil, `AgentsMasMovil`): lo que no cabe en la barra inferior. Es navegación real:
 * cada fila lleva a una pantalla del armazón, y solo salen las que esta persona puede abrir
 * (la misma puerta que protege cada ruta). El saldo es el de verdad o no se enseña.
 */
export default async function MorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "more");
  const t = es.agents.menu;
  const { nav, mode } = access;
  // La tablet no es una cuenta (PRD de agents §3.3): sin «Mi cuenta» ni volver a la puerta de Restavor.
  const esTablet = mode === "device";

  const abre = (page: AgentsPage) =>
    guardAgentsPage(nav.establishmentId, nav.actor, nav.serviceStatus, page).kind === "allow";

  const reservas: readonly (readonly [AgentsPage, string, IconName])[] = [
    ["settings", t.hoursTitle, "settings"],
    ["team", t.teamTitle, "team"],
    ["history", es.agents.history.title, "request"],
    ["connections", t.connectionsTitle, "switchSpace"],
  ];
  const agentes: readonly (readonly [AgentsPage, string, IconName, string | undefined])[] = [
    ["balance", t.balance, "wallet", nav.balanceLabel ?? undefined],
    ["plan", t.plan, "plans", undefined],
    ["help", t.help, "help", undefined],
  ];

  const fila = (page: AgentsPage, label: string, icon: IconName, detail?: string) => (
    <li key={page}>
      <Link
        href={agentsPageHref(nav.establishmentId, page)}
        className="flex min-h-14 items-center gap-3 px-1 py-2 text-[15px] hover:bg-soft-surface"
      >
        <Icon name={icon} className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        {detail ? <span className="text-sm font-semibold tabular-nums text-text-secondary">{detail}</span> : null}
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-text-secondary" />
      </Link>
    </li>
  );

  // En la tablet con los Ajustes cerrados, la puerta del PIN es lo que sustituye a «Ajustes».
  const abrirConPin = esTablet && nav.elevation == null;
  const visiblesReservas = reservas.filter(([page]) => abre(page));
  const visiblesAgentes = agentes.filter(([page]) => abre(page));

  return (
    <div className="space-y-6">
      <PageHeader title={t.more} subtitle={nav.name} />

      {visiblesReservas.length > 0 || abrirConPin ? (
        <Card title={t.reservationsSection}>
          <ul className="divide-y divide-border">
            {visiblesReservas.map(([page, label, icon]) => fila(page, label, icon))}
            {abrirConPin ? fila("unlock", es.agents.device.unlock.link, "lock") : null}
          </ul>
        </Card>
      ) : null}

      {visiblesAgentes.length > 0 ? (
        <Card title={es.agents.home.title}>
          <ul className="divide-y divide-border">
            {visiblesAgentes.map(([page, label, icon, detail]) => fila(page, label, icon, detail))}
          </ul>
        </Card>
      ) : null}

      {esTablet ? null : (
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/" className="font-medium text-cuotly-green hover:underline">
              {t.backToApp}
            </Link>
          </li>
          <li>
            <Link href="/cuenta" className="font-medium text-cuotly-green hover:underline">
              {t.account}
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
