import {
  isReportLevel,
  isReportPeriodKind,
  reportLevelRank,
  type ReportLevel,
  type ReportPeriodKind,
} from "@/core/reports";
import type { createClient } from "@/lib/supabase/server";

import { loadSubscriptionTerms, type SubscriptionTerms } from "./terms-load";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Lo que leen las pestañas de Planes y servicios (M21, M54, M55 y la lista
 * de M56). Todo lo filtra RLS: `plans`, `services`, sus versiones y las
 * suscripciones son del equipo del espacio (`is_space_member`), y un
 * restaurante no llega aquí. Las versiones se leen con sus columnas
 * enumeradas: `published_by` está revocada (migración 75, P7).
 */

export interface CataloguePlan {
  readonly id: string;
  /** Decisión 72 · el plan al que pertenece esta versión (`plans.lineage_id`). */
  readonly lineageId: string;
  readonly revision: number;
  readonly publishedAt: string;
  /** `null` es la versión vigente del plan. */
  readonly supersededAt: string | null;
  readonly archived: boolean;
  readonly name: string;
  readonly priceCents: number;
  readonly includedSmall: number;
  readonly includedPhoto: number;
  readonly includedMedium: number;
  readonly includedLarge: number;
  readonly startSlaHours: number;
  readonly executionSla: { readonly small: number; readonly photo: number; readonly medium: number; readonly large: number };
  readonly canOrderRequests: boolean;
  readonly queueRank: number;
  readonly grantsPriority: boolean;
  readonly watchesReviews: boolean;
  readonly reportLevel: ReportLevel;
  readonly reportLevelRank: number;
  /** RN-REP-32 · informe mensual o trimestral. */
  readonly reportPeriod: ReportPeriodKind;
}

export interface CatalogueService {
  readonly id: string;
  readonly lineageId: string;
  readonly revision: number;
  readonly publishedAt: string;
  readonly supersededAt: string | null;
  readonly archived: boolean;
  readonly name: string;
  readonly kind: "daily_menu" | "other";
  readonly priceCents: number;
  readonly pricePremiumCents: number | null;
  readonly includedUpdates: number;
}

export interface ConditionsVersion {
  readonly id: string;
  readonly subjectId: string;
  readonly version: number;
  readonly conditions: string;
  readonly publishedAt: string;
}

export interface ActiveSubscription {
  readonly id: string;
  readonly establishmentId: string;
  readonly planId: string | null;
  readonly serviceId: string | null;
  /** El linaje de lo que tiene: cuenta igual esté en la versión que esté. */
  readonly lineageId: string | null;
}

/** RN-COM-22 y 24 · un restaurante que no está en la versión vigente de lo suyo. */
export interface RevisionStatusRow {
  readonly subscriptionId: string;
  readonly establishmentId: string;
  readonly kind: "plan" | "service";
  readonly currentId: string;
  readonly currentRevision: number;
  readonly headId: string;
  readonly headRevision: number;
  readonly movesAt: string | null;
  readonly harms: boolean;
  readonly accepted: boolean;
  readonly state: string;
}

export interface PlanCatalogue {
  /** La versión vigente de cada plan (archivados incluidos, marcados). */
  readonly plans: readonly CataloguePlan[];
  /** Todas las versiones de todos los planes, para "Versiones". */
  readonly planRevisions: readonly CataloguePlan[];
  readonly services: readonly CatalogueService[];
  readonly serviceRevisions: readonly CatalogueService[];
  readonly revisionStatus: readonly RevisionStatusRow[];
  readonly planVersions: readonly ConditionsVersion[];
  readonly serviceVersions: readonly ConditionsVersion[];
  readonly subscriptions: readonly ActiveSubscription[];
  readonly establishments: ReadonlyMap<string, string>;
  readonly canPublish: boolean;
  /** Si algo no se pudo leer: la pantalla lo dice en vez de pintar vacío. */
  readonly failed: boolean;
}

