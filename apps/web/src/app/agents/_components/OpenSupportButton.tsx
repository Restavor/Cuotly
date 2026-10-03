"use client";

import { useState, useTransition } from "react";

import { Button, Modal, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { openSupportSessionAction } from "../support-actions";

const MINUTES = [30, 60, 120] as const;

/**
 * «Abrir como soporte» (PRD de agents §3.4, SOP-01): pide el motivo y la duración y abre la sesión de soporte de Reservas
 * de un restaurante. Es lo que permite a alguien de Restavor marcado como soporte ver los datos de los comensales; el
 * motivo queda registrado y lo ve el restaurante. Si no tiene el segundo paso hecho, la base de datos no abre nada y
 * esto lo dice.
 */
export function OpenSupportButton({
  establishmentId,
  restaurantName,
  returnTo,
}: {
  establishmentId: string;
  restaurantName: string;
  /** De dónde viene, para volver al salir (la ficha del espacio o Administración). */
  returnTo: string;
}) {
  const t = es.agents.support;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await openSupportSessionAction({ establishmentId, reason, minutes, returnTo });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Navegación completa: la sesión de soporte cambia lo que el servidor deja ver.
      window.location.assign(result.href);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)} data-testid="open-support">
        {t.open}
      </Button>
      <Modal open={open} title={t.dialogTitle(restaurantName)} onClose={() => setOpen(false)}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <TextArea label={t.reasonLabel} hint={t.reasonHint} value={reason} maxLength={500} rows={3} required onChange={(e) => setReason(e.target.value)} />
          <fieldset>
            <legend className="mb-1.5 block text-sm font-semibold text-text">{t.minutesLabel}</legend>
            <div className="flex flex-wrap gap-2">
              {MINUTES.map((m) => (
                <label
                  key={m}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-field border px-4 text-sm font-medium ${
                    minutes === m ? "border-primary bg-primary/10 text-primary-dark" : "border-border bg-surface text-text"
                  }`}
                >
                  <input type="radio" name="minutes" className="sr-only" checked={minutes === m} onChange={() => setMinutes(m)} />
                  {t.minutes(m)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="min-h-11" onClick={() => setOpen(false)}>
              {es.agents.team.cancel}
            </Button>
            <Button type="submit" className="min-h-11" pending={busy}>
              {t.submit}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
