import { describe, expect, it } from "vitest";
import { getAvailability, noticeReason, occupancyOf } from "./availability";
import type { AvailabilityInput, AvailabilitySettings, OccupancyReservation } from "./availability";
import type { Shift } from "./shifts";

const TZ = "Europe/Madrid";
const settings: AvailabilitySettings = {
  timeZone: TZ,
  slotInterval: 30,
  largeGroupThreshold: 9,
  minNoticeMinutes: 120,
  maxAdvanceDays: 60,
  serviceStatus: "active",
};
const restaurant = { name: "Casa Pepe", localPhone: "+34954000000", transferPhone: "+34600123456" };

const shift = (id: string, name: string, weekdays: number[], start: string, last: string, end: string, capacity: number): Shift => ({
  id,
  name,
  weekdays,
  startTime: start,
  lastBookingTime: last,
  endTime: end,
  capacity,
  active: true,
});

const casaPepe = [
  shift("comida", "Comida", [2, 3, 4, 5, 6, 7], "13:00", "15:00", "16:00", 40),
  shift("cena", "Cena", [2, 3, 4, 5, 6, 7], "20:00", "22:30", "23:30", 60),
];

// Domingo 27/09/2026 es domingo; el lunes 28 está cerrado.
const NOW = new Date("2026-09-20T08:00:00Z"); // 10:00 en Madrid, una semana antes

function input(over: Partial<AvailabilityInput>): AvailabilityInput {
  return {
    date: "2026-09-27",
    partySize: 4,
    source: "agent",
    now: NOW,
    shifts: casaPepe,
    closedDates: [],
    reservations: [],
    settings,
    restaurant,
    ...over,
  };
}

const res = (id: string, shiftId: string, date: string, partySize: number, status: OccupancyReservation["status"] = "confirmed"): OccupancyReservation => ({
  id,
  shiftId,
  date,
  partySize,
  status,
});

describe("RN-RES-02 · ocupación del turno", () => {
  it("RN-RES-02 · suma pendientes y confirmadas, no canceladas ni 'No vino'", () => {
    const rs = [
      res("a", "cena", "2026-09-27", 10),
      res("b", "cena", "2026-09-27", 5, "pending"),
      res("c", "cena", "2026-09-27", 7, "cancelled"),
      res("d", "cena", "2026-09-27", 3, "no_show"),
      res("e", "cena", "2026-09-28", 9),
    ];
    expect(occupancyOf(rs, "cena", "2026-09-27")).toBe(15);
  });
  it("RN-RES-02 · al editar, la reserva no cuenta contra sí misma", () => {
    expect(occupancyOf([res("a", "cena", "2026-09-27", 10)], "cena", "2026-09-27", "a")).toBe(0);
  });
});

