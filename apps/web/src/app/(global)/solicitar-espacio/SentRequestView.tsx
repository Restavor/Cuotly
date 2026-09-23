import { InfoNote, RequestTimeline, type TimelineView } from "@/components/panel/RequestPieces";
import { ButtonLink, Card, StatusBadge } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CUOTLY_PLAN_TERMS } from "@/core/cuotly-subscription";
import { isCuotlyPlan, spaceRequestSteps, type SpaceRequestState } from "@/core/space-requests";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import { requestTone } from "../../administracion/solicitudes/request-tone";

const t = es.spaceRequestForm;

export type SentRequest = {
  readonly id: string;
  readonly business_name: string;
  readonly contact_name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly estimated_establishments: number | null;
  readonly estimated_users: number | null;
  readonly intended_use: string | null;
  readonly plan: string;
  readonly tax_name: string | null;
  readonly tax_id: string | null;
  readonly tax_address: string | null;
  readonly status: string;
  readonly status_reason: string | null;
  readonly submitted_at: string | null;
  readonly decided_at: string | null;
};

export type SentRequestSpace = {
  readonly slug: string;
  readonly cuotly_status: string | null;
  readonly cuotly_status_changed_at: string | null;
} | null;

function cuando(value: string | null): string | null {
  return value === null ? null : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "long", timeStyle: "short" });
}

/**
 * G03 · la solicitud enviada: el estado, los tres datos de la cabecera y el
 * camino en cuatro pasos (`spaceRequestSteps()`), abajo la franja con "Ver
 * datos enviados" y la acción que toca. Recibe las filas ya leídas: aquí
 * no se consulta nada.
 */
export function SentRequestView({
  request,
  space,
  showData,
  canRequestAnother,
}: {
  request: SentRequest;
  space: SentRequestSpace;
  showData: boolean;
  /** Solo sin otra viva: una persona sigue una solicitud a la vez. */
  canRequestAnother: boolean;
}) {
  const estado = request.status as SpaceRequestState;

  const pasos: TimelineView[] = spaceRequestSteps(estado, space?.cuotly_status ?? null).map((p) => {
    const nota =
      p.status === "pending"
        ? t.stepNotes.pending
        : p.key === "review" && p.status === "current"
          ? t.stepNotes.reviewing
          : p.key === "review" && p.status === "waiting"
            ? t.stepNotes.waiting
            : p.key === "approval" && p.status === "stopped"
              ? t.stepNotes.rejected
              : p.key === "activation" && p.status === "current"
                ? t.stepNotes.trial
                : p.key === "activation" && p.status === "waiting"
                  ? t.stepNotes.awaitingPayment
                  : p.key === "activation" && p.status === "stopped"
                    ? t.stepNotes.archivedByOwner
                    : null;
    // Un paso en marcha dice lo que pasa, no una fecha que no tiene.
    const fecha =
      p.status === "pending" || p.status === "current" || p.status === "waiting"
        ? null
        : p.key === "submitted"
          ? cuando(request.submitted_at)
          : p.key === "activation"
            ? cuando(space?.cuotly_status_changed_at ?? null)
            : cuando(request.decided_at);
    return { key: p.key, status: p.status, label: t.steps[p.key], dateLabel: fecha, note: nota };
  });

  const plan = isCuotlyPlan(request.plan)
    ? t.planWithPrice(es.cuotlySubscription.plans[request.plan], euros(CUOTLY_PLAN_TERMS[request.plan].priceCents))
    : request.plan;
  const titulo = estado === "approved" ? t.approvedTitle : estado === "rejected" ? t.rejectedTitle : t.receivedTitle;
  const cuerpo = estado === "approved" ? t.approvedBody : estado === "rejected" ? t.rejectedBody : t.receivedBody;
  const aqui = `/solicitar-espacio?solicitud=${request.id}`;

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-cuotly-green/15 text-primary-dark">
              <Icon name="document" className="h-11 w-11" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-primary-dark">{titulo}</h2>
                <StatusBadge tone={requestTone(estado)}>{t.states[estado]}</StatusBadge>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{cuerpo}</p>
              {estado === "rejected" && request.status_reason ? (
                <div className="mt-3">
                  <InfoNote title={t.reasonLabel}>{request.status_reason}</InfoNote>
                </div>
              ) : null}
              <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-3">
                <Dato icon="building" label={t.summaryBusiness} value={request.business_name} />
                <Dato icon="document" label={t.summaryPlan} value={plan} />
                <Dato icon="person" label={t.summaryContact} value={request.contact_name} />
              </dl>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold text-primary-dark">{t.progressTitle}</h2>
          <RequestTimeline steps={pasos} orientation="vertical" onlyKnownDates />
        </Card>
      </div>

      <Card className="p-4!">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Solo mientras está en manos de Cuotly: de una decidida ya no se pide nada. */}
          <p className="flex flex-1 items-center gap-3 text-sm text-text-secondary">
            {estado === "submitted" || estado === "in_review" ? (
              <>
                <Icon name="info" className="h-6 w-6 shrink-0 text-primary-dark" />
                {t.moreInfoHint}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={showData ? aqui : `${aqui}&ver=datos`} variant="secondary">
              {showData ? t.hideSubmitted : t.viewSubmitted}
            </ButtonLink>
            {estado === "rejected" && canRequestAnother ? (
              <ButtonLink href="/solicitar-espacio?nueva=1" variant="secondary">
                {t.newRequest}
              </ButtonLink>
            ) : null}
            {estado === "approved" && space ? (
              <ButtonLink href={`/espacios/${space.slug}`}>{t.goToSpace}</ButtonLink>
            ) : (
              <ButtonLink href="/">{t.backHome}</ButtonLink>
            )}
          </div>
        </div>
      </Card>

      {showData ? (
        <Card title={t.submittedDataTitle}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Enviado label={t.businessName} value={request.business_name} />
            <Enviado label={t.contactName} value={request.contact_name} />
            <Enviado label={t.email} value={request.email} />
            <Enviado label={t.phone} value={request.phone} />
            <Enviado label={t.estimatedEstablishments} value={request.estimated_establishments?.toString() ?? null} />
            <Enviado label={t.estimatedUsers} value={request.estimated_users?.toString() ?? null} />
            <Enviado label={t.intendedUse} value={request.intended_use} />
            <Enviado label={t.planTitle} value={plan} />
            <Enviado label={t.taxName} value={request.tax_name} />
            <Enviado label={t.taxId} value={request.tax_id} />
            <Enviado label={t.taxAddress} value={request.tax_address} />
          </dl>
        </Card>
      ) : null}
    </>
  );
}

function Dato({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cuotly-green/15 text-primary-dark">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-text-secondary">{label}</dt>
        <dd className="break-words text-sm font-semibold text-text">{value}</dd>
      </div>
    </div>
  );
}

function Enviado({ label, value }: { label: string; value: string | null }) {
  const vacio = value === null || value.trim() === "";
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={`mt-0.5 break-words ${vacio ? "text-text-secondary" : "font-medium text-text"}`}>
        {vacio ? t.notGiven : value}
      </dd>
    </div>
  );
}
