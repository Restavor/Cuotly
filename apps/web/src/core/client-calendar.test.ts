import { describe, expect, it } from "vitest";

import {
  addMonths,
  eventsByDay,
  filterByKind,
  gridBounds,
  monthGrid,
  readClientCalendarParams,
  upcomingEvents,
  type ClientCalendarEvent,
} from "./client-calendar";

const ev = (id: string, kind: ClientCalendarEvent["kind"], day: string, time: string | null = null): ClientCalendarEvent => ({
  id,
  kind,
  day,
  time,
  title: id,
  detail: null,
  stateLabel: null,
  href: `/${id}`,
});

describe("R21 · la rejilla del mes, de lunes a domingo", () => {
  it("septiembre de 2026 empieza en martes: la primera fila arranca el lunes 31 de agosto", () => {
    const semanas = monthGrid("2026-09");
    expect(semanas[0][0]).toEqual({ day: "2026-08-31", inMonth: false });
    expect(semanas[0][1]).toEqual({ day: "2026-09-01", inMonth: true });
    expect(semanas).toHaveLength(5);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(gridBounds("2026-09")).toEqual({ from: "2026-08-31", to: "2026-10-04" });
  });

  it("febrero de 2027 (empieza en lunes, 28 días) cabe en cuatro semanas justas", () => {
    const semanas = monthGrid("2027-02");
    expect(semanas).toHaveLength(4);
    expect(semanas[0][0].day).toBe("2027-02-01");
  });

  it("los meses se suman cruzando el año", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("R21 y R22 · filtros, agrupación y lo que viene", () => {
  const eventos = [
    ev("pub", "menu", "2026-09-16", "11:00"),
    ev("sol", "request", "2026-09-18", "10:30"),
    ev("ren", "renewal", "2026-10-14"),
    ev("inf", "report", "2026-09-30", "09:00"),
    ev("antes", "request", "2026-09-02"),
  ];

  it("lee la dirección: un mes o un tipo que no existen no rompen la pantalla", () => {
    expect(readClientCalendarParams({ mes: "2026-13", tipo: "fiesta" }, "2026-09-22")).toEqual({
      month: "2026-09",
      kind: null,
      view: "mes",
      selected: null,
    });
    expect(readClientCalendarParams({ mes: "2026-10", tipo: "menu", vista: "agenda", evento: "x" }, "2026-09-22")).toEqual({
      month: "2026-10",
      kind: "menu",
      view: "agenda",
      selected: "x",
    });
  });

  it("filtra por tipo y ordena por día y hora", () => {
    expect(filterByKind(eventos, "request").map((e) => e.id)).toEqual(["antes", "sol"]);
    expect(filterByKind(eventos, null).map((e) => e.id)).toEqual(["antes", "pub", "sol", "inf", "ren"]);
  });

  it("agrupa por día para pintar la rejilla", () => {
    const mapa = eventsByDay(eventos);
    expect(mapa.get("2026-09-16")?.map((e) => e.id)).toEqual(["pub"]);
    expect(mapa.has("2026-09-17")).toBe(false);
  });

  it("lo que viene es de hoy en adelante, el más cercano primero", () => {
    expect(upcomingEvents(eventos, "2026-09-18").map((e) => e.id)).toEqual(["sol", "inf", "ren"]);
  });
});