describe("RN-RES-04 · huecos del día", () => {
  it("RN-RES-04 · Cena 20:00–23:30, última 22:30, cada 30 → seis huecos", () => {
    const r = getAvailability(input({}));
    expect(r.slots.filter((s) => s.shiftId === "cena").map((s) => s.time)).toEqual(["20:00", "20:30", "21:00", "21:30", "22:00", "22:30"]);
  });
  it("RN-RES-04 · una hora que no es hueco → not_a_slot con alternativas", () => {
    const r = getAvailability(input({ requestedTime: "21:15" }));
    expect(r.requested).toMatchObject({ available: false, reason: "not_a_slot" });
    expect(r.alternatives.length).toBeGreaterThan(0);
  });
  it("RN-RES-04 · (c) día cerrado → closed_day y alternativas en días siguientes", () => {
    const r = getAvailability(input({ date: "2026-09-28", requestedTime: "21:00" }));
    expect(r.slots).toEqual([]);
    expect(r.requested?.reason).toBe("closed_day");
    expect(r.alternatives).toEqual([
      { date: "2026-09-29", time: "21:00" },
      { date: "2026-09-30", time: "21:00" },
      { date: "2026-10-01", time: "21:00" },
    ]);
  });
  it("RN-RES-04 · un día cerrado a propósito no tiene huecos aunque su turno abra", () => {
    const r = getAvailability(input({ date: "2026-10-12", closedDates: ["2026-10-12"], requestedTime: "21:00" }));
    expect(r.requested?.reason).toBe("closed_day");
  });
  it("RN-RES-04 · (a) cena única llena el domingo, 21:00 para 4 → misma hora martes, miércoles y jueves (lunes cerrado)", () => {
    const cenaSolo = [shift("cena", "Cena", [2, 3, 4, 5, 6], "20:00", "22:30", "23:30", 60), shift("cena-dom", "Cena domingo", [7], "20:00", "22:30", "23:30", 60)];
    const r = getAvailability(
      input({
        shifts: cenaSolo,
        // Lleno el domingo (turno propio de domingo, 60 plazas).
        reservations: [res("x", "cena-dom", "2026-09-27", 60)],
        requestedTime: "21:00",
      }),
    );
    expect(r.requested).toMatchObject({ available: false, reason: "full" });
    expect(r.requested?.message).toBe("El domingo a las 21:00 no nos queda sitio para 4 personas.");
    // Lunes 28 cerrado; martes 29, miércoles 30, jueves 1/10.
    expect(r.alternatives).toEqual([
      { date: "2026-09-29", time: "21:00" },
      { date: "2026-09-30", time: "21:00" },
      { date: "2026-10-01", time: "21:00" },
    ]);
  });
  it("RN-RES-04 · (b) tandas: 1ª llena y 2ª libre, pedida 21:00 → 22:00, 22:30, 23:00", () => {
    const sol = [
      shift("t1", "Cena 1ª tanda", [2, 3, 4, 5, 6], "20:00", "21:00", "21:30", 30),
      shift("t2", "Cena 2ª tanda", [2, 3, 4, 5, 6], "22:00", "23:00", "23:30", 30),
    ];
    const r = getAvailability(
      input({ date: "2026-09-26", shifts: sol, reservations: [res("x", "t1", "2026-09-26", 30)], requestedTime: "21:00" }),
    );
    expect(r.requested?.reason).toBe("full");
    expect(r.alternatives.map((a) => a.time)).toEqual(["22:00", "22:30", "23:00"]);
    expect(r.alternatives.every((a) => a.date === "2026-09-26")).toBe(true);
  });
  it("RN-RES-04 · alternativas del mismo día: los más cercanos, en empate el más temprano, en orden cronológico", () => {
    const r = getAvailability(input({ reservations: [res("x", "cena", "2026-09-27", 58)], requestedTime: "21:00", partySize: 4 }));
    // La cena no tiene sitio para 4 en ningún hueco; las alternativas salen de la comida (≤ 120 min): ninguna. Sigue la misma hora otro día.
    expect(r.alternatives.every((a) => a.date !== "2026-09-27")).toBe(true);
    const r2 = getAvailability(
      input({ shifts: [shift("c", "Cena", [7], "20:00", "22:30", "23:30", 60)], reservations: [], requestedTime: "21:15", partySize: 2 }),
    );
    // 21:15 no es hueco: a 15 min están 21:00 y 21:30 (empate), luego 20:30 y 22:00 (45 min) → el empate de 15 se mantiene y el tercero es 21:00±45 → 20:30 (más temprano).
    expect(r2.alternatives.map((a) => a.time)).toEqual(["20:30", "21:00", "21:30"]);
  });
  it("RN-RES-04 · (d) reservas en pausa → todo service_paused y sin alternativas", () => {
    const r = getAvailability(input({ settings: { ...settings, serviceStatus: "paused" }, requestedTime: "21:00" }));
    expect(r.slots.every((s) => !s.available && s.reason === "service_paused")).toBe(true);
    expect(r.alternatives).toEqual([]);
  });
  it("RN-RES-04 · en pausa manda la pausa, aunque el día esté cerrado o la hora no sea hueco (igual que book_reservation)", () => {
    const paused = { ...settings, serviceStatus: "paused" as const };
    const cerrado = getAvailability(input({ settings: paused, closedDates: ["2026-09-27"], requestedTime: "21:00" }));
    expect(cerrado.requested).toMatchObject({ available: false, reason: "service_paused" });
    expect(cerrado.requested?.message).toBe("Ahora mismo no podemos tomar reservas por teléfono.");
    const noHueco = getAvailability(input({ settings: paused, requestedTime: "21:15" }));
    expect(noHueco.requested).toMatchObject({ available: false, reason: "service_paused" });
    expect(noHueco.alternatives).toEqual([]);
    // Una plataforma no está en pausa: ahí sigue mandando el día cerrado.
    const plataforma = getAvailability(input({ source: "platform", settings: paused, closedDates: ["2026-09-27"], requestedTime: "21:00" }));
    expect(plataforma.requested).toMatchObject({ available: false, reason: "closed_day" });
  });
  it("RN-RES-04 · una plataforma sigue entrando con las reservas en pausa", () => {
    const r = getAvailability(input({ source: "platform", settings: { ...settings, serviceStatus: "paused" } }));
    expect(r.slots.every((s) => s.available)).toBe(true);
  });
  it("RN-RES-04 · el restaurante viaja en la respuesta", () => {
    expect(getAvailability(input({})).restaurant).toEqual(restaurant);
  });
});

