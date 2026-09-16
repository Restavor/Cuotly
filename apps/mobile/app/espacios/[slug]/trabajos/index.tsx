import { useRouter } from "expo-router";

import { FINISHED_JOB_STATES } from "@/core/job-states";

import { Badge, Body, CacheNotice, Card, Empty, ErrorBox, Loading, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { must } from "../../../../src/lib/api";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useLoader } from "../../../../src/lib/use-loader";

type JobRow = {
  id: string;
  code: string;
  state: string;
  category: string;
  assigned_to: string | null;
  establishment_id: string;
  establishmentName: string;
  assigneeName: string;
};

async function loadJobs(spaceId: string): Promise<JobRow[]> {
  const [{ data: rows, error }, { data: ests }, { data: people }] = await Promise.all([
    supabase.from("jobs").select("id, code, state, category, assigned_to, establishment_id, created_at").eq("space_id", spaceId).order("created_at", { ascending: false }).limit(100),
    supabase.from("establishments").select("id, name").eq("space_id", spaceId),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const names = new Map((ests ?? []).map((e) => [e.id, e.name]));
  const persons = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? ""]));
  return must(rows, error).map((j) => ({
    ...j,
    establishmentName: names.get(j.establishment_id) ?? "",
    assigneeName: j.assigned_to ? (persons.get(j.assigned_to) ?? "") : "",
  }));
}

function toneOf(state: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (state === "published" || state === "completed") return "success";
  if (state === "in_progress" || state === "assigned") return "info";
  if (state.startsWith("blocked") || state === "authorized_pause") return "warning";
  if (state.startsWith("cancelled")) return "danger";
  return "neutral";
}

/** §176 · asignar, comenzar, bloquear y publicar salen de aquí. */
export default function JobsScreen() {
  const { viewer } = useSpace();
  const router = useRouter();
  const list = useLoader(viewer?.userId ?? null, `jobs:${viewer?.spaceId}`, () => loadJobs(viewer?.spaceId as string), [viewer?.spaceId]);
  if (!viewer) return <Loading />;

  const jobs = list.data ?? [];
  const mine = viewer.role === "worker" ? jobs.filter((j) => j.assigned_to === viewer.userId) : jobs;
  const open = mine.filter((j) => !(FINISHED_JOB_STATES as readonly string[]).includes(j.state));
  const finished = mine.filter((j) => (FINISHED_JOB_STATES as readonly string[]).includes(j.state));

  const item = (j: JobRow) => (
    <Card key={j.id} onPress={() => router.push(`/espacios/${viewer.slug}/trabajos/${j.id}` as never)} testID={`trabajo-${j.code}`}>
      <Title>
        {j.code} · {j.establishmentName}
      </Title>
      <Badge tone={toneOf(j.state)}>{web.naming.states.job[j.state as keyof typeof web.naming.states.job] ?? j.state}</Badge>
      <Body muted>
        {web.naming.categories[j.category as keyof typeof web.naming.categories] ?? j.category}
        {j.assigneeName ? ` · ${j.assigneeName}` : ""}
      </Body>
    </Card>
  );

  return (
    <Screen title={viewer.role === "worker" ? es.jobs.mine : es.jobs.title} refreshing={list.loading} onRefresh={list.reload}>
      {list.fromCache ? <CacheNotice fetchedAt={list.fetchedAt} /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {list.data && mine.length === 0 ? <Empty>{es.jobs.empty}</Empty> : null}
      {open.map(item)}
      {finished.length > 0 ? <Body muted>{web.naming.states.job.completed}</Body> : null}
      {finished.map(item)}
    </Screen>
  );
}
