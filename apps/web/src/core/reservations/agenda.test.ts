import { describe, expect, it } from "vitest";
import { daySummary, filterByOrigin, firstPending, groupByShift, originCounters, sortDayRows } from "./agenda";
import type { AgendaReservation } from "./agenda";
import type { Shift } from "./shifts";

const a = (id: string, time: string, party: number, source: AgendaReservation["source"], status: AgendaReservation["status"] = "confirmed", shiftId: string | null = "comida", name = id): AgendaReservation => ({
  id,
  shiftId,
  date: "2026-09-26",
  time,
  partySize: party,
  status,
  source,
  customerName: name,
});

// Las 12 reservas de AgentsHoy (sábado 26/09/2026).
const hoy: AgendaReservation[] = [
  a("lucia", "13:30", 2, "platform"),
  a("raul", "13:30", 2, "manual", "no_show"),
  a("javier", "14:00", 4, "agent"),
  a("carmen", "14:00", 3, "manual"),
  a("andres", "14:30", 12, "agent", "pending"),
  a("pablo", "14:30", 2, "web"),
  a("elena", "15:00", 2, "platform", "cancelled"),
  a("marta", "20:30", 4, "agent", "confirmed", "cena"),
  a("sergio", "21:00", 6, "platform", "confirmed", "cena"),
  a("nuria", "21:00", 2, "web", "confirmed", "cena"),
  a("tomas", "21:30", 2, "manual", "confirmed", "cena"),
  a("ivan", "22:00", 5, "platform", "confirmed", "cena"),
];
const shifts: Shift[] = [
  { id: "comida", name: "Comida", weekdays: [6], startTime: "13:00", lastBookingTime: "15:00", endTime: "16:00", capacity: 40, active: true },
  { id: "cena", name: "Cena", weekdays: [6], startTime: "20:00", lastBookingTime: "22:30", endTime: "23:30", capacity: 60, active: true },
];

describe("RES-01 · resumen y filtros del día", () => {
  it("RES-01 · '10 reservas · 42 personas · 1 pendiente' (sin canceladas ni 'No vino')", () => {
    expect(daySummary(hoy)).toEqual({ reservations: 10, people: 42, pending: 1 });
  });
  it("RES-01 · contadores de los filtros como la maqueta: Todas 10, Agente 3, Plataformas 3, Web 2, Manual 2", () => {
    expect(originCounters(hoy)).toEqual({ all: 10, agent: 3, platform: 3, web: 2, manual: 2 });
  });
  it("RES-01 · filtrar por origen deja solo ese origen", () => {
    expect(filterByOrigin(hoy, "web").map((r) => r.id)).toEqual(["pablo", "nuria"]);
    expect(filterByOrigin(hoy, "all")).toHaveLength(12);
  });
  it("RES-01 · las canceladas van al final de su hora y 'No vino' conserva su sitio", () => {
    const rows = sortDayRows([a("elena", "15:00", 2, "platform", "cancelled"), a("zoe", "15:00", 2, "web"), a("raul", "13:30", 2, "manual", "no_show"), a("lucia", "13:30", 2, "platform")]);
    expect(rows.map((r) => r.id)).toEqual(["lucia", "raul", "zoe", "elena"]);
    expect(sortDayRows([a("x", "14:00", 2, "web", "cancelled"), a("y", "14:00", 2, "web")]).map((r) => r.id)).toEqual(["y", "x"]);
  });
  it("RES-01 · 'Revisar' lleva a la primera pendiente por hora", () => {
    const pend = [...hoy, a("tarde", "20:00", 10, "web", "pending", "cena")];
    expect(firstPending(pend)?.id).toBe("andres");
    expect(firstPending(hoy.filter((r) => r.status !== "pending"))).toBeUndefined();
  });
});

describe("RN-RES-02 · bloques por turno", () => {
  it("RN-RES-02 · Comida 23 de 40 y Cena 19 de 60, con la ocupación del día entero aunque haya filtro", () => {
    const visible = filterByOrigin(hoy, "web");
    const blocks = groupByShift(hoy, visible, shifts);
    expect(blocks.map((b) => [b.shift?.name, b.occupied, b.state])).toEqual([
      ["Comida", 23, "ok"],
      ["Cena", 19, "ok"],
    ]);
    expect(blocks[0].rows.map((r) => r.id)).toEqual(["pablo"]);
  });
  it("RN-RES-02 · una plataforma sin turno va a 'Fuera de turno' (shift null)", () => {
    const blocks = groupByShift([...hoy, a("fuera", "18:00", 4, "platform", "confirmed", null)], [...hoy, a("fuera", "18:00", 4, "platform", "confirmed", null)], shifts);
    expect(blocks.at(-1)?.shift).toBeNull();
    expect(blocks.at(-1)?.rows.map((r) => r.id)).toEqual(["fuera"]);
  });
  it("RN-RES-02 · un turno pasado de aforo marca 'over' (63/60)", () => {
    const lleno = [a("g", "21:00", 63, "platform", "confirmed", "cena")];
    expect(groupByShift(lleno, lleno, shifts).find((b) => b.shift?.id === "cena")?.state).toBe("over");
  });
});
