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

  it("AVI-01 · un aviso enviado dice cuál y por dónde, sin el contacto del cliente", () => {
    const sent = describeEvent(ev({ type: "notification_sent", actorType: "system", actorName: "Sistema", data: { template: "confirmed", channel: "whatsapp" } }), null, TZ);
    expect(sent.text).toBe("Aviso «reserva confirmada» enviado por WhatsApp");
    expect(describeEvent(ev({ type: "notification_sent", actorType: "system", actorName: "Sistema", data: { template: "cancelled", channel: "email" } }), null, TZ).text).toBe(
      "Aviso «reserva cancelada» enviado por email",
    );
  });
  it("RN-AGT-07 · un aviso que no sale por falta de saldo lo dice como pide el PRD: «Aviso no enviado: sin saldo»", () => {
    expect(describeEvent(ev({ type: "notification_skipped", actorType: "system", actorName: "Sistema", data: { template: "confirmed", reason: "no_balance" } }), null, TZ).text).toBe(
      "Aviso no enviado: sin saldo",
    );
  });
  it("RN-RES-10 · cada motivo por el que un aviso no sale tiene su frase, y uno nuevo no inventa nada", () => {
    for (const reason of ["no_consent", "no_contact", "messaging_disabled", "no_rate", "not_allowed", "missing_data", "enqueue_error"]) {
      const text = describeEvent(ev({ type: "notification_skipped", actorType: "system", actorName: "Sistema", data: { reason } }), null, TZ).text;
      expect(text, reason).not.toBe("Aviso no enviado");
      expect(text, reason).toMatch(/^(Aviso no enviado|El aviso no se pudo preparar)/);
    }
    expect(describeEvent(ev({ type: "notification_skipped", actorType: "system", actorName: "Sistema", data: { reason: "algo_nuevo" } }), null, TZ).text).toBe("Aviso no enviado");
  });
  it("RN-RES-10 · un WhatsApp que no llega y pasa a SMS lo cuenta; sin respaldo, dice que ese número no tiene WhatsApp", () => {
    const base = { type: "notification_failed", actorType: "system", actorName: "Sistema" } as const;
    expect(describeEvent(ev({ ...base, data: { template: "confirmed", channel: "whatsapp", reason: "whatsapp_undeliverable", fallback: "sms" } }), null, TZ).text).toBe(
      "WhatsApp no disponible en ese número: se envía por SMS",
    );
    expect(describeEvent(ev({ ...base, data: { template: "confirmed", channel: "whatsapp", reason: "whatsapp_undeliverable" } }), null, TZ).text).toBe(
      "Aviso no entregado: ese número no tiene WhatsApp",
    );
    expect(describeEvent(ev({ ...base, data: { reason: "max_attempts" } }), null, TZ).text).toBe("Aviso no enviado: no se pudo entregar tras varios intentos");
    expect(describeEvent(ev({ ...base, data: { reason: "meta_999999" } }), null, TZ).text).toBe("Aviso no enviado: el proveedor lo ha rechazado");
  });
});
