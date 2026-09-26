import { Card, ProgressBar } from "@/components/ui";
import type { CreditCostView, CreditItem } from "@/core/credits";
import { es } from "@/i18n/es";

/**
 * RN-CRE-11 y RN-CRE-16 · lo que cuesta una solicitud, como lo lee el
 * restaurante: en porcentaje de su plan, con lo que se va a hacer y el
 * plazo. Los créditos exactos no se enseñan aquí: el cliente compra una
 * capacidad, no una cuenta de créditos (decisión 85). Las partidas no
 * llevan porcentaje cada una: redondeadas por separado no sumarían el
 * total, y el total es lo que se acepta.
 */
export function CreditCostCard({
  view,
  items,
  summary,
}: {
  view: CreditCostView;
  items: readonly CreditItem[];
  summary: string | null;
}) {
  const t = es.credits;
  return (
    <Card title={t.costTitle}>
      {view.percentOfPlan === null ? (
        <p className="text-sm font-semibold text-text">{t.noCreditsPlan}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-base font-semibold text-text">{t.usesPercent(view.percentOfPlan)}</p>
          <ProgressBar percent={view.percentOfPlan} label={t.usesPercent(view.percentOfPlan)} />
          {view.remainingAfterPercent !== null ? (
            <p className="text-sm text-text-secondary">{t.leavesPercent(view.remainingAfterPercent)}</p>
          ) : null}
        </div>
      )}

      {items.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-text">{t.itemsTitle}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text">
            {items.map((item, i) => (
              <li key={`${i}-${item.description}`}>{item.description}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-text-secondary">{t.processingNote}</p>
        </div>
      ) : null}

      {summary ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-text">{t.summaryTitle}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{summary}</p>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-text-secondary">
        {view.slaRange ? t.slaRange(view.slaRange.minDays, view.slaRange.maxDays) : t.slaByTeam}
      </p>
    </Card>
  );
}
