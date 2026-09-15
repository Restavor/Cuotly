"use client";

import { useActionState, useId } from "react";

import { Button, TextArea } from "@/components/ui";
import { spaceRequestTransitionAllowed, type SpaceRequestState } from "@/core/space-requests";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../../action-state";
import { approveSpaceRequest, decideSpaceRequest } from "../../actions";

/**
 * RN-PLA-03 · solo se pintan las transiciones que la tabla permite desde
 * el estado actual como plataforma; el servidor las vuelve a comprobar.
 * RN-PLA-05 · la clave de idempotencia de aprobar nace con el formulario.
 */
export function DecisionForms({ requestId, state }: { requestId: string; state: SpaceRequestState }) {
  const [decideState, decide, deciding] = useActionState(decideSpaceRequest, INITIAL_ADMIN_STATE);
  const [approveState, approve, approving] = useActionState(approveSpaceRequest, INITIAL_ADMIN_STATE);
  const key = useId();
  const t = es.platformAdmin.requests;

  const puede = (to: SpaceRequestState) => spaceRequestTransitionAllowed(state, to, "platform");

  return (
    <div className="space-y-6">
      <form action={decide} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <TextArea name="reason" label={t.reasonLabel} rows={3} />
        <div className="flex flex-wrap gap-2">
          {puede("in_review") ? (
            <Button type="submit" name="status" value="in_review" variant="secondary" pending={deciding}>
              {t.review}
            </Button>
          ) : null}
          {puede("needs_information") ? (
            <Button type="submit" name="status" value="needs_information" variant="secondary" pending={deciding}>
              {t.needsInformation}
            </Button>
          ) : null}
          {puede("rejected") ? (
            <Button type="submit" name="status" value="rejected" variant="danger" pending={deciding}>
              {t.reject}
            </Button>
          ) : null}
        </div>
        {decideState.error ? (
          <p role="alert" className="text-sm text-danger">
            {decideState.error}
          </p>
        ) : null}
        {decideState.done ? (
          <p role="status" className="text-sm text-text-secondary">
            {t.decided}
          </p>
        ) : null}
      </form>

      {puede("approved") ? (
        <form action={approve} className="space-y-3 border-t border-border pt-4">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="idempotencyKey" value={`approve:${requestId}:${key}`} />
          <Button type="submit" pending={approving}>
            {approving ? t.pending : t.approve}
          </Button>
          {approveState.error ? (
            <p role="alert" className="text-sm text-danger">
              {approveState.error}
            </p>
          ) : null}
          {approveState.done ? (
            <p role="status" className="text-sm text-text-secondary">
              {t.approved}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
