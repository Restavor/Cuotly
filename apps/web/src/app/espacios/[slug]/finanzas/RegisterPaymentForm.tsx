"use client";

import { useActionState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_PAYMENT, registerPayment } from "./actions";

export function RegisterPaymentForm({
  chargeId,
  outstandingEuros,
}: {
  chargeId: string;
  outstandingEuros: string;
}) {
  const [state, action, pending] = useActionState(registerPayment, INITIAL_PAYMENT);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="chargeId" value={chargeId} />
      <div className="w-32">
        <Field
          label={es.teamArea.finance.registerAmountLabel}
          name="amount"
          inputMode="decimal"
          defaultValue={outstandingEuros}
          required
        />
      </div>
      <div className="w-44">
        <Select
          label={es.teamArea.finance.registerMethodLabel}
          name="method"
          required
          options={[
            { value: "transfer", label: es.teamArea.methods.transfer },
            { value: "bizum", label: es.teamArea.methods.bizum },
          ]}
        />
      </div>
      <Button type="submit" disabled={pending} className="mb-4">
        {pending ? es.teamArea.finance.registerPending : es.teamArea.finance.registerSubmit}
      </Button>
      {state.error ? (
        <p role="alert" className="mb-4 w-full text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
