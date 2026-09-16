"use client";

import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";
import { completeAccountSetup } from "../../actions";
import { passwordInitialState } from "../../form-states";

/**
 * RN-ACC-04 · contraseña y repetición, y nada más.
 *
 * El correo se enseña **bloqueado**: la cuenta se crea contra la dirección
 * aprobada, que el servidor lee de la base y no de este formulario. Está
 * aquí para que quien lo recibe vea a qué cuenta va, no para que lo
 * escriba.
 */
export function SetupForm({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    completeAccountSetup,
    passwordInitialState,
  );
  const t = es.auth.setup;

  return (
    <form action={formAction}>
      <Logo />

      <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">
        {name ? `${t.title}, ${name}` : t.title}
      </h1>
      <p className="mb-7 text-sm text-text-secondary">{t.subtitle}</p>

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
