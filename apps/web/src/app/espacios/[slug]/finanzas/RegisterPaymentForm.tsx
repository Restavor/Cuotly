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
      {/*
        Registrar un cobro no decía nada al terminar: el estado de la fila
        cambia, pero eso está en otra celda y no siempre se mueve (un cobro
        a cuenta sigue "Pagado en parte"). Quien pulsa el botón necesita
        saber que su pulsación llegó.
      */}
      {state.done ? (
        <p role="status" className="mb-4 w-full text-sm text-text-secondary">
          {es.teamArea.finance.registerDone}
        </p>
      ) : null}
    </form>
  );
}
