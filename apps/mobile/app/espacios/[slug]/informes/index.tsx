import { useRouter } from "expo-router";

import { Badge, Body, CacheNotice, Card, Empty, ErrorBox, Loading, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { must } from "../../../../src/lib/api";
import { dayOf } from "../../../../src/lib/format";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useLoader } from "../../../../src/lib/use-loader";

export type ReportRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  period_start: string;
  period_end: string;
  establishment_id: string | null;
  sent_at: string | null;
  establishmentName: string;
};

export async function loadReports(spaceId: string | null, establishmentId: string | null): Promise<ReportRow[]> {
  let query = supabase
    .from("reports")
    .select("id, name, category, status, period_start, period_end, establishment_id, sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(60);
  if (spaceId) query = query.eq("space_id", spaceId);
  if (establishmentId) query = query.eq("establishment_id", establishmentId);
  const [{ data: rows, error }, { data: ests }] = await Promise.all([query, supabase.from("establishments").select("id, name")]);
  const names = new Map((ests ?? []).map((e) => [e.id, e.name]));
  return must(rows, error).map((r) => ({ ...r, establishmentName: r.establishment_id ? (names.get(r.establishment_id) ?? "") : "" }));
}

export function ReportList({ reports, slug, timezone }: { reports: readonly ReportRow[]; slug: string; timezone: string }) {
  const router = useRouter();
  return (
    <>
      {reports.map((r) => (
        <Card key={r.id} onPress={() => router.push(`/espacios/${slug}/informes/${r.id}` as never)} testID={`informe-${r.id}`}>
          <Title>{r.name}</Title>
          <Badge tone={r.status === "sent" ? "success" : "neutral"}>{r.status}</Badge>
          <Body muted>
            {r.establishmentName ? `${r.establishmentName} · ` : ""}
            {es.reports.period(dayOf(r.period_start, timezone), dayOf(r.period_end, timezone))}
          </Body>
        </Card>
      ))}
    </>
  );
}

/** §176 · "consultar informe": la lista, y el detalle enseña lo que el servidor devuelve. */
export default function ReportsScreen() {
  const { viewer } = useSpace();
  const list = useLoader(viewer?.userId ?? null, `reports:${viewer?.spaceId}`, () => loadReports(viewer?.spaceId ?? null, null), [viewer?.spaceId]);
  if (!viewer) return <Loading />;
  return (
    <Screen title={es.reports.title} refreshing={list.loading} onRefresh={list.reload}>
      {list.fromCache ? <CacheNotice fetchedAt={list.fetchedAt} /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.length === 0 ? <Empty>{es.reports.empty}</Empty> : null}
      {list.data ? <ReportList reports={list.data} slug={viewer.slug} timezone={viewer.timezone} /> : null}
      <Body muted>{web.states.emptyDescription}</Body>
    </Screen>
  );
}
