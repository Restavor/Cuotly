"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button, Card, Field, Modal, StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/client";

type Factor = {
  readonly id: string;
  readonly friendly_name?: string | null;
  readonly status: string;
  readonly created_at: string;
};

type Enrolling = {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
};

/**
 * §136 · el segundo factor con la API de MFA de Supabase Auth, desde el
 * navegador: registrar (código QR + confirmación), verificar la sesión en
 * curso y desactivar. Ningún secreto pasa por nuestro servidor: el
 * navegador habla con el servidor de identidad y el resultado es el nivel
 * `aal2` del token, que es lo que las funciones de la base comprueban.
 */
export function TwoFactorSetup({ sessionVerified }: { sessionVerified: boolean }) {
  const router = useRouter();
  const t = es.twoFactor;
  const [factors, setFactors] = useState<readonly Factor[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmUnenroll, setConfirmUnenroll] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setLoadError(listError.message);
      return;
    }
    setFactors(data.totp.filter((f) => f.status === "verified"));
  }, []);

  useEffect(() => {
    // La primera carga se suscribe al resultado en vez de llamar a
    // `refresh()`: el estado se escribe en la respuesta del servidor de
    // identidad, no en el cuerpo del efecto.
    let cancelado = false;
    createClient()
      .auth.mfa.listFactors()
      .then(({ data, error: listError }) => {
        if (cancelado) return;
        if (listError) setLoadError(listError.message);
        else setFactors(data.totp.filter((f) => f.status === "verified"));
      });
    return () => {
      cancelado = true;
    };
  }, []);

  async function startEnroll() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: t.factorName,
    });
    setBusy(false);
    if (enrollError || !data) {
      setError(enrollError?.message ?? t.loadError);
      return;
    }
    setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    setCode("");
  }

  async function cancelEnroll() {
    if (enrolling) {
      const supabase = createClient();
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    }
    setEnrolling(null);
    setCode("");
  }

  async function verify(factorId: string, done: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setBusy(false);
      setError(challengeError?.message ?? t.invalidCode);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError(t.invalidCode);
      return;
    }
    setEnrolling(null);
    setCode("");
    setNotice(done);
    await refresh();
    router.refresh();
  }

  async function unenroll(factorId: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    setConfirmUnenroll(null);
    if (unenrollError) {
      setError(sessionVerified ? unenrollError.message : t.unenrollNeedsAal2);
      return;
    }
    setNotice(t.unenrolled);
    await refresh();
    router.refresh();
  }

  const qrSrc = enrolling
    ? enrolling.qrCode.startsWith("data:")
      ? enrolling.qrCode
      : `data:image/svg+xml;utf-8,${encodeURIComponent(enrolling.qrCode)}`
    : null;

  return (
    <div className="space-y-6">
      <Card title={t.factorsTitle}>
        {loadError ? (
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
        ) : factors === null ? (
          <p className="text-sm text-text-secondary">{es.states.loading}</p>
        ) : factors.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone="neutral">{t.statusOff}</StatusBadge>
            {enrolling === null ? (
              <Button type="button" onClick={startEnroll} pending={busy}>
                {busy ? t.enrollStarting : t.enrollStart}
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-3">
            {factors.map((factor) => (
              <li key={factor.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <StatusBadge tone="success" icon="check">
                    {t.statusOn}
                  </StatusBadge>
                  <span className="ml-2 text-sm text-text">{factor.friendly_name ?? t.factorName}</span>
                  <span className="block text-xs text-text-secondary">
                    {t.factorCreated} {factor.created_at.slice(0, 10)}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {!sessionVerified ? (
                    <Button type="button" variant="secondary" onClick={() => router.push("/cuenta/verificar")}>
                      {t.verifyNow}
                    </Button>
                  ) : null}
                  <Button type="button" variant="danger" onClick={() => setConfirmUnenroll(factor.id)} pending={busy}>
                    {t.unenroll}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-text-secondary">
          {sessionVerified ? t.sessionVerified : t.sessionNotVerified}
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-2 text-sm text-text-secondary">
            {notice}
          </p>
        ) : null}
      </Card>

      {enrolling && qrSrc ? (
        <Card title={t.enrollTitle}>
          <p className="mb-4 text-sm text-text-secondary">{t.enrollHint}</p>
          {/* Es un QR generado por el servidor de identidad como SVG en
              línea: `next/image` no aporta nada a una imagen que no se
              descarga de ningún sitio. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="" width={200} height={200} className="mb-4 rounded-[10px] border border-border" />
          <p className="mb-1 text-xs text-text-secondary">{t.secretLabel}</p>
          <code className="mb-4 block break-all rounded-[10px] bg-soft-surface px-3 py-2 text-sm">{enrolling.secret}</code>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void verify(enrolling.factorId, t.enrolled);
            }}
          >
            <Field
              label={t.codeLabel}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t.codePlaceholder}
              required
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => void cancelEnroll()} disabled={busy}>
                {t.cancel}
              </Button>
              <Button type="submit" pending={busy}>
                {busy ? t.verifying : t.verify}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Modal open={confirmUnenroll !== null} title={t.unenroll} onClose={() => setConfirmUnenroll(null)}>
        <p className="mb-4 text-sm text-text-secondary">{t.unenrollConfirm}</p>
        {!sessionVerified ? <p className="mb-4 text-sm text-text">{t.unenrollNeedsAal2}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setConfirmUnenroll(null)}>
            {t.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            pending={busy}
            onClick={() => confirmUnenroll && void unenroll(confirmUnenroll)}
          >
            {busy ? t.unenrolling : t.unenrollAction}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
