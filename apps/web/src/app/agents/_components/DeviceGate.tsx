"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PinPad } from "@/components/agents/PinPad";
import { Modal } from "@/components/ui/Modal";
import { normalizePin, PIN_LENGTH, type DeviceAuthFailure } from "@/core/reservations/device";
import { es } from "@/i18n/es";

/**
 * «¿Quién eres?» (`PinTablet`, PRD de agents §3.3): en la tablet del local, **cada acción que cambia algo**
 * pide el PIN de quien la hace, y esa acción se ejecuta con los permisos de esa persona solo esa vez.
 *
 * Esto es solo la parte visible. No sabe qué PIN es el bueno ni cuántos fallos lleva el dispositivo: eso lo
 * decide el servidor (`reservation_device_act`). Si el servidor lo deniega, la acción vuelve con
 * `device` (`wrong_pin`, `locked`…) y el teclado se vuelve a abrir con el motivo. Fuera de una tablet no
 * hace nada: la acción se ejecuta tal cual.
 */

/** Lo único que el teclado necesita saber de un resultado: si lo denegó la tablet y qué decir. */
function denialOf(result: unknown): { failure: DeviceAuthFailure; message: string } | null {
  if (typeof result !== "object" || result === null) return null;
  const { device, message } = result as { device?: DeviceAuthFailure; message?: unknown };
  if (!device || typeof message !== "string") return null;
  return { failure: device, message };
}

interface Gate {
  readonly isDevice: boolean;
  /**
   * Pide el PIN (en una tablet) y ejecuta `action` con él. Devuelve su resultado, o `null` si quien estaba
   * delante cerró el teclado sin poner nada. Si el servidor deniega el PIN, vuelve a pedirlo.
   */
  readonly run: <T>(
    forWhat: string,
    action: (pin: string | undefined) => Promise<T>,
    /** Un PIN que ya se tecleó para esta misma acción (por ejemplo, «Guardar igualmente»): se prueba sin volver a pedirlo. */
    knownPin?: string,
  ) => Promise<T | null>;
}

const NO_DEVICE: Gate = { isDevice: false, run: (_forWhat, action) => action(undefined) };

const GateContext = createContext<Gate>(NO_DEVICE);

export function useDeviceGate(): Gate {
  return useContext(GateContext);
}

interface Pending {
  readonly forWhat: string;
  readonly error: string | null;
  readonly locked: boolean;
  readonly resolve: (pin: string | null) => void;
}

export function DeviceGateProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ask = useCallback(
    (forWhat: string, error: string | null, locked: boolean) =>
      new Promise<string | null>((resolve) => {
        // Fuera de la transición de quien llama: las pantallas lanzan `run` dentro de `startTransition(async …)` para
        // enseñar «Guardando…», y React no pinta lo que se programa dentro de una acción asíncrona hasta que termina.
        // Como la acción espera a este teclado, no terminaría nunca. Un `setTimeout` lo saca de ahí.
        window.setTimeout(() => {
          setValue("");
          setBusy(false);
          setPending({ forWhat, error, locked, resolve });
        }, 0);
      }),
    [],
  );

  const gate = useMemo<Gate>(
    () => ({
      isDevice: true,
      run: async (forWhat, action, knownPin) => {
        let error: string | null = null;
        let locked = false;
        let reuse = knownPin;
        for (;;) {
          const pin = reuse ?? (await ask(forWhat, error, locked));
          reuse = undefined;
          if (pin === null) return null;
          if (mounted.current) setBusy(true);
          const result = await action(pin);
          const denied = denialOf(result);
          if (denied === null || (denied.failure.code !== "wrong_pin" && denied.failure.code !== "locked")) {
            if (mounted.current) setPending(null);
            return result;
          }
          error = denied.message;
          locked = denied.failure.code === "locked";
        }
      },
    }),
    [ask],
  );

  function close() {
    pending?.resolve(null);
    setPending(null);
    setValue("");
    setBusy(false);
  }

  function submit() {
    if (!pending || busy || value.length !== PIN_LENGTH) return;
    pending.resolve(value);
    setBusy(true);
  }

  const t = es.agents.device.pin;
  return (
    <GateContext.Provider value={gate}>
      {children}
      <Modal open={pending !== null} title={t.title} onClose={close}>
        {pending ? (
          <div data-testid="pin-gate" className="space-y-5">
            <p className="text-sm text-text-secondary">{pending.forWhat}</p>
            <p className="text-center text-lg font-semibold text-primary-dark">{t.enter}</p>
            <PinPad
              value={value}
              onChange={(next) => setValue(normalizePin(next))}
              onSubmit={submit}
              disabled={busy || pending.locked}
            />
            <div aria-live="polite" className="min-h-6 text-center text-sm">
              {pending.error ? (
                <p role="alert" data-testid="pin-gate-error" className="font-medium text-danger">
                  {pending.error}
                </p>
              ) : busy ? (
                <p className="text-text-secondary">{t.checking}</p>
              ) : null}
            </div>
            <p className="text-center text-xs text-text-secondary">{t.lockNote}</p>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={close}
                className="min-h-11 rounded-field border border-border bg-surface px-5 text-sm font-semibold text-text hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                {pending.locked ? t.close : t.cancel}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </GateContext.Provider>
  );
}
