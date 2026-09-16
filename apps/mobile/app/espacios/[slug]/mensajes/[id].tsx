import { useLocalSearchParams } from "expo-router";

import { Conversation } from "../../../../src/components/Conversation";
import { Loading, Screen } from "../../../../src/components/ui";
import { es } from "../../../../src/i18n/es";
import { useSpace } from "../../../../src/lib/space-context";

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { viewer } = useSpace();
  if (!viewer) return <Loading />;
  return (
    <Screen title={es.messages.title}>
      <Conversation conversationId={String(id)} spaceSlug={viewer.slug} userId={viewer.userId} timezone={viewer.timezone} />
    </Screen>
  );
}
