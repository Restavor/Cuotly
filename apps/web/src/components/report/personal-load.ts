/**
 * §90 · el informe personal del trabajador (RN-REP-02).
 *
 * Las filas las da `worker_report_dataset()`, que **comprueba quién
 * pregunta**: el trabajador solo puede pedir el suyo. Las cuentas las hace
 * `src/core/reports.ts` con el reloj contractual, igual que los
 * indicadores de §91 — y por lo mismo: el cumplimiento de un plazo no se
 * puede medir en horas de calendario.
 */

import { contractualCalendar, holidaysKnownAsOf } from "@/core/business-clock";
import {
  type ReportPeriod,
  type WorkerPersonalReport,
  workerPersonalReport,
} from "@/core/reports";
import { reportsClient } from "@/lib/supabase/reports-client";
import { parseOperationDataset } from "@/services/report-generation";

export interface PersonalReportInput {
  readonly spaceId: string;
  readonly userId: string;
  readonly period: ReportPeriod;
  readonly timezone: string;
}

export async function loadPersonalReport(
  client: unknown,
  input: PersonalReportInput,
): Promise<WorkerPersonalReport | null> {
  const supabase = reportsClient(client);

  const { data, error } = await supabase.rpc("worker_report_dataset", {
    p_space_id: input.spaceId,
    p_user_id: input.userId,
    p_from: input.period.start,
    p_to: input.period.end,
  });

  if (error || data === null) return null;

  const raw = data as Record<string, unknown>;
  const dataset = parseOperationDataset({ ...raw, requests: [], consumption: [], menus: [] });

  const { data: holidays } = await supabase
    .from("holidays")
    .select("holiday_date, created_at")
    .eq("space_id", input.spaceId);

  const calendar = contractualCalendar(
    input.timezone,
    holidaysKnownAsOf(
      (holidays ?? []).map((row: { holiday_date: string; created_at: string }) => ({
        date: row.holiday_date,
        configuredAt: new Date(row.created_at),
      })),
      new Date(`${input.period.start}T00:00:00Z`),
    ),
  );

  return workerPersonalReport({
    workerId: input.userId,
    currentLoadPoints: Number(raw.current_load_points ?? 0),
    historicalPoints: Number(raw.historical_points ?? 0),
    jobs: dataset.jobs,
    blocks: dataset.blocks,
    correctionsRequested: dataset.correctionsRequested,
    calendar,
    measuredAt: new Date(),
  });
}
