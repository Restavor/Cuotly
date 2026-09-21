/**
 * La sección "Oportunidades" de "Informes y datos" (Fase 3, Hito 15;
 * §96 a §101). Las mismas piezas para el equipo y para el restaurante: lo
 * que cambia es quién mira, y con ello qué se ofrece.
 *
 * Tres cosas que esta pantalla hace y conviene no deshacer:
 *
 *   · **El título y la explicación de una automática se escriben aquí**,
 *     desde `src/i18n/es.ts`, a partir de la regla y el sujeto que guardó
 *     la base. La base no guarda español (CLAUDE.md).
 *   · **La evidencia se enseña siempre**, con sus cifras y su periodo:
 *     §96 dice que no debe afirmarse algo sin evidencia suficiente, y la
 *     forma de cumplirlo no es prometerlo, es enseñarla.
 *   · **El esfuerzo se dice en palabras del plan** (decisión 26b): la
 *     categoría del cambio, lo que se tarda y lo que gasta de la bolsa; y
 *     si el plan no lo incluye o la bolsa está agotada, que va a
 *     presupuesto, en vez de fingir que está incluido.
 */

import { Card, EmptyState, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui";
import type { ChangeCategory } from "@/core/consumption-ledger";
import {
  type EvidenceMeasurement,
  type OpportunityImpact,
  type OpportunityState,
  type PlanShape,
  canTransition,
  describeEffort,
  visibleToClient,
} from "@/core/opportunities";
import { es } from "@/i18n/es";
import { fechaCorta } from "@/i18n/dates";

import type { OpportunityRow, OpportunitiesView } from "./opportunities-load";
import { AddOpportunityForm, ClientActionForm, NoteForm, ProposalForm, StatusButton } from "./OpportunityForms";

const t = es.opportunities;

/** Quién está mirando. El servidor lo vuelve a comprobar en cada llamada. */
export type OpportunityViewer = "approver" | "worker" | "client";

type RuleKey = keyof typeof t.ruleTitles;

export function opportunityTitle(row: OpportunityRow): string {
  if (row.rule === null) return row.title ?? t.title;
  return t.ruleTitles[row.rule as RuleKey](row.subject);
}

function explicacion(row: OpportunityRow): string | null {
  if (row.rule === null) return row.description;
  return t.ruleExplanations[row.rule as RuleKey];
}

function accionRecomendada(row: OpportunityRow): string | null {
  if (row.recommendedAction !== null) return row.recommendedAction;
  return row.rule === null ? null : t.ruleActions[row.rule as RuleKey];
}

const TONO_ESTADO: Readonly<Record<OpportunityState, "success" | "warning" | "danger" | "info" | "neutral">> = {
  detected: "info",
  recommended: "info",
  under_review: "warning",
  approved_for_report: "success",
  discarded: "neutral",
  in_progress: "warning",
  implemented: "success",
  no_longer_applicable: "neutral",
};

const TONO_IMPACTO: Readonly<Record<OpportunityImpact, "danger" | "warning" | "neutral">> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

/** Una cifra de la evidencia, escrita con su unidad y sin inventar precisión. */
function cifra(measurement: EvidenceMeasurement, value: number | null): string {
  if (value === null) return t.evidenceNoPrevious;
  switch (measurement.unit) {
    case "ratio":
      return `${(value * 100).toFixed(2)} %`;
    case "percent":
      return `${value.toFixed(1)} %`;
    case "position":
      return value.toFixed(1);
    case "ms":
      return `${(value / 1000).toFixed(1)} s`;
    case "kb":
      return `${Math.round(value)} KB`;
    case "score":
      return String(Math.round(value));
    default:
      return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
  }
}

function nombreDeMetrica(metric: string): string {
  const catalogo = es.integrations.metrics as Record<string, string | undefined>;
  return catalogo[metric] ?? metric;
}

function Evidence({ row }: { row: OpportunityRow }) {
  if (row.evidence.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-sm font-semibold text-text">{t.evidenceTitle}</p>
      <p className="mb-2 text-xs text-text-secondary">{t.evidenceHint}</p>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t.evidenceMetricColumn}</TableHeaderCell>
            <TableHeaderCell>{t.evidenceValueColumn}</TableHeaderCell>
            <TableHeaderCell>{t.evidencePreviousColumn}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {row.evidence.map((measurement, i) => (
            <TableRow key={`${measurement.metric}-${measurement.dimension}-${i}`}>
              <TableCell>
                {nombreDeMetrica(measurement.metric)}
                {measurement.dimension === "" ? "" : ` · ${measurement.dimension}`}
              </TableCell>
              <TableCell>{cifra(measurement, measurement.value)}</TableCell>
              <TableCell>{cifra(measurement, measurement.previous)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {row.periodStart && row.periodEnd ? (
        <p className="mt-2 text-xs text-text-secondary">
          {t.period(fechaCorta(row.periodStart), fechaCorta(row.periodEnd))} · {t.detectedTimes(row.detectionCount)}
        </p>
      ) : null}
    </div>
  );
}

/** Decisión 26b · el esfuerzo, dicho en lo que se tarda y lo que gasta. */
function Effort({
  category,
  plan,
  remaining,
}: {
  category: ChangeCategory | null;
  plan: PlanShape | null;
  remaining: Readonly<Record<ChangeCategory, number>> | null;
}) {
  if (category === null) {
    return <p className="mt-3 text-sm text-text-secondary">{t.effortNone}</p>;
  }

  const nombre = es.naming.categories[category];
  const duracion = t.effortDuration[category];

  if (remaining === null) {
    return (
      <p className="mt-3 text-sm text-text">
        <span className="font-semibold">{t.effortTitle}:</span> {nombre} · {duracion}.{" "}
        <span className="text-text-secondary">{t.effortUnknownBalance}</span>
      </p>
    );
  }

  const efecto = describeEffort(category, plan, remaining[category]);
  return (
    <p className="mt-3 text-sm text-text">
      <span className="font-semibold">{t.effortTitle}:</span> {nombre} · {duracion}.{" "}
      {efecto.includedInPlan ? t.effortSpends(nombre, efecto.remaining) : t.effortNotIncluded}
    </p>
  );
}

function Acciones({
  row,
  viewer,
  path,
}: {
  row: OpportunityRow;
  viewer: OpportunityViewer;
  path: string;
}) {
  if (viewer === "client") {
    return <ClientActionForm opportunityId={row.id} title={opportunityTitle(row)} path={path} />;
  }

  const actor = viewer === "approver" ? "approver" : "worker";
  const botones: { status: OpportunityState; label: string; needsReason?: boolean }[] = ([
    { status: "recommended", label: t.recommend },
    { status: "under_review", label: t.review },
    { status: "approved_for_report", label: t.approve },
    { status: "in_progress", label: t.markInProgress },
    { status: "implemented", label: t.markImplemented },
    { status: "no_longer_applicable", label: t.markNotApplicable },
    { status: "discarded", label: t.discard, needsReason: true },
  ] as const).filter((boton) => canTransition(row.status, boton.status, actor)) as {
    status: OpportunityState;
    label: string;
    needsReason?: boolean;
  }[];

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {botones.map((boton) => (
          <StatusButton
            key={boton.status}
            opportunityId={row.id}
            status={boton.status}
            label={boton.label}
            path={path}
            needsReason={boton.needsReason}
          />
        ))}
      </div>
      {viewer === "worker" ? <p className="text-xs text-text-secondary">{t.cannotApproveHint}</p> : null}

      {viewer === "approver" ? (
        <ProposalForm
          opportunityId={row.id}
          impact={row.impact}
          priority={row.priority}
          effortCategory={row.effortCategory}
          includeInReport={row.includeInReport}
          recommendedAction={row.recommendedAction}
          path={path}
        />
      ) : null}

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-primary-dark">{t.notesTitle}</summary>
        <p className="mt-1 text-xs text-text-secondary">{t.notesHint}</p>
        <NoteForm opportunityId={row.id} path={path} />
      </details>
    </div>
  );
}

function OpportunityCard({
  row,
  viewer,
  view,
  path,
}: {
  row: OpportunityRow;
  viewer: OpportunityViewer;
  view: OpportunitiesView;
  path: string;
}) {
  const explica = explicacion(row);
  const accion = accionRecomendada(row);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-primary-dark">{opportunityTitle(row)}</h3>
        <StatusBadge tone={TONO_ESTADO[row.status]}>{t.states[row.status]}</StatusBadge>
        <StatusBadge tone={TONO_IMPACTO[row.impact]}>{t.impacts[row.impact]}</StatusBadge>
        <StatusBadge tone="neutral">{t.categories[row.category as keyof typeof t.categories]}</StatusBadge>
        {viewer === "client" ? null : (
          <>
            <StatusBadge tone="neutral">{t.scopes[row.scope]}</StatusBadge>
            <StatusBadge tone="neutral">{t.priorityLabel(row.priority)}</StatusBadge>
          </>
        )}
      </div>

      {explica ? <p className="mt-2 text-sm text-text">{explica}</p> : null}
      <p className="mt-1 text-xs text-text-secondary">{t.impactHints[row.impact]}</p>

      {accion ? (
        <p className="mt-2 text-sm text-text">
          <span className="font-semibold">{t.recommendedActionLabel}:</span> {accion}
        </p>
      ) : null}

      <Effort category={row.effortCategory} plan={view.plan} remaining={view.remaining} />

      <Evidence row={row} />

      {row.reopenedAt && row.discardReason ? (
        <p className="mt-2 text-xs text-text-secondary">{t.reopenedAfterDiscard(row.discardReason)}</p>
      ) : null}

      {viewer === "client" ? null : (
        <p className="mt-2 text-xs text-text-secondary">
          {t.origins[row.origin]} · {t.clientVisibilityNote(visibleToClient(row.status))}{" "}
          {row.includeInReport ? t.includedInReport : t.notIncludedInReport}
        </p>
      )}

      <Acciones row={row} viewer={viewer} path={path} />
    </Card>
  );
}

export function OpportunitiesSection({
  view,
  viewer,
  establishmentId,
  path,
}: {
  view: OpportunitiesView | null;
  viewer: OpportunityViewer;
  establishmentId: string;
  path: string;
}) {
  if (view === null) {
    return (
      <Card title={t.title}>
        <EmptyState title={es.states.errorTitle} description={es.emptyReasons.error} />
      </Card>
    );
  }

  if (view.rows.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <EmptyState
            icon="agent"
            title={
              viewer === "client" && view.access === "none"
                ? es.integrations.sections.opportunities.emptyTitle
                : t.teamEmpty
            }
            description={
              viewer === "client"
                ? view.access === "none"
                  ? t.clientEmptyNone
                  : t.clientEmptyBasic
                : t.teamEmptyHint
            }
          />
        </Card>
        {viewer === "client" ? null : <Card><AddOpportunityForm establishmentId={establishmentId} path={path} /></Card>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">{viewer === "client" ? t.clientHint : t.teamHint}</p>
      {viewer === "client" ? null : (
        <p className="text-xs text-text-secondary">
          {t.impactNotMoney} {t.clientPlanNote[view.access]}
        </p>
      )}

      {view.rows.map((row) => (
        <OpportunityCard key={row.id} row={row} viewer={viewer} view={view} path={path} />
      ))}

      {viewer === "client" ? null : <Card><AddOpportunityForm establishmentId={establishmentId} path={path} /></Card>}
    </div>
  );
}

/**
 * Página 26 del diseño · "Oportunidades destacadas", en el Resumen de
 * "Informes y datos".
 *
 * Es un **resumen** de la sección Oportunidades, no un segundo sitio donde
 * decidir: aquí no hay botones de aprobar ni de descartar. Esas decisiones
 * se toman en la sección, con la evidencia y el periodo delante, que es
 * justo lo que no cabe en cuatro líneas (§96).
 *
 * Qué entra y qué no:
 *
 *   · Fuera las **descartadas** y las que **ya no aplican**: una
 *     oportunidad que alguien descartó no está destacada, está cerrada.
 *   · El orden es el de `priority`, el mismo que usa la sección. Ordenar
 *     aquí por otra cosa —el impacto, la fecha— haría que "las cuatro
 *     primeras" fueran cuatro distintas en cada pantalla.
 *   · Sin plan de mantenimiento no se detectan (§101), y eso se dice: un
 *     "no hay ninguna" ahí haría pensar que se miró y no había nada.
 *
 * El impacto va **escrito**, no solo con color (§21.4), y su texto sale
 * del mismo diccionario que la sección (CA-21).
 */
export function OpportunityHighlights({ view }: { readonly view: OpportunitiesView | null }) {
  if (view === null || view.access === "none") {
    return <EmptyState title={t.highlightsEmptyTitle} description={t.highlightsNoPlan} />;
  }

  const CERRADAS: readonly string[] = ["discarded", "no_longer_applicable"];
  const destacadas = view.rows
    .filter((row) => !CERRADAS.includes(row.status))
    .slice(0, 4);

  if (destacadas.length === 0) {
    return (
      <EmptyState title={t.highlightsEmptyTitle} description={t.highlightsEmptyReason} />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {destacadas.map((row) => (
        <li key={row.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5">
          <span className="min-w-0 flex-1 basis-48">
            <span className="block truncate text-sm font-medium text-text">
              {opportunityTitle(row)}
            </span>
            <span className="block truncate text-xs text-text-secondary">
              {t.states[row.status]}
            </span>
          </span>
          <StatusBadge tone={TONO_IMPACTO[row.impact]}>{t.impacts[row.impact]}</StatusBadge>
        </li>
      ))}
    </ul>
  );
}
