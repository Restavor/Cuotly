import { Redirect, useRouter } from "expo-router";

import { isClientRole } from "@/components/shell/navigation";
import { ACTIVE_JOB_STATES } from "@/core/job-states";

import { Body, CacheNotice, Card, ErrorBox, Loading, Row, Screen, Title } from "../../../src/components/ui";
import { es, web } from "../../../src/i18n/es";
import { supabase } from "../../../src/lib/supabase";
import { useSpace } from "../../../src/lib/space-context";
import { useLoader } from "../../../src/lib/use-loader";

type Summary = {
  pendingRequests: number;
  openJobs: number;
  myJobs: number;
  myTasks: number;
  unread: number;
};

const PENDING_REQUEST_STATES = ["received", "analyzing", "pending_internal_validation", "needs_information"];

async function loadSummary(spaceId: string, userId: string): Promise<Summary> {
  const [requests, jobs, myJobs, tasks, conversations] = await Promise.all([
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("space_id", spaceId).in("state", PENDING_REQUEST_STATES),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("space_id", spaceId).in("state", [...ACTIVE_JOB_STATES]),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("space_id", spaceId).eq("assigned_to", userId).in("state", [...ACTIVE_JOB_STATES]),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("space_id", spaceId).eq("assignee_id", userId).in("state", ["pending", "in_progress"]),
    supabase.rpc("list_conversations", { p_space_id: spaceId }),
  ]);
  return {
    pendingRequests: requests.count ?? 0,
    openJobs: jobs.count ?? 0,
    myJobs: myJobs.count ?? 0,
    myTasks: tasks.count ?? 0,
    unread: (conversations.data ?? []).reduce((acc, c) => acc + (c.unread_count ?? 0), 0),
  };
}

/**
 * §20.4 · el Inicio del equipo, en cifras que salen del servidor. Un
 * restaurante no tiene Inicio de espacio: va al suyo (RN-MOV-02).
 */
export default function SpaceHome() {
  const { viewer, fromCache } = useSpace();
  const router = useRouter();
  const summary = useLoader(
    viewer?.userId ?? null,
    `home:${viewer?.slug}`,
    () => loadSummary(viewer?.spaceId as string, viewer?.userId as string),
    [viewer?.spaceId],
  );

  if (!viewer) return <Loading />;
  if (isClientRole(viewer.role)) {
    if (viewer.establishmentId) {
      return <Redirect href={`/espacios/${viewer.slug}/restaurantes/${viewer.establishmentId}` as never} />;
    }
    return (
      <Screen title={es.common.establishments}>
        {viewer.establishments.map((e) => (
          <Card key={e.id} onPress={() => router.push(`/espacios/${viewer.slug}/restaurantes/${e.id}` as never)}>
            <Title>{e.name}</Title>
          </Card>
        ))}
      </Screen>
    );
  }

  const base = `/espacios/${viewer.slug}`;
  return (
    <Screen title={viewer.spaceName} refreshing={summary.loading} onRefresh={summary.reload}>
      {fromCache || summary.fromCache ? <CacheNotice fetchedAt={summary.fetchedAt} /> : null}
      <Body muted>{web.roles[viewer.role]}</Body>
      {summary.error ? <ErrorBox message={summary.error} onRetry={summary.reload} /> : null}
      {summary.data ? (
        <>
          <Card onPress={() => router.push(`${base}/solicitudes` as never)}>
            <Row label={es.home.team.pendingRequests} value={summary.data.pendingRequests} />
          </Card>
          <Card onPress={() => router.push(`${base}/trabajos` as never)}>
            <Row label={es.home.team.openJobs} value={summary.data.openJobs} />
            <Row label={es.home.team.myJobs} value={summary.data.myJobs} />
          </Card>
          <Card onPress={() => router.push(`${base}/tareas` as never)}>
            <Row label={es.home.team.myTasks} value={summary.data.myTasks} />
          </Card>
          <Card onPress={() => router.push(`${base}/mensajes` as never)}>
            <Row label={es.home.team.unread} value={summary.data.unread} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
