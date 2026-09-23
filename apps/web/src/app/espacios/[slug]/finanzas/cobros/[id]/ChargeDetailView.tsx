import Link from "next/link";
import type { ReactNode } from "react";

import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
import { ButtonLink, Card, StatusBadge } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { ChargeEvent } from "@/core/finance-summary";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import { chargeTone } from "../../FinanceView";

const t = es.teamArea.finance;
type ChargeStateKey = keyof typeof es.teamArea.chargeStates;
type MethodKey = keyof typeof es.teamArea.methods;

export type ChargeDetailData = {
  readonly concept: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dueAt: string;
  readonly baseCents: number;
  readonly taxCents: number;
  readonly taxRatePercent: number;
  readonly totalCents: number;
  readonly receivedCents: number;
  readonly outstandingCents: number;
  readonly status: string;
  readonly establishment: {
    readonly id: string;
    readonly name: string;
    readonly code: string;
    readonly city: string | null;
    readonly photoUrl: string | null;
  };
  /** El plan o servicio del que sale, o `null` si no sale de ninguno. */
  readonly plan: { readonly name: string; readonly kind: "plan" | "service" } | null;
  readonly quoteId: string | null;
  readonly receipts: readonly {
    readonly fileId: string;
    readonly name: string;
    readonly side: string;
    readonly at: string;
  }[];
  readonly timeline: readonly ChargeEvent[];
};

/**
 * M17 · el detalle de un cobro, como el dibujo: quién y de qué plan, el
 * desglose, el justificante con la acción de registrar el pago, y el
 * historial. Las cifras llegan del servidor (`charge_status()`,
 * `charge_outstanding_cents()`, `charge_collected_cents()`).
 *
 * "Confirmar cobro" y "Registrar pago parcial" del dibujo son **un solo
 * formulario**: `register_payment()` recibe el importe, y si cubre lo
 * pendiente el cobro queda pagado; si no, parcial. Dos botones para la
 * misma operación harían pensar que son dos cosas distintas.
 */
