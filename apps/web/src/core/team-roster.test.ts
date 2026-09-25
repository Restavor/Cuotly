import { describe, expect, it } from "vitest";

import {
  authorizedEstablishments,
  canPerformJobs,
  dayStatus,
  invitationExpired,
  memberRemoval,
  mondayOf,
  readRemovedMemberSummary,
  readTeamParams,
  shiftWeek,
  teamCounts,
  upcomingAbsences,
  weekDays,
} from "./team-roster";

describe("readTeamParams", () => {
  it("sin nada, la pestaña de miembros y la semana de hoy", () => {
    expect(readTeamParams({}, "2026-09-23")).toEqual({ tab: "miembros", person: null, week: "2026-09-21" });
  });

  it("lee la pestaña, la persona y la semana", () => {
    const id = "f1500000-0000-4000-8000-000000000001";
    expect(readTeamParams({ tab: "permisos", persona: id, semana: "2026-09-30" }, "2026-09-23")).toEqual({
      tab: "permisos",
      person: id,
      week: "2026-09-28",
    });
  });

  it("descarta lo que no entiende en vez de romper", () => {
    expect(readTeamParams({ tab: "otra", persona: "x", semana: "2026-02-30" }, "2026-09-23")).toEqual({
      tab: "miembros",
      person: null,
      week: "2026-09-21",
    });
  });
});

