import Link from "next/link";

import { ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadSchedule } from "@/services/reservations-gateway";

import { requireAgentsPage } from "../../../../agents-context";
import { ScheduleEditor } from "../../_components/ScheduleEditor";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Horarios (RES-12; PRD de agents §6.2 y §11.1, `Ajustes`): días, turnos, aforo,
 * horas de reserva, grupos grandes, días cerrados y límites. Lo cambian el Propietario, el
 * Encargado y Restavor; el Equipo con PIN no ve Ajustes. El servidor repite cada validación.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "settings");
  const t = es.agents.agenda;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={t.hours.title} />
        <NoPermissionState description={t.hours.noPermissionReason} />
      </div>
    );
  }

  const supabase = await createClient();
  let schedule;
  try {
    schedule = await loadSchedule(supabase, id);
  } catch {
    schedule = null;
  }
  if (schedule === null) return <ErrorState title={t.common.failedLoad} description={t.common.failedLoadReason} />;

  const tabs = [
    { href: agentsPageHref(id, "settings"), label: t.hours.tabs.hours, current: true },
    { href: agentsPageHref(id, "team"), label: t.hours.tabs.team, current: false },
    { href: agentsPageHref(id, "connections"), label: t.hours.tabs.connections, current: false },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.hours.title} subtitle={access.nav.name} />
      <nav aria-label={t.hours.tabsLabel} className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.current ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center border-b-2 px-4 text-sm font-semibold ${
              tab.current ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <ScheduleEditor establishmentId={id} schedule={schedule} />
    </div>
  );
}
