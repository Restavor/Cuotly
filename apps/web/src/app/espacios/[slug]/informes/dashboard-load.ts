import { contractualCalendar, holidaysKnownAsOf } from "@/core/business-clock";
import { monthRange } from "@/core/client-activity";
import { operationalIndicators, type OperationalIndicators } from "@/core/reports";
import { digitalRow, issuedByOrigin, jobsPerWorker, previousMonth, type ProviderCell } from "@/core/space-reports";
import type { IntegrationProvider } from "@/core/integrations";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { digitalFigures, parseOperationDataset } from "@/services/report-generation";
import { createSupabaseReportGateway } from "@/services/report-gateway";

import { loadSpaceAttention } from "../home-load";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * M18 y M65 a M67 · las cifras de los paneles de Informes.
 *
 * Son **las mismas que salen en cada informe**: las funciones de
 * `report_operation_dataset()` y `report_finance_dataset()` pasadas por
 * `operationalIndicators()` (§91), y los puntos digitales por
 * `digitalFigures()` (§92). No hay ninguna métrica nueva.
 *
 * **La clave de servicio, y por qué es seguro aquí.** Esas funciones son
 * internas (cerradas a `authenticated`): leen el espacio entero de un
 * tirón, sin RLS. La generación de informes las llama igual y con la
 * misma precaución (`informes/actions.ts`): antes, **con la sesión de
 * quien mira**, se comprueba que tiene `manage_clients` en este espacio,
 * que es lo que exige la política de `reports`. `assertCanSeeReports()`
 * hace eso, y ninguna de las funciones de abajo se llama sin ella.
 */
export async function assertCanSeeReports(supabase: Supabase, spaceId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "manage_clients" });
  return data === true;
}

