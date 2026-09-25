import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

import type { TeamData, TeamMember } from "./team-load";
import { InvitationsTab, MembersTab, PermissionsTab, SupervisionTab } from "./TeamView";

vi.mock("./actions", () => ({
  saveMemberPermissions: vi.fn(),
  cancelInvitation: vi.fn(),
  removeMember: vi.fn(),
}));
vi.mock("@/app/espacios/actions", () => ({ inviteMember: vi.fn() }));

const t = es.teamPage;
afterEach(cleanup);

function member(over: Partial<TeamMember> & Pick<TeamMember, "userId" | "name" | "role">): TeamMember {
  return {
    email: null,
    status: "active",
    since: "2026-01-12T10:00:00Z",
    adminCanPerformJobs: false,
    canApproveReports: false,
    specialties: [],
    establishmentIds: [],
    loadPoints: 0,
    available: true,
    availabilityNote: null,
    ...over,
  };
}

const OWNER = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const WORKER = "00000000-0000-4000-8000-000000000003";

function team(over: Partial<TeamData> = {}): TeamData {
  return {
    members: [
      member({ userId: OWNER, name: "Bosco", role: "owner", specialties: ["web"] }),
      member({ userId: ADMIN, name: "Ana", role: "admin", loadPoints: 12, adminCanPerformJobs: true }),
      member({
        userId: WORKER,
        name: "Diego",
        role: "worker",
        specialties: ["design", "web"],
        establishmentIds: ["e1"],
        loadPoints: 8,
      }),
    ],
    establishments: [
      { id: "e1", name: "Magariños", archived: false },
      { id: "e2", name: "La Encina", archived: false },
    ],
    supervisions: [{ id: "s1", workerId: WORKER, adminId: ADMIN, kind: "principal", endsAt: null }],
    caps: { manageSpace: true, invite: true, assignJobs: true },
    loadState: "ok",
    ...over,
  };
}

describe("M69 · Miembros y carga", () => {
  it("cuenta miembros, administradores y trabajadores activos, y suma la carga", () => {
    render(<MembersTab slug="s" data={team()} />);
    expect(screen.getByText(t.members.statAdmins).closest("div")?.parentElement?.textContent).toContain("1");
    expect(screen.getByTestId("equipo-carga-total").textContent).toContain(t.members.points(20));
  });

  it("RN-ASG-01 · el trabajador enseña sus restaurantes; propietario y administrador, todos por su rol", () => {
    render(<MembersTab slug="s" data={team()} />);
    const filas = within(screen.getByTestId("equipo-miembros")).getAllByRole("row");
    const diego = filas.find((f) => f.textContent?.includes("Diego"));
    const bosco = filas.find((f) => f.textContent?.includes("Bosco"));
    expect(diego?.textContent).toContain("Magariños");
    expect(diego?.textContent).not.toContain("La Encina");
    expect(bosco?.textContent).toContain(t.members.allEstablishments(2));
  });

  it("el supervisor sale en la fila del trabajador y el enlace lleva a sus permisos", () => {
    render(<MembersTab slug="s" data={team()} />);
    const diego = within(screen.getByTestId("equipo-miembros"))
      .getAllByRole("row")
      .find((f) => f.textContent?.includes("Diego"));
    expect(diego?.textContent).toContain("Ana");
    const enlace = screen.getByRole("link", { name: t.members.openPermissions("Diego") });
    expect(enlace.getAttribute("href")).toBe(`/espacios/s/equipo?tab=permisos&persona=${WORKER}`);
  });

  it("sin permiso para ver la carga, lo dice en vez de pintar un cero", () => {
    const data = team({
      loadState: "no_permission",
      members: team().members.map((m) => ({ ...m, loadPoints: null })),
    });
    render(<MembersTab slug="s" data={data} />);
    expect(screen.getByTestId("equipo-carga-total").textContent).toContain(t.members.loadNoPermission);
    expect(screen.queryByText(t.members.points(0))).toBeNull();
  });
});

