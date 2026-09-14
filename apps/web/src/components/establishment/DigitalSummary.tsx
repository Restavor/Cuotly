import { Card } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { INTEGRATION_PROVIDERS, minimumCoveredDays, SUMMARY_WINDOW_DAYS } from "@/core/integrations";
import { es } from "@/i18n/es";

import { formatDay, formatMoment, type DigitalSummaryView, type ProviderSummary } from "./integrations-load";

const t = es.integrations;

/**
 * "Informes y datos" › Analítica digital (§178, RN-INT-07). Por fuente:
 * o el motivo de no tener cifra —los cinco de §178, decididos en
 * `summaryReason()`— o las cifras de la ventana con su antigüedad ("datos
 * hasta", "sincronizado el"). Nunca una cifra vieja como actual, nunca
 * una de relleno (CLAUDE.md MUST NOT).
 */
export function DigitalSummary({ view, title, hint }: { view: DigitalSummaryView; title: string; hint: string }) {
  return (
    <Card title={title} action={<span className="text-xs text-text-secondary">{t.summaryWindow}</span>}>
      <p className="mb-3 text-sm text-text-secondary">{hint}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {INTEGRATION_PROVIDERS.map((provider) => {
          const resumen = view.providers.find((p) => p.provider === provider);
          if (!resumen) return null;
          return (
            <section
              key={provider}
              data-testid={`digital-${provider}`}
              data-reason={resumen.reason ?? "ok"}
              className="rounded-lg border border-border p-3"
            >
              <h4 className="font-semibold text-text">{t.providers[provider].name}</h4>
              <ProviderSummaryView resumen={resumen} view={view} />
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function formatValue(value: number, aggregate: "sum" | "mean" | "latest"): string {
  if (aggregate === "mean") return value.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function ProviderSummaryView({ resumen, view }: { resumen: ProviderSummary; view: DigitalSummaryView }) {
  const antiguedad = (
    <p className="mt-2 text-xs text-text-secondary">
      {resumen.lastSuccessAt ? t.syncedAt(formatMoment(resumen.lastSuccessAt, view.timezone)) : null}
    </p>
  );

  if (resumen.reason !== null) {
    const titulo =
      resumen.reason === "not_connected"
        ? t.notConnectedTitle
        : resumen.reason === "no_data_yet"
          ? t.noDataTitle
          : resumen.reason === "error"
            ? t.errorTitle
            : resumen.reason === "stale"
              ? t.staleTitle
              : t.insufficientTitle;
    return (
      <div className="mt-2">
        <EmptyReason reason={resumen.reason} title={titulo} />
        {resumen.reason === "error" && resumen.lastError ? (
          <p className="mt-2 text-xs text-danger">{resumen.lastError}</p>
        ) : null}
        {resumen.reason === "insufficient_period" && minimumCoveredDays(resumen.provider) > 1 ? (
          <p className="mt-2 text-xs text-text-secondary">
            {t.coveredDays(resumen.coveredDays, SUMMARY_WINDOW_DAYS)}
          </p>
        ) : null}
        {resumen.reason === "stale" || resumen.reason === "error" ? antiguedad : null}
      </div>
    );
  }

  const hasta = resumen.values.reduce<string | null>(
    (max, v) => (v.lastPeriodEnd !== null && (max === null || v.lastPeriodEnd > max) ? v.lastPeriodEnd : max),
    null,
  );

  return (
    <div className="mt-2">
      <dl className="grid grid-cols-2 gap-2">
        {resumen.values.map((v) => (
          <div key={v.metric} className="rounded-lg bg-soft-surface p-2">
            <dt className="text-xs text-text-secondary">
              {(t.metrics as Record<string, string | undefined>)[v.metric] ?? v.metric}
            </dt>
            {v.aggregate === "latest" ? (
              <dd className="text-sm text-text">
                {v.byDimension.length === 0
                  ? "—"
                  : v.byDimension.map((d) => (
                      <span key={d.dimension} className="mr-2">
                        {(t.strategies as Record<string, string | undefined>)[d.dimension] ?? d.dimension}:{" "}
                        <span className="font-semibold">{formatValue(d.value, "latest")}</span>
                      </span>
                    ))}
              </dd>
            ) : (
              <dd className="text-lg font-semibold text-primary-dark">
                {v.value === null ? "—" : formatValue(v.value, v.aggregate)}
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-text-secondary">
        {hasta ? t.dataUntil(formatDay(hasta, view.timezone)) : null}
        {/* Una fuente semanal es una medición, no una serie de días. */}
        {hasta && minimumCoveredDays(resumen.provider) > 1 ? " · " : null}
        {minimumCoveredDays(resumen.provider) > 1 ? t.coveredDays(resumen.coveredDays, SUMMARY_WINDOW_DAYS) : null}
      </p>
      {antiguedad}
    </div>
  );
}
