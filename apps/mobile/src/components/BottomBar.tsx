import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileNav, type NavDestination, type ShellRole } from "@/components/shell/navigation";

import { colors } from "../lib/theme";

/**
 * RN-MOV-02 · la barra de §21: exactamente cinco destinos y "Más", y sale
 * de `mobileNav()` de la web, la misma función que alimenta la barra de
 * móvil del navegador. No es una copia: un destino que entre o salga de
 * la barra cambia en las dos superficies a la vez (CA-21).
 *
 * Las rutas son las de la web (RN-MOV-01), así que se navega con ellas.
 */
export function barDestinations(slug: string, role: ShellRole, establishmentId: string | null): readonly NavDestination[] {
  return mobileNav(slug, role, establishmentId);
}

function isActive(pathname: string, href: string, all: readonly NavDestination[]): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const matches = all.filter((d) => clean === d.href || clean.startsWith(`${d.href}/`));
  if (matches.length === 0) return false;
  const best = matches.reduce((a, b) => (b.href.length > a.href.length ? b : a));
  return best.href === href;
}

export function BottomBar({ slug, role, establishmentId }: { slug: string; role: ShellRole; establishmentId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const destinations = barDestinations(slug, role, establishmentId);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {destinations.map((d) => {
        const active = isActive(pathname, d.href, destinations);
        return (
          <Pressable
            key={d.key}
            onPress={() => router.push(d.href as never)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.item}
            testID={`nav-${d.key}`}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {d.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: 2 },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "500" },
  labelActive: { color: colors.cuotlyGreen, fontWeight: "700" },
});
