"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card } from "@/components/ui";
import { es } from "@/i18n/es";

import { savePaymentDetailsAction } from "../actions";

/** Los datos de pago de Reservas (decisión 132): IBAN, Bizum y nota. Solo los cambia el propietario del espacio. */
export function PaymentDetailsForm({
  slug,
  spaceId,
  initial,
  canEdit,
}: {
  slug: string;
  spaceId: string;
  initial: { iban: string | null; bizumPhone: string | null; note: string | null };
  canEdit: boolean;
}) {
  const t = es.reservationsSpace.payment;
  const router = useRouter();
  const [iban, setIban] = useState(initial.iban ?? "");
  const [bizum, setBizum] = useState(initial.bizumPhone ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, startTransition] = useTransition();

  const inputClass =
    "w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text disabled:opacity-70";

  return (
    <Card title={t.title}>
      <p className="mb-4 text-sm text-text-secondary">{t.body}</p>
      <form
        noValidate
        className="grid max-w-xl gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setFeedback(null);
          startTransition(async () => {
            const result = await savePaymentDetailsAction({ slug, spaceId, iban, bizumPhone: bizum, note });
            setFeedback({ ok: result.ok, message: result.message ?? "" });
            if (result.ok) router.refresh();
          });
        }}
      >
        <div>
          <label htmlFor="payment-iban" className="mb-1.5 block text-sm font-semibold">
            {t.ibanLabel}
          </label>
          <input id="payment-iban" value={iban} onChange={(e) => setIban(e.target.value)} disabled={!canEdit} className={inputClass} placeholder={canEdit ? "" : t.unset} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="payment-bizum" className="mb-1.5 block text-sm font-semibold">
            {t.bizumLabel}
          </label>
          <input id="payment-bizum" value={bizum} onChange={(e) => setBizum(e.target.value)} disabled={!canEdit} className={inputClass} placeholder={canEdit ? "" : t.unset} inputMode="tel" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="payment-note" className="mb-1.5 block text-sm font-semibold">
            {t.noteLabel}
          </label>
          <textarea id="payment-note" value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} maxLength={300} rows={2} className={inputClass} />
        </div>
        {canEdit ? (
          <div>
            <Button type="submit" className="min-h-11" pending={busy} data-testid="save-payment-details">
              {t.save}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{t.onlyOwner}</p>
        )}
        {feedback ? (
          <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-text-secondary" : "text-danger"}`}>
            {feedback.message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
