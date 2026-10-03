"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { parseCustomTopup, topupAmounts, TOPUP_PRESETS_CENTS } from "@/core/agents/balance";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { es } from "@/i18n/es";

import { startTopupAction } from "../saldo/actions";

const OTHER = "other" as const;

/**
 * «Recargar» (`AgentsSaldo`, PRD de agents §5.2 RN-AGT-04): 10, 20, 50 € u otro importe (mínimo 10 €), con lo que se
 * pagará antes de pagar —lo que se elige, más el IVA del espacio—. El IVA no es saldo: sube lo que se elige. Quien lo
 * pide es el Propietario; Stripe recoge la tarjeta en su propia página y el saldo sube cuando avisa del pago.
 */
export function TopupForm({ establishmentId, vatRatePercent }: { establishmentId: string; vatRatePercent: number }) {
  const t = es.agents.balance.topup;
  const [choice, setChoice] = useState<number | typeof OTHER>(2000);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  // Nace con el formulario: pulsar «Pagar» dos veces con el mismo importe es una sola recarga.
  const formKey = useRef(globalThis.crypto.randomUUID());

  const parsed = useMemo(() => (choice === OTHER ? parseCustomTopup(custom) : ({ ok: true, cents: choice } as const)), [choice, custom]);
  const amounts = parsed.ok ? topupAmounts(parsed.cents, vatRatePercent) : null;
  const rate = String(vatRatePercent).replace(".", ",");

  function submit() {
    if (!parsed.ok) {
      setError(parsed.reason === "too_small" ? t.tooSmall : t.invalidAmount);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startTopupAction({ establishmentId, netCents: parsed.cents, formKey: formKey.current });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      window.location.assign(result.url);
    });
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-text">{t.choose}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TOPUP_PRESETS_CENTS.map((cents) => (
            <label
              key={cents}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-field border px-3 text-[15px] font-semibold ${
                choice === cents ? "border-cuotly-green bg-cuotly-green/10 text-text" : "border-border text-text-secondary"
              }`}
            >
              <input
                type="radio"
                name="amount"
                className="sr-only"
                checked={choice === cents}
                onChange={() => setChoice(cents)}
                data-testid={`topup-${cents / 100}`}
              />
              {formatCentsAsEuros(cents)}
            </label>
          ))}
          <label
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-field border px-3 text-[15px] font-semibold ${
              choice === OTHER ? "border-cuotly-green bg-cuotly-green/10 text-text" : "border-border text-text-secondary"
            }`}
          >
            <input
              type="radio"
              name="amount"
              className="sr-only"
              checked={choice === OTHER}
              onChange={() => setChoice(OTHER)}
              data-testid="topup-other"
            />
            {t.other}
          </label>
        </div>
        {choice === OTHER ? (
          <div>
            <label htmlFor="topup-custom" className="mb-1 block text-sm text-text-secondary">
              {t.otherLabel} · {t.otherHint}
            </label>
            <input
              id="topup-custom"
              inputMode="decimal"
              autoComplete="off"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder={t.otherPlaceholder}
              className="min-h-11 w-full max-w-[12rem] rounded-field border border-border bg-surface px-3 text-[15px] text-text"
              data-testid="topup-custom"
            />
          </div>
        ) : null}
      </fieldset>

      <p className="text-sm text-text" data-testid="topup-summary">
        {amounts ? (
          <>
            {t.pay} <strong className="text-[17px]">{formatCentsAsEuros(amounts.totalCents)}</strong>{" "}
            <span className="text-text-secondary">{t.breakdown(formatCentsAsEuros(amounts.netCents), rate)}</span>
          </>
        ) : (
          <span className="text-text-secondary">{t.otherHint}</span>
        )}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-danger" data-testid="topup-error">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="min-h-11" pending={busy} disabled={!parsed.ok} data-testid="topup-pay">
        {busy ? t.working : t.button}
      </Button>
      <p className="text-xs text-text-secondary">{t.note}</p>
    </form>
  );
}
