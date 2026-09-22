"use client";

import { useActionState } from "react";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import { replyToAccessRequest } from "../../actions";
import { followUpReplyInitialState } from "../../form-states";

/**
 * RN-ACC-05 · la respuesta devuelve la solicitud a la cola de revisión.
 * A02 · "Tu respuesta *" y el botón lleno "Enviar información".
 */
export function ReplyForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    replyToAccessRequest,
    followUpReplyInitialState,
  );
  const t = es.auth.access;

  if (state.done) {
    return (
      <p
        role="status"
        className="mt-6 flex items-center gap-3 rounded-[12px] bg-success/10 px-5 py-4 text-[15px] text-text"
      >
        <Icon name="check" aria-hidden="true" className="h-6 w-6 shrink-0 text-primary" />
        {es.auth.followUp.replyDone}
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="token" value={token} />
      <label htmlFor="reply" className="mb-2 block text-[15px] font-semibold text-text">
        {t.yourReplyLabel}
      </label>
      <textarea
        id="reply"
        name="reply"
        rows={3}
        required
        placeholder={t.replyPlaceholder}
        aria-invalid={state.error !== null || undefined}
        className="w-full rounded-[10px] border border-border bg-surface px-4 py-3 text-[15px] text-text outline-none transition-colors placeholder:text-text-secondary/70 focus:border-cuotly-green focus:ring-3 focus:ring-cuotly-green/15"
      />

      {state.error ? (
        <p role="alert" className="mt-2 flex items-center gap-2 text-[15px] text-danger">
          <Icon name="alert" aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2} />
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="mt-3 w-full rounded-[10px] bg-primary px-4 py-3.5 text-[17px] font-semibold text-surface transition-colors hover:bg-primary-dark focus:outline focus:outline-2 focus:outline-cuotly-green disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? t.replySubmitPending : t.replySubmit}
      </button>
    </form>
  );
}
