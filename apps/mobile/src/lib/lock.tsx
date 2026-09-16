import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

import { useAuth } from "./auth-context";

/**
 * RN-MOV-08 · la biometría es un **cerrojo local**, después de iniciar
 * sesión. Opcional: se ofrece tras entrar y se activa desde Ajustes. Si
 * está activado, la app pide el desbloqueo al volver a primer plano.
 *
 * No autentica contra el servidor, no sustituye a la contraseña y no es
 * la verificación en dos pasos (RN-ADM-02): el sombrero de plataforma
 * sigue exigiendo la sesión verificada, y el panel de Cuotly y Modo
 * soporte no están en la app. Sin biometría en el teléfono, o si se
 * rechaza, la app sigue funcionando sin cerrojo.
 */
type LockContextValue = {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly setEnabled: (value: boolean) => Promise<boolean>;
  readonly unlock: () => Promise<boolean>;
};

const LockContext = createContext<LockContextValue>({
  available: false,
  enabled: false,
  locked: false,
  setEnabled: async () => false,
  unlock: async () => true,
});

const ENABLED_KEY = "cuotly:lock:enabled";

async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export function LockProvider({ children, promptMessage }: { children: React.ReactNode; promptMessage: string }) {
  const { session } = useAuth();
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const wentBackgroundAt = useRef<number | null>(null);

  useEffect(() => {
    void (async () => {
      setAvailable(await biometricsAvailable());
      setEnabledState((await AsyncStorage.getItem(ENABLED_KEY)) === "1");
    })();
  }, []);

  // Al volver a primer plano con el cerrojo puesto: bloquear.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        wentBackgroundAt.current = Date.now();
      } else if (next === "active" && enabled && session && wentBackgroundAt.current !== null) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled, session]);

  const unlock = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: "Cancelar" });
      if (result.success) {
        setLocked(false);
        wentBackgroundAt.current = null;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [promptMessage]);

  const setEnabled = useCallback(
    async (value: boolean) => {
      if (value && !(await biometricsAvailable())) return false;
      // Activar exige demostrar que la biometría funciona ahora mismo:
      // así nadie se queda fuera de su propia app.
      if (value) {
        const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: "Cancelar" });
        if (!result.success) return false;
      }
      await AsyncStorage.setItem(ENABLED_KEY, value ? "1" : "0");
      setEnabledState(value);
      if (!value) setLocked(false);
      return true;
    },
    [promptMessage],
  );

  return <LockContext.Provider value={{ available, enabled, locked: locked && enabled, setEnabled, unlock }}>{children}</LockContext.Provider>;
}

export function useLock(): LockContextValue {
  return useContext(LockContext);
}
