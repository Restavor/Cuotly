"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { approveRequestAction, rejectRequestAction } from "../actions";

/**
 * Aprobar o rechazar una solicitud de Reservas (PRD de agents §4.4, COB-01). Rechazar pide el motivo, que verá
 * el restaurante. Quién puede lo decide la base de datos: estos botones solo los ve quien gestiona clientes.
 */
export function RequestDecision({ slug, requestId, canApprove = true }: { slug: string; requestId: string; canApprove?: boolean }) {
  const t = es.reservationsSpace.requests;
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <div className="w-full space-y-3">
      {!canApprove ? (
        <p className="text-sm font-semibold text-pending-text" data-testid="approve-needs-payment-details">
          {t.needPaymentDetails}
        </p>
      ) : null}
      {!rejecting ? (
        <div className="flex flex-wrap gap-3">
          <Button
            className="min-h-11"
            pending={busy}
            disabled={!canApprove}
            data-testid="approve-request"
            onClick={() => {
              setFeedback(null);
              startTransition(async () => {
                const result = await approveRequestAction({ slug, requestId });
                setFeedback({ ok: result.ok, message: result.message ?? "" });
                if (result.ok) router.refresh();
              });
            }}
          >
            {t.approve}
          </Button>
          <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setRejecting(true)} data-testid="reject-request">
            {t.reject}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-field border border-border p-4">
          <label htmlFor={`reject-${requestId}`} className="block text-sm font-semibold">
            {t.rejectReasonLabel}
          </label>
          <textarea
            id={`reject-${requestId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text"
            data-testid="reject-reason"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              className="min-h-11"
              pending={busy}
              data-testid="reject-confirm"
              onClick={() => {
                setFeedback(null);
                startTransition(async () => {
                  const result = await rejectRequestAction({ slug, requestId, reason });
                  setFeedback({ ok: result.ok, message: result.message ?? "" });
                  if (result.ok) router.refresh();
                });
              }}
            >
              {t.rejectConfirm}
            </Button>
            <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setRejecting(false)}>
              {t.rejectCancel}
            </Button>
          </div>
        </div>
      )}
      {feedback ? (
        <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-text-secondary" : "text-danger"}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
