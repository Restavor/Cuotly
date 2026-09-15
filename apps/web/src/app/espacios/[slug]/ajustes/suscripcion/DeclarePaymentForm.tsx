"use client";

import { useActionState, useId } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { CUOTLY_PAYMENT_METHODS } from "@/core/cuotly-subscription";
import { es } from "@/i18n/es";

import { INITIAL_SETTINGS } from "../action-state";
import { declareCuotlyPayment } from "./actions";

export interface DeclarableCharge {
  readonly id: string;
  readonly reference: string;
  readonly concept: string;
  readonly outstandingCents: number;
}

/**
 * RN-SUB-06 · declarar un pago: método, fecha, importe y referencia. La
 * clave de idempotencia nace con el formulario (CA-17).
 */
export function DeclarePaymentForm({ charges }: { charges: readonly DeclarableCharge[] }) {
  const [state, action, pending] = useActionState(declareCuotlyPayment, INITIAL_SETTINGS);
  const key = useId();
  const t = es.cuotlySubscription;

  return (
    <form action={action}>
      <input type="hidden" name="idempotencyKey" value={`declare:${key}`} />
      <Select
        name="chargeId"
        label={t.declareCharge}
        options={charges.map((c) => ({
          value: c.id,
          label: `${c.reference} · ${c.concept} · ${(c.outstandingCents / 100).toFixed(2)} €`,
        }))}
      />
      <Field
        name="amount"
        label={t.declareAmount}
        type="number"
        step="0.01"
        min="0.01"
        defaultValue={charges[0] ? (charges[0].outstandingCents / 100).toFixed(2) : ""}
        required
      />
      <Select
        name="method"
        label={t.declareMethod}
        defaultValue="transfer"
        options={CUOTLY_PAYMENT_METHODS.map((m) => ({ value: m, label: es.platformAdmin.charges.methods[m] }))}
      />
      <Field name="paidAt" label={t.declarePaidAt} type="date" />
      <Field name="reference" label={t.declareReference} />
      <TextArea name="note" label={t.declareNote} rows={2} />
      {state.error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="mb-3 text-sm text-text-secondary">
          {t.declared}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        {pending ? t.declaring : t.declare}
      </Button>
    </form>
  );
}
