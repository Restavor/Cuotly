import { describe, expect, it } from "vitest";
import { highlightRange, parseSearchQuery, searchReservations, searchWindowStart } from "./search";
import type { SearchableReservation } from "./search";

const TZ = "Europe/Madrid";
const NOW = new Date("2026-09-26T12:10:00Z");
const r = (id: string, date: string, name: string, phone: string | null): SearchableReservation => ({ id, date, time: "21:00", customerName: name, phoneE164: phone, status: "confirmed" });

describe("RES-09 · Buscar reserva", () => {
  it("RES-09 · lo que se escribe es un teléfono si son cifras y un nombre si no; con poco texto, no busca", () => {
    expect(parseSearchQuery("")).toEqual({ kind: "empty" });
    expect(parseSearchQuery("6")).toEqual({ kind: "too_short" });
    expect(parseSearchQuery("12")).toEqual({ kind: "too_short" });
    expect(parseSearchQuery("123")).toEqual({ kind: "phone", digits: "123" });
    expect(parseSearchQuery("+34 600-123-456")).toEqual({ kind: "phone", digits: "34600123456" });
    expect(parseSearchQuery("Lau")).toEqual({ kind: "name", text: "Lau" });
  });
  it("RES-09 · bastan los 3 últimos números del teléfono", () => {
    const rs = [r("a", "2026-09-27", "Laura Vega", "+34600000123"), r("b", "2026-09-27", "Otro", "+34600000999")];
    const res = searchReservations(parseSearchQuery("123"), rs, NOW, TZ);
    expect(res.upcoming.map((h) => h.reservation.id)).toEqual(["a"]);
    expect(res.upcoming[0].matchedBy).toBe("phone");
  });
  it("RES-09 · el nombre no distingue mayúsculas ni tildes y resalta la coincidencia", () => {
    const rs = [r("a", "2026-09-27", "Andrés Martínez", "+34600000001")];
    const res = searchReservations(parseSearchQuery("andres"), rs, NOW, TZ);
    expect(res.upcoming[0].nameRange).toEqual([0, 6]);
    expect(highlightRange("Andrés Martínez", "MARTI")).toEqual([7, 12]);
    expect(highlightRange("Ana", "zz")).toBeNull();
  });
  it("RES-09 · 'Próximas' de la más cercana a la más lejana y 'Últimos 30 días' de la más reciente a la más antigua", () => {
    const rs = [
      r("p2", "2026-10-30", "Laura Vega", "+34600000001"),
      r("p1", "2026-09-26", "Laura Vega", "+34600000001"),
      r("h1", "2026-09-10", "Laura Vega", "+34600000001"),
      r("h2", "2026-08-30", "Laura Vega", "+34600000001"),
    ];
    const res = searchReservations(parseSearchQuery("laura"), rs, NOW, TZ);
    expect(res.upcoming.map((h) => h.reservation.id)).toEqual(["p1", "p2"]);
    expect(res.past.map((h) => h.reservation.id)).toEqual(["h1", "h2"]);
  });
  it("RES-09 · solo los últimos 30 días y todas las futuras", () => {
    expect(searchWindowStart(NOW, TZ)).toBe("2026-08-27");
    const rs = [r("dentro", "2026-08-27", "Laura", "+34600000001"), r("fuera", "2026-08-26", "Laura", "+34600000001"), r("lejos", "2027-05-01", "Laura", "+34600000001")];
    const res = searchReservations(parseSearchQuery("laura"), rs, NOW, TZ);
    expect([...res.upcoming, ...res.past].map((h) => h.reservation.id).sort()).toEqual(["dentro", "lejos"]);
  });
  it("RES-09 · las anonimizadas (sin teléfono) no salen al buscar por número", () => {
    expect(searchReservations(parseSearchQuery("123"), [r("a", "2026-09-27", "Anónimo", null)], NOW, TZ).upcoming).toEqual([]);
  });
});
