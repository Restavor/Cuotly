"use client";

import { useActionState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_PAYMENT } from "@/app/espacios/[slug]/finanzas/action-state";
import { registerPayment } from "@/app/espacios/[slug]/finanzas/actions";

/**
 * HU-26 / RN-FIN-05: "indica fecha, importe y método". `defaultDay` es el
 * día de hoy **en la zona del espacio**, calculado en el servidor: el
 * navegador de quien registra el cobro puede estar en otro huso, y quien
 * manda es el espacio (CLAUDE.md MUST).
 *
 * Falta el justificante, que es la cuarta pieza de HU-26 y depende del
 * bucket de Storage: sin él no hay dónde subir el archivo, así que no se
 * finge un campo que no guardaría nada (CLAUDE.md, P6).
 *
 * Vive en `components/` y no en `finanzas/` porque lo usan dos pantallas:
 * Finanzas (HU-26) y el detalle de un trabajo, que es por donde el
 * trabajador marca pagado un cobro de su restaurante **sin entrar en
 * Finanzas** (HU-27, RN-FIN-05). Es el mismo formulario y la misma acción
 * a propósito: lo que cambia entre los dos roles es lo que permite
 * `register_payment()` en el servidor, no la pantalla.
 */
export function RegisterPaymentForm({
  chargeId,
  outstandingEuros,
  defaultDay,
}: {
  chargeId: string;
  outstandingEuros: string;
  defaultDay: string;
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
      <div className="w-40">
        <Field
          label={es.teamArea.finance.registerDateLabel}
          name="paidAt"
          type="date"
          defaultValue={defaultDay}
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
