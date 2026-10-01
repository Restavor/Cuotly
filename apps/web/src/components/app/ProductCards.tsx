import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink, Card, StatusBadge } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  isReservationServiceStatus,
  type ProductRow,
} from "@/core/app/products";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";

import { ContratarReservas, type ContractOffer } from "./ContratarReservas";

/**
 * Las tarjetas de producto del Inicio de Restavor app (`diseno/final/AppInicio*`).
 * Todo lo que enseñan llega calculado del servidor; aquí solo se pinta, y lo que
 * no hay se dice con su motivo en vez de rellenarlo (CLAUDE.md).
 */

function ProductHeader({
  icon,
  suffix,
  tagline,
  badge,
}: {
  icon: IconName;
  suffix: "web" | "agents";
  tagline: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary-dark">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold text-primary-dark">
          {es.common.appName}{" "}
          <span className="font-medium text-text-secondary">{es.common.productSuffix[suffix]}</span>
        </span>
        <span className="block text-xs text-text-secondary">{tagline}</span>
      </span>
      {badge}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <b className="text-[22px] font-bold tabular-nums text-text">{value}</b>
      <span className="text-[13px] text-text-secondary">{label}</span>
    </div>
  );
}

/** Restavor web, con lo que ya enseñaba el Inicio global. */
export function WebCard({
  attentionCount,
  restaurantCount,
}: {
  /** Nulo: no se ha podido calcular (se dice, no se pone un cero). */
  attentionCount: number | null;
  restaurantCount: number | null;
}) {
  const t = es.app.home.web;
  return (
    <section aria-label={`${es.common.appName} ${es.common.productSuffix.web}`}>
      <Card className="flex flex-col gap-4">
        <ProductHeader
          icon="monitor"
          suffix="web"
          tagline={t.tagline}
          badge={<StatusBadge tone="success">{t.active}</StatusBadge>}
        />
        <div className="rounded-field bg-soft-surface p-4">
          <div className="grid grid-cols-2 gap-3">
            {attentionCount === null ? null : (
              <Stat value={attentionCount} label={t.statAttention(attentionCount)} />
            )}
            {restaurantCount === null ? null : (
              <Stat value={restaurantCount} label={t.statRestaurants(restaurantCount)} />
            )}
          </div>
          {attentionCount === null ? (
            <p className="text-sm text-text-secondary">{t.attentionUnknown}</p>
          ) : null}
        </div>
        <ButtonLink href="/web" variant="primary" trailingIcon="chevronRight" className="min-h-[48px] w-full">
          {t.enter}
        </ButtonLink>
      </Card>
    </section>
  );
}

/** Restavor web sin contratar: lo que se ve cuando no hay nada de mantenimiento. */
export function WebCardEmpty() {
  const t = es.app.home.web;
  return (
    <section aria-label={`${es.common.appName} ${es.common.productSuffix.web}, ${t.none}`}>
      <Card className="flex flex-col gap-4 border-dashed bg-background">
        <ProductHeader
          icon="monitor"
          suffix="web"
          tagline={t.tagline}
          badge={<StatusBadge tone="neutral">{t.none}</StatusBadge>}
        />
        <p className="text-sm text-text-secondary">{t.noneBody}</p>
        <ButtonLink href="/web" variant="outline" className="min-h-[44px]">
          {t.noneButton}
        </ButtonLink>
      </Card>
    </section>
  );
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "active") return "success";
  if (status === "approved_pending_payment" || status === "paused" || status === "ending") return "warning";
  if (status === "past_due") return "danger";
  return "neutral";
}

/** Restavor agents contratado: un renglón por restaurante con Reservas. */
export function AgentsCard({ rows }: { rows: readonly ProductRow[] }) {
  const t = es.app.home.agents;
  return (
    <section aria-label={`${es.common.appName} ${es.common.productSuffix.agents}`}>
      <Card className="flex flex-col gap-4">
        <ProductHeader icon="sparkles" suffix="agents" tagline={t.tagline} />
        <ul className="divide-y divide-border rounded-field bg-soft-surface px-4">
          {rows.map((row) => (
            <li key={`${row.establishmentId}`} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">
                {t.reservationsOf(row.establishmentName ?? "")}
              </span>
              {isReservationServiceStatus(row.detail) ? (
                <StatusBadge tone={statusTone(row.detail)}>{t.status[row.detail]}</StatusBadge>
              ) : null}
            </li>
          ))}
        </ul>
        {/* CLAUDE.md · sin datos de relleno: lo que aún no existe se dice con su motivo. */}
        <div>
          <p className="text-sm font-semibold text-text">{t.notConnectedTitle}</p>
          <p className="text-sm text-text-secondary">{t.notConnectedReason}</p>
        </div>
        <ButtonLink href="/agents" trailingIcon="chevronRight" className="min-h-[48px] w-full">
          {t.enter}
        </ButtonLink>
      </Card>
    </section>
  );
}

const STEPS = ["sent", "review", "pay", "use"] as const;

