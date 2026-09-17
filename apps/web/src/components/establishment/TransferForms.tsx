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
}: {
  establishmentId: string;
  pending: PendingTransfer | null;
  canPropose: boolean;
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

  return <ProposeForm establishmentId={establishmentId} />;
}

function ProposeForm({ establishmentId }: { establishmentId: string }) {
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
