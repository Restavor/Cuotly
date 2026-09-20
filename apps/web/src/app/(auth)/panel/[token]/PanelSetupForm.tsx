"use client";

import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";
import { completePanelInvitation } from "../../actions";
import { passwordInitialState } from "../../form-states";

/**
 * RN-ACC-13 · contraseña y repetición, y nada más, igual que la pantalla
 * de alta de RN-ACC-04.
 *
 * El correo se enseña **bloqueado**: la cuenta se crea contra la dirección
 * que se invitó y que el equipo aprobó, que el servidor lee de la base y
 * no de este formulario. Está aquí para que quien lo recibe vea a qué
 * cuenta va, no para que lo escriba — dejarlo escribir solo produce un
 * rechazo que no se entiende.
 *
 * Y se dice **a qué restaurante entra**: quien abre este enlace puede no
 * haber oído hablar de Cuotly, así que el nombre de su restaurante es lo
 * único que le dice de qué va esto.
 */
export function PanelSetupForm({
  token,
  email,
  establishmentName,
}: {
  token: string;
  email: string;
  establishmentName: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    completePanelInvitation,
    passwordInitialState,
  );
  const t = es.auth.panelInvitation;

  return (
    <form action={formAction}>
      <Logo />

      <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{t.title}</h1>
      <p className="mb-7 text-sm text-text-secondary">
        {establishmentName ? t.subtitleWith(establishmentName) : t.subtitle}
      </p>

      <input type="hidden" name="token" value={token} />

      <Field
        label={es.auth.setup.emailLabel}
        id="email"
        value={email}
        hint={es.auth.setup.emailLocked}
        readOnly
        disabled
      />

      <Field
        label={es.auth.setup.passwordLabel}
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      <Field
        label={es.auth.setup.repeatLabel}
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
        {pending ? es.auth.setup.submitPending : es.auth.setup.submit}
      </Button>
    </form>
  );
}
