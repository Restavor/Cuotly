"use client";

/**
 * Los formularios de Oportunidades (§97, §98, §100). Son lo único que
 * necesita ser cliente: el resto de la sección se pinta en el servidor.
 *
 * Ninguno decide si puede: enseñan lo que tiene sentido enseñar y el
 * servidor vuelve a comprobarlo (migración 84). Si un botón se colara,
 * la llamada respondería que no — que es la diferencia entre ocultar y
 * cerrar (CLAUDE.md).
 */

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import type { ChangeCategory } from "@/core/consumption-ledger";
import type { OpportunityImpact, OpportunityState } from "@/core/opportunities";
import { es } from "@/i18n/es";

import { INITIAL_OPPORTUNITY_STATE, type OpportunityFormState } from "./opportunity-action-state";
import {
  actOnOpportunity,
  addManualOpportunity,
  addOpportunityNote,
  changeOpportunityStatus,
  editOpportunityProposal,
} from "./opportunity-actions";

const t = es.opportunities;

function Error({ state }: { state: OpportunityFormState }) {
  return state.error ? (
    <p role="alert" className="text-sm text-danger">
      {state.error}
    </p>
  ) : null;
}

const IMPACT_OPTIONS: { value: OpportunityImpact; label: string }[] = [
  { value: "high", label: t.impacts.high },
  { value: "medium", label: t.impacts.medium },
  { value: "low", label: t.impacts.low },
];

const EFFORT_OPTIONS: { value: ChangeCategory; label: string }[] = [
  { value: "small", label: es.naming.categories.small },
  { value: "photo", label: es.naming.categories.photo },
  { value: "medium", label: es.naming.categories.medium },
  { value: "large", label: es.naming.categories.large },
];

const CATEGORY_OPTIONS = [
  { value: "traffic", label: t.categories.traffic },
  { value: "search", label: t.categories.search },
  { value: "performance", label: t.categories.performance },
  { value: "technical", label: t.categories.technical },
  { value: "conversion", label: t.categories.conversion },
];

/**
 * Mover de estado. El motivo solo se pide donde hace falta: descartar sin
 * motivo no se puede (§99, la descartada conserva historial).
 */
export function StatusButton({
  opportunityId,
  status,
  label,
  path,
  needsReason = false,
}: {
  opportunityId: string;
  status: OpportunityState;
  label: string;
  path: string;
  needsReason?: boolean;
}) {
  const [state, action, pending] = useActionState(changeOpportunityStatus, INITIAL_OPPORTUNITY_STATE);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="path" value={path} />
      {needsReason ? <Field label={t.reasonLabel} name="reason" required /> : null}
      <Button type="submit" variant={needsReason ? "secondary" : "primary"} disabled={pending}>
        {label}
      </Button>
      <Error state={state} />
    </form>
  );
}

/** §96 · impacto, prioridad, esfuerzo y acción recomendada son propuestas editables. */
export function ProposalForm({
  opportunityId,
  impact,
  priority,
  effortCategory,
  includeInReport,
  recommendedAction,
  path,
}: {
  opportunityId: string;
  impact: OpportunityImpact;
  priority: number;
  effortCategory: ChangeCategory | null;
  includeInReport: boolean;
  recommendedAction: string | null;
  path: string;
}) {
  const [state, action, pending] = useActionState(editOpportunityProposal, INITIAL_OPPORTUNITY_STATE);

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary-dark">{t.editTitle}</summary>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <input type="hidden" name="path" value={path} />
        <p className="text-sm text-text-secondary">{t.editHint}</p>

        <Select label={t.impactLabel} name="impact" defaultValue={impact} options={IMPACT_OPTIONS} />
        <Field label={t.priorityField} name="priority" type="number" min={1} max={3} defaultValue={priority} />
        <Select
          label={t.effortLabel}
          name="effortCategory"
          defaultValue={effortCategory ?? "small"}
          options={EFFORT_OPTIONS}
        />
        <Field label={t.recommendedActionLabel} name="recommendedAction" defaultValue={recommendedAction ?? ""} />

        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" name="includeInReport" defaultChecked={includeInReport} />
          {t.includeInReport}
        </label>

        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
        <Error state={state} />
      </form>
    </details>
  );
}

/** §97 · "Existe Añadir oportunidad". */
export function AddOpportunityForm({ establishmentId, path }: { establishmentId: string; path: string }) {
  const [state, action, pending] = useActionState(addManualOpportunity, INITIAL_OPPORTUNITY_STATE);

  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-primary-dark">{t.addTitle}</summary>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="establishmentId" value={establishmentId} />
        <input type="hidden" name="path" value={path} />
        <p className="text-sm text-text-secondary">{t.addHint}</p>

        <Field label={t.titleLabel} name="title" required />
        <TextArea label={t.descriptionLabel} name="description" />
        <Select label={t.categoryLabel} name="category" options={CATEGORY_OPTIONS} />
        <Select label={t.impactLabel} name="impact" defaultValue="medium" options={IMPACT_OPTIONS} />
        <Select label={t.effortLabel} name="effortCategory" defaultValue="small" options={EFFORT_OPTIONS} />
        <Field label={t.recommendedActionLabel} name="recommendedAction" />

        <Button type="submit" disabled={pending}>
          {pending ? t.adding : t.add}
        </Button>
        <Error state={state} />
      </form>
    </details>
  );
}

/** §97 · aportar evidencia y añadir observaciones. Interno. */
export function NoteForm({ opportunityId, path }: { opportunityId: string; path: string }) {
  const [state, action, pending] = useActionState(addOpportunityNote, INITIAL_OPPORTUNITY_STATE);

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="path" value={path} />
      <TextArea label={t.noteLabel} name="body" />
      <Select
        label={t.notesTitle}
        name="kind"
        defaultValue="observation"
        options={[
          { value: "observation", label: t.noteKinds.observation },
          { value: "evidence", label: t.noteKinds.evidence },
        ]}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {t.addNote}
      </Button>
      <Error state={state} />
    </form>
  );
}

/** §100 · las tres acciones del restaurante. Las tres crean un borrador. */
export function ClientActionForm({
  opportunityId,
  title,
  path,
}: {
  opportunityId: string;
  title: string;
  path: string;
}) {
  const [state, action, pending] = useActionState(actOnOpportunity, INITIAL_OPPORTUNITY_STATE);

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="path" value={path} />
      <p className="text-sm font-semibold text-text">{t.clientActionsTitle}</p>
      <p className="text-sm text-text-secondary">{t.clientActionHint}</p>

      <Select
        label={t.clientActionsTitle}
        name="action"
        defaultValue="request_change"
        options={[
          { value: "request_change", label: t.clientActions.request_change },
          { value: "request_quote", label: t.clientActions.request_quote },
          { value: "ask_question", label: t.clientActions.ask_question },
        ]}
      />
      <TextArea label={t.messageLabel} name="message" defaultValue={t.messagePrefill(title)} />

      <Button type="submit" disabled={pending}>
        {pending ? t.sending : t.send}
      </Button>
      {state.done ? <p className="text-sm text-success">{t.draftCreated}</p> : null}
      <Error state={state} />
    </form>
  );
}
