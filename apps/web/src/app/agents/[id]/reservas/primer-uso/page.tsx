import { redirect } from "next/navigation";

import { ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadSchedule } from "@/services/reservations-gateway";

import { requireAgentsPage } from "../../../agents-context";
import { OnboardingWizard } from "../_components/OnboardingWizard";

export const dynamic = "force-dynamic";

/**
 * Reservas · Primer uso (RES-13; PRD de agents §5.1, `PrimerUso`): lo que se ve la primera
 * vez que un restaurante con Reservas activa entra, hasta que termina de configurarlo.
 * Solo lo abre quien puede cambiar los horarios; un restaurante que ya lo terminó va a Hoy.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "onboarding");
  const t = es.agents.agenda;
  if (access.kind === "denied") return <NoPermissionState />;

  const supabase = await createClient();
  let schedule;
  try {
    schedule = await loadSchedule(supabase, id);
  } catch {
    schedule = null;
  }
  if (schedule === null) return <ErrorState title={t.common.failedLoad} description={t.common.failedLoadReason} />;
  if (schedule.onboardingCompletedAt !== null) redirect(agentsPageHref(id, "today"));

  return (
    <div className="space-y-6">
      <PageHeader title={t.onboarding.title} subtitle={access.nav.name} />
      <OnboardingWizard establishmentId={id} schedule={schedule} todayHref={agentsPageHref(id, "today")} />
    </div>
  );
}
