"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { acceptConditionsAction } from "../plan/actions";

/** «Acepta las condiciones de Reservas» (`AgentsCondiciones`, PRD de agents §4.4): casilla y botón, y de ahí a los datos de pago. */
export function AcceptConditionsForm({ establishmentId, next }: { establishmentId: string; next: string }) {
  const t = es.agents.billing.conditions;
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!checked) {
          setError(t.mustAccept);
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await acceptConditionsAction({ establishmentId });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          router.push(next);
        });
      }}
    >
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
          data-testid="accept-conditions"
        />
        <span>{t.checkbox}</span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="min-h-11" pending={busy} data-testid="accept-conditions-button">
        {t.button}
      </Button>
    </form>
  );
}
