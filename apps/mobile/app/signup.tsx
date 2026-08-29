import { Link } from "expo-router";
import { Text } from "react-native";
import { AuthForm } from "../src/components/AuthForm";
import { supabase } from "../src/lib/supabase";
import { colors } from "../src/lib/theme";

export default function SignUpScreen() {
  return (
    <AuthForm
      title="Crear cuenta en Cuotly"
      submitLabel="Crear cuenta"
      pendingLabel="Creando cuenta…"
      onSubmit={async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return error ? error.message : null;
      }}
      footer={
        <Text style={{ marginTop: 16 }}>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" style={{ color: colors.primary }}>
            Entra
          </Link>
        </Text>
      }
    />
  );
}
