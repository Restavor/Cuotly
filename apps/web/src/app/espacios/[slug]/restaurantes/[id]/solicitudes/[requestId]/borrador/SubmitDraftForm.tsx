"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import { INITIAL_SUBMIT } from "./action-state";
import { submitDraft } from "./actions";

/**
 * §68 · enviar, que es lo que la revisión precede: el pie de R07 con
 * "Cancelar" y "Confirmar envío". Hasta aquí el equipo no ha visto
 * ninguna solicitud y el contador de primera atención no corre
 * (RN-SLA-01): los dos empiezan con este botón.
 *
 * "Cancelar" no borra el borrador (CLAUDE.md MUST NOT): vuelve al listado,
 * donde sigue con su estado hasta que se envíe.
 *
 * No lleva el alcance en campos ocultos a propósito: lo que se envía es lo
 * que está GUARDADO, y eso lo lee la acción de la base. Si viajara por
 * aquí, escribir en el cuadro de texto sin pulsar "Guardar el alcance"
 * mandaría una solicitud que dice una cosa y se clasifica por otra.
 */
export function SubmitDraftForm({
  slug,
  establishmentId,
  requestId,
  cancelHref,
}: {
  slug: string;
  establishmentId: string;
  requestId: string;
  cancelHref: string;
}) {
  const [formState, action, pending] = useActionState(submitDraft, INITIAL_SUBMIT);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <input type="hidden" name="requestId" value={requestId} />

      {formState.error ? (
        <p role="alert" className="text-sm text-danger">
          {formState.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={cancelHref}
          className="inline-flex items-center justify-center rounded-[10px] border border-cuotly-green bg-surface px-6 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
        >
          {es.panelRequests.cancel}
        </Link>
        <Button type="submit" disabled={pending}>
          <Icon name="share" className="h-4 w-4" />
          {pending ? es.clientArea.draftSubmitPending : es.panelRequests.confirmSend}
        </Button>
      </div>
    </form>
  );
}
