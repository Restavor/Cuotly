"use client";

import { useActionState } from "react";
import { Button, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";
import { replyToAccessRequest } from "../../actions";
import { followUpReplyInitialState } from "../../form-states";

/** RN-ACC-05 · la respuesta devuelve la solicitud a la cola de revisión. */
export function ReplyForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    replyToAccessRequest,
    followUpReplyInitialState,
  );
  const t = es.auth.followUp;

  if (state.done) {
    return (
      <p role="status" className="rounded-lg bg-success/10 px-3 py-2.5 text-sm text-text">
        {t.replyDone}
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <TextArea label={t.replyLabel} id="reply" name="reply" rows={4} required />

      {state.error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-text">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" pending={pending} className="w-full">
        {pending ? t.replySubmitPending : t.replySubmit}
      </Button>
    </form>
  );
}
