"use client";

import { useActionState, useState } from "react";

import { Button, TextArea } from "@/components/ui";
import { type IncidentState, incidentTransitionAllowed } from "@/core/support";
import { es } from "@/i18n/es";

import { INITIAL_HELP_STATE } from "../../action-state";
import { attachToIncident, moveFromSpace, replyFromSpace } from "../../actions";

function Mensajes({ state, done }: { state: { error: string | null; done: boolean }; done: string }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm text-text-secondary">
          {done}
        </p>
      ) : null}
    </>
  );
}

/**
 * RN-SOP-04/08 · lo que el espacio puede hacer en su incidencia: escribir,
 * adjuntar y —solo de "resuelta"— cerrar o reabrir. Los botones siguen la
 * tabla de transiciones como lado `space`; el servidor la vuelve a mirar.
 */
export function SpaceIncidentForms({
  incidentId,
  spaceId,
  slug,
  state,
}: {
  incidentId: string;
  spaceId: string;
  slug: string;
  state: IncidentState;
}) {
  const [replyState, reply, replying] = useActionState(replyFromSpace, INITIAL_HELP_STATE);
  const [moveState, move, moving] = useActionState(moveFromSpace, INITIAL_HELP_STATE);
  const [attachState, attach, attaching] = useActionState(attachToIncident, INITIAL_HELP_STATE);
  const [elegido, setElegido] = useState<string | null>(null);
  const t = es.help.incidents;

  if (state === "closed") {
    return <p className="text-sm text-text-secondary">{t.closedHint}</p>;
  }

  const puedeCerrar = incidentTransitionAllowed(state, "closed", "space");
  const puedeReabrir = incidentTransitionAllowed(state, "in_review", "space");

  return (
    <div className="space-y-6">
      <form action={reply} className="space-y-3">
        <input type="hidden" name="incidentId" value={incidentId} />
        <input type="hidden" name="slug" value={slug} />
        <TextArea name="body" label={t.replyLabel} hint={state === "needs_information" ? t.replyHint : undefined} rows={4} required />
        <Button type="submit" pending={replying}>
          {t.replySubmit}
        </Button>
        <Mensajes state={replyState} done={t.replyDone} />
      </form>

      <form action={attach} className="space-y-3 border-t border-border pt-4" encType="multipart/form-data">
        <input type="hidden" name="incidentId" value={incidentId} />
        <input type="hidden" name="spaceId" value={spaceId} />
        <input type="hidden" name="slug" value={slug} />
        <p className="mb-1 block text-sm font-semibold text-text" id={`adjunto-${incidentId}`}>
          {t.attachLabel}
        </p>
        {/* El campo de archivo disfrazado de botón (ver FileUploadField):
            el del navegador habla su idioma, no el de Cuotly. */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-[10px] border border-border bg-soft-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cuotly-green">
            {es.files.choose}
            <input
              type="file"
              name="file"
              aria-labelledby={`adjunto-${incidentId}`}
              className="sr-only"
              required
              onChange={(evento) => setElegido(evento.target.files?.[0]?.name ?? null)}
            />
          </label>
          <span className="min-w-0 text-sm text-text-secondary [overflow-wrap:anywhere]">
            {elegido ?? es.files.noneChosen}
          </span>
        </div>
        <Button type="submit" variant="secondary" pending={attaching}>
          {t.attachSubmit}
        </Button>
        <Mensajes state={attachState} done={t.attachDone} />
      </form>

      {puedeCerrar || puedeReabrir ? (
        <form action={move} className="space-y-3 border-t border-border pt-4">
          <input type="hidden" name="incidentId" value={incidentId} />
          <input type="hidden" name="slug" value={slug} />
          {puedeReabrir ? <TextArea name="reason" label={t.reopenReason} rows={2} /> : null}
          <div className="flex flex-wrap gap-2">
            {puedeCerrar ? (
              <Button type="submit" name="status" value="closed" pending={moving}>
                {t.confirmResolved}
              </Button>
            ) : null}
            {puedeReabrir ? (
              <Button type="submit" name="status" value="in_review" variant="secondary" pending={moving}>
                {t.reopen}
              </Button>
            ) : null}
          </div>
          <Mensajes state={moveState} done={t.moved} />
        </form>
      ) : null}
    </div>
  );
}
