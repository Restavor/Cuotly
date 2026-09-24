import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { statusEffects } from "@/core/establishment-status";
import { todayInTimeZone } from "@/core/finance";
import { comparePlans, type ComparisonKey } from "@/core/plan-catalogue";
import { commitmentIsCurrent, planChangeOptions } from "@/core/plans";
import { termsNeedAcceptance } from "@/core/terms";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";
import { createClient } from "@/lib/supabase/server";

import { loadPlanCatalogue, type CataloguePlan } from "../catalogue-load";
import {
  AssignPlanForm,
  CancelScheduledChangeForm,
  ConfirmPlanChangeForm,
  ContractServiceForm,
  RecordExternalAcceptanceForm,
  RestaurantSwitcher,
} from "../PlanForms";
import { PlansTabs } from "../PlansView";
import { loadSubscriptionTerms, type SubscriptionTerms } from "../terms-load";
import { RevisionBlock } from "../RevisionBlock";
import { loadSubscriptionRevision } from "../revision-load";

/**
 * M56 · "Asignación y cambio de plan" de un restaurante (HU-07): lo que
 * tiene contratado y desde cuándo, su historial de planes, la comparativa
 * con el plan al que cambiaría (`?a=<plan>`) y cómo se haría el cambio;
 * debajo, la bolsa del ciclo, el cambio programado, los servicios y las
 * condiciones, que ya vivían aquí.
 *
 * Ninguna acción se autoriza aquí. `manage_clients` se consulta solo para
 * decidir qué formularios se pintan; quien llegue por URL sin esa capacidad
 * ve la pantalla en modo lectura y, si enviara el formulario de todos
 * modos, el servidor lo rechaza (CLAUDE.md MUST).
 *
 * Qué caminos tiene un cambio de plan lo decide `src/core/plans.ts` con las
 * mismas reglas que el servidor hace cumplir (RN-COM-15, 16 y 17). Lo que
 * costaría la mejora inmediata lo calcula el servidor
 * (`plan_change_preview()`, una lectura) antes de pintar el botón que cobra.
 *
 * **No se copia del dibujo** el "Motivo del cambio" ni la "Fecha de
 * entrada en vigor" libre: las funciones de cambio no guardan motivo, y la
 * fecha no se elige, la fijan las reglas (ahora, o la renovación).
 */
export const dynamic = "force-dynamic";

type CategoryKey = keyof typeof es.naming.categories;
type StateKey = keyof typeof es.naming.states.establishment;

