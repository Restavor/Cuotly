import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { commitmentIsCurrent, planChangeOptions } from "@/core/plans";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import {
  AssignPlanForm,
  CancelScheduledChangeForm,
  ContractServiceForm,
  SchedulePlanChangeForm,
  UpgradeNowForms,
} from "../PlanForms";

/**
 * HU-07 · la ficha de planes y servicios de un restaurante: lo que tiene
 * contratado, la bolsa del ciclo vigente, y las acciones de §6.4.
 *
 * Ninguna acción se autoriza aquí. `manage_clients` se consulta solo para
 * decidir qué formularios se pintan; quien llegue por URL sin esa capacidad
 * ve la pantalla en modo lectura y, si enviara el formulario de todos
 * modos, el servidor lo rechaza (CLAUDE.md MUST).
 *
 * Qué caminos se le ofrecen a un cambio de plan lo decide
 * `src/core/plans.ts` con las mismas reglas que el servidor hace cumplir
 * (RN-COM-15, 16 y 17), no una condición escrita a mano en el JSX.
 */
export const dynamic = "force-dynamic";

type CategoryKey = keyof typeof es.naming.categories;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function dia(instant: string | null): string {
  return instant === null ? "—" : instant.slice(0, 10);
}

export default async function EstablishmentPlanPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.plansPage.detailTitle}</h1>
        <NoPermissionState
          title={es.plansPage.noAccessTitle}
          description={es.plansPage.noAccessReason}
        />
      </div>
    );
  }

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, code, status")
    .eq("id", id)
    .eq("space_id", space.id)
    .maybeSingle();
  if (!establishment) notFound();

  const [
    { data: puedeGestionar },
    { data: subscriptions },
    { data: plans },
    { data: services },
    { data: commitments },
    { data: cycles },
    { data: scheduled },
    { data: allowance },
  ] = await Promise.all([
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_clients" }),
    supabase
      .from("subscriptions")
      .select("id, kind, plan_id, service_id, status, started_at, plans (name, price_cents, start_sla_hours), services (name, price_cents)")
      .eq("establishment_id", establishment.id)
      .eq("status", "active"),
    supabase
      .from("plans")
      .select("id, name, price_cents, start_sla_hours")
      .eq("space_id", space.id)
      .order("price_cents", { ascending: true }),
    supabase
      .from("services")
      .select("id, name, price_cents")
      .eq("space_id", space.id)
      .order("name", { ascending: true }),
    // Columnas enumeradas: `plan_commitments` tiene privilegio de columna.
    supabase
      .from("plan_commitments")
      .select("subscription_id, ends_at, started_at")
      .eq("establishment_id", establishment.id)
      .order("started_at", { ascending: false }),
    supabase
      .from("consumption_cycles")
      .select("subscription_id, cycle_start, cycle_end")
      .eq("establishment_id", establishment.id)
      .order("cycle_start", { ascending: false }),
    supabase
      .from("scheduled_plan_changes")
      .select("id, subscription_id, to_plan_id, direction, effective_at, state")
      .eq("establishment_id", establishment.id)
      .eq("state", "pending"),
    // La bolsa del ciclo la calcula el servidor (CA-08): incluidas del
    // ciclo más la suma de los apuntes, nunca un contador guardado.
    supabase.rpc("establishment_cycle_allowance", { p_establishment_id: establishment.id }),
  ]);

  const activas = subscriptions ?? [];
  const planSubscription = activas.find((s) => s.kind === "plan") ?? null;
  const serviceSubscriptions = activas.filter((s) => s.kind === "service");

  const permanencia =
    planSubscription === null
      ? null
      : ((commitments ?? []).find((c) => c.subscription_id === planSubscription.id)?.ends_at ?? null);

  const cicloFin =
    planSubscription === null
      ? null
      : ((cycles ?? []).find((c) => c.subscription_id === planSubscription.id)?.cycle_end ?? null);

  const cambioProgramado =
    planSubscription === null
      ? null
      : ((scheduled ?? []).find((c) => c.subscription_id === planSubscription.id) ?? null);

  const todosLosPlanes = plans ?? [];
  const catalogoServicios = services ?? [];
  const contratados = new Set(
    serviceSubscriptions.map((s) => s.service_id).filter((s): s is string => Boolean(s)),
  );
  const serviciosDisponibles = catalogoServicios.filter((s) => !contratados.has(s.id));

  // RN-COM-15/16/17 · qué se puede hacer con cada plan destino. La decisión
  // es de `src/core/plans.ts`; el servidor la vuelve a comprobar.
  const caminos = planSubscription
    ? todosLosPlanes.map((plan) => ({
        plan,
        options: planChangeOptions({
          currentPlanId: planSubscription.plan_id ?? "",
          targetPlanId: plan.id,
          currentPriceCents: planSubscription.plans?.price_cents ?? 0,
          targetPriceCents: plan.price_cents,
          cycleEndsAt: cicloFin === null ? null : new Date(cicloFin),
          commitmentEndsAt: permanencia === null ? null : new Date(permanencia),
        }),
      }))
    : [];

  const mejorables = caminos
    .filter((c) => c.options.includes("immediate"))
    .map((c) => ({ id: c.plan.id, name: c.plan.name, priceCents: c.plan.price_cents }));
  const programables = caminos
    .filter((c) => c.options.includes("renewal"))
    .map((c) => ({ id: c.plan.id, name: c.plan.name, priceCents: c.plan.price_cents }));
  const bloqueados = caminos.filter((c) => c.options.includes("blocked"));

  const gestionar = Boolean(puedeGestionar);
  const bolsa = allowance ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-1">
        <Link href={`/espacios/${slug}/planes`} className="text-sm text-cuotly-green underline">
          {es.plansPage.backToList}
        </Link>
        <h1 className="text-2xl font-bold text-primary-dark">
          {establishment.name} · {establishment.code}
        </h1>
        <p className="text-sm text-text-secondary">{es.plansPage.detailTitle}</p>
      </header>

      <Card title={es.plansPage.currentPlanTitle}>
        {planSubscription === null ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">{es.plansPage.noPlan}</p>
            <p className="text-sm text-text-secondary">{es.plansPage.noPlanHint}</p>
            {gestionar && todosLosPlanes.length > 0 ? (
              <AssignPlanForm
                establishmentId={establishment.id}
                plans={todosLosPlanes.map((p) => ({
                  id: p.id,
                  name: p.name,
                  priceCents: p.price_cents,
                }))}
              />
            ) : null}
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-text">{es.plansPage.planColumn}</dt>
              <dd className="text-text-secondary">{planSubscription.plans?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-text">{es.plansPage.priceLabel}</dt>
              <dd className="text-text-secondary">
                {euros(planSubscription.plans?.price_cents ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-text">{es.plansPage.slaLabel}</dt>
              <dd className="text-text-secondary">
                {planSubscription.plans?.start_sla_hours ?? "—"} {es.plansPage.slaHours}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-text">{es.plansPage.commitmentColumn}</dt>
              <dd className="text-text-secondary">
                {permanencia === null
                  ? es.plansPage.noCommitment
                  : commitmentIsCurrent(new Date(), new Date(permanencia))
                    ? `${es.plansPage.commitmentUntil} ${dia(permanencia)}`
                    : es.plansPage.commitmentOver}
              </dd>
            </div>
          </dl>
        )}
      </Card>

      <Card title={es.plansPage.includedTitle}>
        {bolsa.length === 0 ? (
          <EmptyState
            title={es.plansPage.cycleEmptyTitle}
            description={es.plansPage.cycleEmptyReason}
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-text-secondary">
              {es.plansPage.renewsAtLabel} {dia(bolsa[0]?.renews_at ?? null)}
            </p>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{es.plansPage.categoryColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.plansPage.includedColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.plansPage.remainingColumn}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bolsa.map((fila) => (
                  <TableRow key={fila.category}>
                    <TableCell>
                      {es.naming.categories[fila.category as CategoryKey] ?? fila.category}
                    </TableCell>
                    <TableCell>{fila.included}</TableCell>
                    <TableCell>{fila.remaining}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {cambioProgramado ? (
        <Card title={es.plansPage.scheduledTitle}>
          <p className="text-sm text-text-secondary">
            <StatusBadge tone={cambioProgramado.direction === "upgrade" ? "success" : "warning"}>
              {cambioProgramado.direction === "upgrade"
                ? es.plansPage.scheduledUpgrade
                : es.plansPage.scheduledDowngrade}
            </StatusBadge>{" "}
            {es.plansPage.scheduledTo}{" "}
            {todosLosPlanes.find((p) => p.id === cambioProgramado.to_plan_id)?.name ?? "—"}{" "}
            {es.plansPage.scheduledAt} {dia(cambioProgramado.effective_at)}.
          </p>
          {gestionar && planSubscription ? (
            <div className="mt-3">
              <CancelScheduledChangeForm subscriptionId={planSubscription.id} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {planSubscription ? (
        <Card title={es.plansPage.changePlanTitle}>
          <p className="mb-3 text-sm text-text-secondary">{es.plansPage.changePlanHint}</p>

          {gestionar ? (
            <div className="space-y-5">
              {mejorables.length > 0 ? (
                <UpgradeNowForms subscriptionId={planSubscription.id} plans={mejorables} />
              ) : null}

              {programables.length > 0 ? (
                <SchedulePlanChangeForm
                  subscriptionId={planSubscription.id}
                  plans={programables}
                />
              ) : null}

              {/*
                P6 · una reducción que no cabe todavía se explica, no se
                esconde: si el botón desapareciera sin más, nadie sabría por
                qué su plan no se puede bajar.
              */}
              {bloqueados.length > 0 ? (
                <p className="text-sm text-text-secondary">
                  {es.plansPage.downgradeBlocked}{" "}
                  {bloqueados.map((c) => c.plan.name).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">{es.plansPage.readOnlyHint}</p>
          )}
        </Card>
      ) : null}

      <Card title={es.plansPage.servicesTitle}>
        <p className="mb-3 text-sm text-text-secondary">{es.plansPage.servicesHint}</p>

        {serviceSubscriptions.length === 0 ? (
          <p className="text-sm text-text-secondary">{es.plansPage.noServices}</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.plansPage.serviceLabel}</TableHeaderCell>
                <TableHeaderCell>{es.plansPage.priceLabel}</TableHeaderCell>
                <TableHeaderCell>{es.plansPage.serviceContractedOn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {serviceSubscriptions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.services?.name ?? "—"}</TableCell>
                  <TableCell>{euros(s.services?.price_cents ?? 0)}</TableCell>
                  <TableCell>{dia(s.started_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {gestionar ? (
          <div className="mt-4">
            {catalogoServicios.length === 0 ? (
              <p className="text-sm text-text-secondary">{es.plansPage.servicesNoneAvailable}</p>
            ) : serviciosDisponibles.length === 0 ? (
              <p className="text-sm text-text-secondary">{es.plansPage.servicesAllContracted}</p>
            ) : (
              <ContractServiceForm
                establishmentId={establishment.id}
                services={serviciosDisponibles.map((s) => ({
                  id: s.id,
                  name: s.name,
                  priceCents: s.price_cents,
                }))}
              />
            )}
          </div>
        ) : null}
      </Card>

      {/*
        P6 · las dos cosas que esta pantalla no hace, dichas con su motivo
        en vez de con un botón que no funcionaría.
      */}
      <Card title={es.plansPage.servicePendingBillingTitle}>
        <p className="text-sm text-text-secondary">{es.plansPage.servicePendingBillingReason}</p>
      </Card>

      <Card title={es.plansPage.terminationTitle}>
        <p className="text-sm text-text-secondary">{es.plansPage.terminationReason}</p>
      </Card>
    </div>
  );
}
