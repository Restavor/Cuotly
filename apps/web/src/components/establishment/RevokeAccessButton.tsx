"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import {
  revokeClientAccess,
  type RevokeAccessState,
} from "@/app/espacios/[slug]/restaurantes/[id]/actions";

const INITIAL: RevokeAccessState = { error: null, revoked: false };

/**
 * Maqueta 15 · el "…" de cada fila de usuarios, que en realidad es una
 * acción sola: retirar el acceso (RN-EST-05).
 *
 * Es un formulario de verdad, no un botón con `onClick`: la acción es de
 * servidor y así funciona sin JavaScript (CA-22). El motivo va escrito
 * porque `revoke_establishment_access()` lo guarda en la auditoría, y un
 * acceso retirado sin motivo es justo el apunte que nadie sabe explicar
 * tres meses después.
 *
 * Que este botón se pinte o no NO autoriza nada: quien no tenga
 * `manage_clients` recibe la excepción del servidor aunque llame a la
 * acción a mano (CLAUDE.md).
 */
export function RevokeAccessButton({
  userId,
  source,
  establishmentId,
  groupId,
  personName,
}: {
  userId: string;
  source: "group" | "establishment";
  establishmentId: string;
  groupId: string;
  personName: string;
}) {
  const [state, action, pending] = useActionState(revokeClientAccess, INITIAL);

  return (
    <form action={action} className="flex flex-wrap items-end justify-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <input type="hidden" name="groupId" value={groupId} />
      <label className="sr-only" htmlFor={`motivo-${userId}`}>
        {es.establishmentSheet.revokeReasonLabel}
      </label>
      <input
        id={`motivo-${userId}`}
        name="reason"
        placeholder={es.establishmentSheet.revokeReasonPlaceholder}
        className="w-40 rounded-[10px] border border-border bg-surface px-2 py-1 text-sm text-text placeholder:text-text-secondary focus:outline focus:outline-2 focus:outline-cuotly-green"
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending
          ? es.establishmentSheet.revokePending
          : es.establishmentSheet.revokeSubmit(personName)}
      </Button>
      {state.error ? <p className="w-full text-right text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