export async function loadPlanCatalogue(supabase: Supabase, spaceId: string): Promise<PlanCatalogue> {
  const [plans, services, planVersions, serviceVersions, subscriptions, establishments, { data: canPublish }, revisions] =
    await Promise.all([
      supabase
        .from("plans")
        .select(
          "id, lineage_id, revision, published_at, superseded_at, archived_at, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large, can_order_requests, queue_rank, grants_priority, watches_reviews, report_level, report_period",
        )
        .eq("space_id", spaceId)
        .order("price_cents"),
      supabase
        .from("services")
        .select(
          "id, lineage_id, revision, published_at, superseded_at, archived_at, name, kind, price_cents, price_premium_cents, included_updates",
        )
        .eq("space_id", spaceId)
        .order("price_cents", { ascending: false }),
      supabase
        .from("plan_versions")
        .select("id, plan_id, version, conditions, published_at")
        .eq("space_id", spaceId),
      supabase
        .from("service_versions")
        .select("id, service_id, version, conditions, published_at")
        .eq("space_id", spaceId),
      supabase
        .from("subscriptions")
        .select("id, establishment_id, plan_id, service_id")
        .eq("space_id", spaceId)
        .eq("status", "active"),
      supabase.from("establishments").select("id, name").eq("space_id", spaceId),
      supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "manage_space" }),
      supabase.rpc("space_revision_status", { p_space_id: spaceId }),
    ]);

  const planRevisions: CataloguePlan[] = (plans.data ?? []).map((p) => {
    const level: ReportLevel = isReportLevel(p.report_level) ? p.report_level : "basic";
    return {
      id: p.id,
      lineageId: p.lineage_id,
      revision: p.revision,
      publishedAt: p.published_at,
      supersededAt: p.superseded_at,
      archived: p.archived_at !== null,
      name: p.name,
      priceCents: p.price_cents,
      includedSmall: p.included_small,
      includedPhoto: p.included_photo,
      includedMedium: p.included_medium,
      includedLarge: p.included_large,
      startSlaHours: p.start_sla_hours,
      executionSla: {
        small: p.execution_sla_small,
        photo: p.execution_sla_photo,
        medium: p.execution_sla_medium,
        large: p.execution_sla_large,
      },
      canOrderRequests: p.can_order_requests,
      queueRank: p.queue_rank,
      grantsPriority: p.grants_priority,
      watchesReviews: p.watches_reviews,
      reportLevel: level,
      reportLevelRank: reportLevelRank(level),
      reportPeriod: isReportPeriodKind(p.report_period) ? p.report_period : "month",
    };
  });
  const serviceRevisions: CatalogueService[] = (services.data ?? []).map((s) => ({
    id: s.id,
    lineageId: s.lineage_id,
    revision: s.revision,
    publishedAt: s.published_at,
    supersededAt: s.superseded_at,
    archived: s.archived_at !== null,
    name: s.name,
    kind: s.kind === "daily_menu" ? "daily_menu" : "other",
    priceCents: s.price_cents,
    pricePremiumCents: s.price_premium_cents,
    includedUpdates: s.included_updates,
  }));
  const planLineage = new Map(planRevisions.map((p) => [p.id, p.lineageId]));
  const serviceLineage = new Map(serviceRevisions.map((s) => [s.id, s.lineageId]));

  return {
    plans: planRevisions.filter((p) => p.supersededAt === null),
    planRevisions,
    services: serviceRevisions.filter((s) => s.supersededAt === null),
    serviceRevisions,
    revisionStatus: (revisions.data ?? []).map((r) => ({
      subscriptionId: r.subscription_id,
      establishmentId: r.establishment_id,
      kind: r.kind === "service" ? "service" : "plan",
      currentId: r.current_id,
      currentRevision: r.current_revision,
      headId: r.head_id,
      headRevision: r.head_revision,
      movesAt: r.moves_at,
      harms: r.harms,
      accepted: r.accepted,
      state: r.state,
    })),
    planVersions: (planVersions.data ?? []).map((v) => ({
      id: v.id,
      subjectId: v.plan_id,
      version: v.version,
      conditions: v.conditions,
      publishedAt: v.published_at,
    })),
    serviceVersions: (serviceVersions.data ?? []).map((v) => ({
      id: v.id,
      subjectId: v.service_id,
      version: v.version,
      conditions: v.conditions,
      publishedAt: v.published_at,
    })),
    subscriptions: (subscriptions.data ?? []).map((s) => ({
      id: s.id,
      establishmentId: s.establishment_id,
      planId: s.plan_id,
      serviceId: s.service_id,
      lineageId: s.plan_id !== null ? (planLineage.get(s.plan_id) ?? null) : s.service_id !== null ? (serviceLineage.get(s.service_id) ?? null) : null,
    })),
    establishments: new Map((establishments.data ?? []).map((e) => [e.id, e.name])),
    canPublish: canPublish === true,
    failed: [plans, services, planVersions, serviceVersions, subscriptions, revisions].some((r) => r.error !== null),
  };
}

export interface SubscriberTerms {
  readonly subscriptionId: string;
  readonly establishmentId: string;
  readonly name: string;
  readonly terms: SubscriptionTerms | null;
}

/**
 * M55 · quién tiene contratado un plan o servicio ahora y en qué versión
 * de sus condiciones está, según `subscription_terms()` (la misma función
 * que la ficha del restaurante, para que las dos digan lo mismo).
 */
export async function loadSubscribersTerms(
  supabase: Supabase,
  catalogue: PlanCatalogue,
  subject: { readonly type: "plan" | "service"; readonly lineageId: string },
): Promise<readonly SubscriberTerms[]> {
  // Todos los que tienen el plan, estén en la versión que estén.
  const subs = catalogue.subscriptions.filter(
    (s) => s.lineageId === subject.lineageId && (subject.type === "plan" ? s.planId !== null : s.serviceId !== null),
  );
  const rows = await Promise.all(
    subs.map(async (s) => ({
      subscriptionId: s.id,
      establishmentId: s.establishmentId,
      name: catalogue.establishments.get(s.establishmentId) ?? "—",
      terms: await loadSubscriptionTerms(supabase, s.id),
    })),
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
}
