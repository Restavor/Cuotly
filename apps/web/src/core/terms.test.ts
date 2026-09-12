import { describe, expect, it } from "vitest";

import {
  TERMS_STATUSES,
  isTermsStatus,
  termsNeedAcceptance,
  termsStatusOf,
  termsTone,
} from "./terms";

/**
 * Maqueta 13 · "Versión aceptada · Ver condiciones".
 *
 * El estado lo calcula `subscription_terms()` en el servidor y lo prueba
 * `supabase/tests/condiciones_versionadas.sql`. Aquí se prueba lo que la
 * pantalla hace con él, que es poco y tiene que ser exacto.
 */
describe("condiciones versionadas y aceptadas (RN-DAT-07, §104)", () => {
  it("RN-DAT-07 · los cuatro estados del servidor, y solo esos", () => {
    expect([...TERMS_STATUSES]).toEqual(["no_terms", "pending", "accepted", "outdated"]);
    for (const status of TERMS_STATUSES) expect(isTermsStatus(status)).toBe(true);
    expect(isTermsStatus("firmado")).toBe(false);
  });

  it("§104 · aceptar una versión anterior NO es haber aceptado la vigente", () => {
    // "Se conserva versión aceptada" — y por eso `outdated` pide acción
    // igual que `pending`: hay una versión nueva que el restaurante no ha
    // leído.
    expect(termsNeedAcceptance("outdated")).toBe(true);
    expect(termsNeedAcceptance("pending")).toBe(true);
    expect(termsNeedAcceptance("accepted")).toBe(false);
  });

  it("sin condiciones publicadas no hay nada que aceptar: es cosa del espacio, no del restaurante", () => {
    expect(termsNeedAcceptance("no_terms")).toBe(false);
    expect(termsTone("no_terms")).toBe("neutral");
  });

  it("el tono: aceptada en verde, lo que pide acción avisa", () => {
    expect(termsTone("accepted")).toBe("success");
    expect(termsTone("pending")).toBe("warning");
    expect(termsTone("outdated")).toBe("warning");
  });

  it("un estado desconocido se trata como PENDIENTE, no como aceptado", () => {
    // Avisar de más es mejor que afirmar una aceptación que no consta.
    expect(termsStatusOf("lo_que_sea")).toBe("pending");
    expect(termsStatusOf("accepted")).toBe("accepted");
  });
});
