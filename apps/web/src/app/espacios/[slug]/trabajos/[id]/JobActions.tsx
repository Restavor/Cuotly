"use client";

import { useActionState } from "react";

import { INITIAL_JOB_ACTION } from "./action-state";
import {
  Button,
  Card,
  EmptyState,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextArea,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import {
  assignJob,
  blockJob,
  openJobCommentsHere,
  publishJob,
  startJob,
  unblockJob,
} from "./actions";

function Error({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

export type Candidate = {
  workerId: string;
  name: string;
  loadPoints: number;
  jobCount: number;
};

export function AssignJobForm({
  jobId,
  candidates,
}: {
  jobId: string;
  candidates: readonly Candidate[];
}) {
  const [state, action, pending] = useActionState(assignJob, INITIAL_JOB_ACTION);

  return (
    <Card title={es.teamArea.jobs.assignTitle}>
      <p className="mb-3 text-sm text-text-secondary">{es.teamArea.jobs.assignHint}</p>

      {candidates.length === 0 ? (
        <EmptyState
          title={es.teamArea.jobs.assignEmptyTitle}
          description={es.teamArea.jobs.assignEmptyReason}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.jobs.assigneeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.loadColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.jobsColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {candidates.map((candidate) => (
                <TableRow key={candidate.workerId}>
                  <TableCell>{candidate.name}</TableCell>
                  <TableCell>{candidate.loadPoints}</TableCell>
                  <TableCell>{candidate.jobCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <form action={action} className="mt-4 space-y-3">
            <input type="hidden" name="jobId" value={jobId} />
            <Select
              label={es.teamArea.jobs.assigneeColumn}
              name="workerId"
              required
              options={candidates.map((c) => ({ value: c.workerId, label: c.name }))}
            />
            <Error message={state.error} />
            <Button type="submit" disabled={pending}>
              {pending ? es.teamArea.jobs.assignPending : es.teamArea.jobs.assignSubmit}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

export function StartJobForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(startJob, INITIAL_JOB_ACTION);
  return (
    <Card title={es.teamArea.jobs.startSubmit}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? es.teamArea.jobs.startPending : es.teamArea.jobs.startSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function BlockJobForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(blockJob, INITIAL_JOB_ACTION);
  return (
    <Card title={es.teamArea.jobs.blockTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <p className="text-sm text-text-secondary">{es.teamArea.jobs.blockHint}</p>
        <Select
          label={es.teamArea.jobs.blockReasonLabel}
          name="reasonType"
          required
          options={[
            { value: "client_information", label: es.teamArea.blockReasons.client_information },
            { value: "external_incident", label: es.teamArea.blockReasons.external_incident },
            { value: "authorized_pause", label: es.teamArea.blockReasons.authorized_pause },
          ]}
        />
        <TextArea label={es.teamArea.jobs.blockNoteLabel} name="note" />
        <Error message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? es.teamArea.jobs.blockPending : es.teamArea.jobs.blockSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function UnblockJobForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(unblockJob, INITIAL_JOB_ACTION);
  return (
    <Card title={es.teamArea.jobs.unblockSubmit}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? es.teamArea.jobs.unblockPending : es.teamArea.jobs.unblockSubmit}
        </Button>
      </form>
    </Card>
  );
}

/**
 * M78 · la franja de abajo de un trabajo bloqueado: qué hay que resolver
 * y "Reanudar trabajo". Es el mismo `unblock_job()` que "Desbloquear": el
 * servidor decide quién puede levantarlo y el contador de ejecución sigue
 * donde se quedó (RN-SLA-14).
 */
export function ResumeJobBar({ jobId, hint }: { jobId: string; hint: string }) {
  const [state, action, pending] = useActionState(unblockJob, INITIAL_JOB_ACTION);
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-4 rounded-card border border-cuotly-green/30 bg-cuotly-green/10 px-5 py-4"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <Icon name="info" aria-hidden="true" className="h-5 w-5 shrink-0 text-cuotly-green" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-text">{hint}</p>
        <Error message={state.error} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? es.teamArea.jobs.unblockPending : es.teamArea.jobs.resumeSubmit}
      </Button>
    </form>
  );
}

export function PublishJobForm({ jobId, spaceId }: { jobId: string; spaceId: string }) {
  const [state, action, pending] = useActionState(publishJob, INITIAL_JOB_ACTION);
  return (
    <Card title={es.teamArea.jobs.publishTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="spaceId" value={spaceId} />
        <p className="text-sm text-text-secondary">{es.teamArea.jobs.publishHint}</p>
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? es.teamArea.jobs.publishPending : es.teamArea.jobs.publishSubmit}
        </Button>
      </form>
    </Card>
  );
}

/**
 * §66.2 · los comentarios internos todavía no abiertos. Un botón y no una
 * creación al mirar (ver `openJobCommentsHere`): al pulsarlo se crea la
 * conversación y la ficha, revalidada, la enseña aquí mismo.
 */
export function OpenJobCommentsForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(openJobCommentsHere, INITIAL_JOB_ACTION);
  const t = es.teamArea.jobs;

  return (
    <Card title={t.commentsTitle}>
      <EmptyState title={t.commentsClosedTitle} description={t.commentsClosedReason} />
      <p className="mt-3 text-sm text-text-secondary">{es.teamArea.messages.internalNotice}</p>
      <form action={action} className="mt-3">
        <input type="hidden" name="jobId" value={jobId} />
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? t.commentsOpenPending : t.commentsOpen}
        </Button>
      </form>
    </Card>
  );
}
