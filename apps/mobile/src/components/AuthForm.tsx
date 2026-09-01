import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { es } from "../i18n/es";
import { colors } from "../lib/theme";
import { validateCredentials } from "../lib/validate-auth-form";

type Props = {
  title: string;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (email: string, password: string) => Promise<string | null>;
  footer: React.ReactNode;
};

/**
 * Formulario de correo/contraseña compartido entre /login y /signup. No hay
 * Server Actions en React Native (eso es cosa de la web con Next.js); aquí
 * se llama directamente a Supabase desde el propio componente.
 */
export function AuthForm({
  title,
  submitLabel,
  pendingLabel,
  onSubmit,
  footer,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    const validationError = validateCredentials(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }
    setPending(true);
    setError(null);
    const result = await onSubmit(email, password);
    setPending(false);
    if (result) {
      setError(result);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <Text style={styles.label}>{es.auth.emailLabel}</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        testID="email-input"
      />

      <Text style={styles.label}>{es.auth.passwordLabel}</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        testID="password-input"
      />

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable
        style={[styles.button, pending && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={pending}
        testID="submit-button"
      >
        {pending ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.buttonText}>{submitLabel}</Text>
        )}
      </Pressable>

      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 8,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.primaryDark,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
    marginBottom: 8,
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
  },
  button: {
    backgroundColor: colors.cuotlyGreen,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "600",
  },
});
