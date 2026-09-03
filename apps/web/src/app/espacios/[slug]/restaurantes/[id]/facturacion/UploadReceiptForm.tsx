"use client";

import { useActionState } from "react";

import { FileUploadField } from "@/components/FileUploadField";
import { Button, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_RECEIPT } from "./action-state";
import { uploadReceipt } from "./actions";

/**
 * HU-26 / RN-FIN-06 · el restaurante sube el justificante de un cobro.
 *
 * Se elige a qué cobro corresponde en vez de suponerlo: un restaurante
 * puede tener varias mensualidades sin saldar y adivinar cuál es acabaría
 * colgando el resguardo del cobro equivocado.
 */
export function UploadReceiptForm({
  establishmentId,
  charges,
}: {
  establishmentId: string;
  charges: readonly { readonly id: string; readonly label: string }[];
}) {
  const [state, action, pending] = useActionState(uploadReceipt, INITIAL_RECEIPT);

  return (
    <form action={action} className="space-y-1">
      <p className="mb-3 text-sm text-text-secondary">{es.clientArea.receiptHint}</p>

      <Select
        label={es.clientArea.receiptChargeLabel}
        name="chargeId"
        required
        options={charges.map((charge) => ({ value: charge.id, label: charge.label }))}
      />

      <FileUploadField
        establishmentId={establishmentId}
        category="billing"
        name="receiptFileId"
      />

      <Button type="submit" disabled={pending}>
        {pending ? es.clientArea.receiptPending : es.clientArea.receiptSubmit}
      </Button>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm text-text-secondary">
          {es.clientArea.receiptDone}
        </p>
      ) : null}
    </form>
  );
}
