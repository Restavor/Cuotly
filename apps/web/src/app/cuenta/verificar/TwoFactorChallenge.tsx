"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/client";

import { signOut } from "../../(auth)/actions";

/**
 * El código de seis cifras contra el primer factor verificado de la
 * cuenta. Al pasar, el navegador guarda la sesión `aal2` y se vuelve al
 * inicio con la página refrescada, para que el servidor la lea.
 */
export function TwoFactorChallenge() {
  const router = useRouter();
  const t = es.twoFactor;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (listError || !factor) {
      setBusy(false);
      setError(listError?.message ?? t.challengeNoFactor);
      return;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challengeError || !challenge) {
      setBusy(false);
      setError(challengeError?.message ?? t.invalidCode);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError(t.invalidCode);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <>
      <form onSubmit={submit}>
        <Field
          label={t.codeLabel}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t.codePlaceholder}
          autoFocus
          required
        />
        {error ? (
          <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-text">
            {error}
          </p>
        ) : null}
        <Button type="submit" pending={busy} className="w-full">
          {busy ? t.verifying : t.challengeSubmit}
        </Button>
      </form>
      <form action={signOut} className="mt-4 text-center">
        <button type="submit" className="text-sm text-text-secondary underline">
          {t.challengeSignOut}
        </button>
      </form>
    </>
  );
}
