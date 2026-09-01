"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { acceptRequest, type AcceptState } from "./actions";

const INITIAL: AcceptState = { error: null, accepted: false };

export function AcceptRequestButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(acceptRequest, INITIAL);

  return (
    <form action={action} className="shrink-0 text-right">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" disabled={pending}>
        {pending ? es.clientArea.acceptPending : es.clientArea.acceptSubmit}
      </Button>
      {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
