"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { canCloseByHand, canReactivateClosed, canRequestCancellation } from "@/core/reservations/lifecycle";
import { es } from "@/i18n/es";

import {
  cancelServiceAction,
  closeServiceAction,
  reactivateClosedAction,
  undoCancelAction,
} from "../actions";

/**
 * Lo que Restavor puede hacer con Reservas de un restaurante según su estado (PRD de agents §6.12): darle de baja o
 * anular la baja, cerrar a mano desde la pausa (con motivo) y reactivar una cerrada dentro de sus 30 días. Qué se
 * ofrece sale de `core/reservations/lifecycle.ts`; que se pueda lo decide la base de datos.
 */
export function ServiceActions({
  slug,
  establishmentId,
  status,
  endingAt,
  closedAt,
  dataPurged,
}: {
  slug: string;
  establishmentId: string;
  status: string;
  endingAt: string | null;
  closedAt: string | null;
  dataPurged: boolean;
}) {
  const t = es.reservationsSpace.running;
  const router = useRouter();
  const [asking, setAsking] = useState<"cancel" | "close" | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message: string | null }>) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback({ ok: result.ok, message: result.message ?? "" });
      if (result.ok) {
        setAsking(null);
        setReason("");
        router.refresh();
      }
    });
  };

  const now = new Date();
  const canCancel = canRequestCancellation(status);
  const canUndo = status === "ending" && (endingAt === null || new Date(endingAt).getTime() > now.getTime());
  const canClose = canCloseByHand(status);
  const canReactivate = canReactivateClosed(status, closedAt ? new Date(closedAt) : null, dataPurged, now);

  if (!canCancel && !canUndo && !canClose && !canReactivate) return null;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap gap-3">
        {canCancel && asking !== "cancel" ? (
          <Button variant="secondary" className="min-h-11" onClick={() => setAsking("cancel")} data-testid={`cancel-${establishmentId}`}>
            {t.cancel}
          </Button>
        ) : null}
        {canUndo ? (
          <Button variant="secondary" className="min-h-11" pending={busy} onClick={() => run(() => undoCancelAction({ slug, establishmentId }))}>
            {t.undoCancel}
          </Button>
        ) : null}
        {canClose && asking !== "close" ? (
          <Button variant="secondary" className="min-h-11" onClick={() => setAsking("close")} data-testid={`close-${establishmentId}`}>
            {t.close}
          </Button>
        ) : null}
        {canReactivate ? (
          <Button className="min-h-11" pending={busy} onClick={() => run(() => reactivateClosedAction({ slug, establishmentId }))} data-testid={`reactivate-${establishmentId}`}>
            {t.reactivate}
          </Button>
        ) : null}
      </div>

      {asking === "cancel" ? (
        <div role="group" aria-label={t.cancelConfirm} className="space-y-3 rounded-field border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold">{t.cancelConfirm}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" className="min-h-11" pending={busy} onClick={() => run(() => cancelServiceAction({ slug, establishmentId }))} data-testid={`cancel-confirm-${establishmentId}`}>
              {t.cancel}
            </Button>
            <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setAsking(null)}>
              {t.keep}
            </Button>
          </div>
        </div>
      ) : null}

      {asking === "close" ? (
        <div className="space-y-3 rounded-field border border-danger/30 bg-danger/5 p-4">
          <label htmlFor={`close-reason-${establishmentId}`} className="block text-sm font-semibold">
            {t.closeReasonLabel}
          </label>
          <textarea
            id={`close-reason-${establishmentId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text"
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" className="min-h-11" pending={busy} onClick={() => run(() => closeServiceAction({ slug, establishmentId, reason }))} data-testid={`close-confirm-${establishmentId}`}>
              {t.closeConfirm}
            </Button>
            <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setAsking(null)}>
              {t.keep}
            </Button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-text-secondary" : "text-danger"}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
