import { Link } from "expo-router";
import { Text } from "react-native";
import { AuthForm } from "../src/components/AuthForm";
import { supabase } from "../src/lib/supabase";
import { es } from "../src/i18n/es";
import { colors } from "../src/lib/theme";

export default function LoginScreen() {
  return (
    <AuthForm
      title={es.auth.login.title}
      submitLabel={es.auth.login.submit}
      pendingLabel={es.auth.login.submitPending}
      onSubmit={async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return error ? es.auth.login.invalidCredentials : null;
      }}
      footer={
        <Text style={{ marginTop: 16 }}>
          {es.auth.login.noAccount}{" "}
          <Link href="/signup" style={{ color: colors.primary }}>
            {es.auth.login.signupLink}
          </Link>
        </Text>
      }
    />
  );
}
