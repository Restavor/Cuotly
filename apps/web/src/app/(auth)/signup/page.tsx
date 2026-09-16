"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button, Field, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";
import { requestAccess } from "../actions";
import {
  accessRequestInitialState,
  type AccessRequestFormState,
} from "../form-states";

/**
 * PRD §37 (RN-ACC-02) · el formulario de solicitud de acceso, que **ocupa
 * el lugar del registro** desde la decisión 41. Esta ruta se llama todavía
 * `/signup` a propósito: es donde va quien busca registrarse, y lo que
 * encuentra es esto.
 *
 * Los cuatro estados del diseño (A09 a A12) están aquí y no en el
 * servidor, porque son de la pantalla:
 *
 *   · A09 · los campos mal rellenados se señalan **uno a uno**, con el
 *     mensaje debajo de cada uno y no un cartel genérico arriba.
 *   · A10 · el botón dice qué está pasando mientras envía.
 *   · A11 · si el envío falla, **lo escrito no se pierde**: la acción no
 *     redirige nunca en el camino de error, así que el formulario conserva
 *     sus valores y se puede volver a pulsar.
 *   · A12 · salir con cambios sin enviar **avisa antes**.
 *
 * Y una quinta cosa que no es un estado sino una regla: cuando termina,
 * dice **siempre lo mismo** (RN-ACC-12). Nunca "ese correo ya tiene
 * cuenta", que convertiría esta pantalla en un oráculo de direcciones.
 */
const initialState: AccessRequestFormState = accessRequestInitialState;

export default function SolicitarAccesoPage() {
  const [state, formAction, pending] = useActionState(requestAccess, initialState);
  const [tocado, setTocado] = useState(false);
  const t = es.auth.signup;

  // A12 · mientras haya algo escrito y sin enviar, el navegador pregunta.
  useEffect(() => {
    if (!tocado || state.done) return;
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [tocado, state.done]);

  if (state.done) {
    return (
      <div>
        <Logo />
        <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{t.doneTitle}</h1>
        <p className="mb-7 text-sm text-text-secondary">{t.doneBody}</p>
        <Link
          href="/login"
          className="block w-full rounded-[10px] bg-primary px-4 py-2.5 text-center text-[15px] font-semibold text-white"
        >
          {t.doneBack}
        </Link>
      </div>
    );
  }

  const errorDe = (campo: string) =>
    state.fields.includes(campo) ? t.validationRequired : undefined;

  return (
    <form action={formAction} onChange={() => setTocado(true)}>
      <Logo />

      <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{t.title}</h1>
      <p className="mb-7 text-sm text-text-secondary">{t.subtitle}</p>

      <Field
        label={t.contactNameLabel}
        id="contact_name"
        name="contact_name"
        autoComplete="name"
        error={errorDe("contact_name")}
        required
      />

      <Field
        label={t.businessNameLabel}
        id="business_name"
        name="business_name"
        autoComplete="organization"
        error={errorDe("business_name")}
        required
      />

      <Field
        label={t.phoneLabel}
        id="phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        error={errorDe("phone")}
        required
      />

      <Field
        label={t.emailLabel}
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        hint={t.emailHelp}
        error={
          state.fields.includes("email")
            ? state.error === t.validationEmail
              ? t.validationEmail
              : t.validationRequired
            : undefined
        }
        required
      />

      <TextArea
        label={t.commentsLabel}
        id="comments"
        name="comments"
        hint={t.commentsHelp}
        rows={3}
      />

      {/* A11 · el fallo de envío, que no es un campo mal rellenado. */}
      {state.error && state.fields.length === 0 ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-text">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" pending={pending} className="w-full">
        {pending ? t.submitPending : t.submit}
      </Button>

      <p className="mt-6 text-center text-sm text-text-secondary">
        {t.hasAccount}{" "}
        <Link href="/login" className="font-semibold text-primary">
          {t.loginLink}
        </Link>
      </p>
    </form>
  );
}
