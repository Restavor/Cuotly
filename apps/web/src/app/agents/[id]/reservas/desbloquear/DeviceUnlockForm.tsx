"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { unlockSettingsAction } from "@/app/agents/device-actions";
import { PinPad } from "@/components/agents/PinPad";
import { PageHeader } from "@/components/ui";
import { normalizePin, PIN_LENGTH } from "@/core/reservations/device";
import { es } from "@/i18n/es";

/**
 * «Ajustes con PIN» (`PinTablet`): el teclado de la tablet. El PIN de un Encargado o de un Propietario abre los Ajustes
 * durante 2 minutos sin tocar. Esto solo pinta; el PIN, el bloqueo tras 5 fallos y el rol los comprueba el servidor.
 */
export function DeviceUnlockForm({ establishmentId, backHref }: { establishmentId: string; backHref: string }) {
  const t = es.agents.device;
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, startTransition] = useTransition();

  function submit() {
    if (busy || pin.length !== PIN_LENGTH) return;
    setError(null);
    startTransition(async () => {
      const result = await unlockSettingsAction({ establishmentId, pin });
      if (!result.ok) {
        setError(result.message);
        setLocked(result.device?.code === "locked" || result.device?.code === "no_device");
        setPin("");
        return;
      }
      router.replace(result.href ?? backHref);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-6" data-testid="device-unlock">
      <PageHeader title={t.unlock.title} subtitle={t.unlock.reason} />
      <div className="space-y-5 rounded-card border border-border bg-surface p-6">
        <p className="text-center text-lg font-semibold text-primary-dark">{t.pin.enter}</p>
        <PinPad value={pin} onChange={(next) => setPin(normalizePin(next))} onSubmit={submit} disabled={busy || locked} />
        <div aria-live="polite" className="min-h-6 text-center text-sm">
          {error ? (
            <p role="alert" data-testid="device-unlock-error" className="font-medium text-danger">
              {error}
            </p>
          ) : busy ? (
            <p className="text-text-secondary">{t.pin.checking}</p>
          ) : null}
        </div>
        <p className="text-center text-xs text-text-secondary">{t.pin.lockNote}</p>
      </div>
      <p className="text-center">
        <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-medium text-cuotly-green hover:underline">
          {t.unlock.back}
        </Link>
      </p>
    </div>
  );
}
