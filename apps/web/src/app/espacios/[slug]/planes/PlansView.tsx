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
import {
  diffConditions,
  isRevisionState,
  pickVersion,
  restaurantsBySubject,
  revisionTone,
  type PlansTab,
} from "@/core/plan-catalogue";
import { termsTone } from "@/core/terms";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import type {
  ActiveSubscription,
  CataloguePlan,
  ConditionsVersion,
  PlanCatalogue,
  RevisionStatusRow,
  SubscriberTerms,
} from "./catalogue-load";
import { ArchiveForm, PlanTermsForm, RenameForm, ServiceTermsForm } from "./CatalogueForms";
import { revisionValue } from "./RevisionBlock";
import { PublishConditionsForm } from "./PlanForms";

const t = es.plansPage;
const tc = t.catalogue;
const tv = t.versions;
const te = t.edit;
const tr = t.revisions;

/**
 * Cuántos restaurantes tiene cada plan o servicio, contando todas sus
 * versiones: quien sigue en la 1 también lo tiene (decisión 72).
 */
function countsByLineage(subscriptions: readonly ActiveSubscription[]): ReadonlyMap<string, number> {
  return restaurantsBySubject(
    subscriptions.map((s) => ({
      establishmentId: s.establishmentId,
      planId: s.planId !== null ? s.lineageId : null,
      serviceId: s.serviceId !== null ? s.lineageId : null,
    })),
  );
}

/** RN-COM-22/24 · la insignia de dónde está un restaurante frente a la versión vigente. */
export function RevisionStateBadge({ row, timeZone }: { row: RevisionStatusRow; timeZone: string }) {
  if (!isRevisionState(row.state)) return null;
  const dia = row.movesAt ? enZona(row.movesAt, timeZone, { day: "numeric", month: "short", year: "numeric" }) : "—";
  const texto =
    row.state === "held_back" ? tr.states.held_back : row.state === "scheduled" ? tr.states.scheduled(dia) : tr.states.awaiting_acceptance(dia);
  return (
    <StatusBadge tone={revisionTone(row.state)} wrap>
      {texto}
    </StatusBadge>
  );
}

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

type RevisionRow = {
  readonly id: string;
  readonly lineageId: string;
  readonly revision: number;
  readonly priceCents: number;
  readonly publishedAt: string;
  readonly supersededAt: string | null;
};

/** Las versiones del precio y las cuotas de un plan o servicio, de la más nueva a la más vieja. */
export function revisionsOf(
  catalogue: PlanCatalogue,
  type: "plan" | "service",
  lineageId: string,
): readonly RevisionRow[] {
  const rows: readonly RevisionRow[] = type === "plan" ? catalogue.planRevisions : catalogue.serviceRevisions;
  return rows
    .filter((r) => r.lineageId === lineageId)
    .sort((a, b) => b.revision - a.revision);
}

