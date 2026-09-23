import { isReportLevel, reportLevelRank, type ReportLevel } from "@/core/reports";
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
}

export interface CatalogueService {
  readonly id: string;
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
}

export interface PlanCatalogue {
  readonly plans: readonly CataloguePlan[];
  readonly services: readonly CatalogueService[];
  readonly planVersions: readonly ConditionsVersion[];
  readonly serviceVersions: readonly ConditionsVersion[];
  readonly subscriptions: readonly ActiveSubscription[];
  readonly establishments: ReadonlyMap<string, string>;
  readonly canPublish: boolean;
  /** Si algo no se pudo leer: la pantalla lo dice en vez de pintar vacío. */
  readonly failed: boolean;
}

export async function loadPlanCatalogue(supabase: Supabase, spaceId: string): Promise<PlanCatalogue> {
  const [plans, services, planVersions, serviceVersions, subscriptions, establishments, { data: canPublish }] =
    await Promise.all([
      supabase
        .from("plans")
        .select(
          "id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours, execution_sla_small, execution_sla_photo, execution_sla_medium, execution_sla_large, can_order_requests, queue_rank, grants_priority, watches_reviews, report_level",
        )
        .eq("space_id", spaceId)
        .order("price_cents"),
      supabase
        .from("services")
        .select("id, name, kind, price_cents, price_premium_cents, included_updates")
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
    ]);

  return {
    plans: (plans.data ?? []).map((p) => {
      const level: ReportLevel = isReportLevel(p.report_level) ? p.report_level : "basic";
      return {
        id: p.id,
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
      };
    }),
    services: (services.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind === "daily_menu" ? "daily_menu" : "other",
      priceCents: s.price_cents,
      pricePremiumCents: s.price_premium_cents,
      includedUpdates: s.included_updates,
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
    })),
    establishments: new Map((establishments.data ?? []).map((e) => [e.id, e.name])),
    canPublish: canPublish === true,
    failed: [plans, services, planVersions, serviceVersions, subscriptions].some((r) => r.error !== null),
  };
}

export interface SubscriberTerms {
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
  subject: { readonly type: "plan" | "service"; readonly id: string },
): Promise<readonly SubscriberTerms[]> {
  const subs = catalogue.subscriptions.filter((s) =>
    subject.type === "plan" ? s.planId === subject.id : s.serviceId === subject.id,
  );
  const rows = await Promise.all(
    subs.map(async (s) => ({
      establishmentId: s.establishmentId,
      name: catalogue.establishments.get(s.establishmentId) ?? "—",
      terms: await loadSubscriptionTerms(supabase, s.id),
    })),
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
}
