"use client";

import { useActionState } from "react";

import { Button, Card, Field, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SERVICE_STATUS } from "./service-status-action-state";
import {
  acceptEstablishmentTransfer,
  proposeEstablishmentTransfer,
  rejectEstablishmentTransfer,
  withdrawEstablishmentTransfer,
} from "./service-status-actions";

const t = es.establishmentSheet;

export interface PendingTransfer {
  readonly id: string;
  readonly reason: string | null;
  readonly proposedAt: string;
  /** `true` cuando quien mira es el espacio que la propuso. */
  readonly iProposed: boolean;
  /** Decisión 149 · «Transferir también Reservas». */
  readonly withReservations: boolean;
}

function Feedback({ state }: { state: { error: string | null; done: boolean } }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.done) {
    return (
      <p role="status" className="text-sm text-success">
        {t.serviceDone}
      </p>
    );
  }
  return null;
}

/**
 * RN-TRA · mover un restaurante a otro espacio de mantenimiento.
 *
 * La pantalla tiene tres caras y enseña **una sola** según dónde esté la
 * cosa: no hay propuesta y se puede proponer; hay una propuesta que hicimos
 * nosotros y lo que toca es esperar o retirarla; o hay una que nos han hecho
 * y hay que decidir.
 *
 * Lo que va escrito antes de cada botón y no después:
 *
 *   · al proponer, que el historial VIAJA y que el dinero se queda
 *     (RN-TRA-01 y RN-TRA-04). Quien propone tiene que saber que el equipo
 *     nuevo verá sus trabajos y sus conversaciones internas;
 *   · al aceptar, que es la operación menos reversible del producto. No hay
 *     deshacer: lo que hay es otra transferencia en sentido contrario, que
 *     el otro espacio tendría que aceptar.
 */
export function TransferBlock({
  establishmentId,
  pending,
  canPropose,
  reservationsStatus = null,
}: {
  establishmentId: string;
  pending: PendingTransfer | null;
  canPropose: boolean;
  /** El estado de Reservas de este restaurante, o `null` si no tiene (decisión 149). */
  reservationsStatus?: string | null;
}) {
  if (pending !== null) {
    return pending.iProposed ? (
      <WithdrawForm transfer={pending} />
    ) : (
      <DecideForm transfer={pending} />
    );
  }

  if (!canPropose) {
    return (
      <Card title={t.transferTitle}>
        <p className="text-sm text-text-secondary">{t.transferOnlyOwner}</p>
      </Card>
    );
  }

  return <ProposeForm establishmentId={establishmentId} reservationsStatus={reservationsStatus} />;
}

function ProposeForm({ establishmentId, reservationsStatus }: { establishmentId: string; reservationsStatus: string | null }) {
  const [state, action, pending] = useActionState(
    proposeEstablishmentTransfer,
    INITIAL_SERVICE_STATUS,
  );

  return (
    <Card title={t.transferTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="establishmentId" value={establishmentId} />
        <p className="text-sm text-text-secondary">{t.transferHint}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
          <li>{t.transferWhatTravels}</li>
          <li>{t.transferWhatStays}</li>
          <li>{t.transferNeedsAccept}</li>
        </ul>
        {reservationsStatus !== null ? (
          <div className="rounded-field border border-border p-3" data-testid="transfer-reservations">
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="withReservations"
                className="mt-1 h-5 w-5 shrink-0"
                disabled={reservationsStatus !== "active"}
                data-testid="transfer-with-reservations"
              />
              <span>
                <span className="block font-semibold text-text">{t.transferReservationsLabel}</span>
                <span className="block text-text-secondary">{t.transferReservationsHint}</span>
                {reservationsStatus !== "active" ? (
                  <span className="mt-1 block font-semibold text-pending-text">{t.transferReservationsOnlyActive}</span>
                ) : null}
              </span>
            </label>
          </div>
        ) : null}
        <Field label={t.transferSpaceLabel} name="toSpaceId" hint={t.transferSpaceHint} required />
        <TextArea label={t.serviceReasonLabel} name="reason" rows={2} required />
        <Feedback state={state} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.servicePending : t.transferSubmit}
        </Button>
      </form>
    </Card>
  );
}

function WithdrawForm({ transfer }: { transfer: PendingTransfer }) {
  const [state, action, pending] = useActionState(
    withdrawEstablishmentTransfer,
    INITIAL_SERVICE_STATUS,
  );

  return (
    <Card title={t.transferTitle}>
      <p className="mb-3 text-sm text-text">{t.transferWaiting}</p>
      {transfer.reason ? (
        <p className="mb-3 text-sm text-text-secondary">{transfer.reason}</p>
      ) : null}
      {transfer.withReservations ? (
        <p className="mb-3 text-sm text-text-secondary" data-testid="transfer-includes-reservations">
          {t.transferReservationsIncluded}
        </p>
      ) : null}
      <form action={action} className="space-y-3">
        <input type="hidden" name="transferId" value={transfer.id} />
        <TextArea label={t.transferWithdrawReason} name="reason" rows={2} />
        <Feedback state={state} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.servicePending : t.transferWithdraw}
        </Button>
      </form>
    </Card>
  );
}

function DecideForm({ transfer }: { transfer: PendingTransfer }) {
  const [accepted, acceptAction, accepting] = useActionState(
    acceptEstablishmentTransfer,
    INITIAL_SERVICE_STATUS,
  );
  const [rejected, rejectAction, rejecting] = useActionState(
    rejectEstablishmentTransfer,
    INITIAL_SERVICE_STATUS,
  );

  return (
    <Card title={t.transferOfferedTitle}>
      <p className="mb-3 text-sm text-text">{t.transferOfferedHint}</p>
      {transfer.reason ? (
        <p className="mb-3 rounded-[10px] bg-soft-surface p-3 text-sm text-text">
          {transfer.reason}
        </p>
      ) : null}

      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-text-secondary">
        <li>{t.transferWhatTravels}</li>
        <li>{t.transferWhatStays}</li>
        {transfer.withReservations ? <li data-testid="transfer-includes-reservations">{t.transferReservationsIncluded}</li> : null}
        <li>{t.transferNoUndo}</li>
      </ul>

      <form action={acceptAction} className="mb-4 space-y-2">
        <input type="hidden" name="transferId" value={transfer.id} />
        <Feedback state={accepted} />
        <Button type="submit" disabled={accepting}>
          {accepting ? t.servicePending : t.transferAccept}
        </Button>
      </form>

      <form action={rejectAction} className="space-y-2">
        <input type="hidden" name="transferId" value={transfer.id} />
        <TextArea label={t.transferRejectReason} name="reason" rows={2} required />
        <Feedback state={rejected} />
        <Button type="submit" variant="danger" disabled={rejecting}>
          {rejecting ? t.servicePending : t.transferReject}
        </Button>
      </form>
    </Card>
  );
}
