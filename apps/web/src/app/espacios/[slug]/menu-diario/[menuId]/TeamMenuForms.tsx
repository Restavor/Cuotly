"use client";

import { useActionState } from "react";

import { Button, Card, EmptyState, Field, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, TextArea } from "@/components/ui";
import type { MenuState } from "@/core/menu-states";
import { es } from "@/i18n/es";

import { INITIAL_TEAM_MENU_ACTION, type TeamMenuActionState } from "../action-state";
import {
  assignMenuPublication,
  completeMenuCorrection,
  markMenuPublished,
  openMenuTeamErrorCorrection,
  refundMenuUpdate,
  reportMenuPublicationError,
  requestMenuInformation,
} from "../actions";

const t = es.dailyMenuTeam;

function horaLocal(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function Feedback({ state }: { state: TeamMenuActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.done && state.notice) {
    return <p className="text-sm text-success">{state.notice}</p>;
  }
  return null;
}

export type MenuCandidate = {
  readonly workerId: string;
  readonly name: string;
  readonly loadPoints: number;
  readonly menuCount: number;
};

/**
 * Asignar o reasignar (RN-ASG-02/04, RN-MEN-06). Los candidatos y su orden
 * los da `list_menu_candidates()`; quien puede, lo decide
 * `assign_menu_publication()` al pulsar.
 */
export function AssignMenuForm({
  menuId,
  candidates,
  reassign,
}: {
  menuId: string;
  candidates: readonly MenuCandidate[];
  reassign: boolean;
}) {
  const [state, action, pending] = useActionState(assignMenuPublication.bind(null, menuId), INITIAL_TEAM_MENU_ACTION);

  return (
    <Card title={reassign ? t.reassignTitle : t.assignTitle}>
      <p className="mb-3 text-sm text-text-secondary">{t.assignHint}</p>
      {candidates.length === 0 ? (
        <EmptyState title={t.assignEmptyTitle} description={t.assignEmptyReason} />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.candidateColumn}</TableHeaderCell>
                <TableHeaderCell>{t.loadColumn}</TableHeaderCell>
                <TableHeaderCell>{t.menusColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c.workerId}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.loadPoints}</TableCell>
                  <TableCell>{c.menuCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <form action={action} className="mt-4 space-y-3">
            <Select
              label={t.candidateColumn}
              name="workerId"
              required
              options={candidates.map((c) => ({ value: c.workerId, label: c.name }))}
            />
            <Field label={t.assignReasonLabel} name="reason" />
            <Feedback state={state} />
            <Button type="submit" disabled={pending}>
              {pending ? t.assignPending : t.assignSubmit}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

/**
 * Lo que hace quien tiene la publicación entre manos (§61, §63): pedir
 * información, marcar publicado, registrar un error. Sin botón Comenzar.
 * La pantalla elige qué pintar por estado; quién puede lo decide cada
 * función al pulsar.
 */
export function WorkerActions({ menuId, state: menuState }: { menuId: string; state: MenuState }) {
  const [infoState, infoAction, infoPending] = useActionState(
    requestMenuInformation.bind(null, menuId),
    INITIAL_TEAM_MENU_ACTION,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    async () => markMenuPublished(menuId),
    INITIAL_TEAM_MENU_ACTION,
  );
  const [errorState, errorAction, errorPending] = useActionState(
    reportMenuPublicationError.bind(null, menuId),
    INITIAL_TEAM_MENU_ACTION,
  );

  const canPublish = ["assigned", "reviewing", "ready_to_publish", "publication_error"].includes(menuState);
  const canAskOrFail = ["assigned", "reviewing", "ready_to_publish"].includes(menuState);

  if (!canPublish && !canAskOrFail) return null;

  return (
    <Card title={t.actionsTitle}>
      <div className="space-y-6">
        {canPublish ? (
          <form action={publishAction} className="space-y-2">
            <p className="font-medium text-text">{t.publishTitle}</p>
            <p className="text-sm text-text-secondary">{t.publishHint}</p>
            <Feedback state={publishState} />
            <Button type="submit" disabled={publishPending}>
              {publishPending ? t.pending : t.publishSubmit}
            </Button>
          </form>
        ) : null}

        {canAskOrFail ? (
          <form action={infoAction} className="space-y-2">
            <p className="font-medium text-text">{t.requestInfoTitle}</p>
            <p className="text-sm text-text-secondary">{t.requestInfoHint}</p>
            <TextArea label={t.requestInfoLabel} name="reason" rows={2} required />
            <Feedback state={infoState} />
            <Button type="submit" variant="secondary" disabled={infoPending}>
              {infoPending ? t.pending : t.requestInfoSubmit}
            </Button>
          </form>
        ) : null}

        {canAskOrFail ? (
          <form action={errorAction} className="space-y-2">
            <p className="font-medium text-text">{t.errorTitle}</p>
            <p className="text-sm text-text-secondary">{t.errorHint}</p>
            <TextArea label={t.errorLabel} name="reason" rows={2} required />
            <Feedback state={errorState} />
            <Button type="submit" variant="danger" disabled={errorPending}>
              {errorPending ? t.pending : t.errorSubmit}
            </Button>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

/** §60 · devolver la actualización por error del equipo: una sola vez, con motivo (RN-CON-12). */
export function RefundForm({ publicationId, alreadyRefunded }: { publicationId: string; alreadyRefunded: boolean }) {
  const [state, action, pending] = useActionState(refundMenuUpdate.bind(null, publicationId), INITIAL_TEAM_MENU_ACTION);

  return (
    <Card title={t.refundTitle}>
      {alreadyRefunded ? (
        <p className="text-sm text-text-secondary">{t.refundDone}</p>
      ) : (
        <form action={action} className="space-y-2">
          <p className="text-sm text-text-secondary">{t.refundHint}</p>
          <TextArea label={t.refundLabel} name="reason" rows={2} required />
          <Feedback state={state} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t.pending : t.refundSubmit}
          </Button>
        </form>
      )}
    </Card>
  );
}

export type MenuCorrectionRow = {
  readonly id: string;
  readonly kind: string;
  readonly description: string;
  readonly requestedAt: string;
  readonly requestedBeforeCutoff: boolean;
  readonly completedAt: string | null;
  readonly completionNote: string | null;
};

function CompleteCorrectionForm({ correctionId }: { correctionId: string }) {
  const [state, action, pending] = useActionState(
    completeMenuCorrection.bind(null, correctionId),
    INITIAL_TEAM_MENU_ACTION,
  );
  return (
    <form action={action} className="mt-2 space-y-2">
      <Field label={t.correctionCompleteNoteLabel} name="note" />
      <Feedback state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.pending : t.correctionCompleteSubmit}
      </Button>
    </form>
  );
}

/**
 * RN-COR-10 · las correcciones del menú publicado: las pedidas por el
 * restaurante y las abiertas por error del equipo (RN-COR-07), con su
 * garantía. Cerrarlas es del asignado o de quien gestiona (RN-COR-06).
 */
export function CorrectionsPanel({
  menuId,
  corrections,
  canAct,
  published,
  timeZone,
}: {
  menuId: string;
  corrections: readonly MenuCorrectionRow[];
  canAct: boolean;
  published: boolean;
  timeZone: string;
}) {
  const formatWhen = (iso: string) => horaLocal(iso, timeZone);
  const [state, action, pending] = useActionState(
    openMenuTeamErrorCorrection.bind(null, menuId),
    INITIAL_TEAM_MENU_ACTION,
  );

  return (
    <Card title={t.correctionsTitle}>
      {corrections.length === 0 ? (
        <p className="text-sm text-text-secondary">{t.correctionsEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {corrections.map((c) => (
            <li key={c.id} className="rounded-lg border border-border p-3">
              <p className="text-sm text-text">{c.description}</p>
              <p className="text-sm text-text-secondary">
                {t.correctionRequested(formatWhen(c.requestedAt))} ·{" "}
                {t.correctionKind[c.kind as keyof typeof t.correctionKind] ?? c.kind} ·{" "}
                {c.requestedBeforeCutoff ? t.correctionGuaranteed : t.correctionNotGuaranteed}
              </p>
              {c.completedAt ? (
                <p className="text-sm text-success">
                  {t.correctionCompleted(formatWhen(c.completedAt))}
                  {c.completionNote ? ` · ${c.completionNote}` : ""}
                </p>
              ) : canAct ? (
                <CompleteCorrectionForm correctionId={c.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {published && canAct ? (
        <form action={action} className="mt-4 space-y-2">
          <p className="font-medium text-text">{t.teamErrorTitle}</p>
          <p className="text-sm text-text-secondary">{t.teamErrorHint}</p>
          <TextArea label={t.teamErrorLabel} name="description" rows={2} required />
          <Feedback state={state} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t.pending : t.teamErrorSubmit}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
