import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { BottomBar } from "../../../src/components/BottomBar";
import { Empty, Loading, Screen } from "../../../src/components/ui";
import { es } from "../../../src/i18n/es";
import { useAuth } from "../../../src/lib/auth-context";
import { SpaceProvider, useSpace } from "../../../src/lib/space-context";

/**
 * Todo lo que cuelga de `/espacios/[slug]` comparte quién mira y la barra
 * de cinco destinos y "Más" (RN-MOV-02). La ruta no autoriza nada: cada
 * pantalla pregunta al servidor con la sesión y enseña lo que le devuelve.
 */
function SpaceShell() {
  const { viewer, loading, error } = useSpace();
  if (loading) return <Loading />;
  if (!viewer || error) {
    return (
      <Screen>
        <Empty>{es.common.notFound}</Empty>
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <BottomBar slug={viewer.slug} role={viewer.role} establishmentId={viewer.establishmentId} />
    </View>
  );
}

export default function SpaceLayout() {
  const { session, loading } = useAuth();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  return (
    <SpaceProvider slug={String(slug)}>
      <SpaceShell />
    </SpaceProvider>
  );
}