export function pickRevision(revisions: readonly RevisionRow[], requested: number | null): RevisionRow | null {
  return revisions.find((r) => r.revision === requested) ?? revisions[0] ?? null;
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
  spaceId,
  catalogue,
  selectedId,
  action,
  timeZone,
}: {
  slug: string;
  spaceId: string;
  catalogue: PlanCatalogue;
  selectedId: string | null;
  action: "crear" | "editar" | null;
  timeZone: string;
}) {
  const counts = countsByLineage(catalogue.subscriptions);
  const selected: CataloguePlan | undefined =
    catalogue.plans.find((p) => p.id === selectedId) ?? catalogue.plans[catalogue.plans.length - 1];
  const base = `/espacios/${slug}/planes`;

  const crear =
    catalogue.canPublish && action === "crear" ? (
      <Card title={te.newPlanTitle}>
        <PlanTermsForm spaceId={spaceId} planId={null} initial={null} inUse={0} />
      </Card>
    ) : null;
  const botonCrear = catalogue.canPublish ? (
    <ButtonLink href={`${base}?accion=crear`} icon="plus" size="sm">
      {te.createPlan}
    </ButtonLink>
  ) : null;

  if (catalogue.plans.length === 0) {
    return (
      <div className="space-y-4">
        <LoadFailed failed={catalogue.failed} />
        <div className="flex justify-end">{botonCrear}</div>
        {crear}
        <EmptyReason reason={catalogue.failed ? "error" : "no_data_yet"} title={tc.noPlansTitle} />
      </div>
    );
  }

  const conditions = selected ? currentVersion(catalogue.planVersions, selected.lineageId) : null;
  const editando = catalogue.canPublish && action === "editar" && selected !== undefined && !selected.archived;
  const yesNo = (v: boolean) => (v ? tc.yes : tc.no);

  return (
    <div className="space-y-4">
      <LoadFailed failed={catalogue.failed} />
      {botonCrear ? <div className="flex justify-end">{botonCrear}</div> : null}
      {crear}
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
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-semibold ${p.id === selected?.id ? "text-cuotly-green" : "text-text"}`}
                            aria-current={p.id === selected?.id ? "true" : undefined}
                          >
                            {p.name}
                          </span>
                          {p.archived ? <StatusBadge tone="neutral">{tc.archived}</StatusBadge> : null}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap text-sm text-text-secondary">
                          {tc.pricePerMonth(euros(p.priceCents))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-text-secondary">{counts.get(p.lineageId) ?? 0}</span>
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
                  <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold text-primary-dark">
                    {selected.name}
                    <span className="text-xs font-normal text-text-secondary">{tc.revisionLabel(selected.revision)}</span>
                    {selected.archived ? <StatusBadge tone="neutral">{tc.archived}</StatusBadge> : null}
                  </h2>
                  <p className="mt-2">
                    <span className="text-4xl font-bold tracking-tight text-primary-dark">
                      {euros(selected.priceCents)}
                    </span>{" "}
                    <span className="text-text-secondary">+ IVA/mes</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {catalogue.canPublish && !selected.archived ? (
                    <ButtonLink href={`${base}?plan=${selected.id}&accion=editar`} variant="secondary" size="sm">
                      {te.editPlan}
                    </ButtonLink>
                  ) : null}
                  <ButtonLink href={`${base}?tab=restaurantes&plan=${selected.lineageId}`} variant="outline" size="sm">
                    {tc.viewInRestaurants}
                  </ButtonLink>
                </div>
              </div>
              {selected.archived ? <p className="mt-2 text-xs text-text-secondary">{tc.archivedHint}</p> : null}
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

          {editando && selected ? (
            <Card title={te.editPlan}>
              <div className="space-y-6">
                <PlanTermsForm
                  spaceId={spaceId}
                  planId={selected.id}
                  inUse={counts.get(selected.lineageId) ?? 0}
                  initial={{
                    priceCents: selected.priceCents,
                    includedSmall: selected.includedSmall,
                    includedPhoto: selected.includedPhoto,
                    includedMedium: selected.includedMedium,
                    includedLarge: selected.includedLarge,
                    startSlaHours: selected.startSlaHours,
                    executionSlaSmall: selected.executionSla.small,
                    executionSlaPhoto: selected.executionSla.photo,
                    executionSlaMedium: selected.executionSla.medium,
                    executionSlaLarge: selected.executionSla.large,
                    canOrderRequests: selected.canOrderRequests,
                    grantsPriority: selected.grantsPriority,
                    queueRank: selected.queueRank,
                    reportLevel: selected.reportLevel,
                    watchesReviews: selected.watchesReviews,
                  }}
                />
                <div className="border-t border-border pt-4">
                  <RenameForm kind="plan" id={selected.id} name={selected.name} />
                </div>
                <div className="border-t border-border pt-4">
                  <h3 className="mb-2 text-sm font-semibold text-text">{te.archiveTitle}</h3>
                  <ArchiveForm kind="plan" id={selected.id} />
                </div>
                <ButtonLink href={`${base}?plan=${selected.id}`} variant="secondary" size="sm">
                  {te.cancel}
                </ButtonLink>
              </div>
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
            {catalogue.canPublish ? null : <p className="text-xs text-text-secondary">{tc.editingReadOnly}</p>}
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
  spaceId,
  catalogue,
  selectedId,
  action,
  timeZone,
}: {
  slug: string;
  spaceId: string;
  catalogue: PlanCatalogue;
  selectedId: string | null;
  action: "crear" | "editar" | null;
  timeZone: string;
}) {
  const base = `/espacios/${slug}/planes?tab=servicios`;
  const counts = countsByLineage(catalogue.subscriptions);
  const selected = catalogue.services.find((s) => s.id === selectedId) ?? catalogue.services[0];
  const crear =
    catalogue.canPublish && action === "crear" ? (
      <Card title={te.newServiceTitle}>
        <ServiceTermsForm spaceId={spaceId} serviceId={null} initial={null} inUse={0} />
      </Card>
    ) : null;
  const botonCrear = catalogue.canPublish ? (
    <div className="flex justify-end">
      <ButtonLink href={`${base}&accion=crear`} icon="plus" size="sm">
        {te.createService}
      </ButtonLink>
    </div>
  ) : null;

  if (!selected) {
    return (
      <div className="space-y-4">
        <LoadFailed failed={catalogue.failed} />
        {botonCrear}
        {crear}
        <EmptyReason reason={catalogue.failed ? "error" : "no_data_yet"} title={tc.noServicesTitle} />
      </div>
    );
  }
  const conditions = currentVersion(catalogue.serviceVersions, selected.lineageId);
  const editando = catalogue.canPublish && action === "editar" && !selected.archived;
  const isMenu = selected.kind === "daily_menu";

  return (
    <div className="space-y-4">
      <LoadFailed failed={catalogue.failed} />
      {botonCrear}
      {crear}
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
                      <span className="font-semibold text-primary-dark">
                        {s.name}
                        {s.archived ? <span className="ml-2 text-xs font-normal text-text-secondary">{tc.archived}</span> : null}
                      </span>
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
          {catalogue.canPublish ? null : (
            <p className="mt-4 text-xs text-text-secondary">{tc.editingServicesReadOnly}</p>
          )}
        </Card>

        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-primary-dark">{selected.name}</h2>
            <span className="text-xs text-text-secondary">{tc.revisionLabel(selected.revision)}</span>
            <StatusBadge tone="neutral">{tc.restaurantsCount(counts.get(selected.lineageId) ?? 0)}</StatusBadge>
            {selected.archived ? <StatusBadge tone="neutral">{tc.archived}</StatusBadge> : null}
            {catalogue.canPublish && !selected.archived ? (
              <ButtonLink href={`${base}&servicio=${selected.id}&accion=editar`} variant="secondary" size="sm">
                {te.editService}
              </ButtonLink>
            ) : null}
          </div>
          {selected.archived ? <p className="mt-1 text-xs text-text-secondary">{tc.archivedHint}</p> : null}
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

          {editando ? (
            <div className="mt-5 space-y-6 border-t border-border pt-5">
              <h3 className="text-base font-semibold text-text">{te.editService}</h3>
              <ServiceTermsForm
                spaceId={spaceId}
                serviceId={selected.id}
                inUse={counts.get(selected.lineageId) ?? 0}
                initial={{
                  priceCents: selected.priceCents,
                  pricePremiumCents: selected.pricePremiumCents,
                  includedUpdates: selected.includedUpdates,
                }}
              />
              <div className="border-t border-border pt-4">
                <RenameForm kind="service" id={selected.id} name={selected.name} />
              </div>
              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-semibold text-text">{te.archiveTitle}</h3>
                <ArchiveForm kind="service" id={selected.id} />
              </div>
              <ButtonLink href={`${base}&servicio=${selected.id}`} variant="secondary" size="sm">
                {te.cancel}
              </ButtonLink>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M55 · Versiones                                                          */
/* ----------------------------------------------------------------------- */

export interface RevisionDiffRow {
  readonly field: string;
  readonly oldValue: string | null;
  readonly newValue: string | null;
  readonly better: boolean;
}

export function VersionsTab({
  slug,
  catalogue,
  subject,
  requestedVersion,
  requestedRevision,
  revisionDiff,
  subscribers,
  timeZone,
}: {
  slug: string;
  catalogue: PlanCatalogue;
  subject: { readonly type: "plan" | "service"; readonly id: string } | null;
  requestedVersion: number | null;
  requestedRevision: number | null;
  /** RN-COM-30 · la comparativa de la versión elegida con la anterior; `null` si no se pudo leer. */
  revisionDiff: readonly RevisionDiffRow[] | null;
  subscribers: readonly SubscriberTerms[];
  timeZone: string;
}) {
  const base = `/espacios/${slug}/planes?tab=versiones`;
  const subjects = [
    ...catalogue.plans.map((p) => ({ type: "plan" as const, id: p.id, lineageId: p.lineageId, name: p.name })),
    ...catalogue.services.map((s) => ({ type: "service" as const, id: s.id, lineageId: s.lineageId, name: s.name })),
  ];
  const chosen = subjects.find((s) => subject && s.type === subject.type && s.id === subject.id) ?? subjects[0];
  if (!chosen) {
    return <EmptyReason reason={catalogue.failed ? "error" : "no_data_yet"} title={tc.noPlansTitle} />;
  }

  const revisions = revisionsOf(catalogue, chosen.type, chosen.lineageId);
  const selectedRevision = pickRevision(revisions, requestedRevision);
  const harms = revisionDiff?.some((d) => !d.better && d.field !== "queue_rank") ?? false;
  const estados = new Map(catalogue.revisionStatus.map((r) => [r.subscriptionId, r]));

  const versions = (chosen.type === "plan" ? catalogue.planVersions : catalogue.serviceVersions)
    .filter((v) => v.subjectId === chosen.lineageId)
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

      {/* RN-COM-20 y 30 · las versiones de lo que se contrata. */}
      <Card title={tr.title}>
        {revisions.length <= 1 ? (
          <p className="text-sm text-text-secondary">{tr.none}</p>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ul className="space-y-2" data-testid="planes-revisiones">
              {revisions.map((r) => {
                const activa = r.revision === selectedRevision?.revision;
                return (
                  <li key={r.id}>
                    <Link
                      href={`${base}&tema=${chosen.type}:${chosen.id}&rev=${r.revision}`}
                      aria-current={activa ? "true" : undefined}
                      className={`flex items-center gap-4 rounded-[10px] border p-3 ${
                        activa ? "border-cuotly-green bg-cuotly-green/5" : "border-border hover:bg-soft-surface"
                      }`}
                    >
                      <span className="text-lg font-bold text-primary-dark">v{r.revision}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-text">
                          {r.supersededAt === null ? tr.current : tr.previous} · {euros(r.priceCents)}
                        </span>
                        <span className="block text-xs text-text-secondary">{tr.publishedOn(day(r.publishedAt, timeZone))}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="min-w-0">
              {selectedRevision === null || selectedRevision.revision === 1 ? (
                <p className="text-sm text-text-secondary">{tr.firstRevision}</p>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-text">
                    {tr.compareTitle(selectedRevision.revision - 1, selectedRevision.revision)}
                  </h3>
                  {revisionDiff === null ? (
                    <p className="mt-2 text-sm text-text-secondary">{tr.compareFailed}</p>
                  ) : (
                    <>
                      <ul className="mt-2 divide-y divide-border" data-testid="planes-comparativa">
                        {revisionDiff.map((d) => (
                          <li key={d.field} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                            <span className="text-text-secondary">{tr.fields[d.field] ?? d.field}</span>
                            <span className="flex items-center gap-2">
                              <span className="text-text-secondary line-through">{revisionValue(d.field, d.oldValue)}</span>
                              <span className="font-semibold text-text">{revisionValue(d.field, d.newValue)}</span>
                              <StatusBadge tone={d.better ? "success" : "danger"}>{d.better ? tr.better : tr.worse}</StatusBadge>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-sm text-text">{harms ? tr.harmsNote : tr.favoursNote}</p>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Card>

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
                  {estados.get(s.subscriptionId) ? (
                    <RevisionStateBadge row={estados.get(s.subscriptionId)!} timeZone={timeZone} />
                  ) : null}
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
  /** El plan en cualquiera de sus versiones: es por lo que se filtra. */
  readonly planLineageId: string | null;
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
  revisionStatus,
  timeZone,
}: {
  slug: string;
  rows: readonly RestaurantPlanRow[];
  /** Un plan por linaje: `id` es el `lineage_id`. */
  plans: readonly { id: string; name: string }[];
  planFilter: string | null;
  revisionStatus: readonly RevisionStatusRow[];
  timeZone: string;
}) {
  const visibles = planFilter === null ? rows : rows.filter((r) => r.planLineageId === planFilter);
  const estadoDe = new Map(
    revisionStatus.filter((r) => r.kind === "plan").map((r) => [r.establishmentId, r] as const),
  );
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
                          {estadoDe.get(fila.id) ? (
                            <RevisionStateBadge row={estadoDe.get(fila.id)!} timeZone={timeZone} />
                          ) : null}
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
