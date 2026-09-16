import { usePathname } from "expo-router";

import { NotInApp, Screen } from "../../../../../src/components/ui";
import { web } from "../../../../../src/i18n/es";

/**
 * RN-MOV-03 · lo del restaurante que no está en la app (datos, fuentes,
 * ayuda) dice dónde está. Los informes sí: `/informes` cuelga del espacio.
 */
export default function ClientNotInAppScreen() {
  const pathname = usePathname();
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  const label =
    last === "datos" ? web.nav.data : last === "fuentes" ? web.nav.sources : last === "ayuda" ? web.nav.help : last;
  return (
    <Screen title={label}>
      <NotInApp what={label} />
    </Screen>
  );
}