export function ChargeDetailView({
  slug,
  timeZone,
  data,
  registerForm,
}: {
  slug: string;
  timeZone: string;
  data: ChargeDetailData;
  /** `null` cuando no queda nada pendiente. */
  registerForm: ReactNode | null;
}) {
  const base = `/espacios/${slug}`;
  const dia = (v: string) => enZona(v, timeZone, { day: "numeric", month: "short", year: "numeric" });
  const estado = es.teamArea.chargeStates[data.status as ChargeStateKey] ?? data.status;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`${base}/finanzas?tab=cobros`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-cuotly-green hover:underline"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          {t.backToCharges}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-primary-dark sm:text-[28px]">{data.concept}</h1>
          <StatusBadge tone={chargeTone(data.status)}>{estado}</StatusBadge>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {t.periodLine(dia(data.periodStart), dia(data.periodEnd))} · {t.dueLine(dia(data.dueAt))}
        </p>
      </div>

      <Card>
        <div className="grid gap-5 md:grid-cols-2 md:divide-x md:divide-border">
          <div className="flex items-center gap-4">
            <EstablishmentPhoto photoUrl={data.establishment.photoUrl} size={72} />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-primary-dark">{data.establishment.name}</p>
              <p className="text-sm text-text-secondary">
                {[data.establishment.code, data.establishment.city].filter(Boolean).join(" · ")}
              </p>
              <Link
                href={`${base}/restaurantes/${data.establishment.id}`}
                className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-cuotly-green hover:underline"
              >
                {t.seeEstablishment}
                <Icon name="arrowRight" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4 md:pl-5">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-cuotly-green/10 text-cuotly-green"
            >
              <Icon name={data.quoteId ? "document" : "plans"} className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-secondary">{t.planTitle}</p>
              <p className="font-semibold text-text">
                {data.plan?.name ?? (data.quoteId ? t.quoteOrigin : t.planNone)}
              </p>
            </div>
            {data.quoteId ? (
              <ButtonLink href={`${base}/finanzas/presupuestos/${data.quoteId}`} variant="outline" size="sm">
                {t.seeQuote}
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Card title={t.detailTitle}>
          <dl className="divide-y divide-border text-sm">
            <Linea termino={t.detailConcept} valor={data.concept} />
            <Linea termino={t.detailBase} valor={euros(data.baseCents)} />
            <Linea termino={t.detailTax(data.taxRatePercent)} valor={euros(data.taxCents)} />
            <Linea termino={t.detailTotal} valor={euros(data.totalCents)} fuerte />
          </dl>
          <dl className="mt-4 grid grid-cols-1 gap-3 rounded-[12px] bg-soft-surface p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-text-secondary">{t.detailReceived}</dt>
              <dd className="mt-1 font-semibold text-text">{euros(data.receivedCents)}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">{t.detailOutstanding}</dt>
              <dd className={`mt-1 font-semibold ${data.outstandingCents > 0 ? "text-danger" : "text-text"}`}>
                {euros(data.outstandingCents)}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">{t.detailStatus}</dt>
              <dd className="mt-1">
                <StatusBadge tone={chargeTone(data.status)}>{estado}</StatusBadge>
              </dd>
            </div>
          </dl>
        </Card>

        <Card title={t.receiptsTitle}>
          {data.receipts.length === 0 ? (
            <p className="text-sm text-text-secondary">{t.receiptsEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {data.receipts.map((r) => (
                <li
                  key={`${r.fileId}-${r.at}`}
                  className="flex items-center gap-3 rounded-[12px] border border-border p-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-primary-dark"
                  >
                    <Icon name="document" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{r.name}</span>
                    <span className="block text-xs text-text-secondary">
                      {r.side === "client" ? t.receiptFromClient : t.receiptFromTeam} ·{" "}
                      {t.receiptUploadedAt(enZona(r.at, timeZone, { dateStyle: "medium", timeStyle: "short" }))}
                    </span>
                  </span>
                  {/* RN-ARC-08: enlace privado y temporal, firmado tras
                      comprobar `can_read_file()`. */}
                  <a
                    href={`/api/archivos/${r.fileId}`}
                    aria-label={`${es.files.download} ${r.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-primary-dark hover:bg-cuotly-green/10"
                  >
                    <Icon name="download" className="h-4 w-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-border pt-4">
            {registerForm === null ? (
              <p className="text-sm text-text-secondary">{t.nothingToRegister}</p>
            ) : (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-text">{t.registerTitle}</h3>
                {registerForm}
                <p className="flex items-start gap-2 rounded-[10px] bg-soft-surface p-3 text-xs text-text-secondary">
                  <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                  {t.receiptReviewNote}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card title={t.historyTitle}>
        <div className="relative">
          <span aria-hidden="true" className="absolute bottom-3 left-[7px] top-3 w-0.5 bg-cuotly-green/30" />
          <ol className="space-y-4 pl-7">
            {data.timeline.map((e, i) => {
              const { icono, titulo, detalle } = describir(e, data.concept);
              return (
                <li key={`${e.kind}-${e.at}-${i}`} className="relative flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="absolute -left-7 top-1 h-4 w-4 rounded-full border-2 border-surface bg-cuotly-green"
                  />
                  <span className="w-24 shrink-0 text-sm sm:w-28">
                    <span className="block font-semibold text-text">{dia(e.at)}</span>
                    <span className="block text-xs text-text-secondary">
                      {enZona(e.at, timeZone, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cuotly-green/10 text-primary-dark"
                  >
                    <Icon name={icono} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="block text-sm font-semibold text-text">{titulo}</span>
                    {detalle ? <span className="block text-sm text-text-secondary">{detalle}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </Card>
    </div>
  );
}

function Linea({ termino, valor, fuerte = false }: { termino: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className={fuerte ? "font-semibold text-text" : "text-text-secondary"}>{termino}</dt>
      <dd className={fuerte ? "text-lg font-bold text-primary-dark" : "text-right text-text"}>{valor}</dd>
    </div>
  );
}

function describir(e: ChargeEvent, concepto: string): { icono: IconName; titulo: string; detalle: string | null } {
  switch (e.kind) {
    case "issued":
      return { icono: "finance", titulo: t.historyIssued, detalle: t.historyIssuedDetail(concepto) };
    case "receipt":
      return {
        icono: "upload",
        titulo: e.side === "client" ? t.historyReceiptClient : t.historyReceiptTeam,
        detalle: e.name,
      };
    case "payment":
      return {
        icono: "check",
        titulo: t.historyPayment,
        detalle: t.historyPaymentDetail(
          euros(e.amountCents),
          es.teamArea.methods[e.method as MethodKey] ?? e.method,
        ),
      };
    case "reversal":
      return {
        icono: "xCircle",
        titulo: t.historyReversal,
        detalle: [euros(e.amountCents), e.reason].filter(Boolean).join(" · "),
      };
  }
}