/** Del primer al último día del mes, como piden las funciones de los informes. */
function diasDelMes(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(ultimo).padStart(2, "0")}` };
}

function pasarela() {
  return createSupabaseReportGateway(createAdminClient());
}

export type OperationPanel = {
  readonly current: OperationalIndicators;
  readonly previous: OperationalIndicators | null;
  readonly workers: readonly { readonly userId: string; readonly name: string; readonly assigned: number; readonly completed: number }[];
  readonly attention: readonly {
    readonly id: string;
    readonly code: string;
    readonly establishment: string | null;
    readonly kind: "job_out_of_deadline" | "job_about_to_expire" | "job_blocked_by_client";
    readonly deepLink: string;
  }[];
};

export async function loadOperationPanel(
  supabase: Supabase,
  input: { spaceId: string; slug: string; establishmentId: string | null; month: string; timeZone: string; now: Date },
): Promise<OperationPanel> {
  const gateway = pasarela();
  const mes = diasDelMes(input.month);
  const anterior = diasDelMes(previousMonth(input.month));

  const [raw, rawAnterior, festivos, atencion] = await Promise.all([
    gateway.operationDataset(input.spaceId, input.establishmentId, mes.start, mes.end),
    gateway.operationDataset(input.spaceId, input.establishmentId, anterior.start, anterior.end).catch(() => null),
    gateway.holidays(input.spaceId),
    loadSpaceAttention(supabase, input.spaceId, input.slug, input.now).catch(() => null),
  ]);

  const calendario = (desde: string) =>
    contractualCalendar(input.timeZone, holidaysKnownAsOf(festivos, new Date(`${desde}T00:00:00Z`)));
  const dataset = parseOperationDataset(raw);
  const current = operationalIndicators(dataset, calendario(mes.start), input.now);
  const previous =
    rawAnterior === null
      ? null
      : operationalIndicators(parseOperationDataset(rawAnterior), calendario(anterior.start), input.now);

  const periodo = monthRange(input.month, input.timeZone);
  const porPersona = jobsPerWorker(dataset.jobs, { from: periodo.from, to: periodo.to });
  const ids = [...porPersona.keys()];
  const { data: perfiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));
  // RN-ASG-17 · por nombre, nunca por volumen.
  const workers = ids
    .map((id) => ({ userId: id, name: nombre.get(id) ?? "—", ...(porPersona.get(id) ?? { assigned: 0, completed: 0 }) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const attention = (atencion?.items ?? [])
    .filter(
      (i): i is typeof i & { kind: OperationPanel["attention"][number]["kind"] } =>
        (i.kind === "job_out_of_deadline" || i.kind === "job_about_to_expire" || i.kind === "job_blocked_by_client") &&
        (input.establishmentId === null || i.establishmentId === input.establishmentId),
    )
    .map((i) => ({ id: i.id, code: i.title, establishment: i.establishment, kind: i.kind, deepLink: i.deepLink }));

  return { current, previous, workers, attention };
}

export type FinancePanel = {
  readonly issued: number;
  readonly collected: number;
  readonly outstanding: number;
  readonly chargesOverdue: number;
  readonly origin: { readonly recurring: number; readonly extras: number; readonly other: number };
  readonly rows: readonly {
    readonly establishmentId: string;
    readonly name: string;
    readonly plan: string | null;
    readonly issued: number;
    readonly collected: number;
    readonly outstanding: number;
    readonly chargesOverdue: number;
  }[];
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadFinancePanel(
  supabase: Supabase,
  input: { spaceId: string; establishmentId: string | null; month: string; timeZone: string },
): Promise<FinancePanel> {
  const gateway = pasarela();
  const mes = diasDelMes(input.month);
  const periodo = monthRange(input.month, input.timeZone);

  let establecimientos = supabase.from("establishments").select("id, name").eq("space_id", input.spaceId).neq("status", "archived").order("name");
  if (input.establishmentId) establecimientos = establecimientos.eq("id", input.establishmentId);

  let cobros = supabase
    .from("charges")
    .select("total_cents, subscription_id, quote_id")
    .eq("space_id", input.spaceId)
    .gte("issued_at", periodo.from.toISOString())
    .lt("issued_at", periodo.to.toISOString());
  if (input.establishmentId) cobros = cobros.eq("establishment_id", input.establishmentId);

  const [total, { data: ests }, { data: charges }, { data: subs }] = await Promise.all([
    gateway.financeDataset(input.spaceId, input.establishmentId, mes.start, mes.end),
    establecimientos,
    cobros,
    supabase
      .from("subscriptions")
      .select("establishment_id, plan_id")
      .eq("space_id", input.spaceId)
      .eq("kind", "plan")
      .eq("status", "active"),
  ]);

  const planIds = [...new Set((subs ?? []).map((s) => s.plan_id).filter((x): x is string => x !== null))];
  const { data: plans } = planIds.length
    ? await supabase.from("plans").select("id, name").in("id", planIds)
    : { data: [] };
  const nombrePlan = new Map((plans ?? []).map((p) => [p.id, p.name]));
  const planDe = new Map((subs ?? []).map((s) => [s.establishment_id, s.plan_id ? (nombrePlan.get(s.plan_id) ?? null) : null]));

  const rows = await Promise.all(
    (ests ?? []).map(async (e) => {
      const raw = await gateway.financeDataset(input.spaceId, e.id, mes.start, mes.end);
      return {
        establishmentId: e.id,
        name: e.name,
        plan: planDe.get(e.id) ?? null,
        issued: num(raw.income_total_cents),
        collected: num(raw.collected_cents),
        outstanding: num(raw.outstanding_cents),
        chargesOverdue: num(raw.charges_overdue),
      };
    }),
  );

  return {
    issued: num(total.income_total_cents),
    collected: num(total.collected_cents),
    outstanding: num(total.outstanding_cents),
    chargesOverdue: num(total.charges_overdue),
    origin: issuedByOrigin(
      (charges ?? []).map((c) => ({ totalCents: c.total_cents, subscriptionId: c.subscription_id, quoteId: c.quote_id })),
    ),
    rows,
  };
}

export type DigitalPanel = {
  readonly rows: readonly {
    readonly establishmentId: string;
    readonly name: string;
    readonly sessions: number | null;
    readonly clicks: number | null;
    readonly providers: Record<IntegrationProvider, ProviderCell>;
    readonly lastUpdate: string | null;
  }[];
};

export async function loadDigitalPanel(
  supabase: Supabase,
  input: { spaceId: string; establishmentId: string | null; month: string; timeZone: string; now: Date },
): Promise<DigitalPanel> {
  const gateway = pasarela();
  const mes = diasDelMes(input.month);
  let consulta = supabase.from("establishments").select("id, name").eq("space_id", input.spaceId).neq("status", "archived").order("name");
  if (input.establishmentId) consulta = consulta.eq("id", input.establishmentId);
  const { data: ests } = await consulta;

  const rows = await Promise.all(
    (ests ?? []).map(async (e) => {
      const [estados, puntos] = await Promise.all([
        gateway.providerStates(e.id),
        gateway.metricPoints(e.id, mes.start, mes.end),
      ]);
      const fila = digitalRow(digitalFigures(puntos, estados, mes, input.now, input.timeZone));
      return { establishmentId: e.id, name: e.name, ...fila };
    }),
  );
  return { rows };
}
