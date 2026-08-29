import { Link } from "expo-router";
import { Text } from "react-native";
import { AuthForm } from "../src/components/AuthForm";
import { supabase } from "../src/lib/supabase";
import { colors } from "../src/lib/theme";

export default function LoginScreen() {
  return (
    <AuthForm
      title="Entrar en Cuotly"
      submitLabel="Entrar"
      pendingLabel="Entrando…"
      onSubmit={async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return error ? "Correo o contraseña incorrectos." : null;
      }}
      footer={
        <Text style={{ marginTop: 16 }}>
          ¿No tienes cuenta?{" "}
          <Link href="/signup" style={{ color: colors.primary }}>
            Regístrate
          </Link>
        </Text>
      }
    />
  );
}
