"use client";

import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";
import { completeInvitationSignup } from "../../actions";
import { passwordInitialState } from "../../form-states";

/**
 * RN-ACC-09 · correo prefijado y **bloqueado**, contraseña y repetición.
 *
 * Lo del correo no es una comodidad: `accept_space_invitation_as()` exige
 * desde la migración 7 que coincida con el de la invitación, así que
 * dejarlo escribir a mano solo produce un rechazo que quien lo recibe no
 * entiende. Se enseña para que sepa a qué cuenta va, no para cambiarlo.
 */
export function InvitationForm({
  token,
  email,
  spaceName,
}: {
  token: string;
  email: string;
  spaceName: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    completeInvitationSignup,
    passwordInitialState,
  );
  const t = es.auth.invitation;

  return (
    <form action={formAction}>
      <Logo />

      <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{t.title}</h1>
      {spaceName ? (
        <p className="mb-7 text-sm text-text-secondary">
          {t.subtitleSpace} <strong className="text-text">{spaceName}</strong>.
        </p>
      ) : null}

      <input type="hidden" name="token" value={token} />

      <Field
        label={t.emailLabel}
        id="email"
        value={email}
        hint={t.emailLocked}
        readOnly
        disabled
      />

      <Field
        label={t.passwordLabel}
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      <Field
        label={t.repeatLabel}
        id="repeat"
        name="repeat"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      {state.error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-text">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" pending={pending} className="w-full">
        {pending ? t.submitPending : t.submit}
      </Button>
    </form>
  );
}
