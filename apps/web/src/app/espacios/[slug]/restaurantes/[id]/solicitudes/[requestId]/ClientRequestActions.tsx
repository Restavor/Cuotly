"use client";

import { useActionState } from "react";

import { Button, Card, TextArea } from "@/components/ui";
import type { CancelRequestAvailability } from "@/core/requests";
import { es } from "@/i18n/es";

import { INITIAL_CLIENT_REQUEST } from "./action-state";
import {
  acceptRevised,
  cancelRequest,
  declineRequest,
  provideInformation,
  requestCorrection,
} from "./actions";

function Error({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

export function DeclineRequestForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(declineRequest, INITIAL_CLIENT_REQUEST);
  return (
    <Card title={es.clientArea.declineTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{es.clientArea.declineHint}</p>
        <TextArea label={es.clientArea.declineLabel} name="reason" rows={3} />
        <Error message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? es.clientArea.declinePending : es.clientArea.declineSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function ProvideInformationForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(provideInformation, INITIAL_CLIENT_REQUEST);
  return (
    <Card title={es.clientArea.infoNeededTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{es.clientArea.infoNeededHint}</p>
        <TextArea label={es.clientArea.infoAnswerLabel} name="message" rows={3} required />
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? es.clientArea.infoAnswerPending : es.clientArea.infoAnswerSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function AcceptRevisedForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(acceptRevised, INITIAL_CLIENT_REQUEST);
  return (
    <Card title={es.clientArea.acceptRevisedTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{es.clientArea.acceptRevisedHint}</p>
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? es.clientArea.acceptRevisedPending : es.clientArea.acceptRevisedSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function RequestCorrectionForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(requestCorrection, INITIAL_CLIENT_REQUEST);
  return (
    <Card title={es.clientArea.correctionTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <p className="text-sm text-text-secondary">{es.clientArea.correctionHint}</p>
        <TextArea label={es.clientArea.correctionLabel} name="description" rows={3} required />
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? es.clientArea.correctionPending : es.clientArea.correctionSubmit}
        </Button>
      </form>
    </Card>
  );
}

/**
 * R12 y A14 · cancelar la solicitud.
 *
 * Cuando no se puede, la tarjeta no desaparece: dice cuál de los tres
 * motivos es (CA-20). Los tres piden cosas distintas —esperar, nada, o
 * hablar con el equipo— y meterlos en un "no se puede" a secas dejaría al
 * restaurante sin saber qué hacer.
 */
export function CancelRequestForm({
  requestId,
  availability,
}: {
  requestId: string;
  availability: CancelRequestAvailability;
}) {
  const [state, action, pending] = useActionState(cancelRequest, INITIAL_CLIENT_REQUEST);

  if (!availability.available) {
    return (
      <Card title={es.clientArea.cancelTitle}>
        <p className="text-sm text-text-secondary">
          {availability.reason === "already_cancelled"
            ? es.clientArea.cancelAlready
            : availability.reason === "has_job"
              ? es.clientArea.cancelHasJob
              : es.clientArea.cancelFinished}
        </p>
      </Card>
    );
  }

  return (
    <Card title={es.clientArea.cancelTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{es.clientArea.cancelHint}</p>
        <TextArea label={es.clientArea.cancelLabel} name="reason" rows={2} />
        <Error message={state.error} />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? es.clientArea.cancelPending : es.clientArea.cancelSubmit}
        </Button>
      </form>
    </Card>
  );
}
