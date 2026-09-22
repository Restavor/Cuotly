import { describe, expect, it } from "vitest";

import {
  checkTaxIdLocally,
  decideTaxId,
  isViesCountry,
  normalizeTaxId,
  taxIdVerified,
  viesNumber,
} from "./tax-id";

/*
 * Los números "buenos" de este archivo no salen del código que se prueba:
 * se calcularon aparte, a mano y con otro programa, con el algoritmo
 * publicado de cada país. Un test que calcula el control con la misma
 * función que prueba no prueba nada.
 */

describe("Decisión 68 · RN-ACC-02 · España: DNI, NIE, NIF y CIF con su control", () => {
  it("RN-ACC-02 · un DNI con su letra pasa y con otra letra no", () => {
    expect(checkTaxIdLocally("ES", "12345678Z")).toEqual({ kind: "valid", method: "es_dni" });
    expect(checkTaxIdLocally("ES", "00000000T")).toEqual({ kind: "valid", method: "es_dni" });
    expect(checkTaxIdLocally("ES", "12345678A")).toEqual({ kind: "invalid" });
  });

  it("RN-ACC-02 · un NIE (X, Y, Z) con su letra pasa y con otra no", () => {
    expect(checkTaxIdLocally("ES", "X1234567L")).toEqual({ kind: "valid", method: "es_nie" });
    expect(checkTaxIdLocally("ES", "Y0000001S")).toEqual({ kind: "valid", method: "es_nie" });
    expect(checkTaxIdLocally("ES", "Z9999999H")).toEqual({ kind: "valid", method: "es_nie" });
    expect(checkTaxIdLocally("ES", "X1234567T")).toEqual({ kind: "invalid" });
  });

  it("RN-ACC-02 · los NIF de las letras K, L y M", () => {
    expect(checkTaxIdLocally("ES", "K1234567L")).toEqual({ kind: "valid", method: "es_nif_klm" });
    expect(checkTaxIdLocally("ES", "K1234567A")).toEqual({ kind: "invalid" });
  });

  it("RN-ACC-02 · un CIF con su dígito o su letra de control", () => {
    expect(checkTaxIdLocally("ES", "B12345674")).toEqual({ kind: "valid", method: "es_cif" });
    expect(checkTaxIdLocally("ES", "A58818501")).toEqual({ kind: "valid", method: "es_cif" });
    expect(checkTaxIdLocally("ES", "Q1234567D")).toEqual({ kind: "valid", method: "es_cif" });
    expect(checkTaxIdLocally("ES", "B12345675")).toEqual({ kind: "invalid" });
  });

  it("RN-ACC-02 · cada forma jurídica con el tipo de control que le toca", () => {
    // Una S.L. (B) lleva cifra: con la letra equivalente no vale.
    expect(checkTaxIdLocally("ES", "B1234567D")).toEqual({ kind: "invalid" });
    // Un organismo público (Q) lleva letra: con la cifra equivalente no vale.
    expect(checkTaxIdLocally("ES", "Q12345674")).toEqual({ kind: "invalid" });
  });

  it("RN-ACC-02 · cualquier otra cosa en España se rechaza", () => {
    for (const falso of ["1234", "ABCDEFGHI", "123456789", "PT501964843", ""]) {
      expect(checkTaxIdLocally("ES", falso)).toEqual({ kind: "invalid" });
    }
  });
});

