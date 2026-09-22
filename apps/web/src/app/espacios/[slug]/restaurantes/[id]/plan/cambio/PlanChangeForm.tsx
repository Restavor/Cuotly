"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_PLAN_CHANGE } from "./action-state";
import { requestPlanChange } from "./actions";

const t = es.panelPlan;

export function PlanChangeForm({
  establishmentId,
  cancelHref,
  messagesHref,
}: {
  establishmentId: string;
  cancelHref: string;
  messagesHref: string;
}) {
  const [state, action, pending] = useActionState(requestPlanChange, INITIAL_PLAN_CHANGE);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <TextArea
        label={t.changeLabel}
        name="text"
        rows={4}
        required
        maxLength={1000}
        placeholder={t.changePlaceholder}
        defaultValue={state.text}
      />
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.sent ? (
        <p role="status" className="text-sm text-success">
          {t.changeSent}{" "}
          <Link href={messagesHref} className="font-semibold text-cuotly-green underline">
            {t.goToMessages}
          </Link>
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Link
          href={cancelHref}
          className="inline-flex items-center justify-center rounded-[10px] border border-cuotly-green bg-surface px-6 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
        >
          {t.cancel}
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? t.changePending : t.changeSubmit}
        </Button>
      </div>
    </form>
  );
}
