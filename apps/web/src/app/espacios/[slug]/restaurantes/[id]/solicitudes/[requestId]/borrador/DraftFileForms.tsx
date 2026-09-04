"use client";

import { useActionState } from "react";

import { FileUploadField } from "@/components/FileUploadField";
import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_FILE } from "./action-state";
import { attachDraftFile, detachDraftFile } from "./actions";

/**
 * §68, punto 3 · los ARCHIVOS.
 *
 * Quitar no borra nada: el servidor borra el ENLACE del archivo con este
 * borrador y solo mientras sea borrador (CLAUDE.md MUST NOT). El archivo
 * sigue en el catálogo del restaurante y en el mensaje del que vino, así
 * que quitarlo aquí no le hace perder nada a nadie.
 */
export function RemoveDraftFileButton({
  requestId,
  fileId,
}: {
  requestId: string;
  fileId: string;
}) {
  const [state, action, pending] = useActionState(detachDraftFile, INITIAL_FILE);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="fileId" value={fileId} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-danger underline disabled:opacity-60"
      >
        {pending ? es.clientArea.draftFileRemoving : es.clientArea.draftFileRemove}
      </button>
      {state.error ? (
        <span role="alert" className="ml-2 text-sm text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Añadir el archivo que faltaba. Los bytes van del navegador al bucket con
 * una URL firmada (`FileUploadField`) y por la acción solo viaja el
 * identificador; el límite de 25 MB y los tipos permitidos los hace
 * cumplir el servidor (RN-ARC-06, RN-MSG-09).
 */
export function AddDraftFileForm({
  requestId,
  establishmentId,
}: {
  requestId: string;
  establishmentId: string;
}) {
  const [state, action, pending] = useActionState(attachDraftFile, INITIAL_FILE);

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-border pt-4">
      <input type="hidden" name="requestId" value={requestId} />

      <FileUploadField
        establishmentId={establishmentId}
        category="requests_and_jobs"
        name="attachmentFileId"
      />

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.clientArea.draftFileAdding : es.clientArea.draftFileAdd}
      </Button>
    </form>
  );
}