export default async function EstablishmentPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
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
        <PageHeader title={es.plansPage.change.title} />
        <NoPermissionState title={es.plansPage.noAccessTitle} description={es.plansPage.noAccessReason} />
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
    catalogue,
    { data: allEstablishments },
    { data: puedeGestionar },
    { data: subscriptions },
    { data: services },
    { data: commitments },
    { data: cycles },
    { data: scheduled },
    { data: allowance },
  ] = await Promise.all([
    loadPlanCatalogue(supabase, space.id),
    supabase.from("establishments").select("id, name").eq("space_id", space.id).order("name"),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_clients" }),
    supabase
      .from("subscriptions")
      .select("id, kind, plan_id, service_id, status, started_at, plans (name, price_cents), services (name, price_cents)")
      .eq("establishment_id", establishment.id)
      .eq("status", "active"),
    supabase
      .from("services")
      .select("id, name, price_cents")
      .eq("space_id", space.id)
      .is("superseded_at", null)
      .is("archived_at", null)
      .order("name"),
    // Columnas enumeradas: `plan_commitments` tiene privilegio de columna.
    supabase
      .from("plan_commitments")
      .select("subscription_id, plan_id, service_id, started_at, ends_at, cause")
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

  const tz = space.timezone;
  const dia = (instant: string | null) =>
    instant === null ? "—" : enZona(instant, tz, { day: "numeric", month: "short", year: "numeric" });
  const tch = es.plansPage.change;

  const activas = subscriptions ?? [];
  const planSubscription = activas.find((s) => s.kind === "plan") ?? null;
  const serviceSubscriptions = activas.filter((s) => s.kind === "service");
  // RN-COM-27 · a lo que se puede contratar o cambiar: la versión vigente
  // de cada plan, sin los archivados. El plan que tiene puede ser una
  // versión anterior (RN-COM-24): se busca entre todas.
  const actual: CataloguePlan | null = planSubscription?.plan_id
    ? (catalogue.planRevisions.find((p) => p.id === planSubscription.plan_id) ?? null)
    : null;
  const planes = catalogue.plans.filter((p) => !p.archived && p.lineageId !== actual?.lineageId);
  const planById = new Map(planes.map((p) => [p.id, p]));

  // RN-COM-08 · qué precio se le cobra por cada servicio lo dice el
  // servidor (decisión 20): `service_monthly_price()` es la misma cuenta
  // con la que `generate_monthly_charge_internal()` emite la mensualidad.
  const preciosServicio = new Map<string, { baseCents: number; premiumApplied: boolean } | null>(
    await Promise.all(
      serviceSubscriptions.map(async (s) => {
        const { data } = await supabase.rpc("service_monthly_price", { p_subscription_id: s.id });
        const fila = data?.[0];
        return [s.id, fila ? { baseCents: fila.base_cents, premiumApplied: fila.premium_applied } : null] as const;
      }),
    ),
  );

  // Del plan vigente: su permanencia, su ciclo y desde cuándo lo tiene
  // (la permanencia más reciente de esa suscripción: el libro es inmutable).
  const compromisoActual = planSubscription
    ? ((commitments ?? []).find((c) => c.subscription_id === planSubscription.id) ?? null)
    : null;
  const permanencia = compromisoActual?.ends_at ?? null;
  const cicloFin = planSubscription
    ? ((cycles ?? []).find((c) => c.subscription_id === planSubscription.id)?.cycle_end ?? null)
    : null;
  const cambioProgramado = planSubscription
    ? ((scheduled ?? []).find((c) => c.subscription_id === planSubscription.id) ?? null)
    : null;
  // "Historial de planes": cada permanencia de plan abre una etapa (alta o
  // cambio), con el plan que tenía.
  const historial = (commitments ?? []).filter((c) => c.plan_id !== null);

  const gestionar = puedeGestionar === true;
  const destinoId = typeof query.a === "string" ? query.a : null;
  const destino = destinoId && destinoId !== actual?.id ? (planById.get(destinoId) ?? null) : null;

  // RN-COM-15/16/17 · qué se puede hacer con el plan destino. La decisión
  // es de `src/core/plans.ts`; el servidor la vuelve a comprobar.
  const opciones =
    planSubscription && actual && destino
      ? planChangeOptions({
          currentPlanId: actual.id,
          targetPlanId: destino.id,
          currentPriceCents: actual.priceCents,
          targetPriceCents: destino.priceCents,
          cycleEndsAt: cicloFin === null ? null : new Date(cicloFin),
          commitmentEndsAt: permanencia === null ? null : new Date(permanencia),
        })
      : [];

  // Lo que costaría la mejora inmediata, calculado por el servidor.
  let prorrateo: {
    differenceCents: number;
    fractionPercent: number;
    extras: readonly (readonly [string, number])[];
  } | null = null;
  if (planSubscription && destino && opciones.includes("immediate")) {
    const { data } = await supabase.rpc("plan_change_preview", {
      p_subscription_id: planSubscription.id,
      p_new_plan_id: destino.id,
    });
    const fila = data?.[0];
    if (fila) {
      prorrateo = {
        differenceCents: fila.difference_cents,
        fractionPercent: Math.round(Number(fila.fraction) * 100),
        extras: (
          [
            [es.naming.categories.small, fila.extra_small],
            [es.naming.categories.photo, fila.extra_photo],
            [es.naming.categories.medium, fila.extra_medium],
            [es.naming.categories.large, fila.extra_large],
          ] as const
        ).filter(([, n]) => n > 0),
      };
    }
  }

  const catalogoServicios = services ?? [];
  const contratados = new Set(serviceSubscriptions.map((s) => s.service_id).filter((s): s is string => Boolean(s)));
  const serviciosDisponibles = catalogoServicios.filter((s) => !contratados.has(s.id));
  const bolsa = allowance ?? [];

  /*
    Maqueta 13 · las condiciones de cada suscripción viva, con su estado
    (`subscription_terms()`, que es quien lo deriva), y los archivos del
    restaurante para elegir el contrato de una aceptación externa. "Hoy"
    es el del ESPACIO, no el del navegador de quien registra.
  */
  const [terminos, { data: archivos }] = await Promise.all([
    Promise.all(
      activas.map(async (s) => ({
        subscription: s,
        terms: await loadSubscriptionTerms(supabase, s.id),
        revision: await loadSubscriptionRevision(supabase, s.id, s.kind === "service" ? "service" : "plan"),
      })),
    ),
    // Columnas enumeradas: `files` tiene privilegios de columna.
    supabase
      .from("files")
      .select("id, name")
      .eq("establishment_id", establishment.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);
  const hoy = todayInTimeZone(new Date(), tz);
  const contratos = (archivos ?? []).map((f) => ({ id: f.id, name: f.name }));
  const estado = statusEffects(establishment.status);
  const estadoNombre =
    (es.naming.states.establishment as Readonly<Record<string, string>>)[establishment.status as StateKey] ??
    establishment.status;

  return (
    <div className="space-y-6">
      <PageHeader title={tch.title} subtitle={tch.subtitle} />
      <PlansTabs slug={slug} active="restaurantes" />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Seleccionar restaurante */}
        <Card className="min-w-0">
          <RestaurantSwitcher
            slug={slug}
            current={establishment.id}
            restaurants={(allEstablishments ?? []).map((e) => ({ id: e.id, name: e.name }))}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-bold text-primary-dark [overflow-wrap:anywhere]">{establishment.name}</p>
              <p className="text-sm text-text-secondary">{establishment.code}</p>
            </div>
            <StatusBadge tone={estado.tone}>{estadoNombre}</StatusBadge>
          </div>

          {planSubscription === null ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-text-secondary">{es.plansPage.noPlan}</p>
              <p className="text-sm text-text-secondary">{es.plansPage.noPlanHint}</p>
            </div>
          ) : (
            <dl className="mt-4 divide-y divide-border rounded-[10px] bg-soft-surface px-3 text-sm">
              {[
                [tch.currentPlan, actual?.name ?? planSubscription.plans?.name ?? "—"],
                [es.plansPage.priceLabel, euros(planSubscription.plans?.price_cents ?? 0)],
                [tch.since, dia(compromisoActual?.started_at ?? planSubscription.started_at)],
                [tch.nextRenewal, dia(cicloFin)],
                [
                  es.plansPage.commitmentColumn,
                  permanencia === null
                    ? es.plansPage.noCommitment
                    : commitmentIsCurrent(new Date(), new Date(permanencia))
                      ? `${es.plansPage.commitmentUntil} ${dia(permanencia)}`
                      : es.plansPage.commitmentOver,
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="text-right font-semibold text-text">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <h3 className="mt-5 text-sm font-semibold text-primary-dark">{tch.historyTitle}</h3>
          {historial.length === 0 ? (
            <p className="mt-1 text-sm text-text-secondary">{tch.historyEmpty}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-[10px] border border-border">
              {historial.map((h, i) => (
                <li
                  key={`${h.subscription_id}-${h.started_at}`}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${i === 0 ? "border-l-2 border-l-cuotly-green" : ""}`}
                >
                  <span className="font-semibold text-text">{planById.get(h.plan_id ?? "")?.name ?? "—"}</span>
                  <span className="text-right text-xs text-text-secondary">
                    {h.cause === "initial" ? tch.historyInitial : tch.historyChange} · {dia(h.started_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Comparativa de planes */}
        <Card title={tch.compareTitle} className="min-w-0">
          {planSubscription === null ? (
            gestionar && planes.length > 0 ? (
              <AssignPlanForm
                establishmentId={establishment.id}
                plans={planes.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents }))}
              />
            ) : (
              <p className="text-sm text-text-secondary">{es.plansPage.readOnlyHint}</p>
            )
          ) : (
            <>
              <p className="mb-2 text-sm text-text-secondary">{tch.chooseTarget}</p>
              <ul className="mb-4 flex flex-wrap gap-2" data-testid="planes-destinos">
                {planes
                  .map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/espacios/${slug}/planes/${establishment.id}?a=${p.id}`}
                        aria-current={p.id === destino?.id ? "true" : undefined}
                        className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${
                          p.id === destino?.id
                            ? "border-cuotly-green bg-cuotly-green/10 text-cuotly-green"
                            : "border-border text-text hover:bg-soft-surface"
                        }`}
                      >
                        {p.name}
                      </Link>
                    </li>
                  ))}
              </ul>
              {actual ? <PlanComparison current={actual} target={destino} /> : null}
            </>
          )}
        </Card>

        {/* Configuración del cambio */}
        <Card title={tch.configTitle} className="min-w-0">
          {planSubscription === null || !actual ? (
            <p className="text-sm text-text-secondary">{es.plansPage.noPlan}</p>
          ) : destino === null ? (
            <p className="text-sm text-text-secondary">{tch.pickTargetFirst}</p>
          ) : (
            <div className="space-y-5">
              {opciones.includes("immediate") ? (
                <section className="space-y-2" data-testid="cambio-inmediato">
                  <h3 className="text-sm font-semibold text-primary-dark">{tch.immediateTitle}</h3>
                  <p className="text-sm text-text-secondary">{tch.immediateHint}</p>
                  {prorrateo === null ? (
                    <p className="text-sm text-text-secondary">{tch.previewUnavailable}</p>
                  ) : (
                    <>
                      <div className="rounded-[10px] bg-info/10 p-3 text-sm">
                        <p className="font-semibold text-primary-dark">{tch.summaryTitle}</p>
                        <dl className="mt-1 space-y-1">
                          <SummaryLine k={tch.summaryFrom} v={`${actual.name} (${euros(actual.priceCents)} + IVA)`} />
                          <SummaryLine k={tch.summaryTo} v={`${destino.name} (${euros(destino.priceCents)} + IVA)`} />
                          <SummaryLine k={tch.summaryWhen} v={tch.summaryNow} />
                        </dl>
                        <p className="mt-2 text-text">
                          {es.plansPage.previewDifference} <strong>{euros(prorrateo.differenceCents)}</strong>{" "}
                          {es.plansPage.previewFraction} ({prorrateo.fractionPercent} %).
                        </p>
                        <p className="text-text-secondary">
                          {prorrateo.extras.length === 0
                            ? es.plansPage.previewNoExtras
                            : `${es.plansPage.previewExtras} ${prorrateo.extras.map(([n, c]) => `${n}: +${c}`).join(" · ")}`}
                        </p>
                      </div>
                      {gestionar ? (
                        <ConfirmPlanChangeForm subscriptionId={planSubscription.id} planId={destino.id} mode="now" />
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              {opciones.includes("renewal") ? (
                <section className="space-y-2" data-testid="cambio-renovacion">
                  <h3 className="text-sm font-semibold text-primary-dark">{tch.renewalTitle}</h3>
                  <p className="text-sm text-text-secondary">
                    {cicloFin ? tch.renewalHint(dia(cicloFin)) : tch.renewalHintNoDate}
                  </p>
                  {gestionar ? (
                    <ConfirmPlanChangeForm subscriptionId={planSubscription.id} planId={destino.id} mode="renewal" />
                  ) : null}
                </section>
              ) : null}

              {/*
                P6 · una reducción que no cabe todavía se explica, no se
                esconde: si el botón desapareciera sin más, nadie sabría por
                qué su plan no se puede bajar.
              */}
              {opciones.includes("blocked") ? (
                <p className="rounded-[10px] bg-soft-surface p-3 text-sm text-text">{es.plansPage.downgradeBlocked}</p>
              ) : null}

              {opciones.includes("immediate") || opciones.includes("renewal") ? (
                <p className="text-xs text-text-secondary">{tch.commitmentNote}</p>
              ) : null}
              {!gestionar ? <p className="text-sm text-text-secondary">{es.plansPage.readOnlyHint}</p> : null}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card title={es.plansPage.includedTitle} className="min-w-0">
          {bolsa.length === 0 ? (
            <EmptyState title={es.plansPage.cycleEmptyTitle} description={es.plansPage.cycleEmptyReason} />
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
                      <TableCell>{es.naming.categories[fila.category as CategoryKey] ?? fila.category}</TableCell>
                      <TableCell>{fila.included}</TableCell>
                      <TableCell>{fila.remaining}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Card>

        <div className="min-w-0 space-y-4">
          {cambioProgramado ? (
            <Card title={es.plansPage.scheduledTitle}>
              <p className="text-sm text-text-secondary">
                <StatusBadge tone={cambioProgramado.direction === "upgrade" ? "success" : "warning"}>
                  {cambioProgramado.direction === "upgrade"
                    ? es.plansPage.scheduledUpgrade
                    : es.plansPage.scheduledDowngrade}
                </StatusBadge>{" "}
                {es.plansPage.scheduledTo} {planById.get(cambioProgramado.to_plan_id)?.name ?? "—"}{" "}
                {es.plansPage.scheduledAt} {dia(cambioProgramado.effective_at)}.
              </p>
              {gestionar && planSubscription ? (
                <div className="mt-3">
                  <CancelScheduledChangeForm subscriptionId={planSubscription.id} />
                </div>
              ) : null}
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
                  {serviceSubscriptions.map((s) => {
                    const precio = preciosServicio.get(s.id) ?? null;
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.services?.name ?? "—"}</TableCell>
                        <TableCell>
                          {precio === null ? (
                            <span className="text-text-secondary">{es.plansPage.servicePriceUnknown}</span>
                          ) : (
                            <>
                              {es.plansPage.servicePriceApplied(euros(precio.baseCents))}
                              <span className="block text-xs text-text-secondary">
                                {precio.premiumApplied
                                  ? es.plansPage.servicePricePremiumReason
                                  : es.plansPage.servicePriceStandardReason}
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell>{dia(s.started_at)}</TableCell>
                      </TableRow>
                    );
                  })}
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
                    services={serviciosDisponibles.map((s) => ({ id: s.id, name: s.name, priceCents: s.price_cents }))}
                  />
                )}
              </div>
            ) : null}
            {serviceSubscriptions.length === 0 ? null : (
              <p className="mt-3 text-xs text-text-secondary">{es.plansPage.serviceBillingHint}</p>
            )}
          </Card>
        </div>
      </div>

      {/*
        Maqueta 13 · "Versión aceptada · Ver condiciones", por suscripción.
        Decisión del 12/09/2026, opción (c): el restaurante acepta en su
        pantalla, y aquí el equipo registra la aceptación de fuera con
        fecha y contrato.
      */}
      {terminos.length === 0 ? null : (
        <Card title={es.plansPage.terms.statusTitle}>
          <ul className="divide-y divide-border">
            {terminos.map(({ subscription, terms, revision }) => (
              <li key={subscription.id} className="py-3">
                <p className="font-semibold text-primary-dark">
                  {subscription.kind === "plan" ? (subscription.plans?.name ?? "—") : (subscription.services?.name ?? "—")}
                </p>
                <TermsLine terms={terms} dia={dia} />
                {revision ? (
                  <RevisionBlock
                    revision={revision}
                    subscriptionId={subscription.id}
                    canRecord={gestionar}
                    today={hoy}
                    files={contratos}
                    timeZone={tz}
                  />
                ) : null}
                {terms?.current ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-cuotly-green underline">
                      {es.plansPage.terms.readLink}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-text">{terms.current.conditions}</p>
                  </details>
                ) : null}
                {gestionar && terms?.current && termsNeedAcceptance(terms.status) ? (
                  <div className="mt-3 rounded-lg bg-soft-surface p-3">
                    <p className="text-sm font-semibold text-text">{es.plansPage.terms.recordTitle}</p>
                    <p className="mb-2 text-xs text-text-secondary">{es.plansPage.terms.recordHint}</p>
                    <RecordExternalAcceptanceForm
                      subscriptionId={subscription.id}
                      versionId={terms.current.versionId}
                      today={hoy}
                      files={contratos}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <Link href={`/espacios/${slug}/planes?tab=versiones`} className="text-cuotly-green underline">
              {es.plansPage.terms.catalogueLink}
            </Link>
          </p>
        </Card>
      )}

      {/*
        P6 · lo que esta pantalla no hace, dicho con su motivo en vez de
        con un botón que no funcionaría.
      */}
      <Card title={es.plansPage.terminationTitle}>
        <p className="text-sm text-text-secondary">{es.plansPage.terminationReason}</p>
      </Card>
    </div>
  );
}

function SummaryLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
      <dt className="text-text-secondary">{k}</dt>
      <dd className="font-semibold text-text">{v}</dd>
    </div>
  );
}

/**
 * M56 · "Comparativa de planes": el actual a la izquierda y el elegido a
 * la derecha, fila a fila, con lo que mejora resaltado (`comparePlans()`).
 */
function PlanComparison({ current, target }: { current: CataloguePlan; target: CataloguePlan | null }) {
  const tch = es.plansPage.change;
  const tc = es.plansPage.catalogue;
  const valor = (p: CataloguePlan, key: ComparisonKey): string => {
    switch (key) {
      case "price":
        return `${euros(p.priceCents)} + IVA`;
      case "small":
        return String(p.includedSmall);
      case "photo":
        return String(p.includedPhoto);
      case "medium":
        return String(p.includedMedium);
      case "large":
        return String(p.includedLarge);
      case "startSla":
        return `${p.startSlaHours} h`;
      case "ordering":
        return p.canOrderRequests ? tc.yes : tc.no;
      case "report":
        return tc.reportLevels[p.reportLevel];
    }
  };
  const filas = target
    ? comparePlans(current, target)
    : comparePlans(current, current).map((r) => ({ ...r, changed: false, better: false }));

  return (
    <div className="relative overflow-x-auto" data-testid="planes-comparativa">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-secondary">
            <th className="py-2 pr-3 font-medium">
              <span className="sr-only">{tch.compareTitle}</span>
            </th>
            <th className="py-2 pr-3 font-medium">
              {tch.currentPlan}
              <span className="block text-base font-bold text-primary-dark">{current.name}</span>
            </th>
            <th className="py-2 pr-1" aria-hidden="true" />
            <th className="py-2 font-medium">
              {tch.newPlan}
              <span className="block text-base font-bold text-primary-dark">{target?.name ?? "—"}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-text-secondary">
                {tch.rows[r.key]}
              </th>
              <td className="py-2 pr-3 text-text">{valor(current, r.key)}</td>
              <td className="py-2 pr-1 text-text-secondary" aria-hidden="true">
                {target && r.changed ? <Icon name="arrowRight" className="h-3.5 w-3.5" /> : null}
              </td>
              <td className={`py-2 ${r.better ? "font-semibold text-cuotly-green" : "text-text"}`}>
                {target ? valor(target, r.key) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * La línea de estado de las condiciones de una suscripción, en una frase.
 * `null` (la función no contestó) se dice como tal: no es "sin
 * condiciones", es que no se ha podido leer.
 */
function TermsLine({ terms, dia }: { terms: SubscriptionTerms | null; dia: (v: string) => string }) {
  const t = es.plansPage.terms;
  if (terms === null) {
    return <p className="text-sm text-text-secondary">{es.establishmentSheet.termsUnknown}</p>;
  }
  if (terms.current === null) {
    return <p className="text-sm text-text-secondary">{t.statusNoTerms}</p>;
  }
  if (terms.accepted === null) {
    return <p className="text-sm text-text-secondary">{t.statusPending(terms.current.version)}</p>;
  }
  const canal = terms.accepted.channel === "external" ? t.channelExternal : t.channelInApp;
  if (terms.status === "accepted") {
    return (
      <p className="text-sm text-text-secondary">
        {t.statusAccepted(terms.accepted.version, dia(terms.accepted.acceptedAt))} ({canal})
      </p>
    );
  }
  return (
    <p className="text-sm text-text-secondary">
      {t.statusOutdated(terms.accepted.version, terms.current.version)} ({canal})
    </p>
  );
}
