import { Link, Redirect, useRouter } from "expo-router";
import { Text } from "react-native";

import { classifySignInError, signInFailureMessage } from "@/core/auth-errors";

import { AuthForm } from "../src/components/AuthForm";
import { useAuth } from "../src/lib/auth-context";
import { loginScreenDestination } from "../src/lib/routes";
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
 *
 * **Y al entrar, lleva dentro.** Esta pantalla solo enseñaba el error cuando
 * lo había; cuando todo iba bien no navegaba, y se quedaba el formulario
 * delante con la sesión ya abierta (23/09/2026). Ahora hay dos caminos: al
 * terminar bien se va a la portada, y quien llega aquí con sesión —un
 * enlace viejo, volver atrás— también (`loginScreenDestination`).
 */
export default function LoginScreen() {
  const t = web.auth.login;
  const { session, loading } = useAuth();
  const router = useRouter();

  const destino = loginScreenDestination(session !== null, loading);
  if (destino !== null) return <Redirect href={destino} />;

  return (
    <AuthForm
      title={t.title}
      submitLabel={t.submit}
      pendingLabel={t.submitPending}
      onSubmit={async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        const motivo = classifySignInError(error);
        if (motivo !== null) return signInFailureMessage(motivo);
        router.replace("/");
        return null;
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
