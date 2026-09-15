"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../action-state";
import { closeSupportSession } from "../actions";

/** RN-ADM-06 · cerrar una sesión de soporte antes de que caduque. */
export function EndSupportForm({ sessionId, compact = false }: { sessionId: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(closeSupportSession, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.support;

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      {compact ? null : (
        <input
          name="note"
          aria-label={t.endNote}
          placeholder={t.endNote}
          className="rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-xs text-text"
        />
      )}
      <Button type="submit" variant="secondary" pending={pending} className="px-3 py-1.5 text-xs">
        {pending ? t.ending : compact ? t.bannerLeave : t.end}
      </Button>
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-xs text-text-secondary">
          {t.endedDone}
        </p>
      ) : null}
    </form>
  );
}
