import { Link } from "expo-router";
import { Text } from "react-native";

import { classifySignInError, signInFailureMessage } from "@/core/auth-errors";

import { AuthForm } from "../src/components/AuthForm";
import { web } from "../src/i18n/es";
import { colors } from "../src/lib/theme";
import { supabase } from "../src/lib/supabase";

/**
 * RN-ACC-10 · una sola forma de entrar, correo y contraseña, y el enlace de
 * abajo lleva a **solicitar acceso**: desde la decisión 41 no hay registro
 * que ofrecer (§37).
 *
 * El motivo del fallo lo clasifica `src/core/auth-errors.ts` de la web, el
 * mismo módulo que usa el navegador. Esta pantalla contestaba "Correo o
 * contraseña incorrectos" a cualquier error —red incluida—, que es lo que
 * CA-20 prohíbe y lo que la web dejó de hacer: en un teléfono, donde la
 * cobertura se va sola, era el caso más frecuente y el peor, porque manda a
 * cambiar una contraseña que estaba bien.
 */
export default function LoginScreen() {
  const t = web.auth.login;
  return (
    <AuthForm
      title={t.title}
      submitLabel={t.submit}
      pendingLabel={t.submitPending}
      onSubmit={async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        const motivo = classifySignInError(error);
        return motivo === null ? null : signInFailureMessage(motivo);
      }}
      footer={
        <Text style={{ marginTop: 16 }}>
          {t.noAccount}{" "}
          <Link href="/signup" style={{ color: colors.primary }}>
            {t.signupLink}
          </Link>
        </Text>
      }
    />
  );
}
