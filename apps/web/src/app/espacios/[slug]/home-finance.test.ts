import { describe, expect, it } from "vitest";

import { resumenFinanciero } from "./home-load";

/**
 * Página 22 · cuál de los tres estados del "Resumen financiero" es.
 *
 * Los tres se leen distinto y confundirlos tiene consecuencias:
 *
 *   · Sin la capacidad `manage_finance`, `financial_dashboard()` SIEMPRE
 *     devuelve error. Tratarlo como fallo de lectura le diría "vuelve a
 *     cargar en un momento" a quien nunca va a poder verlo.
 *   · Un fallo de verdad tampoco es "no tienes permiso": decírselo a
 *     quien sí lo tiene le manda a pedir algo que ya tiene (§20.7).
 *   · Y ninguno de los dos es un cero. "0 € cobrado" es una afirmación
 *     sobre el dinero del espacio, y no se hace sin haber mirado (CA-20).
 */
describe("página 22 · los tres estados del resumen financiero", () => {
  const fila = { collected_cents: 248_000, pending_cents: 31_000 };

  it("con permiso y datos, los importes", () => {
    expect(resumenFinanciero(true, null, fila)).toEqual({
      kind: "ok",
      collectedCents: 248_000,
      pendingCents: 31_000,
    });
  });

  it("sin la capacidad es «no puedes verlo», aunque llegue un error", () => {
    // Es el caso normal: la función lanza, así que llegan los dos a la vez.
    expect(resumenFinanciero(false, new Error("no tienes permiso"), undefined)).toEqual({
      kind: "no_permission",
    });
  });

  it("si ni siquiera se ha podido saber si hay permiso, tampoco se enseña", () => {
    // `has_capability` devolvió null: no se sabe. No se adivina que sí.
    expect(resumenFinanciero(null, null, fila)).toEqual({ kind: "no_permission" });
  });

  it("con permiso pero con error, es un fallo de lectura y NO «sin permiso»", () => {
    expect(resumenFinanciero(true, new Error("timeout"), undefined)).toEqual({ kind: "failed" });
  });

  it("con permiso y sin error pero sin fila, también es un fallo", () => {
    // Una respuesta vacía no son cero euros: es que no hay respuesta.
    expect(resumenFinanciero(true, null, undefined)).toEqual({ kind: "failed" });
  });

  it("un cero de verdad SÍ es un cero, y se enseña", () => {
    expect(resumenFinanciero(true, null, { collected_cents: 0, pending_cents: 0 })).toEqual({
      kind: "ok",
      collectedCents: 0,
      pendingCents: 0,
    });
  });
});
