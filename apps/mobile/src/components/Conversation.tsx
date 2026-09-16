import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Body, Button, CacheNotice, Card, ErrorBox, Field, Loading, Notice } from "./ui";
import { es, web } from "../i18n/es";
import { fromError, must } from "../lib/api";
import { useOnline } from "../lib/connectivity";
import { newMessageDraft, removeDraft, saveDraft } from "../lib/drafts";
import { whenAt } from "../lib/format";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import { useAction } from "../lib/use-action";
import { useLoader } from "../lib/use-loader";

type Message = {
  id: string;
  body: string;
  created_at: string;
  is_mine: boolean;
  sender_display: string;
  sender_role: string;
};

async function loadMessages(conversationId: string): Promise<{ messages: Message[]; readOnly: boolean }> {
  const [{ data, error }, { data: readOnly }] = await Promise.all([
    supabase.rpc("list_conversation_messages", { p_conversation_id: conversationId }),
    supabase.rpc("conversation_is_read_only", { p_conversation_id: conversationId }),
  ]);
  const messages = must(data, error);
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  return { messages, readOnly: readOnly === true };
}

/**
 * Una conversación, la misma para el equipo y para el restaurante: el
 * servidor decide qué se ve (`sender_display` nunca es el nombre de
 * alguien del equipo para un restaurante, RN-MSG) y aquí solo se pinta.
 *
 * RN-MOV-09/10 · el mensaje nace como borrador con su clave de
 * idempotencia. Con conexión se envía en el acto con esa clave; sin
 * conexión se guarda, y se enviará cuando la persona lo confirme.
 */
export function Conversation({ conversationId, spaceSlug, userId, timezone }: { conversationId: string; spaceSlug: string; userId: string; timezone: string }) {
  const online = useOnline();
  const thread = useLoader(userId, `conversation:${conversationId}`, () => loadMessages(conversationId), [conversationId]);
  const [text, setText] = useState("");
  const [savedAsDraft, setSavedAsDraft] = useState(false);
  const send = useAction("send_message");

  async function submit() {
    const body = text.trim();
    if (body.length === 0) return;
    const draft = newMessageDraft({ spaceSlug, conversationId, body });
    await saveDraft(userId, draft);
    if (!online) {
      setText("");
      setSavedAsDraft(true);
      return;
    }
    setSavedAsDraft(false);
    await send.run(
      async () => {
        const { error } = await supabase.rpc("post_message", { p_conversation_id: conversationId, p_body: body, p_idempotency_key: draft.idempotencyKey });
        if (!error) {
          await removeDraft(userId, draft.localId);
          setText("");
        }
        return fromError(error);
      },
      thread.reload,
      es.common.done,
    );
  }

  if (thread.loading && !thread.data) return <Loading />;
  if (thread.error || !thread.data) return <ErrorBox message={thread.error ?? web.states.errorDescription} onRetry={thread.reload} />;

  return (
    <View style={styles.wrap}>
      {thread.fromCache ? <CacheNotice fetchedAt={thread.fetchedAt} /> : null}
      {thread.data.messages.map((m) => (
        <View key={m.id} style={[styles.bubble, m.is_mine ? styles.mine : styles.theirs]}>
          <Text style={styles.sender}>{m.is_mine ? es.messages.you : m.sender_display}</Text>
          <Text style={styles.body}>{m.body}</Text>
          <Text style={styles.when}>{whenAt(m.created_at, timezone)}</Text>
        </View>
      ))}
      {thread.data.readOnly ? (
        <Body muted>{es.messages.readOnly}</Body>
      ) : (
        <Card>
          <Field label={es.messages.placeholder} value={text} onChangeText={setText} multiline />
          {savedAsDraft ? <Notice tone="warning">{es.offline.draftSaved}</Notice> : null}
          {send.error ? <Notice tone="danger">{send.error}</Notice> : null}
          <Button label={es.common.send} pending={send.pending} disabled={text.trim().length === 0} onPress={() => void submit()} />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  bubble: { borderRadius: 14, padding: 10, maxWidth: "88%", gap: 2 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.softSurface },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sender: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  body: { fontSize: 15, color: colors.text },
  when: { fontSize: 11, color: colors.textSecondary },
});
