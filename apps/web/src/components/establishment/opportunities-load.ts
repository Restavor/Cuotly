/**
 * `src/components/establishment/opportunities-load.ts` — lo que las
 * pantallas de Oportunidades leen (Fase 3, Hito 15; §96 a §101).
 *
 * Quién ve qué NO se decide aquí: la política de RLS de `opportunities`
 * (migración 84) devuelve al restaurante solo las aprobadas que su plan le
 * deja ver, y al equipo las de los restaurantes que gestiona. Esto lee lo
 * que la sesión pueda leer y lo ordena.
 *
 * Las columnas se enumeran una a una a propósito: `select *` sobre esta
 * tabla devuelve 403, porque las columnas con identidad del equipo están
 * revocadas (CLAUDE.md).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { type ChangeCategory, calculateConsumptionBalance } from "@/core/consumption-ledger";
import {
  type EvidenceMeasurement,
  type OpportunityImpact,
  type OpportunityRule,
  type OpportunityState,
  type PlanOpportunityAccess,
  type PlanShape,
  isOpportunityRule,
  isOpportunityState,
} from "@/core/opportunities";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Las tablas y funciones de la migración 84 todavía no están en
   `database.types.ts`: ese archivo se regenera CONTRA EL PROYECTO REAL
   cada vez que se aplica una migración (dice de sí mismo que no se edita
   a mano), y la 84 la aplica Bosco cuando lo decide. Hasta entonces el
   cliente tipado no las conoce y el `any` se queda aquí, en la frontera,
   como en `integration-gateway.ts`. Cuando la 84 esté aplicada y los
   tipos regenerados, esto vuelve a `SupabaseClient<Database>` y las
   conversiones de abajo sobran. */
type Client = SupabaseClient<any, any, any>;

const COLUMNAS =
  "id, origin, rule_key, subject, category, scope, title, description, recommended_action, " +
  "impact, priority, effort_category, include_in_report, status, status_reason, evidence, " +
  "period_start, period_end, detection_count, first_detected_at, last_detected_at, approved_at, " +
  "discarded_at, discard_reason, reopened_at";

export interface OpportunityRow {
  readonly id: string;
  readonly origin: "automatic" | "manual";
  /** `null` en una añadida a mano (§97): esa lleva título escrito. */
  readonly rule: OpportunityRule | null;
  readonly subject: string;
  readonly category: string;
  readonly scope: "basic" | "advanced";
  readonly title: string | null;
  readonly description: string | null;
  readonly recommendedAction: string | null;
  readonly impact: OpportunityImpact;
  readonly priority: number;
  readonly effortCategory: ChangeCategory | null;
  readonly includeInReport: boolean;
  readonly status: OpportunityState;
  readonly statusReason: string | null;
  readonly evidence: readonly EvidenceMeasurement[];
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly detectionCount: number;
  readonly firstDetectedAt: string | null;
  readonly lastDetectedAt: string | null;
  readonly approvedAt: string | null;
  /** §99 · el descarte anterior, que se sigue indicando si la oportunidad vuelve. */
  readonly discardedAt: string | null;
  readonly discardReason: string | null;
  readonly reopenedAt: string | null;
}

export interface OpportunitiesView {
  readonly rows: readonly OpportunityRow[];
  /** §101 · qué deja ver el plan vigente. El equipo lo ve para saber qué ve su cliente. */
  readonly access: PlanOpportunityAccess;
  /** El plan vigente, para decir el esfuerzo en palabras del plan (decisión 26b). */
  readonly plan: PlanShape | null;
  /** Saldo del ciclo vigente por categoría, del libro (RN-DAT-04). */
  readonly remaining: Readonly<Record<ChangeCategory, number>> | null;
}

const CATEGORIES: readonly ChangeCategory[] = ["small", "photo", "medium", "large"];

/** `evidence` es `jsonb`: lo que guarda es lo que escribió `src/core/opportunities.ts`. */
function medidas(evidence: any): readonly EvidenceMeasurement[] {
  return Array.isArray(evidence) ? (evidence as EvidenceMeasurement[]) : [];
}