describe("la semana", () => {
  it("empieza en lunes", () => {
    expect(mondayOf("2026-09-21")).toBe("2026-09-21");
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");
    expect(mondayOf("2026-01-01")).toBe("2025-12-29");
  });

  it("se desplaza de siete en siete y cruza meses y años", () => {
    expect(shiftWeek("2026-09-28", 1)).toBe("2026-10-05");
    expect(shiftWeek("2026-01-05", -1)).toBe("2025-12-29");
  });

  it("tiene siete días seguidos", () => {
    expect(weekDays("2026-09-28")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("teamCounts", () => {
  it("cuenta solo a los activos y no mete al propietario entre los administradores", () => {
    expect(
      teamCounts([
        { role: "owner", status: "active" },
        { role: "admin", status: "active" },
        { role: "worker", status: "active" },
        { role: "worker", status: "active" },
        { role: "worker", status: "suspended" },
      ]),
    ).toEqual({ members: 4, admins: 1, workers: 2 });
  });
});

describe("RN-ASG-10 · dayStatus", () => {
  const ausencias = [
    { userId: "a", startsOn: "2026-09-24", endsOn: "2026-09-25", state: "approved" },
    { userId: "a", startsOn: "2026-09-25", endsOn: "2026-09-26", state: "requested" },
    { userId: "a", startsOn: "2026-09-28", endsOn: "2026-09-28", state: "rejected" },
    { userId: "b", startsOn: "2026-09-23", endsOn: "2026-09-23", state: "approved" },
  ];

  it("una ausencia aprobada manda sobre la pedida y sobre lo declarado", () => {
    expect(dayStatus("2026-09-25", "a", ausencias, true)).toBe("absent");
  });

  it("una ausencia pedida se distingue de la aprobada", () => {
    expect(dayStatus("2026-09-26", "a", ausencias, true)).toBe("absence_requested");
  });

  it("una rechazada no cuenta, y sin ausencia vale la disponibilidad declarada", () => {
    expect(dayStatus("2026-09-28", "a", ausencias, true)).toBe("available");
    expect(dayStatus("2026-09-28", "a", ausencias, false)).toBe("unavailable");
  });

  it("no inventa fines de semana libres: no hay horario fijo por persona", () => {
    expect(dayStatus("2026-09-27", "a", ausencias, true)).toBe("available");
  });

  it("las ausencias de otra persona no cuentan", () => {
    expect(dayStatus("2026-09-23", "a", ausencias, true)).toBe("available");
  });
});

describe("upcomingAbsences", () => {
  it("deja las pedidas y aprobadas que no han terminado, por fecha de inicio", () => {
    const lista = upcomingAbsences(
      [
        { userId: "a", startsOn: "2026-10-01", endsOn: "2026-10-02", state: "approved" },
        { userId: "b", startsOn: "2026-09-20", endsOn: "2026-09-23", state: "approved" },
        { userId: "c", startsOn: "2026-09-10", endsOn: "2026-09-12", state: "approved" },
        { userId: "d", startsOn: "2026-09-30", endsOn: "2026-09-30", state: "requested" },
        { userId: "e", startsOn: "2026-09-25", endsOn: "2026-09-25", state: "rejected" },
      ],
      "2026-09-23",
    );
    expect(lista.map((a) => a.userId)).toEqual(["b", "d", "a"]);
  });
});

describe("RN-ASG-01 · authorizedEstablishments", () => {
  it("el trabajador tiene los que tiene asignados", () => {
    expect(authorizedEstablishments("worker", ["x"])).toEqual({ all: false, ids: ["x"] });
    expect(authorizedEstablishments("worker", [])).toEqual({ all: false, ids: [] });
  });

  it("propietario y administradores, todos por su rol", () => {
    expect(authorizedEstablishments("owner", [])).toEqual({ all: true });
    expect(authorizedEstablishments("admin", [])).toEqual({ all: true });
  });
});

describe("canPerformJobs", () => {
  it("sigue el criterio de member_can_perform_jobs()", () => {
    expect(canPerformJobs("owner", false)).toBe(true);
    expect(canPerformJobs("worker", false)).toBe(true);
    expect(canPerformJobs("admin", false)).toBe(false);
    expect(canPerformJobs("admin", true)).toBe(true);
  });
});

describe("invitationExpired", () => {
  it("caduca en el instante de expires_at", () => {
    const ahora = new Date("2026-09-23T10:00:00Z");
    expect(invitationExpired("2026-09-23T10:00:00Z", ahora)).toBe(true);
    expect(invitationExpired("2026-09-23T10:00:01Z", ahora)).toBe(false);
  });
});

describe("memberRemoval — decisión 80, §4.5", () => {
  it("RN-MIE-01: solo el propietario ve cómo retirar a alguien", () => {
    expect(memberRemoval("worker", "active", false)).toBeNull();
    expect(memberRemoval("admin", "active", false)).toBeNull();
    expect(memberRemoval("worker", "active", true)).toBe("form");
    expect(memberRemoval("admin", "temporarily_absent", true)).toBe("form");
  });

  it("RN-MIE-02: al propietario no se le retira; se le manda a transferir la propiedad", () => {
    expect(memberRemoval("owner", "active", true)).toBe("owner");
  });

  it("RN-MIE-06: a quien ya está fuera no se le ofrece retirarlo otra vez", () => {
    expect(memberRemoval("worker", "access_revoked", true)).toBe("removed");
    expect(memberRemoval("admin", "inactive", true)).toBe("removed");
  });
});

describe("readRemovedMemberSummary — RN-MIE-03", () => {
  it("RN-MIE-03: lee lo que ha quedado para reasignar tal como lo cuenta el servidor", () => {
    expect(
      readRemovedMemberSummary({ already_removed: false, jobs: 3, tasks: 2, menus: 1, other_jobs: 1 }),
    ).toEqual({ jobs: 3, tasks: 2, menus: 1, corrections: 1 });
  });

  it("RN-MIE-03: un campo que falta o no es un número no inventa pendientes", () => {
    expect(readRemovedMemberSummary(null)).toEqual({ jobs: 0, tasks: 0, menus: 0, corrections: 0 });
    expect(readRemovedMemberSummary({ jobs: "3", tasks: -1, menus: 1.5 })).toEqual({
      jobs: 0,
      tasks: 0,
      menus: 0,
      corrections: 0,
    });
  });
});
