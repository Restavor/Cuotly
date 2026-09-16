import { useLocalSearchParams } from "expo-router";

import { Badge, Body, CacheNotice, Card, ErrorBox, Loading, Row, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { must } from "../../../../src/lib/api";
import { dayOf, whenAt } from "../../../../src/lib/format";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useLoader } from "../../../../src/lib/use-loader";

type Detail = {
  id: string;
  name: string;
  category: string;
  status: string;
  status_reason: string | null;
  period_start: string;
  period_end: string;
  sent_at: string | null;
  approved_at: string | null;
  delivery_channel: string | null;
  sections: { section_key: string; included: boolean; note: string | null }[];
};

async function loadReport(id: string): Promise<Detail> {
  const { data, error } = await supabase
    .from("reports")
    .select("id, name, category, status, status_reason, period_start, period_end, sent_at, approved_at, delivery_channel")
    .eq("id", id)
    .maybeSingle();
  const report = must(data, error);
  const { data: sections } = await supabase.from("report_sections").select("section_key, included, note, position").eq("report_id", id).order("position");
  return { ...report, sections: sections ?? [] };
}

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { viewer } = useSpace();
  const detail = useLoader(viewer?.userId ?? null, `report:${id}`, () => loadReport(String(id)), [id]);
  if (!viewer || detail.loading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorBox message={detail.error ?? web.states.errorDescription} onRetry={detail.reload} />;
  const r = detail.data;
  return (
    <Screen title={r.name} refreshing={detail.loading} onRefresh={detail.reload}>
      {detail.fromCache ? <CacheNotice fetchedAt={detail.fetchedAt} /> : null}
      <Card>
        <Badge tone={r.status === "sent" ? "success" : "neutral"}>{r.status}</Badge>
        <Row label={es.reports.title} value={es.reports.period(dayOf(r.period_start, viewer.timezone), dayOf(r.period_end, viewer.timezone))} />
        {r.sent_at ? <Row label={web.naming.entities.request} value={whenAt(r.sent_at, viewer.timezone)} /> : null}
        {r.status_reason ? <Body muted>{r.status_reason}</Body> : null}
      </Card>
      <Card>
        <Title>{es.reports.sections}</Title>
        {r.sections.filter((s) => s.included).map((s) => (
          <Body key={s.section_key}>
            · {s.section_key}
            {s.note ? ` — ${s.note}` : ""}
          </Body>
        ))}
        <Body muted>{es.reports.detailHint}</Body>
      </Card>
    </Screen>
  );
}
