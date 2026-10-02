import { describe, expect, it } from "vitest";
import { duplicateIds, duplicatePartners, pairKey } from "./duplicates";
import type { DuplicateCandidate } from "./duplicates";

const r = (id: string, date: string, phone: string | null, status: DuplicateCandidate["status"] = "confirmed"): DuplicateCandidate => ({ id, date, phoneE164: phone, status });
const none = new Set<string>();

describe("RN-RES-06 · posibles duplicadas", () => {
  it("RN-RES-06 · mismo día y mismo teléfono forman un par", () => {
    const ids = duplicateIds([r("a", "2026-09-27", "+34600000001"), r("b", "2026-09-27", "+34600000001"), r("c", "2026-09-27", "+34600000002")], none);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
  it("RN-RES-06 · otro día, otro teléfono o sin teléfono: no hay par", () => {
    expect(duplicateIds([r("a", "2026-09-27", "+34600000001"), r("b", "2026-09-28", "+34600000001")], none).size).toBe(0);
    expect(duplicateIds([r("a", "2026-09-27", null), r("b", "2026-09-27", null)], none).size).toBe(0);
  });
  it("RN-RES-06 · al cancelar una del par, la otra deja de estar marcada", () => {
    const ids = duplicateIds([r("a", "2026-09-27", "+34600000001"), r("b", "2026-09-27", "+34600000001", "cancelled")], none);
    expect(ids.size).toBe(0);
  });
  it("RN-RES-06 · si tiene otro par, sigue marcada", () => {
    const ids = duplicateIds(
      [r("a", "2026-09-27", "+34600000001"), r("b", "2026-09-27", "+34600000001", "cancelled"), r("c", "2026-09-27", "+34600000001")],
      none,
    );
    expect([...ids].sort()).toEqual(["a", "c"]);
  });
  it("RN-RES-06 · un par descartado ('No es duplicada') no se marca, en cualquier orden", () => {
    const dismissed = new Set([pairKey("b", "a")]);
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
    expect(duplicateIds([r("a", "2026-09-27", "+34600000001"), r("b", "2026-09-27", "+34600000001")], dismissed).size).toBe(0);
  });
  it("RN-RES-06 · una 'No vino' tampoco forma par: solo cuentan las activas", () => {
    expect(duplicateIds([r("a", "2026-09-27", "+34600000001"), r("b", "2026-09-27", "+34600000001", "no_show")], none).size).toBe(0);
  });
  it("RN-RES-06 · con quién forma pareja (para 'Cancelar una')", () => {
    const all = [r("a", "2026-09-27", "+34600000001"), r("b", "2026-09-27", "+34600000001"), r("c", "2026-09-27", "+34600000009")];
    expect(duplicatePartners("a", all, none).map((p) => p.id)).toEqual(["b"]);
    expect(duplicatePartners("c", all, none)).toEqual([]);
  });
});
