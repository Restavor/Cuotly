"use client";

import { useRef, useState, useTransition } from "react";

import { Button, Card, Field, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import type { SheetFeedback } from "./action-state";
import { adjustBalanceAction, registerManualTopupAction, registerPayoutAction, setLowBalanceThresholdAction } from "./actions";

type MethodKey = keyof typeof es.reservationsSpace.sheet.forms.methods;

function Feedback({ result }: { result: SheetFeedback | null }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-text-secondary" : "text-danger"}`} data-testid="sheet-feedback">
      {result.message}
    </p>
  );
}

/**
 * Las tres cosas que Restavor hace con el saldo de un restaurante (PRD de agents §5.2): «Registrar recarga»,
 * «Ajuste» y «Devolver el saldo». El ajuste y la devolución piden el segundo paso: si la sesión no lo ha pasado se
 * dice antes de escribir, pero quien lo comprueba de verdad es la base de datos.
 */
export function BalanceTeamForms({
  slug,
  establishmentId,
  canWrite,
  twoFactor,
  canPayout,
  thresholdCents,
}: {
  slug: string;
  establishmentId: string;
  canWrite: boolean;
  twoFactor: boolean;
  canPayout: boolean;
  thresholdCents: number;
}) {
  const t = es.reservationsSpace.sheet.forms;
  const [busy, startTransition] = useTransition();
  const formKey = useRef(globalThis.crypto.randomUUID());

  const [topupAmount, setTopupAmount] = useState("");
  const [topupMethod, setTopupMethod] = useState<MethodKey>("transfer");
  const [topupNote, setTopupNote] = useState("");
  const [topupResult, setTopupResult] = useState<SheetFeedback | null>(null);

  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustResult, setAdjustResult] = useState<SheetFeedback | null>(null);

  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutResult, setPayoutResult] = useState<SheetFeedback | null>(null);

  const [threshold, setThreshold] = useState(String(thresholdCents / 100).replace(".", ","));
  const [thresholdResult, setThresholdResult] = useState<SheetFeedback | null>(null);

  if (!canWrite) {
    return (
      <p className="text-sm text-text-secondary" data-testid="balance-forms-readonly">
        {t.noPermission}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card title={t.topupTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.topupHelp}</p>
        <form
          noValidate
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await registerManualTopupAction({
                slug,
                establishmentId,
                amount: topupAmount,
                method: topupMethod,
                note: topupNote,
                formKey: formKey.current,
              });
              setTopupResult(result);
              if (result.ok) {
                setTopupAmount("");
                setTopupNote("");
                formKey.current = globalThis.crypto.randomUUID();
              }
            });
          }}
        >
          <Field label={t.amountLabel} name="topup-amount" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} inputMode="decimal" data-testid="manual-topup-amount" />
          <div>
            <label htmlFor="topup-method" className="mb-1 block text-sm font-medium text-text">
              {t.methodLabel}
            </label>
            <select
              id="topup-method"
              value={topupMethod}
              onChange={(e) => setTopupMethod(e.target.value as MethodKey)}
              className="min-h-11 w-full rounded-field border border-border bg-surface px-3 text-[15px] text-text"
              data-testid="manual-topup-method"
            >
              {(Object.keys(t.methods) as MethodKey[]).map((key) => (
                <option key={key} value={key}>
                  {t.methods[key]}
                </option>
              ))}
            </select>
          </div>
          <Field label={t.noteLabel} name="topup-note" value={topupNote} onChange={(e) => setTopupNote(e.target.value)} />
          <p className="text-xs text-text-secondary" data-testid="note-visible-warning">
            {t.noteVisible}
          </p>
          <Feedback result={topupResult} />
          <Button type="submit" pending={busy} data-testid="manual-topup-submit">
            {t.topupButton}
          </Button>
        </form>
      </Card>

      <Card title={t.adjustTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.adjustHelp}</p>
        {!twoFactor ? (
          <p className="mb-3 text-sm font-semibold text-pending-text" data-testid="adjust-needs-2fa">
            {t.needsTwoFactor}
          </p>
        ) : null}
        <form
          noValidate
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await adjustBalanceAction({ slug, establishmentId, amount: adjustAmount, reason: adjustReason, formKey: formKey.current });
              setAdjustResult(result);
              if (result.ok) {
                setAdjustAmount("");
                setAdjustReason("");
                formKey.current = globalThis.crypto.randomUUID();
              }
            });
          }}
        >
          <Field label={t.adjustAmountLabel} name="adjust-amount" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} inputMode="decimal" data-testid="adjust-amount" />
          <TextArea label={t.reasonLabel} name="adjust-reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} data-testid="adjust-reason" />
          <p className="text-xs text-text-secondary" data-testid="reason-visible-warning">
            {t.reasonVisible}
          </p>
          <Feedback result={adjustResult} />
          <Button type="submit" pending={busy} disabled={!twoFactor} data-testid="adjust-submit">
            {t.adjustButton}
          </Button>
        </form>
      </Card>

      <Card title={t.thresholdTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.thresholdHelp}</p>
        <form
          noValidate
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setThresholdResult(await setLowBalanceThresholdAction({ slug, establishmentId, amount: threshold }));
            });
          }}
        >
          <Field label={t.thresholdLabel} name="threshold-amount" value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" data-testid="threshold-amount" />
          <Feedback result={thresholdResult} />
          <Button type="submit" pending={busy} data-testid="threshold-submit">
            {t.thresholdButton}
          </Button>
        </form>
      </Card>

      {canPayout ? (
        <Card title={t.payoutTitle}>
          <p className="mb-3 text-sm text-text-secondary">{t.payoutHelp}</p>
          <form
            noValidate
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await registerPayoutAction({ slug, establishmentId, amount: payoutAmount, note: payoutNote, formKey: formKey.current });
                setPayoutResult(result);
                if (result.ok) {
                  setPayoutAmount("");
                  setPayoutNote("");
                  formKey.current = globalThis.crypto.randomUUID();
                }
              });
            }}
          >
            <Field label={t.amountLabel} name="payout-amount" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} inputMode="decimal" data-testid="payout-amount" />
            <Field label={t.noteLabel} name="payout-note" value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} />
            <p className="text-xs text-text-secondary">{t.noteVisible}</p>
            <Feedback result={payoutResult} />
            <Button type="submit" pending={busy} disabled={!twoFactor} data-testid="payout-submit">
              {t.payoutButton}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
