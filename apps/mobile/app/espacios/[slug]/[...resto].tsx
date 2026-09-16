import { usePathname } from "expo-router";

import { activeDestination } from "@/components/shell/navigation";

import { NotInApp, Screen } from "../../../src/components/ui";
import { web } from "../../../src/i18n/es";
import { useSpace } from "../../../src/lib/space-context";

/**
 * RN-MOV-03 · lo que la app no trae se enseña como pantalla que dice
 * dónde está, nunca como pantalla vacía: calendario, restaurantes, planes,
 * ayuda, el agente y los ajustes que no son del teléfono viven en la web.
 */
export default function NotInAppScreen() {
  const pathname = usePathname();
  const { viewer } = useSpace();
  const destination = viewer ? activeDestination(viewer.slug, pathname) : null;
  return (
    <Screen title={destination?.label ?? web.common.appName}>
      <NotInApp what={destination?.label ?? pathname} />
    </Screen>
  );
}
