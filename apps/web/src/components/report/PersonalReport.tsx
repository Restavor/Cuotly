import { Card } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import type { ReportPeriod, WorkerPersonalReport } from "@/core/reports";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";

const t = es.reportsPage;

/**
 * §90 · el informe personal del trabajador. Dos cosas que esta pantalla
 * dice en voz alta porque §55 y §90 las dicen:
 *
 *   · **La carga no es una nota de rendimiento**, y los puntos históricos
 *     van separados de la carga actual.
 *   · **No lleva finanzas.** Ni una cifra de dinero, aquí ni en el PDF.
 *
 * Las comparaciones con otros no están: solo las ven propietario y
 * administradores (§90), y a un trabajador enseñárselas sería el ranking
 * que §55 prohíbe.
 */
export function PersonalReport({
  report,
  period,
}: {
  report: WorkerPersonalReport | null;
  period: ReportPeriod;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.personalTitle}</h1>
        <p className="text-sm text-text-secondary">{t.personalSubtitle}</p>
        <p className="mt-1 text-sm text-text-secondary">
          {t.pdf.periodLine(fechaCorta(period.start), fechaCorta(period.end))}
        </p>
      </header>

      {report === null ? (
        <Card>
          <EmptyReason reason="error" title={es.states.errorTitle} />
        </Card>
      ) : (
        <>
          <Card title={t.personalMetrics.currentLoadPoints}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cifra label={t.personalMetrics.currentLoadPoints} value={String(report.currentLoadPoints)} />
              <Cifra label={t.personalMetrics.historicalPoints} value={String(report.historicalPoints)} />
            </div>
            <p className="mt-3 text-sm text-text-secondary">{t.loadIsNotAScore}</p>
          </Card>

          <Card title={es.nav.jobs}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cifra label={t.personalMetrics.jobsCompleted} value={String(report.jobsCompleted)} />
              <Cifra label={t.personalMetrics.jobsPending} value={String(report.jobsPending)} />
              <Cifra label={t.personalMetrics.jobsBlocked} value={String(report.jobsBlocked)} />
              <Cifra
                label={t.personalMetrics.correctionsRequested}
                value={String(report.correctionsRequested)}
              />
            </div>
          </Card>

          <Card title={t.personalDeadlines}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cifra
                label={t.personalMetrics.startCompliancePercent}
                value={porcentaje(report.startCompliancePercent)}
              />
              <Cifra
                label={t.personalMetrics.executionCompliancePercent}
                value={porcentaje(report.executionCompliancePercent)}
              />
              <Cifra
                label={t.personalMetrics.averageStartMinutes}
                value={minutos(report.averageStartMinutes)}
              />
              <Cifra
                label={t.personalMetrics.averageCompletionMinutes}
                value={minutos(report.averageCompletionMinutes)}
              />
            </div>
            <p className="mt-3 text-sm text-text-secondary">{t.comparisonsOnlyForManagers}</p>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * `null` no es cero: cero cumplimiento significa "todos mal" y no tener
 * ninguno significa que no hubo. Se dice cuál de las dos cosas es (CA-20).
 */
function porcentaje(value: number | null): string {
  return value === null ? t.pdf.noValue : t.units.percent(value);
}

function minutos(value: number | null): string {
  return value === null ? t.pdf.noValue : t.units.business_minutes(value);
}

function Cifra({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-soft-surface p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-lg font-semibold text-primary-dark">{value}</p>
    </div>
  );
}
