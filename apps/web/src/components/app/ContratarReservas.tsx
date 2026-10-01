"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";

import { Button, Modal } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import {
  loadReservationTerms,
  requestReservationsAction,
  type ReservationTermsResult,
} from "@/app/(global)/reservas-actions";

export interface ContractOffer {
  readonly establishmentId: string;
  readonly name: string;
}

/**
 * RN-APP-03 · la ventana "Contratar Reservas" de `diseno/final/AppContratar`.
 *
 * El botón que la abre lo pone quien la usa (`children`): "Contratar
 * Reservas" en la tarjeta sin contratar, "Volver a pedir Reservas" tras un
 * rechazo. Las condiciones se leen del servidor al abrirla y al cambiar de
 * restaurante —el espacio de cada uno puede tener las suyas—, y el botón de
 * enviar espera a tenerlas y a que se acepten.
 *
 * La clave de idempotencia nace al abrir la ventana: pulsar "Enviar" dos
 * veces es una sola solicitud (CA-17), y el servidor lo garantiza aunque el
 * navegador no lo hiciera. Aceptar las condiciones lo comprueba el servidor
 * con la versión que se le manda; esta casilla no autoriza nada.
 */
export function ContratarReservas({
  offers,
  variant = "primary",
  children,
}: {
  offers: readonly ContractOffer[];
  variant?: "primary" | "outline";
  children: React.ReactNode;
}) {
  const t = es.app.contract;
  const router = useRouter();
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [establishmentId, setEstablishmentId] = useState(offers[0]?.establishmentId ?? "");
  const [terms, setTerms] = useState<ReservationTermsResult | "loading">("loading");
  const [accepted, setAccepted] = useState(false);
  const [showConditions, setShowConditions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();

  // Las condiciones del restaurante elegido, cada vez que se abre o se cambia.
  useEffect(() => {
    if (!open || establishmentId === "") return;
    let vigente = true;
    void loadReservationTerms(establishmentId).then((result) => {
      if (vigente) setTerms(result);
    });
    return () => {
      vigente = false;
    };
  }, [open, establishmentId]);

  function abrir() {
    setEstablishmentId(offers[0]?.establishmentId ?? "");
    setTerms("loading");
    setAccepted(false);
    setShowConditions(false);
    setError(null);
    setKey(crypto.randomUUID());
    setOpen(true);
  }

  function enviar() {
    if (terms === "loading" || !terms.ok) return;
    const versionId = terms.versionId;
    start(async () => {
      const result = await requestReservationsAction(establishmentId, versionId, key);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const actual = offers.find((offer) => offer.establishmentId === establishmentId);
  const listas = terms !== "loading" && terms.ok;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={abrir}
        className="min-h-[48px] w-full text-base"
      >
        {children}
      </Button>

      <Modal open={open} title={t.title} onClose={() => setOpen(false)} size="lg">
        <p className="-mt-3 mb-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {t.kicker}
        </p>

        <div className="mb-5">
          {offers.length > 1 ? (
            <>
              <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold text-text">
                {t.forRestaurant}
              </label>
              <select
                id={selectId}
                value={establishmentId}
                onChange={(event) => {
                  setEstablishmentId(event.target.value);
                  setTerms("loading");
                  setAccepted(false);
                }}
                className="w-full rounded-[10px] border border-border bg-surface px-3.5 py-3 text-base text-text focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green/20"
              >
                {offers.map((offer) => (
                  <option key={offer.establishmentId} value={offer.establishmentId}>
                    {offer.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-text">{t.forRestaurant}</p>
              <p className="mt-1.5 rounded-[10px] border border-border px-3.5 py-3 text-base text-text">
                {actual?.name ?? ""}
              </p>
            </>
          )}
        </div>

        <ul className="mb-5 space-y-2.5">
          {t.includes.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-[15px] leading-snug text-text">
              <Icon name="tick" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-success" />
              {line}
            </li>
          ))}
        </ul>

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-field bg-soft-surface p-4">
            <p className="text-xs text-text-secondary">{t.feeLabel}</p>
            <p className="mt-1 text-[22px] font-bold tabular-nums text-text">{t.fee}</p>
            <p className="text-xs tabular-nums text-text-secondary">{t.feeWithTax}</p>
          </div>
          <div className="rounded-field bg-soft-surface p-4">
            <p className="text-xs text-text-secondary">{t.balanceLabel}</p>
            <p className="mt-1 text-[22px] font-bold text-text">{t.balance}</p>
            <p className="text-xs text-text-secondary">{t.balanceBody}</p>
          </div>
        </div>

        <div className="mb-5">
          <p className="mb-2.5 text-sm font-semibold text-text">{t.afterTitle}</p>
          <ol className="space-y-2.5">
            {t.after.map((line, index) => (
              <li key={line} className="flex items-start gap-3 text-[15px] leading-snug text-text">
                <span
                  aria-hidden="true"
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-soft-surface text-[13px] font-bold text-primary-dark"
                >
                  {index + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        </div>

        <div className="mb-4">
          <label className="flex min-h-[44px] items-center gap-2.5 text-[15px] text-text">
            <input
              type="checkbox"
              checked={accepted}
              disabled={!listas}
              onChange={(event) => setAccepted(event.target.checked)}
              className="h-5 w-5 accent-primary"
            />
            <span>
              {t.acceptPrefix}{" "}
              <button
                type="button"
                onClick={() => setShowConditions((value) => !value)}
                aria-expanded={showConditions}
                className="font-semibold text-cuotly-green underline"
              >
                {t.acceptLink}
              </button>
            </span>
          </label>

          {showConditions ? (
            <div className="mt-2 rounded-field border border-border bg-background p-4 text-sm text-text">
              {terms === "loading" ? (
                <p className="text-text-secondary">{t.conditionsLoading}</p>
              ) : terms.ok ? (
                <>
                  <p className="mb-2 text-xs text-text-secondary">
                    {t.conditionsTitle} · {t.conditionsVersion(terms.version)}
                  </p>
                  <p className="whitespace-pre-wrap">{terms.conditions}</p>
                </>
              ) : (
                <p role="alert" className="text-danger">
                  {terms.error}
                </p>
              )}
            </div>
          ) : null}

          {terms !== "loading" && !terms.ok && !showConditions ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {terms.error}
            </p>
          ) : null}
        </div>

        {error === null ? null : (
          <p role="alert" className="mb-3 rounded-field bg-danger/10 px-3 py-2.5 text-sm text-text">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_2fr]">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            className="min-h-[48px]"
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={enviar}
            disabled={!accepted || !listas}
            pending={pending}
            className="min-h-[48px]"
          >
            {pending ? t.submitting : t.submit}
          </Button>
        </div>
      </Modal>
    </>
  );
}
