import { ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { es } from "@/i18n/es";
import { agentsDb } from "@/app/agents/db";
import { loadSchedule } from "@/services/reservations-gateway";

import { requireAgentsPage } from "../../../../agents-context";
import { ScheduleEditor } from "../../_components/ScheduleEditor";
import { SettingsTabs } from "../_components/SettingsTabs";

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

  const supabase = await agentsDb(id);
  let schedule;
  try {
    schedule = await loadSchedule(supabase, id);
  } catch {
    schedule = null;
  }
  if (schedule === null) return <ErrorState title={t.common.failedLoad} description={t.common.failedLoadReason} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.hours.title} subtitle={access.nav.name} />
      <SettingsTabs establishmentId={id} current="hours" />
      <ScheduleEditor establishmentId={id} schedule={schedule} />
    </div>
  );
}
