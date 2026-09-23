"use client";

import Image from "next/image";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";
import { AVATAR_MIME_TYPES } from "@/services/avatar-storage";

import { removeAvatar, saveAvatar } from "./actions";
import { ACCOUNT_INITIAL_STATE } from "./form-state";

/**
 * G05 · la cara o la inicial, con "Cambiar foto" al lado (RN-GLO-09).
 *
 * Son **dos formularios de servidor**, no uno con estado: subir y quitar
 * son dos cosas distintas. "Cambiar foto" es la etiqueta del campo de
 * archivo con forma de botón: al elegir la imagen, el formulario se envía
 * solo. Sin JavaScript eso no pasa, y por eso va un botón de enviar dentro
 * de `<noscript>` (CA-22). La subida va en la propia petición: una foto
 * cabe, 25 MB de PDF no.
 *
 * El `accept` del campo es **cortesía para el navegador**, no un control:
 * el formato y el tamaño los rechaza el bucket (migración 109) y el tipo
 * lo vuelve a mirar la acción. Ocultar o filtrar en el cliente no es una
 * barrera (CLAUDE.md).
 */
export function AvatarForm({
  avatarUrl,
  initial,
  personName,
}: {
  /** Enlace firmado y temporal, o `null` si no tiene foto. */
  avatarUrl: string | null;
  initial: string;
  personName: string;
}) {
  const [subir, accionSubir, subiendo] = useActionState(saveAvatar, ACCOUNT_INITIAL_STATE);
  const t = es.globalContext.account;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-4">
        {avatarUrl !== null ? (
          <Image
            src={avatarUrl}
            alt={personName}
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-dark text-2xl font-semibold text-surface"
          >
            {initial}
          </span>
        )}

        <form action={accionSubir} className="flex items-center gap-2">
          <label
            htmlFor="avatar"
            className={`inline-flex cursor-pointer items-center rounded-[10px] border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-soft-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cuotly-green ${
              subiendo ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {subiendo ? t.photoPending : t.photoChange}
            <input
              id="avatar"
              type="file"
              name="avatar"
              accept={AVATAR_MIME_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => {
                if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit();
              }}
            />
          </label>
          <noscript>
            <Button type="submit" variant="secondary">
              {t.save}
            </Button>
          </noscript>
        </form>

        {avatarUrl !== null ? (
          <form action={removeAvatar}>
            {/*
              Sin estado: el resultado se VE —donde había una cara aparece
              la inicial— y un "Foto quitada" debajo de eso sobra.
            */}
            <button type="submit" className="text-sm font-medium text-text-secondary underline hover:text-text">
              {t.photoRemove}
            </button>
          </form>
        ) : null}
      </div>

      {/*
        CLAUDE.md · si no hay foto no se deja un hueco sin explicación: se
        dice que se enseña la inicial, que es lo que pasa.
      */}
      <p className="mt-2 text-xs text-text-secondary">
        {avatarUrl === null ? `${t.photoNone} ` : ""}
        {t.photoLimits}
      </p>

      {subir.error ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {subir.error}
        </p>
      ) : null}
      {subir.done ? (
        <p role="status" className="mt-1 text-sm text-cuotly-green">
          {t.photoSaved}
        </p>
      ) : null}
    </div>
  );
}
