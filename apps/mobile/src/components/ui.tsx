import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { es, web } from "../i18n/es";
import { colors } from "../lib/theme";

/**
 * Las piezas de pantalla de la app, con los tokens de Emerald Control
 * (§146) de `theme.ts` y ningún color suelto. Son pocas a propósito: una
 * pantalla de Cuotly en el teléfono es una lista de tarjetas, un
 * formulario corto o un detalle con sus botones.
 */
export function Screen({
  title,
  children,
  refreshing = false,
  onRefresh,
  footer,
}: {
  title?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
}) {
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

export function Card({ children, onPress, testID }: { children: ReactNode; onPress?: () => void; testID?: string }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} testID={testID}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.cardTitle}>{children}</Text>;
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_COLORS: Record<Tone, string> = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
  neutral: colors.textSecondary,
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <View style={[styles.badge, { borderColor: TONE_COLORS[tone] }]}>
      <Text style={[styles.badgeText, { color: TONE_COLORS[tone] }]}>{children}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled = false,
  disabledReason,
  pending = false,
  kind = "primary",
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** RN-MOV-09 · un botón deshabilitado dice por qué. */
  disabledReason?: string;
  pending?: boolean;
  kind?: "primary" | "secondary" | "danger";
  testID?: string;
}) {
  const off = disabled || pending;
  return (
    <View style={styles.buttonWrap}>
      <Pressable
        onPress={onPress}
        disabled={off}
        accessibilityRole="button"
        accessibilityState={{ disabled: off }}
        testID={testID}
        style={[
          styles.button,
          kind === "secondary" && styles.buttonSecondary,
          kind === "danger" && styles.buttonDanger,
          off && styles.buttonDisabled,
        ]}
      >
        {pending ? (
          <ActivityIndicator color={kind === "secondary" ? colors.primary : colors.surface} />
        ) : (
          <Text style={[styles.buttonText, kind === "secondary" && styles.buttonTextSecondary]}>{label}</Text>
        )}
      </Pressable>
      {disabled && disabledReason ? <Text style={styles.disabledReason}>{disabledReason}</Text> : null}
    </View>
  );
}

/**
 * `help` es la frase de debajo que explica para qué se pide el campo;
 * `error` es lo que le pasa a ESTE campo, señalado donde está y no en un
 * cartel genérico arriba (A09 del diseño definitivo).
 */
export function Field({
  label,
  help,
  error,
  ...props
}: { label: string; help?: string; error?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMultiline, error ? styles.inputError : null]}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        {...props}
      />
      {help && !error ? <Text style={styles.fieldHelp}>{help}</Text> : null}
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: Tone }) {
  return (
    <View style={[styles.notice, { borderLeftColor: TONE_COLORS[tone] }]} accessibilityRole="alert">
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{web.states.emptyTitle}</Text>
      <Text style={styles.muted}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>{web.states.loading}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{web.states.errorTitle}</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? <Button label={web.common.retry} onPress={onRetry} kind="secondary" /> : null}
    </View>
  );
}

/** RN-MOV-09 · la banda de "sin conexión · datos de …". */
export function CacheNotice({ fetchedAt }: { fetchedAt: string | null }) {
  const when = fetchedAt ? new Date(fetchedAt).toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "";
  return (
    <Notice tone="warning">
      {es.offline.banner} {fetchedAt ? es.offline.fetchedAt(when) : ""}
    </Notice>
  );
}

/** RN-MOV-03 · lo que la app no trae dice dónde está. */
export function NotInApp({ what }: { what: string }) {
  return (
    <Card>
      <Title>{es.notInApp.title}</Title>
      <Body muted>{es.notInApp.body(what)}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 24, fontWeight: "700", color: colors.primaryDark, marginBottom: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
  cardPressed: { borderColor: colors.cuotlyGreen },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.primaryDark },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  muted: { color: colors.textSecondary, fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { color: colors.textSecondary, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right" },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  buttonWrap: { gap: 4 },
  button: { backgroundColor: colors.cuotlyGreen, borderRadius: 10, padding: 14, alignItems: "center", minHeight: 48, justifyContent: "center" },
  buttonSecondary: { backgroundColor: colors.softSurface },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "600" },
  buttonTextSecondary: { color: colors.primaryDark },
  disabledReason: { color: colors.textSecondary, fontSize: 13 },
  field: { gap: 4 },
  label: { fontSize: 14, color: colors.textSecondary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: colors.surface, color: colors.text, minHeight: 48 },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  inputError: { borderColor: colors.danger },
  fieldHelp: { fontSize: 13, color: colors.textSecondary },
  fieldError: { fontSize: 13, color: colors.danger },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface },
  choiceSelected: { borderColor: colors.cuotlyGreen, backgroundColor: colors.softSurface },
  choiceText: { color: colors.text, fontSize: 14 },
  choiceTextSelected: { color: colors.primaryDark, fontWeight: "600" },
  notice: { backgroundColor: colors.surface, borderLeftWidth: 4, borderRadius: 10, padding: 12 },
  noticeText: { color: colors.text, fontSize: 14 },
  empty: { padding: 24, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: colors.primaryDark },
});
