import Link from "next/link";

import {
  ButtonLink,
  Card,
  EntityCell,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
} from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon, type IconName } from "@/components/ui/Icon";
import { INCLUDED_TEMPLATE_LIMIT } from "@/core/daily-menu";
import { diffConditions, pickVersion, restaurantsBySubject, type PlansTab } from "@/core/plan-catalogue";
import { termsTone } from "@/core/terms";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import type { CataloguePlan, ConditionsVersion, PlanCatalogue, SubscriberTerms } from "./catalogue-load";
import { PublishConditionsForm } from "./PlanForms";

const t = es.plansPage;
const tc = t.catalogue;
const tv = t.versions;

/**
 * Las pestañas de Planes y servicios (M21, M54, M55, M56). "Asignación y
 * cambio" es la lista de restaurantes con su plan; la ficha de cada uno es
 * `/planes/<restaurante>`.
 */
export function PlansTabs({ slug, active }: { slug: string; active: PlansTab }) {
  const base = `/espacios/${slug}/planes`;
  return (
    <Tabs
      label={t.tabsLabel}
      active={active}
      tabs={(["planes", "servicios", "versiones", "restaurantes"] as const).map((key) => ({
        key,
        label: t.tabs[key],
        href: key === "planes" ? base : `${base}?tab=${key}`,
      }))}
    />
  );
}

function day(instant: string, timeZone: string): string {
  return enZona(instant, timeZone, { day: "numeric", month: "short", year: "numeric" });
}

function LoadFailed({ failed }: { failed: boolean }) {
  return failed ? (
    <p role="status" className="rounded-[10px] bg-danger/10 px-4 py-3 text-sm text-text">
      {tc.loadFailed}
    </p>
  ) : null;
}

function currentVersion(versions: readonly ConditionsVersion[], subjectId: string): ConditionsVersion | null {
  return pickVersion(
    versions.filter((v) => v.subjectId === subjectId),
    null,
  );
}

