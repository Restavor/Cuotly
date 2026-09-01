import { Link } from "expo-router";
import { Text } from "react-native";
import { AuthForm } from "../src/components/AuthForm";
import { supabase } from "../src/lib/supabase";
import { es } from "../src/i18n/es";
import { colors } from "../src/lib/theme";

export default function SignUpScreen() {
  return (
    <AuthForm
      title={es.auth.signup.title}
      submitLabel={es.auth.signup.submit}
      pendingLabel={es.auth.signup.submitPending}
      onSubmit={async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return error ? error.message : null;
      }}
      footer={
        <Text style={{ marginTop: 16 }}>
          {es.auth.signup.hasAccount}{" "}
          <Link href="/login" style={{ color: colors.primary }}>
            {es.auth.signup.loginLink}
          </Link>
        </Text>
      }
    />
  );
}
