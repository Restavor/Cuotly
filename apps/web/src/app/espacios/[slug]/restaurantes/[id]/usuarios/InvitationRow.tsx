"use client";

import { useActionState } from "react";

import { Button, Field } from "@/components/ui";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";

import {
  cancelPanelInvitation,
  reviewPanelInvitation,
  type ReviewInvitationState,
} from "./actions";
import type { PanelInvitation } from "./users-load";

const INITIAL: ReviewInvitationState = { error: null, done: false };

/**
 * RN-PAN-14 · una invitación en la lista, con lo que se puede hacer con
 * ella desde donde se mira.
 *
 * **Los botones de aprobar y rechazar solo los ve el equipo** (`canReview`),
 * y eso es lo que pinta la pantalla — no lo que decide quién puede: lo
 * decide `review_establishment_invitation()`, que rechaza a cualquiera sin
 * `manage_clients` aunque llame a mano (CLAUDE.md).
 *
 * **RN-PAN-15 · aquí no hay ningún nombre del equipo.** La fila trae el
 * estado y el motivo del rechazo; quién lo decidió ni se pide ni llega,
 * porque el privilegio de columna lo cierra en la base.
 */
export function InvitationRow({
  invitation,
  canReview,
}: {
  invitation: PanelInvitation;
  canReview: boolean;
}) {
  const [review, reviewAction, reviewing] = useActionState(reviewPanelInvitation, INITIAL);
  const [cancel, cancelAction, cancelling] = useActionState(cancelPanelInvitation, INITIAL);
  const t = es.establishmentSheet.invitations;

  const estado = t.states[invitation.status as keyof typeof t.states] ?? invitation.status;
  const roles = es.establishmentSheet.clientRoles;
  const rol = roles[invitation.role as keyof typeof roles] ?? invitation.role;

  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-text">{invitation.email}</span>
        <span className="text-xs text-text-secondary">{estado}</span>
      </div>

      <p className="text-sm text-text-secondary">
        {rol}
        {invitation.expiresAt && invitation.status === "approved"
          ? ` · ${t.expiresOn(fechaCorta(invitation.expiresAt))}`
          : ""}
      </p>

      {invitation.status === "rejected" && invitation.rejectionReason ? (
        <p className="text-sm text-text">{t.rejectedBecause(invitation.rejectionReason)}</p>
      ) : null}

      {invitation.status === "pending_review" && !canReview ? (
        <p className="text-xs text-text-secondary">{t.pendingHint}</p>
      ) : null}

      {canReview && invitation.status === "pending_review" ? (
        <form action={reviewAction} className="space-y-2">
          <input type="hidden" name="invitationId" value={invitation.id} />
          {/* El motivo va en el mismo formulario que los dos botones: un
              rechazo sin motivo no le dice nada a quien invitó, y pedirlo
              en un segundo paso sería una pantalla más. Al aprobar, el
              campo se ignora. */}
          <Field
            label={t.rejectReasonLabel}
            name="reason"
            hint={t.rejectReasonHint}
            id={`reason-${invitation.id}`}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="decision" value="approve" disabled={reviewing}>
              {t.approve}
            </Button>
            <Button
              type="submit"
              name="decision"
              value="reject"
              variant="secondary"
              disabled={reviewing}
            >
              {t.reject}
            </Button>
          </div>
          {review.error ? <p className="text-sm text-danger">{review.error}</p> : null}
        </form>
      ) : null}

      {invitation.status === "pending_review" || invitation.status === "approved" ? (
        <form action={cancelAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <Button type="submit" variant="secondary" disabled={cancelling}>
            {t.cancel}
          </Button>
          {cancel.error ? <p className="text-sm text-danger">{cancel.error}</p> : null}
        </form>
      ) : null}
    </li>
  );
}
