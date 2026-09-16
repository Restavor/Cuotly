import { useRouter } from "expo-router";

import { menuTone, type MenuState } from "@/core/menu-states";

import { Badge, Body, CacheNotice, Card, Empty, ErrorBox, Loading, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { must } from "../../../../src/lib/api";
import { dayOf, whenAt } from "../../../../src/lib/format";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useLoader } from "../../../../src/lib/use-loader";

type QueueRow = {
  menu_id: string;
  name: string;
  state: string;
  target_date: string;
  establishment_id: string;
  establishment_name: string;
  is_assigned: boolean;
  guaranteed: boolean;
  publish_by_at: string | null;
};

async function loadQueue(spaceId: string): Promise<QueueRow[]> {
  const { data, error } = await supabase.rpc("team_menu_queue", { p_space_id: spaceId });
  return must(data, error);
}

/**
 * La cola de Menú Diario del equipo (RN-MEN-06): asignar, pedir información
 * y marcar publicado se hacen desde la web; aquí se ve qué hay pendiente y
 * cada fila abre la ficha del menú en el restaurante.
 */
export default function TeamMenuQueueScreen() {
  const { viewer } = useSpace();
  const router = useRouter();
  const list = useLoader(viewer?.userId ?? null, `menu-queue:${viewer?.spaceId}`, () => loadQueue(viewer?.spaceId as string), [viewer?.spaceId]);
  if (!viewer) return <Loading />;
  return (
    <Screen title={es.menu.teamQueue} refreshing={list.loading} onRefresh={list.reload}>
      {list.fromCache ? <CacheNotice fetchedAt={list.fetchedAt} /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.length === 0 ? <Empty>{es.menu.teamEmpty}</Empty> : null}
      {(list.data ?? []).map((m) => (
        <Card key={m.menu_id} onPress={() => router.push(`/espacios/${viewer.slug}/restaurantes/${m.establishment_id}/menu-diario/${m.menu_id}` as never)}>
          <Title>
            {m.establishment_name} · {m.name}
          </Title>
          <Badge tone={menuTone(m.state as MenuState)}>{web.naming.states.menu[m.state as keyof typeof web.naming.states.menu] ?? m.state}</Badge>
          <Body muted>
            {dayOf(m.target_date, viewer.timezone)}
            {m.publish_by_at ? ` · ${whenAt(m.publish_by_at, viewer.timezone)}` : ""}
          </Body>
        </Card>
      ))}
    </Screen>
  );
}
