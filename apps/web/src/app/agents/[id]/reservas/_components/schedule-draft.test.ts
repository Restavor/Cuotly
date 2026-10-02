import { describe, expect, it } from "vitest";

import type { DraftShift } from "./ScheduleParts";
import { withSavedIds } from "./schedule-draft";

const draft = (key: string, over: Partial<DraftShift> = {}): DraftShift => ({
  key,
  name: key,
  weekdays: [1],
  startTime: "20:00",
  lastBookingTime: "22:30",
  endTime: "23:30",
  capacity: "60",
  active: true,
  ...over,
});

describe("RN-RES-01 · guardar horarios dos veces no duplica los turnos", () => {
  it("RN-RES-01 · los turnos nuevos reciben el identificador que devolvió la base de datos, en el orden enviado", () => {
    const out = withSavedIds([draft("cena", { id: "id-cena" }), draft("nuevo-1")], ["id-cena", "id-comida"]);
    expect(out.map((d) => d.id)).toEqual(["id-cena", "id-comida"]);
    // La clave no cambia: la pantalla sigue tratándolo como la misma tarjeta.
    expect(out.map((d) => d.key)).toEqual(["cena", "nuevo-1"]);
  });
  it("RN-RES-01 · sin identificadores (o con otra cantidad) el borrador queda como estaba", () => {
    const drafts = [draft("nuevo-1")];
    expect(withSavedIds(drafts, undefined)).toBe(drafts);
    expect(withSavedIds(drafts, ["a", "b"])).toBe(drafts);
  });
  it("RN-RES-01 · los turnos inactivos no se enviaron y no consumen identificador", () => {
    const out = withSavedIds([draft("viejo", { active: false }), draft("nuevo-1")], ["id-nuevo"]);
    expect(out.map((d) => d.id)).toEqual([undefined, "id-nuevo"]);
  });
});
