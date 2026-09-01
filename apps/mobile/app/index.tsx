import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../src/lib/auth-context";
import { supabase } from "../src/lib/supabase";
import { es } from "../src/i18n/es";
import { colors } from "../src/lib/theme";

export default function HomeScreen() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{es.home.title}</Text>
      <Text style={styles.text}>{es.home.signedInAs(session.user.email ?? "")}</Text>
      <Text style={styles.text}>{es.home.noFeaturesYet}</Text>
      <Text style={styles.link} onPress={() => supabase.auth.signOut()}>
        {es.home.signOut}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    paddingTop: 64,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  text: {
    fontSize: 16,
    color: colors.text,
  },
  link: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600",
    marginTop: 12,
  },
});
