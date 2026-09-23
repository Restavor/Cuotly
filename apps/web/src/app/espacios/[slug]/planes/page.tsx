import { notFound, redirect } from "next/navigation";

import { NoPermissionState, PageHeader } from "@/components/ui";
import { readPlansParams } from "@/core/plan-catalogue";
import { commitmentIsCurrent } from "@/core/plans";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadPlanCatalogue, loadSubscribersTerms } from "./catalogue-load";
import {
  PlanCatalogueTab,
  PlansTabs,
  RestaurantsTab,
  ServicesTab,
  VersionsTab,
  type RestaurantPlanRow,
} from "./PlansView";

/**
 * Planes y servicios · las cuatro pestañas del dibujo: Planes (M21),
 * Servicios (M54), Versiones (M55) y Asignación y cambio (M56), que es la
 * lista de restaurantes con su plan; la ficha de cada uno es
 * `/planes/<restaurante>`, donde viven las acciones de §6.4 (HU-07).
 *
 * **Lo que no está, a propósito:** crear, editar y archivar planes y
 * servicios. Cómo se versionan el precio y las cuotas de un plan
 * contratado (§104 de la maestra) no tiene reglas en el PRD, y Bosco lo
 * decidió el 23/09/2026: primero las pantallas, la edición cuando se fijen
 * las reglas. Las condiciones sí se versionan (RN-DAT-07, migración 75).
 *
 * Qué filas se ven lo decide RLS, no esta página: planes, servicios,
 * versiones y suscripciones son del equipo del espacio. Un restaurante no
 * es miembro del espacio y no llega aquí.
 */
export const dynamic = "force-dynamic";

export default async function PlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="space-y-6">
        <PageHeader title={es.plansPage.title} />
        <NoPermissionState title={es.plansPage.noAccessTitle} description={es.plansPage.noAccessReason} />
      </div>
    );
  }

  const vista = readPlansParams(query);
  const catalogue = await loadPlanCatalogue(supabase, space.id);

  let contenido: React.ReactNode;
  if (vista.tab === "servicios") {
    contenido = (
      <ServicesTab slug={slug} catalogue={catalogue} selectedId={vista.service} timeZone={space.timezone} />
    );
  } else if (vista.tab === "versiones") {
    const subject =
      vista.subject ?? (catalogue.plans[0] ? { type: "plan" as const, id: catalogue.plans[0].id } : null);
    const subscribers = subject ? await loadSubscribersTerms(supabase, catalogue, subject) : [];
    contenido = (
      <VersionsTab
        slug={slug}
        catalogue={catalogue}
        subject={subject}
        requestedVersion={vista.version}
        subscribers={subscribers}
        timeZone={space.timezone}
      />
    );
  } else if (vista.tab === "restaurantes") {
    const rows = await loadRestaurantRows(supabase, space.id);
    contenido = (
      <RestaurantsTab
        slug={slug}
        rows={rows}
        plans={catalogue.plans.map((p) => ({ id: p.id, name: p.name }))}
        planFilter={vista.plan}
        timeZone={space.timezone}
      />
    );
  } else {
    contenido = (
      <PlanCatalogueTab slug={slug} catalogue={catalogue} selectedId={vista.plan} timeZone={space.timezone} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={es.plansPage.title} subtitle={es.plansPage.subtitle} />
      <PlansTabs slug={slug} active={vista.tab} />
      {contenido}
    </div>
  );
}

/**
 * Qué tiene contratado cada restaurante y cuándo renueva. `plan_commitments`
 * tiene privilegios de columna (migración 40): sus columnas se enumeran.
 */
async function loadRestaurantRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  spaceId: string,
): Promise<RestaurantPlanRow[]> {
  const [{ data: establishments }, { data: subscriptions }, { data: commitments }, { data: cycles }] =
    await Promise.all([
      supabase.from("establishments").select("id, name, code").eq("space_id", spaceId).order("name"),
      supabase
        .from("subscriptions")
        .select("id, establishment_id, kind, plan_id, plans (name, price_cents), services (name)")
        .eq("space_id", spaceId)
        .eq("status", "active"),
      supabase
        .from("plan_commitments")
        .select("subscription_id, ends_at")
        .eq("space_id", spaceId)
        .order("started_at", { ascending: false }),
      supabase
        .from("consumption_cycles")
        .select("subscription_id, cycle_end")
        .eq("space_id", spaceId)
        .order("cycle_start", { ascending: false }),
    ]);

  const ahora = new Date();
  // La permanencia y el ciclo vigentes son los más recientes: el libro es
  // inmutable, nunca se actualiza una fila, se añade otra.
  const permanencia = new Map<string, string>();
  for (const c of commitments ?? []) if (!permanencia.has(c.subscription_id)) permanencia.set(c.subscription_id, c.ends_at);
  const ciclo = new Map<string, string>();
  for (const c of cycles ?? []) if (!ciclo.has(c.subscription_id)) ciclo.set(c.subscription_id, c.cycle_end);

  return (establishments ?? []).map((e) => {
    const suyas = (subscriptions ?? []).filter((s) => s.establishment_id === e.id);
    const plan = suyas.find((s) => s.kind === "plan");
    const fin = plan ? (permanencia.get(plan.id) ?? null) : null;
    return {
      id: e.id,
      name: e.name,
      code: e.code,
      planId: plan?.plan_id ?? null,
      planName: plan?.plans?.name ?? null,
      planPriceCents: plan?.plans?.price_cents ?? null,
      services: suyas
        .filter((s) => s.kind === "service")
        .map((s) => s.services?.name)
        .filter((n): n is string => Boolean(n)),
      commitmentEndsAt: fin,
      commitmentCurrent: commitmentIsCurrent(ahora, fin === null ? null : new Date(fin)),
      renewsAt: plan ? (ciclo.get(plan.id) ?? null) : null,
    };
  });
}
