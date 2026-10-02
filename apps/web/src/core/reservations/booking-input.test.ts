import { describe, expect, it } from "vitest";
import { validateReservationInput } from "./booking-input";
import type { RawReservationInput } from "./booking-input";

const base: RawReservationInput = {
  date: "2026-09-26",
  time: "21:00",
  partySize: 4,
  name: "Lucía Fernández",
  phone: "612 345 678",
  email: "",
  notes: "",
  language: "es",
};

describe("RES-02 · lo obligatorio de Nueva reserva", () => {
  it("RES-02 · con nombre y teléfono válido, pasa y el teléfono sale en E.164", () => {
    const r = validateReservationInput(base);
    expect(r).toEqual({
      ok: true,
      value: { date: "2026-09-26", time: "21:00", partySize: 4, name: "Lucía Fernández", phoneE164: "+34612345678", email: null, notes: null, language: "es" },
    });
  });
  it("RES-02 · el nombre es obligatorio", () => {
    expect(validateReservationInput({ ...base, name: "   " })).toEqual({ ok: false, errors: { name: true } });
  });
  it("RES-02 · hace falta teléfono o email: con solo email pasa; sin ninguno de los dos, no", () => {
    const soloEmail = validateReservationInput({ ...base, phone: "", email: "cliente@correo.com" });
    expect(soloEmail.ok && soloEmail.value.phoneE164).toBe(null);
    expect(soloEmail.ok && soloEmail.value.email).toBe("cliente@correo.com");
    expect(validateReservationInput({ ...base, phone: "", email: "" })).toEqual({ ok: false, errors: { contact: true } });
  });
  it("RES-02 · un teléfono que no es válido se rechaza aunque haya email", () => {
    expect(validateReservationInput({ ...base, phone: "12345", email: "a@b.es" })).toEqual({ ok: false, errors: { phone: true } });
    expect(validateReservationInput({ ...base, phone: "hola" })).toEqual({ ok: false, errors: { phone: true } });
  });
  it("RES-02 · un email mal escrito se rechaza", () => {
    expect(validateReservationInput({ ...base, email: "no-es-un-email" })).toEqual({ ok: false, errors: { email: true } });
  });
  it("RES-02 · las personas son un entero de 1 en adelante", () => {
    for (const party of [0, -1, 1.5, "abc", "", 100000]) {
      expect(validateReservationInput({ ...base, partySize: party })).toEqual({ ok: false, errors: { party: true } });
    }
    const siete = validateReservationInput({ ...base, partySize: "7" });
    expect(siete.ok && siete.value.partySize).toBe(7);
  });
  it("RES-02 · fecha y hora tienen que existir", () => {
    expect(validateReservationInput({ ...base, date: "2026-02-30" })).toEqual({ ok: false, errors: { date: true } });
    expect(validateReservationInput({ ...base, time: "25:00" })).toEqual({ ok: false, errors: { time: true } });
  });
  it("RES-02 · la nota, 300 caracteres como mucho; vacía se guarda como nula", () => {
    expect(validateReservationInput({ ...base, notes: "x".repeat(301) })).toEqual({ ok: false, errors: { notes: true } });
    const ok = validateReservationInput({ ...base, notes: "  " });
    expect(ok.ok && ok.value.notes).toBe(null);
  });
  it("RES-02 · el idioma de los avisos es español salvo que sea inglés", () => {
    const en = validateReservationInput({ ...base, language: "en" });
    expect(en.ok && en.value.language).toBe("en");
    const raro = validateReservationInput({ ...base, language: "fr" });
    expect(raro.ok && raro.value.language).toBe("es");
  });
});
