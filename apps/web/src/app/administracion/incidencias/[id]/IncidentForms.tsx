"use client";

import { useActionState } from "react";

import { Button, TextArea } from "@/components/ui";
import { INCIDENT_STATES, type IncidentState, incidentNeedsReason, incidentTransitionAllowed } from "@/core/support";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../../action-state";
import { moveIncident, replyIncident } from "../actions";

/**
 * RN-SOP-04 · solo se pintan las transiciones que la tabla permite desde el
 * estado actual como Cuotly; el servidor las vuelve a comprobar. El motivo
 * es obligatorio al pedir información y al cerrar sin resolver, y el
 * servidor lo exige también.
 */
export function IncidentForms({ incidentId, state }: { incidentId: string; state: IncidentState }) {
  const [moveState, move, moving] = useActionState(moveIncident, INITIAL_ADMIN_STATE);
  const [replyState, reply, replying] = useActionState(replyIncident, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.incidents;

  const destinos = INCIDENT_STATES.filter((to) => incidentTransitionAllowed(state, to, "platform"));

  if (state === "closed") {
    return <p className="text-sm text-text-secondary">{t.finalHint}</p>;
  }

  return (
    <div className="space-y-6">
      <form action={reply} className="space-y-3">
        <input type="hidden" name="incidentId" value={incidentId} />
        <TextArea name="body" label={t.replyLabel} rows={4} required />
        <Button type="submit" pending={replying}>
          {t.replySubmit}
        </Button>
        {replyState.error ? (
          <p role="alert" className="text-sm text-danger">
            {replyState.error}
          </p>
        ) : null}
        {replyState.done ? (
          <p role="status" className="text-sm text-text-secondary">
            {t.replyDone}
          </p>
        ) : null}
      </form>

      {destinos.length > 0 ? (
        <form action={move} className="space-y-3 border-t border-border pt-4">
          <input type="hidden" name="incidentId" value={incidentId} />
          <p className="text-sm font-semibold text-text">{t.moveTitle}</p>
          <TextArea name="reason" label={t.reasonLabel} rows={2} />
          <div className="flex flex-wrap gap-2">
            {destinos.map((to) => (
              <Button
                key={to}
                type="submit"
                name="status"
                value={to}
                variant={to === "closed" ? "danger" : "secondary"}
                pending={moving}
                title={incidentNeedsReason(state, to) ? t.reasonLabel : undefined}
              >
                {es.incidents.states[to]}
              </Button>
            ))}
          </div>
          {moveState.error ? (
            <p role="alert" className="text-sm text-danger">
              {moveState.error}
            </p>
          ) : null}
          {moveState.done ? (
            <p role="status" className="text-sm text-text-secondary">
              {t.moved}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
