import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createOptions,
  hrefWithoutAnchor,
  mobileNav,
  type NavDestination,
  type ShellRole,
} from "@/components/shell/navigation";
import { es } from "@/i18n/es";

import { navigableHref } from "../lib/routes";

import { colors } from "../lib/theme";

/**
 * §20.3, reescrito el 19/09/2026 (decisión 47) · **una sola barra**, la
 * misma para todos los roles:
 *
 *     Inicio · Restaurantes · Crear (+) · Mensajes · Más
 *
 * Sale de `mobileNav()` de la web, la misma función que alimenta la barra
 * de móvil del navegador. No es una copia: un destino que entre o salga
 * cambia en las dos superficies a la vez (CA-21, RN-MOV-02).
 *
 * `mobileNav()` devuelve **cuatro** destinos, no cinco, porque **el Crear
 * central no es un destino**: es la acción de §20.5, cuyas opciones
 * dependen del rol. Aquí se pinta entre el segundo y el tercero, que es
 * donde lo pone el diseño, y abre la hoja de opciones de abajo.
 *
 * Que sea una acción y no un destino no es un matiz: si estuviera en la
 * lista con una ruta, el subrayado de "activo" podría posarse en él, y una
 * acción no está nunca activa.
 *
 * **No autoriza nada.** Decide qué se pinta; quién puede ejecutar cada
 * opción lo vuelve a comprobar el servidor (CLAUDE.md: ocultar un botón no
 * es un control de acceso).
 */
export function barDestinations(
  slug: string,
  role: ShellRole,
  establishmentId: string | null,
): readonly NavDestination[] {
  return mobileNav(slug, role, establishmentId);
}

export function createDestinations(
  slug: string,
  role: ShellRole,
  establishmentId: string | null,
): readonly NavDestination[] {
  return createOptions(slug, role, establishmentId);
}

function isActive(pathname: string, href: string, all: readonly NavDestination[]): boolean {
  const clean = hrefWithoutAnchor(pathname);
  const matches = all.filter((d) => {
    const limpio = navigableHref(d.href);
    return clean === limpio || clean.startsWith(`${limpio}/`);
  });
  if (matches.length === 0) return false;
  const best = matches.reduce((a, b) =>
    navigableHref(b.href).length > navigableHref(a.href).length ? b : a,
  );
  return best.href === href;
}

export function BottomBar({
  slug,
  role,
  establishmentId,
}: {
  slug: string;
  role: ShellRole;
  establishmentId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);

  const destinations = barDestinations(slug, role, establishmentId);
  const creates = createDestinations(slug, role, establishmentId);

  // El botón va en medio de los cuatro: dos a cada lado, como en el diseño.
  const mitad = Math.ceil(destinations.length / 2);
  const izquierda = destinations.slice(0, mitad);
  const derecha = destinations.slice(mitad);

  const ir = (href: string) => router.push(navigableHref(href) as never);

  const pestaña = (d: NavDestination) => (
    <Pressable
      key={d.key}
      onPress={() => ir(d.href)}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive(pathname, d.href, destinations) }}
      style={styles.item}
      testID={`nav-${d.key}`}
    >
      <Text
        style={[styles.label, isActive(pathname, d.href, destinations) && styles.labelActive]}
        numberOfLines={1}
      >
        {d.label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {izquierda.map(pestaña)}

      {/*
        El Crear central. Es un `<Pressable>` de verdad con su nombre
        accesible, no un adorno: se alcanza con el lector de pantalla y con
        el teclado externo, igual que las cuatro pestañas (CA-22).
      */}
      <Pressable
        onPress={() => setCreating(true)}
        accessibilityRole="button"
        accessibilityLabel={es.create.label}
        style={styles.item}
        testID="nav-create"
      >
        <View style={styles.fab}>
          <Text style={styles.fabSign}>+</Text>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {es.create.label}
        </Text>
      </Pressable>

      {derecha.map(pestaña)}

      <Modal
        visible={creating}
        transparent
        animationType="slide"
        onRequestClose={() => setCreating(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setCreating(false)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.sheetTitle}>{es.create.label}</Text>
            {creates.length === 0 ? (
              /*
                CLAUDE.md · si no hay nada, se dice el motivo. Un rol sin
                opciones de creación en este contexto no ve una hoja vacía.
              */
              <Text style={styles.sheetEmpty}>{es.create.empty}</Text>
            ) : (
              creates.map((o) => (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    setCreating(false);
                    ir(o.href);
                  }}
                  accessibilityRole="button"
                  style={styles.sheetItem}
                  testID={`create-${o.key}`}
                >
                  <Text style={styles.sheetItemText}>{o.label}</Text>
                </Pressable>
              ))
            )}
          </View>
        </Pressable>
      </Modal>
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
  item: { flex: 1, alignItems: "center", justifyContent: "flex-end", minHeight: 44, paddingHorizontal: 2 },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "500" },
  labelActive: { color: colors.cuotlyGreen, fontWeight: "700" },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cuotlyGreen,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    marginBottom: 2,
  },
  fabSign: { color: colors.surface, fontSize: 26, lineHeight: 30, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(11,47,42,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 8 },
  sheetEmpty: { fontSize: 14, color: colors.textSecondary, paddingVertical: 12 },
  sheetItem: { minHeight: 48, justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.border },
  sheetItemText: { fontSize: 15, color: colors.text, fontWeight: "500" },
});
