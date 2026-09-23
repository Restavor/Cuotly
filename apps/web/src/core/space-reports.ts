/**
 * M18 y M65 a M67 · los paneles de Informes del espacio: Operación,
 * Finanzas y Rendimiento digital. Lo que esta pantalla decide por su
 * cuenta y nada más.
 *
 * **Ninguna métrica nueva.** Las cifras de operación son las de §91
 * (`operationalIndicators()`), las de finanzas las de §89.2
 * (`report_finance_dataset()`) y las digitales las de §92
 * (`digitalFigures()`), las mismas que salen en cada informe. Aquí solo se
 * elige el mes, se cuenta por persona y se reparte por origen.
 */
import { addMonths } from "./client-calendar";
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from "./integrations";
import type { ReportFigure } from "./reports";

export const SPACE_REPORT_TABS = ["operacion", "finanzas", "digital", "generados"] as const;
export type SpaceReportTab = (typeof SPACE_REPORT_TABS)[number];

export type SpaceReportParams = {
  readonly tab: SpaceReportTab;
  /** "YYYY-MM" en la zona del espacio. */
  readonly month: string;
  readonly establishmentId: string | null;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string {
  return ((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();
}

/**
 * La pestaña, el mes y el restaurante. Sin pestaña, la biblioteca si ya
 * venía filtrada (los enlaces de antes llevan esos filtros) y Operación si
 * no. Un mes mal escrito o futuro es el de hoy.
 */
export function readSpaceReportParams(params: Params, today: string): SpaceReportParams {
  const actual = today.slice(0, 7);
  const tab = uno(params.tab);
  const mes = uno(params.mes);
  const deBiblioteca = ["categoria", "estado", "grupo", "plan", "desde", "hasta"].some((k) => uno(params[k]) !== "");
  return {
    tab: (SPACE_REPORT_TABS as readonly string[]).includes(tab)
      ? (tab as SpaceReportTab)
      : deBiblioteca
        ? "generados"
        : "operacion",
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= actual ? mes : actual,
    establishmentId: uno(params.restaurante) || null,
  };
}

/** El mes anterior, para comparar (RN-REP-17: del mismo tamaño y pegado a este). */
export function previousMonth(month: string): string {
  return addMonths(month, -1);
}

/**
 * M65 · "Carga de trabajo por trabajador": cuántos trabajos del periodo
 * lleva cada persona y cuántos publicó dentro de él. Sin ordenar por
 * volumen: RN-ASG-17 prohíbe cualquier ranking entre trabajadores, así
 * que quien lo pinte ordena por nombre.
 */
export function jobsPerWorker(
  jobs: readonly {
    readonly assigneeId: string | null;
    readonly publishedAt: Date | null;
  }[],
  period: { readonly from: Date; readonly to: Date },
): Map<string, { assigned: number; completed: number }> {
  const porPersona = new Map<string, { assigned: number; completed: number }>();
  for (const job of jobs) {
    if (job.assigneeId === null) continue;
    const fila = porPersona.get(job.assigneeId) ?? { assigned: 0, completed: 0 };
    fila.assigned += 1;
    if (job.publishedAt !== null && job.publishedAt >= period.from && job.publishedAt < period.to) {
      fila.completed += 1;
    }
    porPersona.set(job.assigneeId, fila);
  }
  return porPersona;
}

/**
 * M66 · "Mantenimiento recurrente vs. extras": lo emitido en el mes según
 * de dónde sale cada cobro. Del plan o de un servicio (su suscripción) es
 * recurrente; de un presupuesto (§84), extra. Un cobro sin ninguno de los
 * dos se cuenta aparte en vez de meterlo en uno de los otros.
 */
export function issuedByOrigin(
  charges: readonly {
    readonly totalCents: number;
    readonly subscriptionId: string | null;
    readonly quoteId: string | null;
  }[],
): { recurring: number; extras: number; other: number } {
  let recurring = 0;
  let extras = 0;
  let other = 0;
  for (const c of charges) {
    if (c.quoteId !== null) extras += c.totalCents;
    else if (c.subscriptionId !== null) recurring += c.totalCents;
    else other += c.totalCents;
  }
  return { recurring, extras, other };
}

/** Cómo está cada fuente en el mes: con dato, o el motivo de §178 por el que no lo hay. */
export type ProviderCell = { readonly kind: "ok" } | { readonly kind: "missing"; readonly reason: string };

/**
 * M67 · una fila de "Rendimiento por restaurante" a partir de las cifras
 * digitales del informe (`digitalFigures()`): las sesiones de GA4, los
 * clics de Search Console, cada fuente con dato o con su motivo, y la
 * última sincronización. Nada se suma entre fuentes: una sesión de GA4 y
 * una de Clarity no son la misma sesión.
 */
export function digitalRow(figures: readonly ReportFigure[]): {
  sessions: number | null;
  clicks: number | null;
  providers: Record<IntegrationProvider, ProviderCell>;
  lastUpdate: string | null;
} {
  const de = (provider: string, metric: string) =>
    figures.find((f) => f.section === "digital" && f.dimension === provider && f.metric === metric) ?? null;

  const providers = {} as Record<IntegrationProvider, ProviderCell>;
  let lastUpdate: string | null = null;
  for (const provider of INTEGRATION_PROVIDERS) {
    const suyas = figures.filter((f) => f.section === "digital" && f.dimension === provider);
    const conDato = suyas.some((f) => f.value !== null);
    const motivo = suyas.find((f) => f.noDataReason)?.noDataReason ?? "no_data_yet";
    providers[provider] = conDato ? { kind: "ok" } : { kind: "missing", reason: motivo };
    for (const f of suyas) {
      if (f.value !== null && f.at && (lastUpdate === null || f.at > lastUpdate)) lastUpdate = f.at;
    }
  }

  return {
    sessions: de("ga4", "sessions")?.value ?? null,
    clicks: de("search_console", "clicks")?.value ?? null,
    providers,
    lastUpdate,
  };
}