/** `AppInicioEstados` · «Solicitud enviada»: los cuatro pasos, con el segundo en curso. */
export function RequestedCard({ row }: { row: ProductRow }) {
  const t = es.app.home.agents;
  const textos = {
    sent: [t.steps.sent, row.at === null ? t.steps.sentBody("Enviada") : t.steps.sentBody(fechaCorta(row.at))],
    review: [t.steps.review, t.steps.reviewBody],
    pay: [t.steps.pay, t.steps.payBody],
    use: [t.steps.use, t.steps.useBody],
  } as const;
  return (
    <section aria-label={`${es.common.appName} ${es.common.productSuffix.agents}, ${t.requestedBadge}`}>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary-dark">
            <Icon name="sparkles" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-primary-dark">
              {es.common.appName}{" "}
              <span className="font-medium text-text-secondary">{es.common.productSuffix.agents}</span>
              {t.cardSuffix}
            </span>
            <span className="block truncate text-xs text-text-secondary">
              {t.requestedSubtitle(row.establishmentName ?? "")}
            </span>
          </span>
          <StatusBadge tone="info">{t.requestedBadge}</StatusBadge>
        </div>
        <ol aria-label={t.stepsLabel} className="space-y-3 rounded-field bg-soft-surface p-4">
          {STEPS.map((paso, indice) => (
            <li key={paso} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                  indice === 0
                    ? "bg-success text-surface"
                    : indice === 1
                      ? "bg-primary text-surface"
                      : "border border-border bg-surface text-text-secondary"
                }`}
              >
                {indice === 0 ? <Icon name="tick" className="h-4 w-4" /> : indice + 1}
              </span>
              <span className="min-w-0">
                <strong className="block text-[15px] text-text">{textos[paso][0]}</strong>
                <span className="block text-sm text-text-secondary">{textos[paso][1]}</span>
              </span>
            </li>
          ))}
        </ol>
        <div>
          <Link
            href="/mensajes"
            className="inline-flex min-h-[44px] items-center rounded-field px-3 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
          >
            {t.writeToRestavor}
          </Link>
        </div>
      </Card>
    </section>
  );
}

/** `AppInicioEstados` · «No aprobada», con el motivo que escribió Restavor. */
export function RejectedCard({ row, offer }: { row: ProductRow; offer: ContractOffer | null }) {
  const t = es.app.home.agents;
  return (
    <section aria-label={`${es.common.appName} ${es.common.productSuffix.agents}, ${t.rejectedBadge}`}>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary-dark">
            <Icon name="sparkles" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-primary-dark">
              {es.common.appName}{" "}
              <span className="font-medium text-text-secondary">{es.common.productSuffix.agents}</span>
              {t.cardSuffix}
            </span>
            <span className="block truncate text-xs text-text-secondary">{row.establishmentName}</span>
          </span>
          <StatusBadge tone="danger">{t.rejectedBadge}</StatusBadge>
        </div>
        <p className="text-sm text-text">{t.rejectedTitle}</p>
        <div className="rounded-field border border-danger/30 bg-danger/5 p-4">
          <strong className="block text-sm text-text">{t.rejectedWhy}</strong>
          <p className="mt-1 text-sm text-text">{row.reason ?? t.rejectedNoReason}</p>
          {row.at === null ? null : (
            <p className="mt-1 text-xs tabular-nums text-text-secondary">{fechaCorta(row.at)}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {offer === null ? null : (
            <div className="min-w-[220px] flex-1">
              <ContratarReservas offers={[offer]}>{t.askAgain}</ContratarReservas>
            </div>
          )}
          <Link
            href="/mensajes"
            className="inline-flex min-h-[44px] items-center rounded-field px-3 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
          >
            {t.writeToRestavor}
          </Link>
        </div>
      </Card>
    </section>
  );
}

/** Restavor agents sin contratar: lo que se ofrece, con «Contratar Reservas». */
export function AgentsOfferCard({ offers }: { offers: readonly ContractOffer[] }) {
  const t = es.app.home.agents;
  return (
    <section aria-label={`${es.common.appName} ${es.common.productSuffix.agents}, ${t.offerBadge}`}>
      <Card className="flex flex-col gap-4 border-dashed bg-background">
        <ProductHeader
          icon="sparkles"
          suffix="agents"
          tagline={t.taglineOffer}
          badge={<StatusBadge tone="neutral">{t.offerBadge}</StatusBadge>}
        />
        <div className="space-y-2.5">
          <strong className="block text-base text-text">{t.offerTitle}</strong>
          {offers.length === 1 ? (
            <p className="text-sm text-text-secondary">{t.offerFor(offers[0].name)}</p>
          ) : null}
          {t.offerBullets.map((line) => (
            <p key={line} className="flex items-start gap-2.5 text-[15px] leading-snug text-text">
              <Icon name="tick" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-success" />
              {line}
            </p>
          ))}
        </div>
        <ContratarReservas offers={offers}>{t.contract}</ContratarReservas>
      </Card>
    </section>
  );
}
