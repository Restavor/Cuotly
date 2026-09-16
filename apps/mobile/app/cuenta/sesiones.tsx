import { Redirect } from "expo-router";

import { Badge, Body, Button, CacheNotice, Card, Empty, ErrorBox, Loading, Notice, Screen, Title } from "../../src/components/ui";
import { es } from "../../src/i18n/es";
import { fromError, must } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth-context";
import { supabase } from "../../src/lib/supabase";
import { useAction } from "../../src/lib/use-action";
import { useLoader } from "../../src/lib/use-loader";

type SessionRow = { id: string; created_at: string; refreshed_at: string; ip: string | null; user_agent: string | null; is_current: boolean };

async function loadSessions(): Promise<SessionRow[]> {
  const { data, error } = await supabase.rpc("my_active_sessions");
  return must(data, error);
}

/** HU-05 · "Mis sesiones", el destino de cuenta que "Más" enseña en móvil. */
export default function SessionsScreen() {
  const { session, loading } = useAuth();
  const list = useLoader(session?.user.id ?? null, "sessions", loadSessions, []);
  const revoke = useAction("set_preference");
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;

  return (
    <Screen title={es.settings.sessions} refreshing={list.loading} onRefresh={list.reload}>
      {list.fromCache ? <CacheNotice fetchedAt={list.fetchedAt} /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {revoke.error ? <Notice tone="danger">{revoke.error}</Notice> : null}
      {list.data && list.data.length === 0 ? <Empty>{es.messages.empty}</Empty> : null}
      {(list.data ?? []).map((s) => (
        <Card key={s.id}>
          <Title>{s.user_agent ?? s.id}</Title>
          {s.is_current ? <Badge tone="success">{es.settings.currentSession}</Badge> : null}
          <Body muted>{new Date(s.refreshed_at).toLocaleString("es-ES")}</Body>
          {!s.is_current ? (
            <Button
              label={es.settings.revokeSession}
              kind="danger"
              pending={revoke.pending}
              disabled={!revoke.enabled}
              disabledReason={revoke.disabledReason}
              onPress={() => void revoke.run(async () => fromError((await supabase.rpc("revoke_my_session", { p_session_id: s.id })).error), list.reload)}
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
