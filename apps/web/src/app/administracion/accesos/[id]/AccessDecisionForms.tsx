"use client";

import { useActionState, useId } from "react";

import { Button, TextArea } from "@/components/ui";
import { accessRequestTransitionAllowed, type AccessRequestState } from "@/core/access-requests";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../../action-state";
import { approveAccessRequest, decideAccessRequest } from "../../actions";

/**
 * RN-ACC-05 · solo se pintan las transiciones que la tabla permite desde
 * el estado actual como plataforma; `decide_access_request()` y
 * `approve_access_request()` las vuelven a comprobar en el servidor.
 * RN-ACC-08 · la clave de idempotencia de aprobar nace con el formulario,
 * así que pulsar dos veces no manda dos enlaces.
 */
export function AccessDecisionForms({
  requestId,
  state,
}: {
  requestId: string;
  state: AccessRequestState;
}) {
  const [decideState, decide, deciding] = useActionState(decideAccessRequest, INITIAL_ADMIN_STATE);
  const [approveState, approve, approving] = useActionState(
    approveAccessRequest,
    INITIAL_ADMIN_STATE,
  );
  const key = useId();
  const t = es.platformAdmin.access;

  const puede = (to: AccessRequestState) => accessRequestTransitionAllowed(state, to, "platform");

  return (
    <div className="space-y-6">
      <form action={decide} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <TextArea name="reason" label={t.reasonLabel} rows={3} />
        <div className="flex flex-wrap gap-2">
          {puede("needs_information") ? (
            <Button
              type="submit"
              name="status"
              value="needs_information"
              variant="secondary"
              pending={deciding}
            >
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
          <input type="hidden" name="idempotencyKey" value={`access:${requestId}:${key}`} />
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
