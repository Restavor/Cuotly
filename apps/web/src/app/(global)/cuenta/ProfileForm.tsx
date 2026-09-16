"use client";

import { useActionState } from "react";

import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";

import { saveProfile } from "./actions";
import { ACCOUNT_INITIAL_STATE } from "./form-state";

/** G05 · el perfil de la persona (RN-GLO-06). */
export function ProfileForm({
  givenName,
  familyName,
  email,
  phone,
  timezone,
}: {
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  timezone: string;
}) {
  const [state, action, pending] = useActionState(saveProfile, ACCOUNT_INITIAL_STATE);
  const t = es.globalContext.account;

  return (
    <form action={action}>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t.givenName} id="given_name" name="given_name" defaultValue={givenName} required />
        <Field label={t.familyName} id="family_name" name="family_name" defaultValue={familyName} />
        <Field label={t.email} id="email" defaultValue={email} hint={t.emailLocked} readOnly disabled />
        <Field label={t.phone} id="phone" name="phone" type="tel" defaultValue={phone} />
      </div>

      <Field
        label={t.timezone}
        id="display_timezone"
        name="display_timezone"
        defaultValue={timezone}
        placeholder={t.timezonePlaceholder}
        hint={t.timezoneHelp}
      />

      {state.error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-text">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="mb-4 text-sm text-text-secondary">
          {t.saved}
        </p>
      ) : null}

      <Button type="submit" pending={pending}>
        {pending ? t.savePending : t.save}
      </Button>
    </form>
  );
}
