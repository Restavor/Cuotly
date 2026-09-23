"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { acceptRevision, type AcceptTermsState } from "./actions";

const INITIAL: AcceptTermsState = { error: null, accepted: false };

/**
 * RN-COM-23 · "Acepto la versión N". Solo lleva la suscripción: la versión
 * que se acepta es la vigente, y la decide el servidor en el momento de
 * pulsar, no la pantalla.
 */
export function AcceptRevisionButton({ subscriptionId, revision }: { subscriptionId: string; revision: number }) {
  const [state, action, pending] = useActionState(acceptRevision, INITIAL);
  const t = es.panelPlan.revision;

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Button type="submit" disabled={pending || state.accepted}>
        {pending ? t.acceptPending : t.acceptSubmit(revision)}
      </Button>
      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.accepted ? (
        <p role="status" className="mt-1 text-xs text-cuotly-green">
          {t.acceptDone}
        </p>
      ) : null}
    </form>
  );
}
