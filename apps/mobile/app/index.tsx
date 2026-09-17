import { Redirect, useRouter } from "expo-router";

import { myContexts } from "@/services/global-gateway";

import { es, web } from "../src/i18n/es";
import { useAuth } from "../src/lib/auth-context";
import { supabase } from "../src/lib/supabase";
import { useLoader } from "../src/lib/use-loader";
import { Body, Button, CacheNotice, Card, Empty, ErrorBox, Loading, Screen, Title } from "../src/components/ui";

type Contexts = {
  spaces: readonly { id: string; name: string; slug: string; role: string }[];
  establishments: readonly { id: string; name: string; slug: string }[];
};

/**
 * §20.1 · el selector de contexto: los espacios donde esta persona es del
 * equipo y los restaurantes a los que tiene acceso. Con uno solo se entra
 * directamente. El rol sale de la membresía real (RN-MOV-02).
 *
 * Sale de `my_contexts()` (RN-GLO-03, migración 98), la **misma** función
 * que usa la web, por el mismo módulo de servicio. Antes esta pantalla lo
 * armaba a mano: leía `space_memberships`, leía `establishments`, se
 * quedaba con los que no fueran de sus espacios y pedía `space_slug()`
 * **uno por uno** —una llamada por restaurante— para poder construir el
 * enlace. Eso es la regla de "de quién es cada contexto" escrita por
 * segunda vez, y la segunda copia se separa de la primera: la condición de
 * verdad es `is_establishment_client()`, no "no está en mis espacios", y
 * las dos dejan de coincidir en cuanto alguien del equipo es además
 * cliente de otro espacio.
 */
async function loadContexts(): Promise<Contexts> {
  const filas = await myContexts(supabase);
  return {
    spaces: filas
      .filter((f) => f.kind === "space")
      .map((f) => ({ id: f.space_id, name: f.space_name, slug: f.space_slug, role: f.role })),
    establishments: filas
      .filter((f) => f.kind === "establishment")
      .map((f) => ({ id: f.establishment_id, name: f.establishment_name, slug: f.space_slug })),
  };
}

export default function HomeScreen() {
  const { session, loading, signOut } = useAuth();
  const router = useRouter();
  const userId = session?.user.id ?? null;
  const contexts = useLoader(userId, "contexts", loadContexts, []);

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
