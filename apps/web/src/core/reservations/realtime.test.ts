import { describe, expect, it } from "vitest";
import { changePayload, parseChange, shouldAnnounce, shouldReload } from "./realtime";

describe("RN-RES-13 · el aviso de tiempo real no lleva datos personales", () => {
  it("RN-RES-13 · el mensaje tiene exactamente las claves de la fecha y el motivo, nada más", () => {
    expect(changePayload({ kind: "date", date: "2026-09-26", reason: "new" })).toEqual({ kind: "date", date: "2026-09-26", reason: "new" });
    expect(changePayload({ kind: "agent" })).toEqual({ kind: "agent" });
  });
  it("RN-RES-13 · un mensaje con más campos (un nombre, un teléfono) se lee sin ellos", () => {
    const leido = parseChange({ kind: "date", date: "2026-09-26", reason: "new", customer_name: "Lucía", phone: "+34600000000" });
    expect(leido).toEqual({ kind: "date", date: "2026-09-26", reason: "new" });
    expect(JSON.stringify(leido)).not.toMatch(/Lucía|34600/);
  });
  it("RN-RES-13 · lo que no tiene la forma esperada se ignora", () => {
    for (const raro of [null, undefined, 3, "x", {}, { kind: "date" }, { kind: "date", date: "2026-02-30" }, { kind: "otra" }]) {
      expect(parseChange(raro)).toBeNull();
    }
  });
  it("RN-RES-13 · cambió una fecha → se vuelve a pedir si es la que se mira (o si no se mira ninguna, como en el calendario)", () => {
    const c = { kind: "date", date: "2026-09-26", reason: "changed" } as const;
    expect(shouldReload(c, "2026-09-26")).toBe(true);
    expect(shouldReload(c, "2026-09-27")).toBe(false);
    expect(shouldReload(c, null)).toBe(true);
    expect(shouldReload({ kind: "agent" }, "2026-09-27")).toBe(true);
  });
  it("RN-RES-13 · solo una reserva nueva de la fecha que se mira suena y enseña la barra", () => {
    expect(shouldAnnounce({ kind: "date", date: "2026-09-26", reason: "new" }, "2026-09-26")).toBe(true);
    expect(shouldAnnounce({ kind: "date", date: "2026-09-26", reason: "new" }, "2026-09-27")).toBe(false);
    expect(shouldAnnounce({ kind: "date", date: "2026-09-26", reason: "changed" }, "2026-09-26")).toBe(false);
    expect(shouldAnnounce({ kind: "agent" }, null)).toBe(false);
  });
});