describe("M70 · Permisos", () => {
  it("sin persona elegida, la lista para elegir", () => {
    render(<PermissionsTab slug="s" spaceId="sp" data={team()} personId={null} history={[]} timeZone="Europe/Madrid" />);
    expect(screen.getByText(t.permissions.chooseTitle)).toBeTruthy();
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toContain(
      `/espacios/s/equipo?tab=permisos&persona=${ADMIN}`,
    );
  });

  it("RN-ASG-01 · a un trabajador se le marcan sus restaurantes y especialidades, y se pueden cambiar", () => {
    render(<PermissionsTab slug="s" spaceId="sp" data={team()} personId={WORKER} history={[]} timeZone="Europe/Madrid" />);
    const magarinos = screen.getByRole("checkbox", { name: "Magariños" }) as HTMLInputElement;
    const encina = screen.getByRole("checkbox", { name: "La Encina" }) as HTMLInputElement;
    expect(magarinos.checked).toBe(true);
    expect(encina.checked).toBe(false);
    expect(magarinos.disabled).toBe(false);
    expect((screen.getByRole("checkbox", { name: es.naming.specialties.design }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: t.permissions.save })).toBeTruthy();
  });

  it("sin capacidades, todo se ve deshabilitado, sin botón de guardar y con el aviso", () => {
    const data = team({ caps: { manageSpace: false, invite: false, assignJobs: false } });
    render(<PermissionsTab slug="s" spaceId="sp" data={data} personId={WORKER} history={[]} timeZone="Europe/Madrid" />);
    expect((screen.getByRole("checkbox", { name: "Magariños" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: t.permissions.save })).toBeNull();
    expect(screen.getByText(t.permissions.readOnlyTitle)).toBeTruthy();
  });

  it("un administrador no marca restaurantes (los tiene por su rol) y tiene sus dos interruptores", () => {
    render(<PermissionsTab slug="s" spaceId="sp" data={team()} personId={ADMIN} history={[]} timeZone="Europe/Madrid" />);
    expect(screen.getByText(t.permissions.establishmentsByRole)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Magariños" })).toBeNull();
    expect((screen.getByRole("switch", { name: new RegExp(t.permissions.performJobs) }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("switch", { name: new RegExp(t.permissions.approveReports) }) as HTMLInputElement).checked).toBe(false);
  });

  it("el historial sale del libro de auditoría, con su nombre en español y quién lo hizo", () => {
    render(
      <PermissionsTab
        slug="s"
        spaceId="sp"
        data={team()}
        personId={WORKER}
        history={[{ id: "h1", action: "membership.establishments_changed", at: "2026-09-15T10:00:00Z", actorId: OWNER }]}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getByText(es.settings.auditActions["membership.establishments_changed"])).toBeTruthy();
    expect(screen.getByText(t.permissions.historyBy("Bosco"))).toBeTruthy();
  });

  it("un historial que no se pudo leer se dice", () => {
    render(<PermissionsTab slug="s" spaceId="sp" data={team()} personId={WORKER} history={null} timeZone="Europe/Madrid" />);
    expect(screen.getByText(t.permissions.historyFailed)).toBeTruthy();
  });
});

describe("Decisión 80 · Retirar del equipo", () => {
  const tp = t.permissions;
  const ver = (data: TeamData, personId: string) =>
    render(<PermissionsTab slug="s" spaceId="sp" data={data} personId={personId} history={[]} timeZone="Europe/Madrid" />);

  it("RN-MIE-01 · el propietario ve el formulario, con motivo y el nombre a escribir (§140)", () => {
    ver(team(), WORKER);
    expect(screen.getByRole("button", { name: tp.removeSubmit })).toBeTruthy();
    expect(screen.getByLabelText(tp.removeReasonLabel)).toBeTruthy();
    expect(screen.getByLabelText(tp.removeConfirmationLabel("Diego"))).toBeTruthy();
  });

  it("RN-MIE-01 · a un administrador no se le ofrece retirar a nadie", () => {
    ver(team({ caps: { manageSpace: false, invite: false, assignJobs: true } }), WORKER);
    expect(screen.queryByRole("button", { name: tp.removeSubmit })).toBeNull();
    expect(screen.queryByText(tp.removeTitle)).toBeNull();
  });

  it("RN-MIE-02 · al propietario no se le retira: se le manda a transferir la propiedad", () => {
    ver(team(), OWNER);
    expect(screen.queryByRole("button", { name: tp.removeSubmit })).toBeNull();
    expect(screen.getByText(tp.removeOwnerTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: tp.removeOwnerLink }).getAttribute("href")).toBe(
      "/espacios/s/ajustes/propiedad",
    );
  });

  it("RN-MIE-06 · a quien ya está fuera no se le retira otra vez ni se le cambian los permisos", () => {
    const base = team();
    const data = team({
      members: base.members.map((m) => (m.userId === WORKER ? { ...m, status: "access_revoked" } : m)),
    });
    ver(data, WORKER);
    expect(screen.queryByRole("button", { name: tp.removeSubmit })).toBeNull();
    expect(screen.getByText(tp.removedTitle)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Magariños" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: tp.save })).toBeNull();
  });
});

describe("M71 · Invitaciones", () => {
  const ahora = new Date("2026-09-23T10:00:00Z");
  const inv = (id: string, expiresAt: string) => ({
    id,
    email: `${id}@ejemplo.com`,
    role: "worker",
    createdAt: "2026-09-10T10:00:00Z",
    expiresAt,
    token: `tok-${id}`,
  });

  it("sin permiso para invitar no enseña ni la lista ni el formulario", () => {
    render(<InvitationsTab spaceId="sp" slug="s" canInvite={false} invitations={[]} timeZone="Europe/Madrid" now={ahora} />);
    expect(screen.getByText(t.invitations.noPermissionTitle)).toBeTruthy();
    expect(screen.queryByText(t.invitations.inviteTitle)).toBeNull();
  });

  it("una caducada se marca y ya no ofrece copiar el enlace; las dos se pueden cancelar", () => {
    render(
      <InvitationsTab
        spaceId="sp"
        slug="s"
        canInvite
        invitations={[inv("laura", "2026-09-30T10:00:00Z"), inv("carlos", "2026-09-20T10:00:00Z")]}
        timeZone="Europe/Madrid"
        now={ahora}
      />,
    );
    const filas = within(screen.getByTestId("equipo-invitaciones")).getAllByRole("row");
    const carlos = filas.find((f) => f.textContent?.includes("carlos@"));
    const laura = filas.find((f) => f.textContent?.includes("laura@"));
    expect(carlos?.textContent).toContain(t.invitations.expired);
    expect(carlos?.textContent).not.toContain(t.invitations.copyLink);
    expect(laura?.textContent).toContain(t.invitations.copyLink);
    expect(screen.getAllByRole("button", { name: t.invitations.cancel })).toHaveLength(2);
  });

  it("sin pendientes lo dice, y el formulario de invitar está debajo", () => {
    render(<InvitationsTab spaceId="sp" slug="s" canInvite invitations={[]} timeZone="Europe/Madrid" now={ahora} />);
    expect(screen.getByText(t.invitations.emptyTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: es.space.team.submit })).toBeTruthy();
  });
});

describe("M72 · Supervisión y disponibilidad", () => {
  it("RN-ASG-10 · la cuadrícula pinta ausencias por día y la disponibilidad declarada el resto", () => {
    const data = team({
      members: team().members.map((m) => (m.userId === ADMIN ? { ...m, available: false } : m)),
    });
    render(
      <SupervisionTab
        slug="s"
        data={data}
        week="2026-09-21"
        today="2026-09-23"
        absences={[{ id: "a1", userId: WORKER, startsOn: "2026-09-24", endsOn: "2026-09-24", state: "approved", reason: "Vacaciones" }]}
        reassignments={[]}
        supervisionForms={null}
        timeZone="Europe/Madrid"
      />,
    );
    const grid = screen.getByTestId("equipo-disponibilidad");
    const ausente = t.supervision.dayStatus.absent;
    expect(within(grid).getAllByRole("img", { name: new RegExp(`^Diego.*${ausente}$`) })).toHaveLength(1);
    expect(within(grid).getAllByRole("img", { name: new RegExp(`^Ana.*${t.supervision.dayStatus.unavailable}$`) })).toHaveLength(7);
    // Y la ausencia está en "Ausencias próximas" con su motivo.
    expect(screen.getByText("Vacaciones")).toBeTruthy();
  });

  it("las reasignaciones pendientes llevan a donde se resuelven", () => {
    render(
      <SupervisionTab
        slug="s"
        data={team()}
        week="2026-09-21"
        today="2026-09-23"
        absences={[]}
        reassignments={[
          { id: "r1", kind: "task", label: "Cambiar fotos", personId: WORKER, at: "2026-09-20T10:00:00Z", href: "/espacios/s/trabajos/j1/tareas?tarea=t1" },
        ]}
        supervisionForms={null}
        timeZone="Europe/Madrid"
      />,
    );
    const lista = screen.getByTestId("equipo-reasignaciones");
    expect(lista.textContent).toContain("Cambiar fotos");
    expect(lista.textContent).toContain("Diego");
    expect(within(lista).getByRole("link", { name: t.supervision.open }).getAttribute("href")).toBe(
      "/espacios/s/trabajos/j1/tareas?tarea=t1",
    );
  });

  it("lo que no se pudo leer se dice, no se pinta vacío", () => {
    render(
      <SupervisionTab
        slug="s"
        data={team()}
        week="2026-09-21"
        today="2026-09-23"
        absences={null}
        reassignments={null}
        supervisionForms={null}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getAllByText(t.supervision.absencesFailed).length).toBeGreaterThan(0);
    expect(screen.getByText(t.supervision.reassignmentsFailed)).toBeTruthy();
  });
});
