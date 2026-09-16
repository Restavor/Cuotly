import { Badge, Body, Button, CacheNotice, Card, Empty, ErrorBox, Loading, Notice, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { fromError, must } from "../../../../src/lib/api";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useAction } from "../../../../src/lib/use-action";
import { useLoader } from "../../../../src/lib/use-loader";

type TaskRow = {
  id: string;
  title: string;
  state: string;
  weight: string;
  estimated_minutes: number | null;
  assignee_id: string | null;
  job_id: string | null;
  jobCode: string;
};

async function loadTasks(spaceId: string, userId: string, mineOnly: boolean): Promise<TaskRow[]> {
  let query = supabase
    .from("tasks")
    .select("id, title, state, weight, estimated_minutes, assignee_id, job_id, created_at")
    .eq("space_id", spaceId)
    .in("state", ["pending", "in_progress", "blocked"])
    .order("created_at", { ascending: false });
  if (mineOnly) query = query.eq("assignee_id", userId);
  const [{ data: rows, error }, { data: jobs }] = await Promise.all([query, supabase.from("jobs").select("id, code").eq("space_id", spaceId)]);
  const codes = new Map((jobs ?? []).map((j) => [j.id, j.code]));
  return must(rows, error).map((t) => ({ ...t, jobCode: t.job_id ? (codes.get(t.job_id) ?? "") : "" }));
}

/** §176 · "completar": la tarea se empieza y se marca hecha con `update_task_state`. */
export default function TasksScreen() {
  const { viewer } = useSpace();
  const mineOnly = viewer?.role === "worker";
  const list = useLoader(
    viewer?.userId ?? null,
    `tasks:${viewer?.spaceId}:${mineOnly}`,
    () => loadTasks(viewer?.spaceId as string, viewer?.userId as string, mineOnly),
    [viewer?.spaceId, mineOnly],
  );
  const complete = useAction("complete_task");
  if (!viewer) return <Loading />;

  return (
    <Screen title={es.tasks.title} refreshing={list.loading} onRefresh={list.reload}>
      {list.fromCache ? <CacheNotice fetchedAt={list.fetchedAt} /> : null}
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      {complete.error ? <Notice tone="danger">{complete.error}</Notice> : null}
      {list.data && list.data.length === 0 ? <Empty>{es.tasks.empty}</Empty> : null}
      {(list.data ?? []).map((t) => (
        <Card key={t.id} testID={`tarea-${t.id}`}>
          <Title>{t.title}</Title>
          <Badge tone={t.state === "in_progress" ? "info" : t.state === "blocked" ? "warning" : "neutral"}>
            {web.naming.states.task[t.state as keyof typeof web.naming.states.task] ?? t.state}
          </Badge>
          <Body muted>
            {t.jobCode}
            {t.estimated_minutes ? ` · ${es.tasks.minutes(t.estimated_minutes)}` : ""}
          </Body>
          {t.assignee_id === viewer.userId && t.state === "pending" ? (
            <Button
              label={es.tasks.startTask}
              kind="secondary"
              pending={complete.pending}
              disabled={!complete.enabled}
              disabledReason={complete.disabledReason}
              onPress={() => void complete.run(async () => fromError((await supabase.rpc("update_task_state", { p_task_id: t.id, p_state: "in_progress" })).error), list.reload)}
            />
          ) : null}
          {t.assignee_id === viewer.userId && t.state === "in_progress" ? (
            <Button
              label={es.tasks.complete}
              pending={complete.pending}
              disabled={!complete.enabled}
              disabledReason={complete.disabledReason}
              onPress={() => void complete.run(async () => fromError((await supabase.rpc("update_task_state", { p_task_id: t.id, p_state: "completed" })).error), list.reload)}
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