export async function loadOpportunities(
  supabase: Client,
  establishmentId: string,
): Promise<OpportunitiesView> {
  const [{ data, error }, { data: access }] = await Promise.all([
    supabase
      .from("opportunities")
      .select(COLUMNAS)
      .eq("establishment_id", establishmentId)
      .order("priority", { ascending: true })
      .order("last_detected_at", { ascending: false, nullsFirst: false }),
    supabase.rpc("client_opportunity_access", { p_establishment_id: establishmentId }),
  ]);
  if (error) throw new Error(`opportunities: ${error.message}`);

  const rows = (data ?? []).map((row: any): OpportunityRow => ({
    id: row.id,
    origin: row.origin,
    rule: isOpportunityRule(row.rule_key ?? "") ? (row.rule_key as OpportunityRule) : null,
    subject: row.subject ?? "",
    category: row.category,
    scope: row.scope,
    title: row.title,
    description: row.description,
    recommendedAction: row.recommended_action,
    impact: row.impact,
    priority: row.priority,
    effortCategory: row.effort_category,
    includeInReport: row.include_in_report,
    status: isOpportunityState(row.status ?? "") ? (row.status as OpportunityState) : "detected",
    statusReason: row.status_reason,
    evidence: medidas(row.evidence),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    detectionCount: row.detection_count,
    firstDetectedAt: row.first_detected_at,
    lastDetectedAt: row.last_detected_at,
    approvedAt: row.approved_at,
    discardedAt: row.discarded_at,
    discardReason: row.discard_reason,
    reopenedAt: row.reopened_at,
  }));

  const { plan, remaining } = await loadPlanAndBalance(supabase, establishmentId);

  return {
    rows,
    access: (access as PlanOpportunityAccess | null) ?? "none",
    plan,
    remaining,
  };
}

/**
 * El plan vigente y el saldo del ciclo abierto, que es lo que convierte
 * "esfuerzo: mediano" en "te gasta 1 de los 3 medianos que te quedan"
 * (decisión 26b). El saldo sale de SUMAR el libro, nunca de un contador
 * (CLAUDE.md); sin plan o sin ciclo abierto se devuelve `null` y la
 * pantalla dice que no lo sabe en vez de enseñar un cero.
 */
async function loadPlanAndBalance(
  supabase: Client,
  establishmentId: string,
): Promise<{ plan: PlanShape | null; remaining: Record<ChangeCategory, number> | null }> {
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, plans (included_small, included_photo, included_medium, included_large, grants_priority)")
    .eq("establishment_id", establishmentId)
    .eq("kind", "plan")
    .eq("status", "active")
    .limit(1);

  const sub = subs?.[0];
  // La relación llega como objeto o como lista de uno según la consulta.
  const planRow: any = Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans;
  if (!sub || !planRow) return { plan: null, remaining: null };

  const plan: PlanShape = {
    includedSmall: planRow.included_small,
    includedPhoto: planRow.included_photo,
    includedMedium: planRow.included_medium,
    includedLarge: planRow.included_large,
    grantsPriority: planRow.grants_priority,
  };

  const { data: cycles } = await supabase
    .from("consumption_cycles")
    .select("id, included_small, included_photo, included_medium, included_large")
    .eq("subscription_id", sub.id)
    .order("cycle_start", { ascending: false })
    .limit(1);

  const cycle = cycles?.[0];
  if (!cycle) return { plan, remaining: null };

  const { data: entries } = await supabase
    .from("consumption_entries")
    .select("category, amount")
    .eq("consumption_cycle_id", cycle.id);

  const incluidas: Record<ChangeCategory, number> = {
    small: cycle.included_small,
    photo: cycle.included_photo,
    medium: cycle.included_medium,
    large: cycle.included_large,
  };

  const remaining = Object.fromEntries(
    CATEGORIES.map((categoria) => [
      categoria,
      calculateConsumptionBalance(
        incluidas[categoria],
        (entries ?? []).filter((e) => e.category === categoria).map((e) => ({ amount: e.amount })),
      ),
    ]),
  ) as Record<ChangeCategory, number>;

  return { plan, remaining };
}
