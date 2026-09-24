"use client";

import { useActionState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { saveProfile } from "./actions";
import { ACCOUNT_INITIAL_STATE } from "./form-state";

/**
 * G05 · los datos personales (RN-GLO-06), en dos columnas como el dibujo.
 *
 * La zona horaria es un desplegable con las del motor de fechas del
 * servidor (las mismas que acepta PostgreSQL), y la opción vacía es "la de
 * cada espacio": solo cambia cómo se enseñan las fechas, nunca los plazos
 * (CLAUDE.md MUST). El idioma del dibujo no está: hoy hay uno solo y un
 * selector de un elemento es un adorno (RN-GLO-06).
 */
export function ProfileForm({
  givenName,
  familyName,
  email,
  phone,
  timezone,
  timezones,
}: {
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
  timezone: string;
  /** Llega del servidor: la lista del navegador puede no coincidir. */
  timezones: readonly string[];
}) {
  const [state, action, pending] = useActionState(saveProfile, ACCOUNT_INITIAL_STATE);
  const t = es.globalContext.account;

  return (
    <form action={action}>
      <div className="grid grid-cols-1 items-end gap-x-4 sm:grid-cols-2">
        <Field label={t.givenName} id="given_name" name="given_name" defaultValue={givenName} required />
        <Field label={t.familyName} id="family_name" name="family_name" defaultValue={familyName} />
        <Field label={t.email} id="email" defaultValue={email} readOnly disabled />
        <Field label={t.phone} id="phone" name="phone" type="tel" defaultValue={phone} />
      </div>
      <p className="-mt-2 mb-4 text-xs text-text-secondary">{t.emailLocked}</p>

      <Select
        label={t.timezone}
        id="display_timezone"
        name="display_timezone"
        defaultValue={timezone}
        aria-describedby="display_timezone-ayuda"
        options={[{ value: "", label: t.timezoneSpace }, ...timezones.map((z) => ({ value: z, label: z }))]}
      />
      <p id="display_timezone-ayuda" className="-mt-2 mb-4 text-xs text-text-secondary">
        {t.timezoneHelp}
      </p>

      {state.error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-text">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {state.done ? (
          <p role="status" className="text-sm text-text-secondary">
            {t.saved}
          </p>
        ) : null}
        <Button type="submit" pending={pending}>
          {pending ? t.savePending : t.saveChanges}
        </Button>
      </div>
    </form>
  );
}
