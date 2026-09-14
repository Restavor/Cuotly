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
import { isChangeCategory } from "@/core/classification-rules";
import {
  type EvidenceMeasurement,
  type OpportunityImpact,
  type OpportunityRule,
  type OpportunityState,
  type PlanOpportunityAccess,
  type PlanShape,
  isOpportunityImpact,
  isOpportunityOrigin,
  isOpportunityRule,
  isOpportunityScope,
  isOpportunityState,
} from "@/core/opportunities";

import type { Database, Json } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

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

/**
 * `evidence` es `jsonb`, así que los tipos generados lo dan como `Json`:
 * lo que guarda es exactamente lo que escribió `src/core/opportunities.ts`,
 * y esta es la única conversión del archivo. Si llegara otra cosa —una
 * fila escrita a mano en el SQL Editor— se enseña vacío en vez de romper
 * la pantalla.
 */
function medidas(evidence: Json): readonly EvidenceMeasurement[] {
  return Array.isArray(evidence) ? (evidence as unknown as EvidenceMeasurement[]) : [];
}

export async function loadOpportunities(
  supabase: Client,
  establishmentId: string,
): Promise<OpportunitiesView> {
  const [{ data, error }, { data: access }] = await Promise.all([
    supabase
      .from("opportunities")
      // Enumeradas y en una sola cadena, no concatenadas: es como el
      // cliente tipado deduce la forma de la fila. `select *` sobre esta
      // tabla devolvería 403 (las columnas de identidad están revocadas).
      .select(
        "id, origin, rule_key, subject, category, scope, title, description, recommended_action, impact, priority, effort_category, include_in_report, status, status_reason, evidence, period_start, period_end, detection_count, first_detected_at, last_detected_at, approved_at, discarded_at, discard_reason, reopened_at",
      )
      .eq("establishment_id", establishmentId)
      .order("priority", { ascending: true })
      .order("last_detected_at", { ascending: false, nullsFirst: false }),
    supabase.rpc("client_opportunity_access", { p_establishment_id: establishmentId }),
  ]);
  if (error) throw new Error(`opportunities: ${error.message}`);

  /*
   * Los CHECK de la tabla ya garantizan que `origin`, `scope`, `impact`,
   * `status` y `effort_category` son de su lista, pero los tipos
   * generados los dan como `text`, que es lo que la columna ES. Se
   * comprueban aquí en vez de forzarlos con un `as`: una fila que no
   * cumpliera su propio CHECK no puede existir, y si existiera —escrita
   * a mano en el SQL Editor— es mejor dejarla fuera y decirlo en el
   * registro del servidor que inventarle un impacto para poder pintarla.
   */
  const descartadas: string[] = [];
  const rows = (data ?? [])
    .map((row): OpportunityRow | null => {
      const status = row.status ?? "";
      const origin = row.origin ?? "";
      const scope = row.scope ?? "";
      const impact = row.impact ?? "";
      const effort = row.effort_category;
      if (
        !isOpportunityState(status) ||
        !isOpportunityOrigin(origin) ||
        !isOpportunityScope(scope) ||
        !isOpportunityImpact(impact) ||
        (effort !== null && !isChangeCategory(effort))
      ) {
        descartadas.push(row.id);
        return null;
      }

      return {
        id: row.id,
        origin,
        rule: isOpportunityRule(row.rule_key ?? "") ? (row.rule_key as OpportunityRule) : null,
        subject: row.subject ?? "",
        category: row.category,
        scope,
        title: row.title,
        description: row.description,
        recommendedAction: row.recommended_action,
        impact,
        priority: row.priority,
        effortCategory: effort,
        includeInReport: row.include_in_report,
        status,
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
      };
    })
    .filter((row): row is OpportunityRow => row !== null);

  if (descartadas.length > 0) {
    console.error("[oportunidades] filas con un valor fuera de su lista", { establishmentId, descartadas });
  }

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
  const planRow = Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans;
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