describe("Decisión 68 · RN-ACC-02 · Portugal, Países Bajos y Bélgica", () => {
  it("RN-ACC-02 · NIF portugués, también con el prefijo PT delante", () => {
    expect(checkTaxIdLocally("PT", "501964843")).toEqual({ kind: "valid", method: "pt_nif" });
    expect(checkTaxIdLocally("PT", "PT501964843")).toEqual({ kind: "valid", method: "pt_nif" });
    expect(checkTaxIdLocally("PT", "123456780")).toEqual({ kind: "invalid" });
  });

  it("RN-ACC-02 · BSN holandés; el número de IVA (…B01) se deja a VIES", () => {
    expect(checkTaxIdLocally("NL", "111222333")).toEqual({ kind: "valid", method: "nl_bsn" });
    expect(checkTaxIdLocally("NL", "123456782")).toEqual({ kind: "valid", method: "nl_bsn" });
    expect(checkTaxIdLocally("NL", "123456789")).toEqual({ kind: "invalid" });
    expect(checkTaxIdLocally("NL", "123456789B01")).toEqual({ kind: "no_algorithm" });
  });

  it("RN-ACC-02 · número nacional belga, nacidos antes y después de 2000", () => {
    expect(checkTaxIdLocally("BE", "85010100115")).toEqual({ kind: "valid", method: "be_national" });
    expect(checkTaxIdLocally("BE", "00010100105")).toEqual({ kind: "valid", method: "be_national" });
    expect(checkTaxIdLocally("BE", "85010100116")).toEqual({ kind: "invalid" });
  });

  it("RN-ACC-02 · un país sin cálculo no se rechaza por no tenerlo", () => {
    expect(checkTaxIdLocally("FR", "123456789")).toEqual({ kind: "no_algorithm" });
    expect(checkTaxIdLocally("US", "123-45-6789")).toEqual({ kind: "no_algorithm" });
  });
});

describe("Decisión 68 · RN-ACC-02 · qué se hace con el cálculo y con VIES", () => {
  const valido = { kind: "valid", method: "pt_nif" } as const;
  const sinCalculo = { kind: "no_algorithm" } as const;

  it("RN-ACC-02 · si el cálculo dice que es falso, se rechaza aunque VIES no conteste", () => {
    expect(decideTaxId({ kind: "invalid" }, null)).toEqual({ ok: false });
    expect(decideTaxId({ kind: "invalid" }, { kind: "unavailable" })).toEqual({ ok: false });
  });

  it("RN-ACC-02 · VIES lo confirma: comprobado en el registro, con el nombre", () => {
    expect(decideTaxId(sinCalculo, { kind: "found", name: "OLIVA LDA" })).toEqual({
      ok: true,
      verification: "registry",
      registryName: "OLIVA LDA",
    });
  });

  it("RN-ACC-02 · el cálculo cuadra: comprobado, aunque VIES no lo tenga (un particular)", () => {
    expect(decideTaxId(valido, { kind: "not_found" })).toEqual({ ok: true, verification: "checksum", registryName: null });
    expect(decideTaxId(valido, null)).toEqual({ ok: true, verification: "checksum", registryName: null });
  });

  it("RN-ACC-02 · sin nada que lo respalde entra, pero marcado para el equipo", () => {
    expect(decideTaxId(sinCalculo, { kind: "not_found" })).toMatchObject({ verification: "registry_not_found" });
    expect(decideTaxId(sinCalculo, { kind: "unavailable" })).toMatchObject({ verification: "registry_unavailable" });
    expect(decideTaxId(sinCalculo, null)).toMatchObject({ verification: "unverified" });
    expect(taxIdVerified("registry_not_found")).toBe(false);
    expect(taxIdVerified("checksum")).toBe(true);
    expect(taxIdVerified("registry")).toBe(true);
  });
});

describe("Decisión 68 · la forma que espera VIES", () => {
  it("normaliza espacios, puntos, guiones y barras", () => {
    expect(normalizeTaxId(" b-12.345/674 ")).toBe("B12345674");
  });

  it("quita el prefijo del país, y Grecia es EL y no GR", () => {
    expect(viesNumber("PT", "PT501964843")).toBe("501964843");
    expect(viesNumber("GR", "EL123456789")).toBe("123456789");
    expect(viesNumber("FR", "40303265045")).toBe("40303265045");
    expect(isViesCountry("GR")).toBe(true);
    expect(isViesCountry("GB")).toBe(false);
  });
});
