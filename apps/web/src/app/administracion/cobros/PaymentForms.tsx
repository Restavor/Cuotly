"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui";
import { CUOTLY_PAYMENT_METHODS } from "@/core/cuotly-subscription";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../action-state";
import { confirmCuotlyPayment, recordCuotlyPayment, rejectCuotlyPayment } from "../actions";

const INPUT = "rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-xs text-text";

function Aviso({ error, done, hecho }: { error: string | null; done: boolean; hecho: string }) {
  if (error) {
    return (
      <p role="alert" className="text-xs text-danger">
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="text-xs text-text-secondary">
        {hecho}
      </p>
    );
  }
  return null;
}

/** RN-SUB-06 · confirmar o rechazar (con motivo) un pago declarado. */
export function PendingPaymentForms({ paymentId }: { paymentId: string }) {
  const [confirmState, confirm, confirming] = useActionState(confirmCuotlyPayment, INITIAL_ADMIN_STATE);
  const [rejectState, reject, rejecting] = useActionState(rejectCuotlyPayment, INITIAL_ADMIN_STATE);
  const t = es.platformAdmin.charges;

  return (
    <div className="flex flex-col gap-2">
      <form action={confirm} className="flex flex-col gap-1">
        <input type="hidden" name="paymentId" value={paymentId} />
        <input name="note" aria-label={t.confirmNote} placeholder={t.confirmNote} className={INPUT} />
        <Button type="submit" pending={confirming} className="px-3 py-1.5 text-xs">
          {confirming ? t.pending_ : t.confirm}
        </Button>
        <Aviso error={confirmState.error} done={confirmState.done} hecho={t.confirmed} />
      </form>
      <form action={reject} className="flex flex-col gap-1">
        <input type="hidden" name="paymentId" value={paymentId} />
        <input name="reason" aria-label={t.rejectReason} placeholder={t.rejectReason} required className={INPUT} />
        <Button type="submit" variant="danger" pending={rejecting} className="px-3 py-1.5 text-xs">
          {rejecting ? t.pending_ : t.reject}
        </Button>
        <Aviso error={rejectState.error} done={rejectState.done} hecho={t.rejected} />
      </form>
    </div>
  );
}

/** RN-SUB-06 · registrar un pago visto en el banco sin declaración previa. */
export function RecordPaymentForm({ chargeId, outstandingCents }: { chargeId: string; outstandingCents: number }) {
  const [state, action, pending] = useActionState(recordCuotlyPayment, INITIAL_ADMIN_STATE);
  const key = useId();
  const t = es.platformAdmin.charges;

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="chargeId" value={chargeId} />
      <input type="hidden" name="idempotencyKey" value={`record:${chargeId}:${key}`} />
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        defaultValue={(outstandingCents / 100).toFixed(2)}
        aria-label={t.recordAmount}
        required
        className={INPUT}
      />
      <select name="method" aria-label={t.recordMethod} className={INPUT} defaultValue="transfer">
        {CUOTLY_PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {t.methods[m]}
          </option>
        ))}
      </select>
      <input name="paidAt" type="date" aria-label={t.recordPaidAt} className={INPUT} />
      <input name="note" aria-label={t.recordNote} placeholder={t.recordNote} className={INPUT} />
      <Button type="submit" variant="secondary" pending={pending} className="px-3 py-1.5 text-xs">
        {pending ? t.pending_ : t.record}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={t.recorded} />
    </form>
  );
}