function Quota({ icon, label }: { icon: IconName; label: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-primary-dark"
      >
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text">{label}</span>
        <span className="block text-xs text-text-secondary">{tc.perCycle}</span>
      </span>
    </li>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="min-w-0 text-text-secondary">
        {label}
        {hint ? <span className="block text-xs">{hint}</span> : null}
      </dt>
      <dd className="shrink-0 text-right font-semibold text-text">{value}</dd>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M21 · Planes                                                             */
/* ----------------------------------------------------------------------- */

export function PlanCatalogueTab({
  slug,
  catalogue,
  selectedId,
  timeZone,
}: {
  slug: string;
  catalogue: PlanCatalogue;
  selectedId: string | null;
  timeZone: string;
}) {
  const counts = restaurantsBySubject(catalogue.subscriptions);
  const selected: CataloguePlan | undefined =
    catalogue.plans.find((p) => p.id === selectedId) ?? catalogue.plans[catalogue.plans.length - 1];
  const base = `/espacios/${slug}/planes`;

  if (catalogue.plans.length === 0) {
    return (
      <div className="space-y-4">
        <LoadFailed failed={catalogue.failed} />
        <EmptyReason reason={catalogue.failed ? "error" : "no_data_yet"} title={tc.noPlansTitle} />
      </div>
    );
  }

  const conditions = selected ? currentVersion(catalogue.planVersions, selected.id) : null;
  const yesNo = (v: boolean) => (v ? tc.yes : tc.no);

  return (
    <div className="space-y-4">
      <LoadFailed failed={catalogue.failed} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card className="p-0! overflow-hidden">
            <div className="relative overflow-x-auto" data-testid="planes-catalogo">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{tc.nameColumn}</TableHeaderCell>
                    <TableHeaderCell>{tc.priceColumn}</TableHeaderCell>
                    <TableHeaderCell>{tc.restaurantsColumn}</TableHeaderCell>
                    <TableHeaderCell>
                      <span className="sr-only">{tc.actionsColumn}</span>
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {catalogue.plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span
                          className={`font-semibold ${p.id === selected?.id ? "text-cuotly-green" : "text-text"}`}
                          aria-current={p.id === selected?.id ? "true" : undefined}
                        >
                          {p.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap text-sm text-text-secondary">
                          {tc.pricePerMonth(euros(p.priceCents))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-text-secondary">{counts.get(p.id) ?? 0}</span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`${base}?plan=${p.id}`}
                          className="text-sm font-semibold text-cuotly-green underline"
                          aria-label={`${tc.view} ${p.name}`}
                        >
                          {tc.view}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {selected ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-primary-dark">{selected.name}</h2>
                  <p className="mt-2">
                    <span className="text-4xl font-bold tracking-tight text-primary-dark">
                      {euros(selected.priceCents)}
                    </span>{" "}
                    <span className="text-text-secondary">+ IVA/mes</span>
                  </p>
                </div>
                <ButtonLink href={`${base}?tab=restaurantes&plan=${selected.id}`} variant="outline" size="sm">
                  {tc.viewInRestaurants}
                </ButtonLink>
              </div>
              {selected.includedSmall + selected.includedPhoto + selected.includedMedium + selected.includedLarge ===
              0 ? (
                <p className="mt-4 text-sm text-text-secondary">{tc.nothingIncluded}</p>
              ) : (
                <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Quota icon="document" label={tc.quotaSmall(selected.includedSmall)} />
                  <Quota icon="job" label={tc.quotaLarge(selected.includedLarge)} />
                  <Quota icon="task" label={tc.quotaMedium(selected.includedMedium)} />
                  <Quota icon="image" label={tc.quotaPhoto(selected.includedPhoto)} />
                </ul>
              )}
            </Card>
          ) : null}
        </div>

        {selected ? (
          <div className="min-w-0 space-y-4">
            <Card title={tc.rulesTitle}>
              <dl className="divide-y divide-border">
                <Fact label={tc.startSla} value={tc.hours(selected.startSlaHours)} />
                <Fact
                  label={tc.executionSla}
                  value=""
                  hint={tc.executionSlaValue(
                    selected.executionSla.small,
                    selected.executionSla.photo,
                    selected.executionSla.medium,
                    selected.executionSla.large,
                  )}
                />
                <Fact label={tc.ordering} value={yesNo(selected.canOrderRequests)} />
                <Fact label={tc.queueRank} value={tc.queueRankValue(selected.queueRank)} hint={tc.queueRankHint} />
                <Fact label={tc.grantsPriority} value={yesNo(selected.grantsPriority)} />
                <Fact label={tc.watchesReviews} value={yesNo(selected.watchesReviews)} />
                <Fact label={tc.reportLevel} value={tc.reportLevels[selected.reportLevel]} />
              </dl>
            </Card>
            <Card title={tc.conditionsTitle}>
              {conditions ? (
                <>
                  <p className="text-xs text-text-secondary">
                    {tc.conditionsVersion(conditions.version, day(conditions.publishedAt, timeZone))}
                  </p>
                  <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm text-text">{conditions.conditions}</p>
                </>
              ) : (
                <p className="text-sm text-text-secondary">{tc.noConditions}</p>
              )}
              <p className="mt-3">
                <Link
                  href={`${base}?tab=versiones&tema=plan:${selected.id}`}
                  className="text-sm font-semibold text-cuotly-green underline"
                >
                  {tc.seeVersions}
                </Link>
              </p>
            </Card>
            <p className="text-xs text-text-secondary">{tc.editingPending}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M54 · Servicios adicionales                                              */
/* ----------------------------------------------------------------------- */

export function ServicesTab({
  slug,
  catalogue,
  selectedId,
  timeZone,
}: {
  slug: string;
  catalogue: PlanCatalogue;
  selectedId: string | null;
  timeZone: string;
}) {
  const base = `/espacios/${slug}/planes?tab=servicios`;
  const counts = restaurantsBySubject(catalogue.subscriptions);
  const selected = catalogue.services.find((s) => s.id === selectedId) ?? catalogue.services[0];

  if (!selected) {
    return (
      <div className="space-y-4">
        <LoadFailed failed={catalogue.failed} />
        <EmptyReason reason={catalogue.failed ? "error" : "no_data_yet"} title={tc.noServicesTitle} />
      </div>
    );
  }
  const conditions = currentVersion(catalogue.serviceVersions, selected.id);
  const isMenu = selected.kind === "daily_menu";

  return (
    <div className="space-y-4">
      <LoadFailed failed={catalogue.failed} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title={tc.servicesTitle} className="min-w-0">
          <ul className="space-y-3" data-testid="planes-servicios">
            {catalogue.services.map((s) => {
              const activo = s.id === selected.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`${base}&servicio=${s.id}`}
                    aria-current={activo ? "true" : undefined}
                    className={`block rounded-[10px] border p-4 transition-colors ${
                      activo ? "border-cuotly-green bg-cuotly-green/5" : "border-border hover:bg-soft-surface"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-primary-dark">{s.name}</span>
                      <StatusBadge tone={s.kind === "daily_menu" ? "info" : "neutral"}>
                        {s.kind === "daily_menu" ? tc.kindDailyMenu : tc.kindOther}
                      </StatusBadge>
                    </span>
                    <span className="mt-2 block text-right text-lg font-bold text-primary-dark">
                      {tc.pricePerMonth(euros(s.priceCents))}
                    </span>
                    {s.pricePremiumCents !== null ? (
                      <span className="block text-right text-xs text-text-secondary">
                        {tc.premiumPrice(euros(s.pricePremiumCents))}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-text-secondary">{tc.editingServicesPending}</p>
        </Card>

        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-primary-dark">{selected.name}</h2>
            <StatusBadge tone="neutral">{tc.restaurantsCount(counts.get(selected.id) ?? 0)}</StatusBadge>
          </div>
          <p className="mt-2">
            <span className="text-3xl font-bold tracking-tight text-primary-dark">{euros(selected.priceCents)}</span>{" "}
            <span className="text-text-secondary">+ IVA/mes</span>
          </p>
          {selected.pricePremiumCents !== null ? (
            <p className="text-sm text-text-secondary">{tc.premiumPrice(euros(selected.pricePremiumCents))}</p>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {selected.includedUpdates > 0 ? (
              <div className="rounded-[10px] border border-border p-4">
                <p className="text-xs text-text-secondary">{tc.monthlyUpdates}</p>
                <p className="mt-1 text-lg font-bold text-primary-dark">{tc.updatesValue(selected.includedUpdates)}</p>
                <p className="text-xs text-text-secondary">{tc.updatesHint}</p>
              </div>
            ) : null}
            {isMenu ? (
              <>
                <div className="rounded-[10px] border border-border p-4">
                  <p className="text-xs text-text-secondary">{tc.templates}</p>
                  <p className="mt-1 text-lg font-bold text-primary-dark">
                    {tc.templatesValue(INCLUDED_TEMPLATE_LIMIT)}
                  </p>
                  <p className="text-xs text-text-secondary">{tc.templatesHint}</p>
                </div>
                <div className="rounded-[10px] border border-border p-4">
                  <p className="text-xs text-text-secondary">{tc.commitment}</p>
                  <p className="mt-1 text-lg font-bold text-primary-dark">{tc.commitmentValue}</p>
                  <p className="text-xs text-text-secondary">RN-COM-09</p>
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-5 rounded-[10px] bg-soft-surface p-4">
            <p className="text-sm font-semibold text-text">{tc.conditionsTitle}</p>
            {conditions ? (
              <>
                <p className="text-xs text-text-secondary">
                  {tc.conditionsVersion(conditions.version, day(conditions.publishedAt, timeZone))}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text">{conditions.conditions}</p>
              </>
            ) : (
              <p className="text-sm text-text-secondary">{tc.noConditions}</p>
            )}
            <p className="mt-3">
              <Link
                href={`/espacios/${slug}/planes?tab=versiones&tema=service:${selected.id}`}
                className="text-sm font-semibold text-cuotly-green underline"
              >
                {tc.seeVersions}
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M55 · Versiones                                                          */
/* ----------------------------------------------------------------------- */

export function VersionsTab({
  slug,
  catalogue,
  subject,
  requestedVersion,
  subscribers,
  timeZone,
}: {
  slug: string;
  catalogue: PlanCatalogue;
  subject: { readonly type: "plan" | "service"; readonly id: string } | null;
  requestedVersion: number | null;
  subscribers: readonly SubscriberTerms[];
  timeZone: string;
}) {
  const base = `/espacios/${slug}/planes?tab=versiones`;
  const subjects = [
    ...catalogue.plans.map((p) => ({ type: "plan" as const, id: p.id, name: p.name })),
    ...catalogue.services.map((s) => ({ type: "service" as const, id: s.id, name: s.name })),
  ];
  const chosen = subjects.find((s) => subject && s.type === subject.type && s.id === subject.id) ?? subjects[0];
  if (!chosen) {
    return <EmptyReason reason={catalogue.failed ? "error" : "no_data_yet"} title={tc.noPlansTitle} />;
  }

  const versions = (chosen.type === "plan" ? catalogue.planVersions : catalogue.serviceVersions)
    .filter((v) => v.subjectId === chosen.id)
    .sort((a, b) => b.version - a.version);
  const selected = pickVersion(versions, requestedVersion);
  const previous = selected ? versions.find((v) => v.version === selected.version - 1) : undefined;
  const diff = selected && previous ? diffConditions(previous.conditions, selected.conditions) : null;
  const vigente = versions[0]?.version;
  const tema = `${chosen.type}:${chosen.id}`;

  return (
    <div className="space-y-4">
      <LoadFailed failed={catalogue.failed} />

      {/* Plan o servicio, como el "Plan:" de arriba a la derecha del dibujo. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="versiones" />
        <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-text">
          {tv.subjectLabel}
          <select
            name="tema"
            defaultValue={tema}
            className="min-w-60 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-normal"
          >
            <optgroup label={t.tabs.planes}>
              {subjects
                .filter((s) => s.type === "plan")
                .map((s) => (
                  <option key={s.id} value={`plan:${s.id}`}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label={t.tabs.servicios}>
              {subjects
                .filter((s) => s.type === "service")
                .map((s) => (
                  <option key={s.id} value={`service:${s.id}`}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-[10px] border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-soft-surface"
        >
          {tv.choose}
        </button>
      </form>

      {versions.length === 0 ? (
        <Card title={chosen.name}>
          <EmptyReason reason="no_data_yet" title={tv.noVersionsTitle} />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Card title={tv.historyTitle} className="min-w-0">
            <ul className="space-y-2" data-testid="planes-versiones">
              {versions.map((v) => {
                const activa = v.version === selected?.version;
                return (
                  <li key={v.id}>
                    <Link
                      href={`${base}&tema=${tema}&version=${v.version}`}
                      aria-current={activa ? "true" : undefined}
                      className={`flex items-center gap-4 rounded-[10px] border p-3 ${
                        activa ? "border-cuotly-green bg-cuotly-green/5" : "border-border hover:bg-soft-surface"
                      }`}
                    >
                      <span className="text-lg font-bold text-primary-dark">v{v.version}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-text">
                          {v.version === vigente ? tv.current : tv.previous}
                        </span>
                        <span className="block text-xs text-text-secondary">{day(v.publishedAt, timeZone)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          {selected ? (
            <Card title={tv.detailTitle} className="min-w-0">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-text-secondary">{tv.versionLabel}</dt>
                  <dd className="text-xl font-bold text-primary-dark">v{selected.version}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{tv.stateLabel}</dt>
                  <dd>
                    <StatusBadge tone={selected.version === vigente ? "success" : "neutral"}>
                      {selected.version === vigente ? tv.current : tv.previous}
                    </StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{tv.publishedLabel}</dt>
                  <dd className="font-semibold text-text">{day(selected.publishedAt, timeZone)}</dd>
                </div>
              </dl>

              <h3 className="mt-5 text-sm font-semibold text-text">{tv.changesTitle}</h3>
              {diff === null ? (
                <p className="mt-1 text-sm text-text-secondary">{tv.firstVersion}</p>
              ) : diff.added.length + diff.removed.length === 0 ? (
                <p className="mt-1 text-sm text-text-secondary">{tv.noChanges}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {diff.added.map((l) => (
                    <li key={`a-${l}`} className="flex items-start gap-2">
                      <Icon name="plus" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>
                        <span className="sr-only">{tv.added}: </span>
                        {l}
                      </span>
                    </li>
                  ))}
                  {diff.removed.map((l) => (
                    <li key={`r-${l}`} className="flex items-start gap-2 text-text-secondary">
                      <Icon name="close" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                      <span className="line-through">
                        <span className="sr-only">{tv.removed}: </span>
                        {l}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-cuotly-green">{tv.textTitle}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text">{selected.conditions}</p>
              </details>
            </Card>
          ) : null}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={tv.subscribersTitle} className="min-w-0">
          {subscribers.length === 0 ? (
            <p className="text-sm text-text-secondary">{tv.subscribersNone}</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="planes-suscriptores">
              {subscribers.map((s) => (
                <li key={s.establishmentId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/espacios/${slug}/planes/${s.establishmentId}`}
                    className="text-sm font-semibold text-text hover:text-cuotly-green"
                  >
                    {s.name}
                  </Link>
                  {s.terms === null ? (
                    <StatusBadge tone="neutral">{tv.acceptanceUnknown}</StatusBadge>
                  ) : (
                    <StatusBadge tone={termsTone(s.terms.status)} wrap>
                      {s.terms.current === null
                        ? t.terms.statusNoTerms
                        : s.terms.accepted === null
                          ? t.terms.statusPending(s.terms.current.version)
                          : s.terms.status === "accepted"
                            ? t.terms.statusAccepted(s.terms.accepted.version, day(s.terms.accepted.acceptedAt, timeZone))
                            : t.terms.statusOutdated(s.terms.accepted.version, s.terms.current.version)}
                    </StatusBadge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t.terms.publishTitle} className="min-w-0">
          <p className="mb-3 text-sm text-text-secondary">{tv.publishNote}</p>
          {catalogue.canPublish ? (
            <PublishConditionsForm subjectType={chosen.type} subjectId={chosen.id} />
          ) : (
            <p className="text-sm text-text-secondary">{tv.readOnly}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M56 · la lista de restaurantes con su plan                               */
/* ----------------------------------------------------------------------- */

export interface RestaurantPlanRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly planId: string | null;
  readonly planName: string | null;
  readonly planPriceCents: number | null;
  readonly services: readonly string[];
  readonly commitmentEndsAt: string | null;
  readonly commitmentCurrent: boolean;
  readonly renewsAt: string | null;
}

export function RestaurantsTab({
  slug,
  rows,
  plans,
  planFilter,
  timeZone,
}: {
  slug: string;
  rows: readonly RestaurantPlanRow[];
  plans: readonly { id: string; name: string }[];
  planFilter: string | null;
  timeZone: string;
}) {
  const visibles = planFilter === null ? rows : rows.filter((r) => r.planId === planFilter);
  const dia = (v: string) => enZona(v, timeZone, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="restaurantes" />
        <label className="flex flex-col gap-1 text-sm font-semibold text-text">
          {t.restaurantsTab.filterLabel}
          <select
            name="plan"
            defaultValue={planFilter ?? ""}
            className="min-w-52 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-normal"
          >
            <option value="">{t.restaurantsTab.filterAll}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-[10px] border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-soft-surface"
        >
          {t.restaurantsTab.filterSubmit}
        </button>
      </form>

      <Card className="p-0! overflow-hidden">
        {visibles.length === 0 ? (
          <div className="p-6">
            <EmptyReason reason="no_data_yet" title={t.emptyTitle} />
          </div>
        ) : (
          <div className="relative overflow-x-auto" data-testid="planes-restaurantes">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.planColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.servicesColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.commitmentColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.renewsColumn}</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">{t.manageLink}</span>
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibles.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell>
                      <EntityCell title={fila.name} subtitle={fila.code} />
                    </TableCell>
                    <TableCell>
                      {fila.planName === null ? (
                        // P6 · no tener plan es un dato, no un hueco.
                        <span className="text-sm text-text-secondary">{t.noPlan}</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone="info">{fila.planName}</StatusBadge>
                          <span className="whitespace-nowrap text-sm text-text-secondary">
                            {euros(fila.planPriceCents ?? 0)}
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-text-secondary">
                        {fila.services.length === 0 ? t.noServices : fila.services.join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap text-sm text-text-secondary">
                        {fila.commitmentEndsAt === null
                          ? t.noCommitment
                          : fila.commitmentCurrent
                            ? `${t.commitmentUntil} ${dia(fila.commitmentEndsAt)}`
                            : t.commitmentOver}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap text-sm text-text-secondary">
                        {fila.renewsAt === null ? t.noCycle : dia(fila.renewsAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ButtonLink href={`/espacios/${slug}/planes/${fila.id}`} variant="outline" size="sm">
                        {t.manageLink}
                      </ButtonLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      <p className="text-sm text-text-secondary">{t.noPlanHint}</p>
    </div>
  );
}
