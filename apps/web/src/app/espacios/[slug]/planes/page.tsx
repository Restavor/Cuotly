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
  pickRevision,
  revisionsOf,
  type RevisionDiffRow,
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
 * Crear, editar, renombrar y archivar planes y servicios (decisión 72,
 * RN-COM-19 a 30) se abre con `?accion=` y solo lo ve el propietario;
 * quien lo impide de verdad son `create_plan()`, `revise_plan()` y
 * compañía, que exigen `manage_space`. Si editar crea versión o edita en
 * el sitio lo decide el servidor (migración 131).
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
      <ServicesTab
        slug={slug}
        spaceId={space.id}
        catalogue={catalogue}
        selectedId={vista.service}
        action={vista.action}
        timeZone={space.timezone}
      />
    );
  } else if (vista.tab === "versiones") {
    const subject =
      vista.subject ?? (catalogue.plans[0] ? { type: "plan" as const, id: catalogue.plans[0].id } : null);
    const head = subject
      ? (subject.type === "plan" ? catalogue.plans : catalogue.services).find((x) => x.id === subject.id)
      : undefined;
    const subscribers = head && subject ? await loadSubscribersTerms(supabase, catalogue, { type: subject.type, lineageId: head.lineageId }) : [];

    // RN-COM-30 · la comparativa de la versión elegida con la anterior.
    // La hace `revision_diff()`: la misma regla de "mejora o empeora" que
    // decide si se pide aceptación, sin copiarla aquí.
    let revisionDiff: RevisionDiffRow[] | null = [];
    if (head && subject) {
      const revisions = revisionsOf(catalogue, subject.type, head.lineageId);
      const elegida = pickRevision(revisions, vista.revision);
      const anterior = elegida ? revisions.find((r) => r.revision === elegida.revision - 1) : undefined;
      if (elegida && anterior) {
        const { data, error } = await supabase.rpc("revision_diff", {
          p_kind: subject.type,
          p_from: anterior.id,
          p_to: elegida.id,
        });
        revisionDiff = error
          ? null
          : (data ?? []).map((d) => ({ field: d.field, oldValue: d.old_value, newValue: d.new_value, better: d.better }));
      }
    }
    contenido = (
      <VersionsTab
        slug={slug}
        catalogue={catalogue}
        subject={subject}
        requestedVersion={vista.version}
        requestedRevision={vista.revision}
        revisionDiff={revisionDiff}
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
        plans={catalogue.plans.map((p) => ({ id: p.lineageId, name: p.name }))}
        planFilter={vista.plan}
        revisionStatus={catalogue.revisionStatus}
        timeZone={space.timezone}
      />
    );
  } else {
    contenido = (
      <PlanCatalogueTab
        slug={slug}
        spaceId={space.id}
        catalogue={catalogue}
        selectedId={vista.plan}
        action={vista.action}
        timeZone={space.timezone}
      />
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
        .select("id, establishment_id, kind, plan_id, plans (name, price_cents, lineage_id), services (name)")
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
      planLineageId: plan?.plans?.lineage_id ?? null,
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
