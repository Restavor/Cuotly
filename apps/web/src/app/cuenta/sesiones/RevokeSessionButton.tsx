"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { revokeSession, type RevokeSessionState } from "./actions";

const INITIAL: RevokeSessionState = { error: null, closed: false };

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(revokeSession, INITIAL);

  return (
    <form action={action} className="shrink-0 text-right">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.sessions.closing : es.sessions.close}
      </Button>
      {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
