import { describe, expect, it, vi } from "vitest";

import { VIES_URL, checkVies } from "./vies";

function responde(status: number, cuerpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(cuerpo), { status }));
}

/*
 * Respuestas copiadas de VIES el 22/09/2026, consultado de verdad desde un
 * sandbox de Vercel en París (este entorno de desarrollo no llega a
 * ec.europa.eu). Se recortan los campos que no se usan. Si VIES cambia su
 * forma de contestar, estos casos son los que tienen que ponerse rojos.
 */
const REAL_GOOGLE_IE = {
  countryCode: "IE",
  vatNumber: "6388047V",
  requestDate: "2026-09-22T21:17:00.446Z",
  valid: true,
  requestIdentifier: "",
  name: "GOOGLE IRELAND LIMITED",
  address: "3RD FLOOR, GORDON HOUSE, BARROW STREET, DUBLIN 4",
  traderName: "---",
};
const REAL_NO_REGISTRADO_PT = {
  countryCode: "PT",
  vatNumber: "123456789",
  requestDate: "2026-09-22T21:17:01.048Z",
  valid: false,
  requestIdentifier: "",
  name: "",
  address: "",
  traderName: "---",
};
const REAL_ALEMANIA_CAIDA = { actionSucceed: false, errorWrappers: [{ error: "MS_UNAVAILABLE" }] };

describe("Decisión 68 · RN-ACC-02 · con las respuestas reales de VIES", () => {
  it("RN-ACC-02 · una empresa dada de alta: encontrada, con su nombre", async () => {
    expect(await checkVies("IE", "6388047V", responde(200, REAL_GOOGLE_IE))).toEqual({
      kind: "found",
      name: "GOOGLE IRELAND LIMITED",
    });
  });

  it("RN-ACC-02 · un número bien formado pero no dado de alta: no encontrado", async () => {
    expect(await checkVies("PT", "123456789", responde(200, REAL_NO_REGISTRADO_PT))).toEqual({
      kind: "not_found",
    });
  });

  it("RN-ACC-02 · el servidor de un país caído llega con un 200: es «no se sabe»", async () => {
    expect(await checkVies("DE", "811569869", responde(200, REAL_ALEMANIA_CAIDA))).toEqual({
      kind: "unavailable",
    });
  });
});

describe("Decisión 68 · RN-ACC-02 · la consulta a VIES", () => {
  it("RN-ACC-02 · pregunta con el país y el número, sin prefijo", async () => {
    const f = responde(200, { valid: true, name: "OLIVA LDA" });
    await checkVies("PT", "501964843", f);
    expect(f).toHaveBeenCalledWith(VIES_URL, expect.objectContaining({ method: "POST" }));
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ countryCode: "PT", vatNumber: "501964843" });
  });

  it("RN-ACC-02 · válido es encontrado, con el nombre registrado", async () => {
    expect(await checkVies("PT", "1", responde(200, { valid: true, name: " OLIVA LDA " }))).toEqual({
      kind: "found",
      name: "OLIVA LDA",
    });
  });

  it("RN-ACC-02 · un país que no da el nombre («---») sigue siendo encontrado", async () => {
    expect(await checkVies("DE", "1", responde(200, { valid: true, name: "---" }))).toEqual({
      kind: "found",
      name: null,
    });
  });

  it("RN-ACC-02 · no válido es no encontrado", async () => {
    expect(await checkVies("FR", "1", responde(200, { valid: false }))).toEqual({ kind: "not_found" });
  });

  it("RN-ACC-02 · un país caído, un 500 o la red cortada son «no se sabe», nunca «no existe»", async () => {
    expect(await checkVies("IT", "1", responde(200, { errorWrappers: [{ error: "MS_UNAVAILABLE" }] }))).toEqual({
      kind: "unavailable",
    });
    expect(await checkVies("IT", "1", responde(500, {}))).toEqual({ kind: "unavailable" });
    const sinRed = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await checkVies("IT", "1", sinRed)).toEqual({ kind: "unavailable" });
  });

  it("RN-ACC-02 · si tarda demasiado, se corta y es «no se sabe»", async () => {
    const lento = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("abortado", "AbortError")));
        }),
    );
    expect(await checkVies("IT", "1", lento, 20)).toEqual({ kind: "unavailable" });
  });
});
