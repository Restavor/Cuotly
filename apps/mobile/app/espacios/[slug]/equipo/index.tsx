import { useState } from "react";

import { Body, Button, CacheNotice, Card, Choice, ErrorBox, Loading, Notice, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { fromError, must } from "../../../../src/lib/api";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useAction } from "../../../../src/lib/use-action";
import { useLoader } from "../../../../src/lib/use-loader";

type Member = { user_id: string; role: string; name: string };
type Team = { members: Member[]; supervisors: Map<string, string>; canManage: boolean };

async function loadTeam(spaceId: string): Promise<Team> {
  const [{ data: rows, error }, { data: people }, { data: supervisions }, { data: canManage }] = await Promise.all([
    supabase.from("space_memberships").select("user_id, role, status").eq("space_id", spaceId).eq("status", "active"),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("supervisions").select("worker_id, admin_id, kind, revoked_at").eq("space_id", spaceId).eq("kind", "principal").is("revoked_at", null),
    supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "manage_space" }),
  ]);
  const persons = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? ""]));
  return {
    members: must(rows, error).map((m) => ({ user_id: m.user_id, role: m.role, name: persons.get(m.user_id) ?? "" })),
    supervisors: new Map((supervisions ?? []).map((s) => [s.worker_id, s.admin_id])),
    canManage: canManage === true,
  };
}

/**
 * §176 · "gestionar equipo": quién supervisa a quién. "Supervisor" no es
 * un rol, es una relación Administrador–Trabajador (CLAUDE.md), y la
 * fija `set_principal_supervisor`. Invitar se hace desde la web.
 */
export default function TeamScreen() {
  const { viewer } = useSpace();
  const team = useLoader(viewer?.userId ?? null, `team:${viewer?.spaceId}`, () => loadTeam(viewer?.spaceId as string), [viewer?.spaceId]);
  const [editing, setEditing] = useState<string | null>(null);
  const [admin, setAdmin] = useState<string | null>(null);
  const save = useAction("set_supervisor");
  if (!viewer) return <Loading />;

  const admins = (team.data?.members ?? []).filter((m) => m.role === "owner" || m.role === "admin");
  const names = new Map((team.data?.members ?? []).map((m) => [m.user_id, m.name]));

  return (
    <Screen title={es.team.title} refreshing={team.loading} onRefresh={team.reload}>
      {team.fromCache ? <CacheNotice fetchedAt={team.fetchedAt} /> : null}
      {team.error ? <ErrorBox message={team.error} onRetry={team.reload} /> : null}
      {save.notice ? <Notice tone="success">{save.notice}</Notice> : null}
      {(team.data?.members ?? []).map((m) => (
        <Card key={m.user_id} testID={`miembro-${m.user_id}`}>
          <Title>{m.name}</Title>
          <Body muted>{web.roles[m.role as keyof typeof web.roles] ?? m.role}</Body>
          {m.role === "worker" ? (
            <Body>{team.data?.supervisors.get(m.user_id) ? es.team.supervisorOf(names.get(team.data.supervisors.get(m.user_id) as string) ?? "") : es.team.noSupervisor}</Body>
          ) : null}
          {m.role === "worker" && team.data?.canManage && editing !== m.user_id ? (
            <Button label={es.team.chooseAdmin} kind="secondary" onPress={() => { setEditing(m.user_id); setAdmin(team.data?.supervisors.get(m.user_id) ?? null); }} />
          ) : null}
          {editing === m.user_id ? (
            <>
              <Choice label={es.team.chooseAdmin} options={admins.map((a) => ({ value: a.user_id, label: a.name }))} value={admin} onChange={setAdmin} />
              {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
              <Button
                label={web.common.save}
                pending={save.pending}
                disabled={!save.enabled || !admin}
                disabledReason={save.disabledReason}
                onPress={() =>
                  void save.run(
                    async () => fromError((await supabase.rpc("set_principal_supervisor", { p_space_id: viewer.spaceId as string, p_worker_id: m.user_id, p_admin_id: admin as string })).error),
                    () => { setEditing(null); team.reload(); },
                    es.team.saved,
                  )
                }
              />
            </>
          ) : null}
        </Card>
      ))}
      <Body muted>{es.team.invitesInWeb}</Body>
    </Screen>
  );
}
