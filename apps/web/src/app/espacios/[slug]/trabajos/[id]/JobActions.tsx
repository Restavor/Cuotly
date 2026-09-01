"use client";

import { useActionState } from "react";

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
import { es } from "@/i18n/es";

import {
  INITIAL_JOB_ACTION,
  assignJob,
  blockJob,
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
