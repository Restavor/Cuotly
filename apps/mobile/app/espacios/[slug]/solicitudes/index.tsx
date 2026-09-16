import { useRouter } from "expo-router";

import { requestTone } from "@/core/requests";

import { Badge, Body, CacheNotice, Card, Empty, ErrorBox, Loading, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { must } from "../../../../src/lib/api";
import { whenAt } from "../../../../src/lib/format";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useLoader } from "../../../../src/lib/use-loader";

type RequestRow = {
  id: string;
  code: string;
  state: string;
  description: string;
  establishment_id: string;
  created_at: string;
  establishmentName: string;
};

async function loadRequests(spaceId: string): Promise<RequestRow[]> {
  const [{ data: rows, error }, { data: ests }] = await Promise.all([
    supabase
      .from("requests")
      .select("id, code, state, description, establishment_id, created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("establishments").select("id, name").eq("space_id", spaceId),
  ]);
  const names = new Map((ests ?? []).map((e) => [e.id, e.name]));
  return must(rows, error).map((r) => ({ ...r, establishmentName: names.get(r.establishment_id) ?? "" }));
}

/** §176 · "aceptar": la bandeja del equipo. Cada fila abre su detalle. */
export default function RequestsScreen() {
  const { viewer } = useSpace();
  const router = useRouter();
  const list = useLoader(viewer?.userId ?? null, `requests:${viewer?.spaceId}`, () => loadRequests(viewer?.spaceId as string), [viewer?.spaceId]);
  if (!viewer) return <Loading />;

  return (
    <Screen title={es.requests.title} refreshing={list.loading} onRefresh={list.reload}>
      {list.fromCache ? <CacheNotice fetchedAt={list.fetchedAt} /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.length === 0 ? <Empty>{es.requests.empty}</Empty> : null}
      {(list.data ?? []).map((r) => (
        <Card key={r.id} onPress={() => router.push(`/espacios/${viewer.slug}/solicitudes/${r.id}` as never)} testID={`solicitud-${r.code}`}>
          <Title>
            {r.code} · {r.establishmentName}
          </Title>
          <Badge tone={requestTone(r.state)}>{web.naming.states.request[r.state as keyof typeof web.naming.states.request] ?? r.state}</Badge>
          <Body>{r.description}</Body>
          <Body muted>{whenAt(r.created_at, viewer.timezone)}</Body>
        </Card>
      ))}
    </Screen>
  );
}
