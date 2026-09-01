"use client";

import { useActionState } from "react";

import { Button, Card, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import {
  INITIAL_REQUEST_ACTION,
  beginAnalysis,
  rejectRequest,
  requestMoreInformation,
  validateClassification,
} from "./actions";

function Error({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

export function BeginAnalysisForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(beginAnalysis, INITIAL_REQUEST_ACTION);
  return (
    <Card title={es.teamArea.requests.analyzeSubmit}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{es.teamArea.requests.analyzeHint}</p>
        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? es.teamArea.requests.analyzePending : es.teamArea.requests.analyzeSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function ValidateClassificationForm({
  requestId,
  suggestedCategory,
  suggestedSummary,
}: {
  requestId: string;
  suggestedCategory: string | null;
  suggestedSummary: string | null;
}) {
  const [state, action, pending] = useActionState(validateClassification, INITIAL_REQUEST_ACTION);

  return (
    <Card title={es.teamArea.requests.validateTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{es.teamArea.requests.validateHint}</p>

        <Select
          label={es.teamArea.requests.validateCategoryLabel}
          name="category"
          defaultValue={suggestedCategory ?? "small"}
          required
          options={[
            { value: "small", label: es.naming.categories.small },
            { value: "photo", label: es.naming.categories.photo },
            { value: "medium", label: es.naming.categories.medium },
            { value: "large", label: es.naming.categories.large },
          ]}
        />

        <TextArea
          label={es.teamArea.requests.validateSummaryLabel}
          name="summary"
          required
          defaultValue={suggestedSummary ?? ""}
        />

        <Error message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? es.teamArea.requests.validatePending : es.teamArea.requests.validateSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function RequestInformationForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(requestMoreInformation, INITIAL_REQUEST_ACTION);
  return (
    <Card title={es.teamArea.requests.infoTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{es.teamArea.requests.infoHint}</p>
        <TextArea label={es.teamArea.requests.infoLabel} name="message" required />
        <Error message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? es.teamArea.requests.infoPending : es.teamArea.requests.infoSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function RejectRequestForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(rejectRequest, INITIAL_REQUEST_ACTION);
  return (
    <Card title={es.teamArea.requests.rejectTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{es.teamArea.requests.rejectHint}</p>
        <TextArea label={es.teamArea.requests.rejectLabel} name="reason" required />
        <Error message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? es.teamArea.requests.rejectPending : es.teamArea.requests.rejectSubmit}
        </Button>
      </form>
    </Card>
  );
}
