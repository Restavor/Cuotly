import { Redirect, useRouter } from "expo-router";

import { es, web } from "../src/i18n/es";
import { must } from "../src/lib/api";
import { useAuth } from "../src/lib/auth-context";
import { supabase } from "../src/lib/supabase";
import { useLoader } from "../src/lib/use-loader";
import { Body, Button, CacheNotice, Card, Empty, ErrorBox, Loading, Screen, Title } from "../src/components/ui";

type Contexts = {
  spaces: readonly { id: string; name: string; slug: string; role: string }[];
  establishments: readonly { id: string; name: string; slug: string; spaceName: string }[];
};

/**
 * §20.1 · el selector de contexto: los espacios donde esta persona es del
 * equipo y los restaurantes a los que tiene acceso. Con uno solo se entra
 * directamente. El rol sale de la membresía real (RN-MOV-02).
 */
async function loadContexts(userId: string): Promise<Contexts> {
  const { data: rows, error } = await supabase
    .from("space_memberships")
    .select("role, spaces (id, name, slug)")
    .eq("user_id", userId)
    .eq("status", "active");
  const memberships = must(rows, error);
  const spaces = memberships
    .map((m) => {
      const s = m.spaces as unknown as { id: string; name: string; slug: string } | null;
      return s ? { id: s.id, name: s.name, slug: s.slug, role: m.role } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const spaceIds = new Set(spaces.map((s) => s.id));
  const { data: ests } = await supabase.from("establishments").select("id, name, space_id");
  const clientEsts = (ests ?? []).filter((e) => !spaceIds.has(e.space_id));
  const establishments: { id: string; name: string; slug: string; spaceName: string }[] = [];
  for (const e of clientEsts) {
    const { data: slug } = await supabase.rpc("space_slug", { p_space_id: e.space_id });
    if (slug) establishments.push({ id: e.id, name: e.name, slug, spaceName: "" });
  }
  return { spaces, establishments };
}

export default function HomeScreen() {
  const { session, loading, signOut } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;
  const contexts = useLoader(userId, "contexts", () => loadContexts(userId as string), []);

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (contexts.loading) return <Loading />;
  if (contexts.error || !contexts.data) {
    return (
      <Screen title={web.common.appName}>
        <ErrorBox message={contexts.error ?? web.states.errorDescription} onRetry={contexts.reload} />
        <Button label={es.common.signOut} onPress={() => void signOut()} kind="secondary" />
      </Screen>
    );
  }

  const { spaces, establishments } = contexts.data;
  const total = spaces.length + establishments.length;
  if (total === 1 && !contexts.fromCache) {
    const only = spaces[0];
    const dest = only ? `/espacios/${only.slug}` : `/espacios/${establishments[0].slug}/restaurantes/${establishments[0].id}`;
    return <Redirect href={dest as never} />;
  }

  return (
    <Screen title={es.common.chooseContext} refreshing={contexts.loading} onRefresh={contexts.reload}>
      {contexts.fromCache ? <CacheNotice fetchedAt={contexts.fetchedAt} /> : null}
      <Body muted>{es.common.signedInAs(session.user.email ?? "")}</Body>
      {total === 0 ? <Empty>{es.common.noSpaces}</Empty> : null}
      {spaces.length > 0 ? <Title>{es.common.spaces}</Title> : null}
      {spaces.map((s) => (
        <Card key={s.id} onPress={() => router.push(`/espacios/${s.slug}` as never)} testID={`espacio-${s.slug}`}>
          <Title>{s.name}</Title>
          <Body muted>{web.roles[s.role as keyof typeof web.roles] ?? s.role}</Body>
        </Card>
      ))}
      {establishments.length > 0 ? <Title>{es.common.establishments}</Title> : null}
      {establishments.map((e) => (
        <Card key={e.id} onPress={() => router.push(`/espacios/${e.slug}/restaurantes/${e.id}` as never)}>
          <Title>{e.name}</Title>
          <Body muted>{web.roles.client}</Body>
        </Card>
      ))}
      <Button label={es.common.signOut} onPress={() => void signOut()} kind="secondary" />
    </Screen>
  );
}
