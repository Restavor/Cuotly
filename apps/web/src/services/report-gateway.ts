/**
 * `src/services/report-gateway.ts` — la mitad de Supabase de los informes
 * (Fase 3, Hito 16). Separado del generador por lo mismo que
 * `opportunity-gateway.ts` lo está del barrido: el generador decide y se
 * prueba entero con una interfaz falsa; aquí solo se traduce.
 *
 * Lo que hay son cuatro funciones reservadas a `service_role` (migración
 * 85) y dos lecturas de tablas que solo el servidor hace enteras.
 */

import type { HolidayRecord } from "@/core/business-clock";
import type { MetricPoint } from "@/core/integrations";
import {
  type ReportCategory,
  type ReportLevel,
  type ReportOpportunity,
  type ReportSectionState,
  highestReportLevel,
  isReportLevel,
} from "@/core/reports";

import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Las funciones de generación son SECURITY DEFINER reservadas a service_role
   y no están en `Database` (los tipos generados describen lo que puede tocar
   una sesión de usuario). El `any` se aísla en esta frontera, igual que en
   `opportunity-gateway.ts`. */
type AnyClient = SupabaseClient<any, any, any>;

async function rpc<T>(client: AnyClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** El informe tal y como lo necesita el generador. */
export interface ReportRow {
  readonly id: string;
  readonly spaceId: string;
  readonly establishmentId: string | null;
  readonly category: ReportCategory;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: string;
  readonly sections: readonly ReportSectionState[];
  readonly notes: Readonly<Record<string, string>>;
  readonly timezone: string;
  /**
   * RN-REP-15 · el nivel del plan del restaurante, que decide hasta dónde
   * llega el informe. Un **consolidado** no tiene restaurante y por tanto
   * no tiene plan: va en `complete`, porque es del espacio y no lo recibe
   * ningún cliente (decisión 30) — es la misma respuesta que da
   * `create_report_draft()` en SQL.
   */
  readonly reportLevel: ReportLevel;
}

export interface ProviderState {
  readonly provider: string;
  readonly status: string;
  readonly lastSuccessAt: string | null;
}

export interface ReportGateway {
  report(reportId: string): Promise<ReportRow | null>;
  operationDataset(
    spaceId: string,
    establishmentId: string | null,
    from: string,
    to: string,
  ): Promise<Record<string, unknown>>;
  financeDataset(
    spaceId: string,
    establishmentId: string | null,
    from: string,
    to: string,
  ): Promise<Record<string, unknown>>;
  /** Los puntos del periodo, agrupados por fuente (como en el barrido de oportunidades). */
  metricPoints(
    establishmentId: string,
    from: string,
    to: string,
  ): Promise<ReadonlyMap<string, readonly MetricPoint[]>>;
  providerStates(establishmentId: string): Promise<readonly ProviderState[]>;
  /**
   * RN-REP-18 · lo que pasó en el periodo. `includeFinance` lo decide la
   * sección de Finanzas de ESE informe, no quien llama: sin ella, los
   * cobros no salen (RN-REP-16).
   */
  monthActivity(
    spaceId: string,
    establishmentId: string | null,
    from: string,
    to: string,
    includeFinance: boolean,
  ): Promise<Record<string, unknown>>;
  /** §96 · las oportunidades APROBADAS del periodo, que son las que entran. */
  approvedOpportunities(
    establishmentId: string,
    from: string,
    to: string,
  ): Promise<readonly ReportOpportunity[]>;
  holidays(spaceId: string): Promise<readonly HolidayRecord[]>;
  storeVersion(reportId: string, snapshot: unknown): Promise<string>;
  /** §95 · los informes cuya fecha ya llegó y los que la tienen a menos de 24 h. */
  reportsDueForSend(limit: number): Promise<readonly string[]>;
  reportsDueForReminder(limit: number): Promise<readonly string[]>;
  send(reportId: string): Promise<number>;
  notifyScheduleDueSoon(reportId: string): Promise<number>;
}

/**
 * PostgREST devuelve la relación anidada como objeto o como lista de uno
 * según cómo infiera la cardinalidad; el tipo de aquí es `any`, así que se
 * normaliza en un sitio en vez de confiar en la forma.
 */
function spaceTimezone(value: any): string {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.timezone ?? "Europe/Madrid";
}

/**
 * RN-REP-15 · el nivel del plan vigente de un restaurante.
 *
 * Se lee de las tablas y **no** por la función `establishment_report_level()`
 * de la migración 111: aquella comprueba que quien pregunta sea del espacio
 * o tenga acceso vivo al restaurante, y la generación corre como
 * `service_role`, sin `auth.uid()`. Llamarla desde aquí devolvería `basic`
 * siempre —su respuesta a quien no le corresponde— y todos los informes
 * saldrían recortados en silencio, que es la peor forma de fallar.
 *
 * El más alto de los planes vivos, que es lo que hace la propia función.
 */
async function establishmentReportLevel(client: AnyClient, establishmentId: string): Promise<ReportLevel> {
  const { data, error } = await client
    .from("subscriptions")
    .select("plans(report_level)")
    .eq("establishment_id", establishmentId)
    .eq("kind", "plan")
    .eq("status", "active");
  if (error) throw new Error(`subscriptions: ${error.message}`);

  const niveles = (data ?? [])
    .map((row: any) => {
      const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
      return plan?.report_level;
    })
    .filter((level: unknown): level is ReportLevel => typeof level === "string" && isReportLevel(level));

  // Sin plan vivo, `basic`: es lo que dice la migración 111, y no es un
  // caso raro —un restaurante dado de alta y aún sin contratar lo está—.
  return highestReportLevel(niveles);
}

export function createSupabaseReportGateway(client: AnyClient): ReportGateway {
  return {
    async report(reportId) {
      const { data, error } = await client
        .from("reports")
        .select(
          "id, space_id, establishment_id, category, period_start, period_end, status, spaces(timezone)",
        )
        .eq("id", reportId)
        .maybeSingle();
      if (error) throw new Error(`reports: ${error.message}`);
      if (!data) return null;

      const { data: sections, error: sectionsError } = await client
        .from("report_sections")
        .select("section_key, position, included, note")
        .eq("report_id", reportId)
        .order("position");
      if (sectionsError) throw new Error(`report_sections: ${sectionsError.message}`);

      const notes: Record<string, string> = {};
      for (const row of sections ?? []) {
        if (row.note) notes[row.section_key] = row.note;
      }

      return {
        id: data.id,
        spaceId: data.space_id,
        establishmentId: data.establishment_id,
        category: data.category,
        periodStart: data.period_start,
        periodEnd: data.period_end,
        status: data.status,
        sections: (sections ?? []).map((row: { section_key: string; position: number; included: boolean }) => ({
          key: row.section_key,
          position: row.position,
          included: row.included,
        })) as readonly ReportSectionState[],
        notes,
        timezone: spaceTimezone(data.spaces),
        reportLevel: data.establishment_id
          ? await establishmentReportLevel(client, data.establishment_id)
          : "complete",
      };
    },

    monthActivity(spaceId, establishmentId, from, to, includeFinance) {
      return rpc<Record<string, unknown>>(client, "report_month_activity", {
        p_space_id: spaceId,
        p_establishment_id: establishmentId,
        p_from: from,
        p_to: to,
        p_include_finance: includeFinance,
      });
    },

    operationDataset(spaceId, establishmentId, from, to) {
      return rpc<Record<string, unknown>>(client, "report_operation_dataset", {
        p_space_id: spaceId,
        p_establishment_id: establishmentId,
        p_from: from,
        p_to: to,
      });
    },

    financeDataset(spaceId, establishmentId, from, to) {
      return rpc<Record<string, unknown>>(client, "report_finance_dataset", {
        p_space_id: spaceId,
        p_establishment_id: establishmentId,
        p_from: from,
        p_to: to,
      });
    },

    async metricPoints(establishmentId, from, to) {
      // Por páginas de 1000, que es el `max_rows` de PostgREST: 28 días de
      // cinco fuentes con desgloses pasan de ahí (Hito 14 lo aprendió con
      // dos totales pedidos y un mes perdido).
      const byProvider = new Map<string, MetricPoint[]>();
      const size = 1000;
      for (let page = 0; ; page += 1) {
        const { data, error } = await client
          .from("metric_points")
          .select("provider, metric, dimension, value, unit, period_start, period_end")
          .eq("establishment_id", establishmentId)
          .gte("period_start", from)
          .lte("period_end", to)
          .order("period_start")
          .range(page * size, page * size + size - 1);
        if (error) throw new Error(`metric_points: ${error.message}`);
        for (const row of (data ?? []) as (MetricPoint & { provider: string })[]) {
          const list = byProvider.get(row.provider) ?? [];
          list.push({
            metric: row.metric,
            dimension: row.dimension,
            period_start: row.period_start,
            period_end: row.period_end,
            value: Number(row.value),
            unit: row.unit,
          });
          byProvider.set(row.provider, list);
        }
        if ((data?.length ?? 0) < size) break;
      }
      return byProvider;
    },

    async providerStates(establishmentId) {
      const { data, error } = await client
        .from("integrations")
        .select("provider, status, last_success_at")
        .eq("establishment_id", establishmentId);
      if (error) throw new Error(`integrations: ${error.message}`);
      return (data ?? []).map((row: { provider: string; status: string; last_success_at: string | null }) => ({
        provider: row.provider,
        status: row.status,
        lastSuccessAt: row.last_success_at,
      }));
    },

    async approvedOpportunities(establishmentId, from, to) {
      // Columna a columna: `opportunities` tiene el `select` concedido así
      // y un `select *` devuelve 403 (CLAUDE.md).
      const { data, error } = await client
        .from("opportunities")
        .select("id, rule_key, subject, title, impact, effort_category, period_start, period_end, status")
        .eq("establishment_id", establishmentId)
        .eq("status", "approved_for_report")
        .lte("period_start", to)
        .gte("period_end", from)
        .order("priority");
      if (error) throw new Error(`opportunities: ${error.message}`);
      return (data ?? []).map((row: any) => ({
        id: String(row.id),
        rule: row.rule_key ?? null,
        subject: String(row.subject ?? ""),
        title: row.title ?? null,
        impact: String(row.impact),
        effortCategory: row.effort_category ?? null,
      }));
    },

    async holidays(spaceId) {
      // RN-CLK-10 · con su fecha de alta: el calendario de un recálculo se
      // construye con los festivos que se conocían entonces, no con los de
      // hoy (`holidaysKnownAsOf`).
      const { data, error } = await client
        .from("holidays")
        .select("holiday_date, created_at")
        .eq("space_id", spaceId);
      if (error) throw new Error(`holidays: ${error.message}`);
      return (data ?? []).map(
        (row: { holiday_date: string; created_at: string }): HolidayRecord => ({
          date: row.holiday_date,
          configuredAt: new Date(row.created_at),
        }),
      );
    },

    storeVersion(reportId, snapshot) {
      return rpc<string>(client, "generate_report_version", {
        p_report_id: reportId,
        p_snapshot: snapshot,
      });
    },

    async reportsDueForSend(limit) {
      const rows = await rpc<readonly { report_id: string }[]>(client, "reports_due_for_send", {
        p_limit: limit,
      });
      return (rows ?? []).map((row) => row.report_id);
    },

    async reportsDueForReminder(limit) {
      const rows = await rpc<readonly { report_id: string }[]>(client, "reports_due_for_reminder", {
        p_limit: limit,
      });
      return (rows ?? []).map((row) => row.report_id);
    },

    send(reportId) {
      return rpc<number>(client, "send_report", { p_report_id: reportId });
    },

    notifyScheduleDueSoon(reportId) {
      return rpc<number>(client, "notify_report_schedule_due_soon", { p_report_id: reportId });
    },
  };
}
