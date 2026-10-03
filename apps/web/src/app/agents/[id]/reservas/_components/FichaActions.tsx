"use client";

import { useDeviceGate } from "@/app/agents/_components/DeviceGate";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button, Modal } from "@/components/ui";
import { todayHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";

import { cancelReservationAction, dismissDuplicateAction, reservationCommandAction } from "../actions";
import type { ActionFeedback } from "../action-state";
import { announceLocalChange } from "./local-change";

type Status = "pending" | "confirmed" | "cancelled" | "no_show";

export interface DuplicatePartnerData {
  readonly id: string;
  readonly time: string;
  readonly name: string;
  readonly href: string;
}

/**
 * Los botones de la ficha (RES-03, RES-05, RES-06, RES-07, RES-08): Confirmar y Rechazar un
 * grupo, «No vino» (desactivado hasta la hora, con «desde las HH:MM») y deshacerlo,
 * Cancelar reserva con su motivo, «No es duplicada» y el «Hecho» de una cancelación que
 * falta en la plataforma. Cada uno llama a una acción de servidor que vuelve a comprobar
 * permiso y estado: que un botón salga o no salga no autoriza nada.
 */
export function FichaActions({
  establishmentId,
  reservationId,
  date,
  time,
  status,
  startsAtMs,
  customerLine,
  platformName,
  pendingPlatformCancel,
  partners,
  openCancel,
  openReject,
  canChange,
}: {
  establishmentId: string;
  reservationId: string;
  date: string;
  time: string;
  status: Status;
  startsAtMs: number;
  /** «Sergio Gil · Sáb 26 sept · 21:00 · 6 personas». */
  customerLine: string;
  platformName: string | null;
  pendingPlatformCancel: boolean;
  partners: readonly DuplicatePartnerData[];
  openCancel: boolean;
  openReject: boolean;
  /** Esta persona puede cambiar reservas (la tabla §3.2); el servidor lo vuelve a comprobar. */
  canChange: boolean;
}) {
  const t = es.agents.agenda.ficha;
  const c = es.agents.agenda.cancel;
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"cancel" | "reject" | null>(openReject ? "reject" : openCancel ? "cancel" : null);
  const [reason, setReason] = useState<"customer" | "error" | "other">("customer");
  const [now, setNow] = useState(() => Date.now());
  const gate = useDeviceGate();

  // «No vino» se activa solo al llegar la hora, sin recargar.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const started = now >= startsAtMs;

  function after(result: ActionFeedback, leave = false) {
    if (!result.ok) {
      setError(result.message);
      return;
    }
    announceLocalChange(establishmentId, { kind: "date", date, reason: "changed" });
    setDialog(null);
    if (leave) router.push(todayHref(establishmentId, date));
    router.refresh();
  }

  function command(name: "confirm" | "reject" | "no_show" | "undo_no_show" | "platform_cancel_done", leave = false) {
    setError(null);
    const f = es.agents.device.pin.for;
    const forWhat = { confirm: f.confirm, reject: f.reject, no_show: f.noShow, undo_no_show: f.undoNoShow, platform_cancel_done: f.platformDone }[name];
    startTransition(async () => {
      // En la tablet del local pide «¿Quién eres?» + PIN; en una cuenta, se ejecuta tal cual.
      const result = await gate.run(forWhat, (pin) => reservationCommandAction({ pin, establishmentId, reservationId, command: name, date }));
      if (result !== null) after(result, leave);
    });
  }

  if (!canChange) return null;
  const active = status === "pending" || status === "confirmed";

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {status === "cancelled" && pendingPlatformCancel ? (
        <div role="status" className="rounded-xl border border-pending-border bg-pending-row px-4 py-3 text-sm">
          <p className="font-semibold text-pending-text">{t.platformCancel(platformName ?? es.agents.components.origins.platform)}</p>
          <p className="mb-3 text-text-secondary">{t.platformCancelHint}</p>
          <Button type="button" variant="secondary" className="min-h-[44px]" pending={busy} onClick={() => command("platform_cancel_done")}>
            {t.platformCancelDone}
          </Button>
        </div>
      ) : null}

      {partners.length > 0 && active ? (
        <div role="status" className="rounded-xl border border-pending-border bg-pending-row px-4 py-3 text-sm">
          <p className="font-semibold text-pending-text">{t.duplicateTitle}</p>
          {partners.map((p) => (
            <div key={p.id} className="mt-2 flex flex-wrap items-center gap-2">
              <a href={p.href} className="flex-1 text-text underline">
                {t.duplicateWith(p.time, p.name)}
              </a>
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px]"
                pending={busy}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await gate.run(es.agents.device.pin.for.dismiss, (pin) =>
                      dismissDuplicateAction({ pin, establishmentId, reservationA: reservationId, reservationB: p.id, date }),
                    );
                    if (result !== null) after(result);
                  });
                }}
              >
                {t.notDuplicate}
              </Button>
            </div>
          ))}
          <p className="mt-2 text-text-secondary">{t.cancelOne}</p>
        </div>
      ) : null}

      {status === "pending" ? (
        <div className="rounded-xl border border-pending-border bg-pending-row px-4 py-3 text-sm">
          <p className="font-semibold text-pending-text">{t.pendingGroup}</p>
          <p className="mb-3 text-text-secondary">{t.pendingGroupHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => setDialog("reject")}>
              {t.rejectGroup}
            </Button>
            <Button type="button" className="min-h-[44px]" pending={busy} onClick={() => command("confirm")}>
              {t.confirmGroup}
            </Button>
          </div>
        </div>
      ) : null}

      {status === "confirmed" ? (
        <Button type="button" variant="secondary" className="min-h-[48px] w-full" disabled={!started} pending={busy} onClick={() => command("no_show")}>
          {started ? t.noShow : t.noShowFrom(time)}
        </Button>
      ) : null}
      {status === "no_show" ? (
        <Button type="button" variant="secondary" className="min-h-[48px] w-full" pending={busy} onClick={() => command("undo_no_show")}>
          {t.undoNoShow}
        </Button>
      ) : null}
      {active ? (
        <Button type="button" variant="outline" className="min-h-[48px] w-full" onClick={() => setDialog("cancel")}>
          {t.cancelReservation}
        </Button>
      ) : null}

      <Modal open={dialog !== null} title={dialog === "reject" ? c.rejectTitle : c.title} onClose={() => setDialog(null)}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{customerLine}</p>
          {dialog === "cancel" ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                {c.reasonLabel} <span className="font-normal text-text-secondary">{es.agents.agenda.common.optional}</span>
              </legend>
              <div className="space-y-2">
                {(["customer", "error", "other"] as const).map((value) => (
                  <label key={value} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-field border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-soft-surface">
                    <input type="radio" name="cancel-reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
                    {c.reasons[value]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {dialog === "cancel" && platformName ? (
            <p className="rounded-xl border border-border bg-soft-surface px-3 py-2 text-sm">{c.platformNotice(platformName)}</p>
          ) : null}
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => setDialog(null)}>
              {c.keep}
            </Button>
            <Button
              type="button"
              variant="danger"
              className="min-h-[44px]"
              pending={busy}
              onClick={() => {
                setError(null);
                if (dialog === "reject") {
                  command("reject", true);
                  return;
                }
                startTransition(async () => {
                  const result = await gate.run(es.agents.device.pin.for.cancel, (pin) =>
                    cancelReservationAction({ pin, establishmentId, reservationId, reason, date }),
                  );
                  if (result !== null) after(result, true);
                });
              }}
            >
              {dialog === "reject" ? c.confirmReject : c.confirm}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
