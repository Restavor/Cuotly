import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

import { useAuth } from "./auth-context";
import { supabase } from "./supabase";

/**
 * RN-MOV-05 y RN-MOV-06 · el push en el teléfono (§70).
 *
 *   · La explicación va ANTES del diálogo del sistema, porque ese diálogo
 *     solo se puede enseñar una vez: `askWithExplanation()` la abre, y
 *     solo si la persona acepta se pide el permiso de verdad.
 *   · Con permiso, el token de Expo se registra con `register_push_device`
 *     al entrar; al cerrar sesión se da de baja ANTES de cerrarla (el
 *     token es del teléfono, no de la persona: si entra otra, pasa a ella
 *     en el servidor).
 *   · Si se rechaza, banda persistente con cómo activarlo desde los
 *     ajustes del teléfono. La app funciona igual sin push; el correo es
 *     el respaldo. El sistema conserva el control final: si dice que no,
 *     aquí se dice que no.
 *   · Tocar un aviso abre su enlace profundo (RN-NOT-04): la ruta es la
 *     misma que en la web y el acceso lo verifica cada pantalla con el
 *     servidor, no la ruta.
 */
export type PushStatus = "unknown" | "granted" | "denied" | "unavailable";

type PushContextValue = {
  readonly status: PushStatus;
  /** El token registrado en el servidor para esta sesión, si lo hay. */
  readonly registeredToken: string | null;
  /** Por qué no hay token aunque haya permiso (sin proyecto de Expo, simulador…). */
  readonly reason: string | null;
  readonly explanationVisible: boolean;
  readonly askWithExplanation: () => void;
  readonly acceptExplanation: () => Promise<void>;
  readonly dismissExplanation: () => void;
  readonly refresh: () => Promise<void>;
};

const PushContext = createContext<PushContextValue>({
  status: "unknown",
  registeredToken: null,
  reason: null,
  explanationVisible: false,
  askWithExplanation: () => {},
  acceptExplanation: async () => {},
  dismissExplanation: () => {},
  refresh: async () => {},
});

const TOKEN_KEY = "cuotly:push:token";
const EXPLAINED_KEY = "cuotly:push:explained";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

/**
 * RN-MOV-05 · dar de baja el teléfono en el servidor. Se llama al cerrar
 * sesión, con la sesión todavía viva; por eso vive fuera del contexto.
 */
export async function unregisterThisDevice(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await supabase.rpc("unregister_push_device", { p_expo_push_token: token });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin red al cerrar sesión: el token queda en el servidor hasta que
    // otra persona entre en este teléfono (pasa a ella) o el proveedor lo
    // dé por inexistente. Nunca se finge que se dio de baja.
  }
}

export function PushProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<PushStatus>("unknown");
  const [registeredToken, setRegisteredToken] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [explanationVisible, setExplanationVisible] = useState(false);
  const registering = useRef(false);

  const registerIfGranted = useCallback(async () => {
    if (!session || registering.current) return;
    registering.current = true;
    try {
      if (!Device.isDevice) {
        setStatus("unavailable");
        setReason("simulator");
        return;
      }
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) {
        setStatus(permission.canAskAgain ? "unknown" : "denied");
        return;
      }
      setStatus("granted");
      const id = projectId();
      if (!id) {
        setReason("no_project");
        return;
      }
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
      const { error } = await supabase.rpc("register_push_device", {
        p_expo_push_token: data,
        p_platform: Platform.OS === "ios" ? "ios" : "android",
        p_device_name: Device.deviceName ?? Device.modelName ?? undefined,
        p_app_version: Constants.expoConfig?.version ?? undefined,
      });
      if (!error) {
        await AsyncStorage.setItem(TOKEN_KEY, data);
        setRegisteredToken(data);
        setReason(null);
      } else {
        setReason(error.message);
      }
    } catch (fallo) {
      setReason(fallo instanceof Error ? fallo.message : String(fallo));
    } finally {
      registering.current = false;
    }
  }, [session]);

  // Al entrar: si el permiso ya está concedido, registrar; si nunca se ha
  // explicado, explicar (una vez).
  useEffect(() => {
    void (async () => {
      if (!session) {
        setRegisteredToken(null);
        return;
      }
      await registerIfGranted();
      const explained = await AsyncStorage.getItem(EXPLAINED_KEY);
      const permission = await Notifications.getPermissionsAsync().catch(() => null);
      if (!explained && permission && !permission.granted && permission.canAskAgain && Device.isDevice) {
        setExplanationVisible(true);
      }
    })();
  }, [session, registerIfGranted]);

  // Tocar un aviso abre el elemento exacto (RN-NOT-04).
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as { deepLink?: unknown } | undefined;
      const deepLink = typeof data?.deepLink === "string" ? data.deepLink : null;
      if (deepLink && deepLink.startsWith("/espacios/")) router.push(deepLink as never);
    };
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);

  const askWithExplanation = useCallback(() => setExplanationVisible(true), []);

  const acceptExplanation = useCallback(async () => {
    setExplanationVisible(false);
    await AsyncStorage.setItem(EXPLAINED_KEY, "1");
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      setStatus("denied");
      return;
    }
    await registerIfGranted();
  }, [registerIfGranted]);

  const dismissExplanation = useCallback(() => {
    setExplanationVisible(false);
    void AsyncStorage.setItem(EXPLAINED_KEY, "1");
  }, []);

  return (
    <PushContext.Provider
      value={{
        status,
        registeredToken,
        reason,
        explanationVisible,
        askWithExplanation,
        acceptExplanation,
        dismissExplanation,
        refresh: registerIfGranted,
      }}
    >
      {children}
    </PushContext.Provider>
  );
}

export function usePush(): PushContextValue {
  return useContext(PushContext);
}