describe("RN-RES-03 · antelación (solo agente y web)", () => {
  // Sábado 26/09/2026, 14:10 en Madrid = 12:10 UTC.
  const hoy = new Date("2026-09-26T12:10:00Z");
  it("RN-RES-03 · (e) hoy a las 14:10 con mínimo 2 h: la comida de hoy es too_soon y la cena está disponible", () => {
    const r = getAvailability(input({ date: "2026-09-26", now: hoy }));
    const comida = r.slots.filter((s) => s.shiftId === "comida");
    expect(comida.every((s) => !s.available && s.reason === "too_soon")).toBe(true);
    const cena = r.slots.filter((s) => s.shiftId === "cena");
    expect(cena.every((s) => s.available)).toBe(true);
  });
  it("RN-RES-03 · justo en el mínimo sí entra; un minuto antes, no", () => {
    expect(noticeReason("2026-09-26", "16:10", hoy, settings)).toBeUndefined();
    expect(noticeReason("2026-09-26", "16:00", hoy, settings)).toBe("too_soon");
  });
  it("RN-RES-03 · más allá del máximo → too_far", () => {
    expect(noticeReason("2026-11-25", "21:00", hoy, settings)).toBeUndefined(); // 60 días
    expect(noticeReason("2026-11-26", "21:00", hoy, settings)).toBe("too_far");
  });
  it("RN-RES-03 · con la baja pedida no se acepta más allá del periodo pagado", () => {
    const ending = { ...settings, serviceStatus: "ending" as const, paidUntil: "2026-10-15" };
    expect(noticeReason("2026-10-15", "21:00", hoy, ending)).toBeUndefined();
    expect(noticeReason("2026-10-16", "21:00", hoy, ending)).toBe("too_far");
  });
  it("RN-RES-03 · las manuales y las plataformas no tienen límite de antelación", () => {
    for (const source of ["manual", "platform"] as const) {
      const r = getAvailability(input({ date: "2026-09-26", now: hoy, source }));
      expect(r.slots.filter((s) => s.shiftId === "comida").every((s) => s.available)).toBe(true);
    }
  });
});

describe("RN-RES-05 · grupos grandes", () => {
  it("RN-RES-05 · agente o web con personas ≥ umbral piden confirmación; manual no", () => {
    const grande = getAvailability(input({ partySize: 9 })).slots[0];
    expect(grande.requiresConfirmation).toBe(true);
    expect(getAvailability(input({ partySize: 8 })).slots[0].requiresConfirmation).toBe(false);
    expect(getAvailability(input({ partySize: 12, source: "manual" })).slots[0].requiresConfirmation).toBe(false);
  });
});
