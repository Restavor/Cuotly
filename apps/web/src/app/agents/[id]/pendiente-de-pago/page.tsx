import { redirect } from "next/navigation";

import { UploadReceiptForm } from "@/app/espacios/[slug]/restaurantes/[id]/facturacion/UploadReceiptForm";
import { Card, EmptyState, ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { hasDebt } from "@/core/agents/payment-info";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadPaymentInfo, loadServiceDates, loadTermsStatus } from "@/services/agents/billing-gateway";

import { requireAgentsPage } from "@/app/agents/agents-context";
import { BillingSteps } from "../_components/BillingSteps";
import { PaymentDetails } from "../_components/PaymentDetails";

export const dynamic = "force-dynamic";

/**
 * «Aprobado: datos para pagar» (`AgentsPendientePago`, PRD de agents §4.4 y §11.1): mientras falta el primer
 * pago, el importe con IVA, el IBAN, el Bizum y el concepto, y «Subir justificante». Subirlo no activa nada: lo
 * activa el equipo de Restavor al registrar el pago (RN-FIN-06). Si el Propietario aún no aceptó las condiciones
 * (la solicitud la creó el equipo en su nombre), antes va a aceptarlas.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "pendingPayment");
  const t = es.agents.billing.pending;
  const title = es.agents.states.pendingPaymentTitle;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={title} />
        <NoPermissionState />
      </div>
    );
  }

  const client = await createClient();
  let info;
  let dates;
  let terms;
  try {
    dates = await loadServiceDates(client, id);
    terms = dates?.subscriptionId ? await loadTermsStatus(client, dates.subscriptionId) : null;
    info = await loadPaymentInfo(client, id);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={access.nav.name} />
        <ErrorState title={es.agents.billing.failedTitle} description={es.agents.billing.failedReason} />
      </div>
    );
  }
  // Sin la aceptación hecha (la solicitud la creó el equipo en nombre del restaurante), primero las condiciones.
  if (terms && (terms.status === "pending" || terms.status === "outdated")) redirect(agentsPageHref(id, "conditions"));
  if (!dates) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={title} subtitle={access.nav.name} />
      <BillingSteps current="pay" />
      <div>
        <h2 className="text-lg font-semibold text-text">{t.headline}</h2>
        <p className="mt-1 text-[15px] text-text-secondary">{t.intro}</p>
      </div>
      {info && hasDebt(info) ? (
        <>
          <PaymentDetails info={info} timeZone={dates.timeZone} title={t.firstChargeTitle} />
          <Card title={t.receiptTitle}>
            <UploadReceiptForm
              establishmentId={id}
              charges={[
                {
                  id: info.chargeId,
                  label: t.receiptCharge(info.concept, enZona(info.dueAt, dates.timeZone, { day: "numeric", month: "long" })),
                },
              ]}
            />
          </Card>
          <p className="text-sm text-text-secondary">{t.next}</p>
        </>
      ) : (
        <EmptyState title={t.nothingTitle} description={t.nothingReason} />
      )}
    </div>
  );
}
