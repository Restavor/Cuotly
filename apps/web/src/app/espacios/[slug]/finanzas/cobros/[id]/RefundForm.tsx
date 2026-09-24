"use client";

import { useActionState, useState } from "react";

import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_REFUND } from "../../action-state";
import { refundCharge } from "../../actions";

const t = es.teamArea.finance;

function nuevaClave(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * M52 · "Registrar reembolso". La clave de idempotencia nace con el
 * formulario y cambia solo cuando el reembolso se ha registrado: un
 * doble clic manda la misma y el servidor escribe un único apunte
 * (migración 129). El importe propuesto es lo cobrado; el servidor no deja
 * pasar de ahí.
 */
export function RefundForm({ chargeId, collectedEuros }: { chargeId: string; collectedEuros: string }) {
  const [state, action, pending] = useActionState(refundCharge, INITIAL_REFUND);
  // La base nace con el formulario; el contador sube con cada reembolso
  // registrado. Mientras no cambie, dos envíos llevan la misma clave.
  const [base] = useState(nuevaClave);
  const clave = `${base}:${state.serial}`;

  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-text-secondary">{t.refundHint}</p>
      <input type="hidden" name="chargeId" value={chargeId} />
      <input type="hidden" name="idempotencyKey" value={clave} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label={t.refundAmountLabel} name="amount" inputMode="decimal" defaultValue={collectedEuros} required />
        <Field label={t.refundReasonLabel} name="reason" required />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : state.done ? (
        <p role="status" className="text-sm text-success">
          {t.refundDone}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.refundPending : t.refundSubmit}
      </Button>
    </form>
  );
}
