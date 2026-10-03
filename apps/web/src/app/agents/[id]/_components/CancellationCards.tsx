"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card } from "@/components/ui";
import { es } from "@/i18n/es";

import { requestCancellationAction, undoCancellationAction } from "../plan/actions";

/** «Darme de baja» (`AjustesPlan`, PRD de agents §6.12): con una confirmación antes, porque no se deshace sola. */
export function CancelServiceCard({ establishmentId }: { establishmentId: string }) {
  const t = es.agents.billing.plan;
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <Card title={t.cancelTitle}>
      <p className="mb-4 text-sm text-text-secondary">{t.cancelBody}</p>
      {notice ? (
        <p role="status" className="mb-3 rounded-field bg-success/10 px-3 py-2 text-sm" data-testid="cancel-notice">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!asking ? (
        <Button variant="secondary" className="min-h-11" onClick={() => setAsking(true)} data-testid="cancel-service">
          {t.cancelButton}
        </Button>
      ) : (
        <div role="group" aria-label={t.cancelConfirmTitle} className="space-y-3 rounded-field border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold">{t.cancelConfirmTitle}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              className="min-h-11"
              pending={busy}
              data-testid="cancel-service-confirm"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await requestCancellationAction({ establishmentId });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setNotice(result.message);
                  setAsking(false);
                  router.refresh();
                });
              }}
            >
              {t.cancelConfirmButton}
            </Button>
            <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setAsking(false)}>
              {t.cancelKeep}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** «Anular la baja»: mientras dure el periodo pagado. */
export function UndoCancellationCard({ establishmentId }: { establishmentId: string }) {
  const t = es.agents.billing.plan;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <Card title={t.undoTitle}>
      <p className="mb-4 text-sm text-text-secondary">{t.undoBody}</p>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        className="min-h-11"
        pending={busy}
        data-testid="undo-cancellation"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await undoCancellationAction({ establishmentId });
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.refresh();
          });
        }}
      >
        {t.undoButton}
      </Button>
    </Card>
  );
}
