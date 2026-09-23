"use client";

import { useActionState } from "react";

import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";

import { changePassword } from "./actions";
import { ACCOUNT_INITIAL_STATE } from "./form-state";

/** RN-GLO-06 · la contraseña de la propia cuenta (M61, "Cambiar contraseña"). */
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, ACCOUNT_INITIAL_STATE);
  const t = es.settings.view;
  return (
    <form action={action} className="space-y-1">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t.newPassword} name="password" type="password" autoComplete="new-password" required minLength={8} />
        <Field label={t.repeatPassword} name="repeat" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" pending={pending}>
          {pending ? t.passwordPending : t.passwordSubmit}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm text-success">
          {t.passwordDone}
        </p>
      ) : null}
    </form>
  );
}
