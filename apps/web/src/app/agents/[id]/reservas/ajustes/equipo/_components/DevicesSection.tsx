"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card, Field, Modal } from "@/components/ui";
import { es } from "@/i18n/es";

import { activateDeviceAction } from "@/app/agents/device-actions";
import { revokeDeviceAction } from "../actions";

export interface DeviceRowView {
  readonly id: string;
  readonly name: string;
  /** «12 sept» */
  readonly since: string;
  /** «hoy 14:02», «ayer»…, o `null` si no se ha usado. */
  readonly lastUsed: string | null;
  /** Es el dispositivo desde el que se mira esta pantalla. */
  readonly isThis: boolean;
}

/**
 * Tablets y móviles del local (`AjustesEquipo`, EQU-02): los dispositivos activos, con «Desactivar», y «Usar este
 * dispositivo como tablet del local». Si pierdes o te roban una tablet, se desactiva aquí y deja de valer en ese
 * momento. Activar solo se puede desde una cuenta de Propietario o Encargado, y en su propio navegador.
 */
export function DevicesSection({
  establishmentId,
  devices,
  canActivate,
}: {
  establishmentId: string;
  devices: readonly DeviceRowView[];
  canActivate: boolean;
}) {
  const t = es.agents.team.devices;
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<DeviceRowView | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function deactivate(device: DeviceRowView) {
    setError(null);
    startTransition(async () => {
      const result = await revokeDeviceAction({ establishmentId, deviceId: device.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(result.message);
      setConfirm(null);
      // Si era este dispositivo, la cookie ya no está: se vuelve a la cuenta.
      if (device.isThis) router.replace("/agents");
      router.refresh();
    });
  }

  function activate() {
    setError(null);
    startTransition(async () => {
      const result = await activateDeviceAction({ establishmentId, name });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Navegación completa: a partir de ahora este navegador es la tablet, no tu cuenta.
      window.location.assign(result.href ?? "/agents");
    });
  }

  return (
    <Card title={t.title}>
      {notice ? (
        <p role="status" className="mb-3 rounded-field bg-success/10 px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {error && !confirm ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {devices.length === 0 ? (
        <p className="text-sm text-text-secondary">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {devices.map((device) => (
            <li key={device.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="device-row">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-text">
                  {device.name}
                  {device.isThis ? <span className="font-normal text-text-secondary"> · {t.thisOne}</span> : null}
                </span>
                <span className="block text-xs text-text-secondary">
                  {t.since(device.since)} · {device.lastUsed ? t.lastUsed(device.lastUsed) : t.never}
                </span>
              </span>
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => setConfirm(device)}>
                {t.deactivate}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {canActivate ? (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-text">{t.activateTitle}</h3>
          <p className="text-sm text-text-secondary">{t.activateBody}</p>
          <p className="text-sm text-text-secondary">{t.activateWarning}</p>
          <form
            noValidate
            className="max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              activate();
            }}
          >
            <Field
              label={t.deviceNameLabel}
              placeholder={t.deviceNamePlaceholder}
              value={name}
              maxLength={80}
              autoComplete="off"
              required
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" className="min-h-11" pending={busy}>
              {busy ? t.activating : t.activate}
            </Button>
          </form>
        </div>
      ) : null}

      <Modal open={confirm !== null} title={confirm?.name ?? t.deactivate} onClose={() => setConfirm(null)}>
        {confirm ? (
          <div className="space-y-4">
            <p className="text-sm">{t.confirmDeactivate(confirm.name)}</p>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => setConfirm(null)}>
                {es.agents.team.cancel}
              </Button>
              <Button type="button" variant="danger" className="min-h-11" pending={busy} onClick={() => deactivate(confirm)}>
                {t.deactivate}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}
