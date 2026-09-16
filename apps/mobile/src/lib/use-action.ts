import { useCallback, useState } from "react";

import { es } from "../i18n/es";
import { isAlreadyDone, type ActionResult } from "./api";
import { useOnline } from "./connectivity";
import { gateAction, type AppAction } from "./offline-rules";

/**
 * Una acción de servidor desde una pantalla: estado de envío, resultado y
 * la puerta de sin conexión (RN-MOV-09). `run()` no hace nada si no hay
 * conexión y la acción la exige: el botón ya venía deshabilitado con su
 * motivo, y aquí no se encola nada.
 *
 * RN-MOV-10 · un "ya hecho" del servidor se enseña como hecho, no como
 * error de red que invite a insistir.
 */
export interface ActionState {
  readonly pending: boolean;
  readonly error: string | null;
  readonly notice: string | null;
  readonly enabled: boolean;
  readonly disabledReason: string | undefined;
  readonly run: (fn: () => Promise<ActionResult>, onDone?: () => void, doneNotice?: string) => Promise<void>;
  readonly reset: () => void;
}

export function useAction(action: AppAction): ActionState {
  const online = useOnline();
  const gate = gateAction(action, online);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<ActionResult>, onDone?: () => void, doneNotice?: string) => {
      if (!gate.enabled) {
        setError(es.offline.buttonReason);
        return;
      }
      setPending(true);
      setError(null);
      setNotice(null);
      try {
        const result = await fn();
        if (result.ok) {
          setNotice(doneNotice ?? es.common.done);
          onDone?.();
        } else if (isAlreadyDone(result.error)) {
          setNotice(es.common.alreadyDone);
          onDone?.();
        } else {
          setError(result.error);
        }
      } catch (fallo) {
        setError(fallo instanceof Error ? fallo.message : String(fallo));
      } finally {
        setPending(false);
      }
    },
    [gate.enabled],
  );

  const reset = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return {
    pending,
    error,
    notice,
    enabled: gate.enabled,
    disabledReason: gate.enabled ? undefined : es.offline.buttonReason,
    run,
    reset,
  };
}
