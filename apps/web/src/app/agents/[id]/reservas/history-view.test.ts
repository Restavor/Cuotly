import { describe, expect, it } from "vitest";
import { describeEvent } from "./history-view";
import type { HistoryEvent } from "@/services/reservations-gateway";

const TZ = "Europe/Madrid";
const ev = (over: Partial<HistoryEvent>): HistoryEvent => ({
  id: "e1",
  type: "created",
  actorType: "member",
  actorName: "José García",
  data: {},
  createdAt: new Date("2026-09-24T16:42:00Z"),
  ...over,
});

describe("RES-03 · el historial legible de la ficha", () => {
  it("RES-03 · escribe la hora del restaurante y nombra a quien es del restaurante", () => {
    expect(describeEvent(ev({ data: { source: "manual" } }), null, TZ)).toEqual({ when: "24 sept, 18:42", text: "Creada a mano · por José García" });
  });
  it("RES-03 · el agente, la web y la plataforma salen con su etiqueta, no con un nombre de persona", () => {
    expect(describeEvent(ev({ actorType: "agent", actorName: "Agente", data: { source: "agent" } }), null, TZ).text).toBe("Reservada por el agente");
    expect(describeEvent(ev({ actorType: "web", actorName: "Web", data: { source: "web" } }), null, TZ).text).toBe("Reservada en la web");
    expect(describeEvent(ev({ actorType: "platform", actorName: "TheFork", data: { source: "platform" } }), "TheFork", TZ).text).toBe("Reservada en TheFork");
  });
  it("RES-03 · el soporte de Restavor sale como «Restavor (soporte)», sin identidad (P7)", () => {
    const e = describeEvent(ev({ actorType: "restavor_support", actorName: "Restavor (soporte)", data: { source: "manual" } }), null, TZ);
    expect(e.text).toBe("Creada a mano · por Restavor (soporte)");
  });
  it("RES-03 · un cambio dice qué cambió, de qué a qué, sin el valor de nombre, teléfono o nota", () => {
    const e = describeEvent(
      ev({
        type: "updated",
        data: { changed: ["time", "party_size", "phone", "notes"], time_from: "21:00:00", time_to: "21:30:00", party_size_from: 4, party_size_to: 6 },
      }),
      null,
      TZ,
    );
    expect(e.text).toBe("Reserva modificada · hora 21:00 → 21:30 · personas 4 → 6 · Cambió el teléfono, la nota · por José García");
  });
  it("RES-03 · un grupo que el agente sube al umbral dice que ahora está pendiente", () => {
    const e = describeEvent(ev({ type: "updated", actorType: "agent", actorName: "Agente", data: { changed: ["party_size"], party_size_from: 4, party_size_to: 10, status_from: "confirmed", status_to: "pending" } }), null, TZ);
    expect(e.text).toBe("Reserva modificada · personas 4 → 10 · ahora pendiente");
  });
  it("RES-05 · cancelar dice el motivo", () => {
    expect(describeEvent(ev({ type: "cancelled", data: { reason: "customer" } }), null, TZ).text).toBe("Reserva cancelada · motivo: el cliente · por José García");
  });
  it("RES-06 · «No vino», deshacerlo, abrirla y «No es duplicada» tienen su frase", () => {
    expect(describeEvent(ev({ type: "no_show" }), null, TZ).text).toContain("«No vino»");
    expect(describeEvent(ev({ type: "no_show_undone" }), null, TZ).text).toContain("deshecho");
    expect(describeEvent(ev({ type: "opened", actorType: "member" }), null, TZ).text).toContain("Abierta");
    expect(describeEvent(ev({ type: "duplicate_dismissed" }), null, TZ).text).toContain("No es duplicada");
  });
  it("un tipo que no conoce no inventa nada", () => {
    expect(describeEvent(ev({ type: "algo_nuevo", actorType: "system", actorName: "Sistema" }), null, TZ).text).toBe("Cambio en la reserva");
  });
});
