import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LockOverlay, OfflineBanner, PushDeniedBanner, PushExplanation } from "../src/components/Banners";
import { es } from "../src/i18n/es";
import { AuthProvider } from "../src/lib/auth-context";
import { ConnectivityProvider } from "../src/lib/connectivity";
import { LockProvider } from "../src/lib/lock";
import { PushProvider } from "../src/lib/push";

/**
 * El armazón de la app. De fuera adentro: la sesión, la conexión
 * (RN-MOV-09), el push (RN-MOV-05/06) y el cerrojo biométrico (RN-MOV-08).
 * Las rutas de `app/` son las mismas que las de la web (RN-MOV-01), así
 * que un enlace profundo de un aviso abre aquí el mismo elemento.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ConnectivityProvider>
          <PushProvider>
            <LockProvider promptMessage={es.lock.prompt}>
              <StatusBar style="dark" />
              <OfflineBanner />
              <PushDeniedBanner />
              <Stack screenOptions={{ headerShown: false }} />
              <PushExplanation />
              <LockOverlay />
            </LockProvider>
          </PushProvider>
        </ConnectivityProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
