import { useRouter } from "expo-router";

import { Badge, Body, CacheNotice, Card, Empty, ErrorBox, Loading, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { must } from "../../../../src/lib/api";
import { whenAt } from "../../../../src/lib/format";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useLoader } from "../../../../src/lib/use-loader";

type Conversation = {
  id: string;
  type: string;
  establishment_name: string;
  request_code: string | null;
  job_code: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  is_read_only: boolean;
};

async function loadConversations(spaceId: string): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc("list_conversations", { p_space_id: spaceId });
  return must(data, error);
}

/** §176 · la bandeja de conversaciones del equipo (`list_conversations`). */
export default function MessagesScreen() {
  const { viewer } = useSpace();
  const router = useRouter();
  const list = useLoader(viewer?.userId ?? null, `conversations:${viewer?.spaceId}`, () => loadConversations(viewer?.spaceId as string), [viewer?.spaceId]);
  if (!viewer) return <Loading />;

  return (
    <Screen title={es.messages.title} refreshing={list.loading} onRefresh={list.reload}>
      {list.fromCache ? <CacheNotice fetchedAt={list.fetchedAt} /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.length === 0 ? <Empty>{es.messages.empty}</Empty> : null}
      {(list.data ?? []).map((c) => (
        <Card key={c.id} onPress={() => router.push(`/espacios/${viewer.slug}/mensajes/${c.id}` as never)} testID={`conversacion-${c.id}`}>
          <Title>
            {c.establishment_name}
            {c.request_code ? ` · ${c.request_code}` : ""}
            {c.job_code ? ` · ${c.job_code}` : ""}
          </Title>
          {c.unread_count > 0 ? <Badge tone="info">{es.messages.unread(c.unread_count)}</Badge> : null}
          {c.last_message_preview ? <Body>{c.last_message_preview}</Body> : null}
          <Body muted>{c.last_message_at ? whenAt(c.last_message_at, viewer.timezone) : web.naming.entities.conversation}</Body>
        </Card>
      ))}
    </Screen>
  );
}
