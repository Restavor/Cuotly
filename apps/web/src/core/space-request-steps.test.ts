import { describe, expect, it } from "vitest";

import { spaceRequestSteps } from "./space-requests";

const estados = (state: Parameters<typeof spaceRequestSteps>[0], space: string | null = null) =>
  spaceRequestSteps(state, space).map((p) => p.status);

describe("G03 · el camino de la solicitud de espacio", () => {
  it("son siempre los cuatro pasos del dibujo, en su orden", () => {
    expect(spaceRequestSteps("submitted", null).map((p) => p.key)).toEqual([
      "submitted",
      "review",
      "approval",
      "activation",
    ]);
  });

  it("enviada o en revisión: el segundo paso es el que está en marcha", () => {
    expect(estados("submitted")).toEqual(["done", "current", "pending", "pending"]);
    expect(estados("in_review")).toEqual(["done", "current", "pending", "pending"]);
  });

  it("RN-PLA-06 · necesita información: la revisión espera al solicitante", () => {
    expect(estados("needs_information")).toEqual(["done", "waiting", "pending", "pending"]);
  });

  it("RN-PLA-06 · rechazada: la aprobación se para y no hay activación", () => {
    expect(estados("rejected")).toEqual(["done", "done", "stopped", "pending"]);
  });

  it("RN-SUB-05 · aprobada con el espacio en prueba: falta pagar la primera mensualidad", () => {
    expect(estados("approved", "trial")).toEqual(["done", "done", "done", "current"]);
  });

  it("RN-SUB-05 · pagar la primera mensualidad activa el espacio", () => {
    expect(estados("approved", "active")).toEqual(["done", "done", "done", "done"]);
  });

  it("§4.4 · archivado por no pagar la prueba: la activación sigue esperando el pago", () => {
    expect(estados("approved", "archived_trial_ended")[3]).toBe("waiting");
    expect(estados("approved", "archived_nonpayment")[3]).toBe("waiting");
    expect(estados("approved", "archived_by_owner")[3]).toBe("stopped");
  });

  it("sin espacio que leer no se afirma nada del último paso", () => {
    expect(estados("approved", null)[3]).toBe("pending");
  });

  it("un borrador no ha empezado ningún paso", () => {
    expect(estados("draft")).toEqual(["pending", "pending", "pending", "pending"]);
  });
});
