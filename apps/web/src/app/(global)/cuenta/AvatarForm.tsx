"use client";

import Image from "next/image";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";
import { AVATAR_MIME_TYPES } from "@/services/avatar-storage";

import { removeAvatar, saveAvatar } from "./actions";
import { ACCOUNT_INITIAL_STATE } from "./form-state";

/**
 * Página 7 del diseño definitivo móvil · el botón "Cambiar foto"
 * (RN-GLO-09).
 *
 * Son **dos formularios de servidor**, no uno con estado: subir y quitar
 * son dos cosas distintas y así cada una funciona sin que hidrate
 * JavaScript (CA-22). Por eso la subida va en la propia petición en vez
 * del vale firmado que usan los archivos: una foto cabe, 25 MB de PDF no.
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
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">{t.photoHint}</p>

      <div className="flex flex-wrap items-center gap-4">
        {avatarUrl !== null ? (
          <Image
            src={avatarUrl}
            alt={personName}
            width={72}
            height={72}
            className="h-18 w-18 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-dark text-xl font-semibold text-surface"
          >
            {initial}
          </span>
        )}

        <form action={accionSubir} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="avatar">
            {t.photoChange}
          </label>
          <input
            id="avatar"
            type="file"
            name="avatar"
            accept={AVATAR_MIME_TYPES.join(",")}
            className="text-sm text-text-secondary"
          />
          <Button type="submit" disabled={subiendo}>
            {subiendo ? t.photoPending : t.photoChange}
          </Button>
        </form>

        {avatarUrl !== null ? (
          <form action={removeAvatar}>
            {/*
              Sin estado: el resultado se VE —donde había una cara aparece
              la inicial— y un "Foto quitada" debajo de eso sobra.
            */}
            <Button type="submit" variant="secondary">
              {t.photoRemove}
            </Button>
          </form>
        ) : null}
      </div>

      <p className="text-xs text-text-secondary">{t.photoLimits}</p>

      {/*
        CLAUDE.md · si no hay foto no se deja un hueco redondo sin
        explicación: se dice que se enseña la inicial, que es lo que pasa.
      */}
      {avatarUrl === null ? (
        <p className="text-sm text-text-secondary">{t.photoNone}</p>
      ) : null}

      {subir.error ? <p className="text-sm text-danger">{subir.error}</p> : null}
      {subir.done ? <p className="text-sm text-cuotly-green">{t.photoSaved}</p> : null}
    </div>
  );
}
