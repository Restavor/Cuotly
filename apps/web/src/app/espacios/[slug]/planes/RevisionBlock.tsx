import { StatusBadge } from "@/components/ui";
import { revisionTone } from "@/core/plan-catalogue";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import { RecordRevisionAcceptanceForm } from "./CatalogueForms";
import type { SubscriptionRevision } from "./revision-load";

const tc = es.plansPage.catalogue;
const tr = es.plansPage.revisions;

/** Un término escrito como se lee: euros, horas, sí/no, nivel de informe. */
export function revisionValue(field: string, value: string | null): string {
  if (value === null || value === "") return tr.noValue;
  if (field.startsWith("price")) return euros(Number(value));
  if (field.endsWith("_hours") || field.startsWith("execution_sla")) return tc.hours(Number(value));
  if (value === "true") return tc.yes;
  if (value === "false") return tc.no;
  if (field === "report_level") return tc.reportLevels[value as keyof typeof tc.reportLevels] ?? value;
  return value;
}

/** Qué cambia, término a término, con si mejora o empeora (RN-COM-30). */
export function RevisionChanges({ changes }: { changes: SubscriptionRevision["changes"] }) {
  if (changes === null) return <p className="text-sm text-text-secondary">{tr.compareFailed}</p>;
  return (
    <ul className="divide-y divide-border">
      {changes.map((d) => (
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
  );
}

/**
 * M56 · la versión nueva de lo que tiene este restaurante: dónde está,
 * cuándo pasa, qué cambia y, si le perjudica y no la ha aceptado,
 * registrar la aceptación que dio fuera de Cuotly (RN-COM-23/24).
 */
export function RevisionBlock({
  revision,
  subscriptionId,
  canRecord,
  today,
  files,
  timeZone,
}: {
  revision: SubscriptionRevision;
  subscriptionId: string;
  canRecord: boolean;
  today: string;
  files: readonly { readonly id: string; readonly name: string }[];
  timeZone: string;
}) {
  const dia = revision.movesAt
    ? enZona(revision.movesAt, timeZone, { day: "numeric", month: "short", year: "numeric" })
    : "—";
  const texto =
    revision.state === "held_back"
      ? tr.states.held_back
      : revision.state === "scheduled"
        ? tr.states.scheduled(dia)
        : tr.states.awaiting_acceptance(dia);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border p-3" data-testid="version-pendiente">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-text">
          {tr.onRevision(revision.currentRevision)} → v{revision.headRevision}
        </span>
        <StatusBadge tone={revisionTone(revision.state)} wrap>
          {texto}
        </StatusBadge>
      </div>
      {revision.state === "held_back" ? <p className="text-xs text-text-secondary">{tr.heldBackHint}</p> : null}
      <RevisionChanges changes={revision.changes} />
      {canRecord && revision.harms && !revision.accepted ? (
        <div className="rounded-lg bg-soft-surface p-3">
          <p className="text-sm font-semibold text-text">{tr.recordTitle}</p>
          <p className="mb-2 text-xs text-text-secondary">{tr.recordHint}</p>
          <RecordRevisionAcceptanceForm subscriptionId={subscriptionId} today={today} files={files} />
        </div>
      ) : null}
    </div>
  );
}
