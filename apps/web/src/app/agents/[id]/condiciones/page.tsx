import { redirect } from "next/navigation";

import { EmptyState, ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadServiceDates, loadTermsStatus } from "@/services/agents/billing-gateway";

import { requireAgentsPage } from "@/app/agents/agents-context";
import { AcceptConditionsForm } from "../_components/AcceptConditionsForm";
import { BillingSteps } from "../_components/BillingSteps";

export const dynamic = "force-dynamic";

/**
 * «Acepta las condiciones de Reservas» (`AgentsCondiciones`, PRD de agents §4.4 paso 4): la primera vez que el
 * Propietario entra tras aprobarse una solicitud que creó el equipo en su nombre, antes de los datos de pago.
 * Si ya las aceptó —o la solicitud la pidió él, que las aceptó al pedirla—, sigue a los datos de pago.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "conditions");
  const t = es.agents.billing;
  const title = es.agents.states.conditionsTitle;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={title} />
        <NoPermissionState />
      </div>
    );
  }

  const client = await createClient();
  let terms;
  try {
    const dates = await loadServiceDates(client, id);
    terms = dates?.subscriptionId ? await loadTermsStatus(client, dates.subscriptionId) : null;
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={access.nav.name} />
        <ErrorState title={t.failedTitle} description={t.failedReason} />
      </div>
    );
  }

  const next = agentsPageHref(id, "pendingPayment");
  if (terms?.status === "accepted") redirect(next);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.conditions.headline} subtitle={t.conditions.subtitle(access.nav.name)} />
      <BillingSteps current="conditions" />
      {terms === null || terms.status === "no_terms" || !terms.conditions ? (
        <EmptyState title={t.conditions.noTermsTitle} description={t.conditions.noTermsReason} />
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-base font-semibold">{terms.version ? t.conditions.version(terms.version) : title}</h2>
          <div className="max-h-96 overflow-y-auto whitespace-pre-line rounded-field bg-soft-surface p-4 text-sm leading-relaxed" data-testid="conditions-text">
            {terms.conditions}
          </div>
          <AcceptConditionsForm establishmentId={id} next={next} />
          <p className="text-sm text-text-secondary">{t.conditions.footnote}</p>
        </div>
      )}
    </div>
  );
}
