import { describe, expect, it } from "vitest";

import { formatIban, hasDebt, paymentDetailsConfigured, priceWithTax } from "./payment-info";

describe("RN-APP-03 · datos para pagar", () => {
  it("RN-APP-03 · 48 € + IVA son 58,08 €", () => {
    expect(priceWithTax(4800, 21)).toEqual({ baseCents: 4800, taxCents: 1008, totalCents: 5808 });
  });

  it("RN-APP-03 · sin IBAN ni Bizum se dice «sin configurar», con uno de los dos no", () => {
    expect(paymentDetailsConfigured({ iban: null, bizumPhone: null })).toBe(false);
    expect(paymentDetailsConfigured({ iban: "ES9121000418450200051332", bizumPhone: null })).toBe(true);
    expect(paymentDetailsConfigured({ iban: null, bizumPhone: "+34 600 123 456" })).toBe(true);
    expect(paymentDetailsConfigured({ iban: "", bizumPhone: "" })).toBe(false);
  });

  it("RN-APP-03 · el IBAN se enseña en grupos de cuatro", () => {
    expect(formatIban("ES9121000418450200051332")).toBe("ES91 2100 0418 4502 0005 1332");
    expect(formatIban("ES91 2100 0418 4502 0005 1332")).toBe("ES91 2100 0418 4502 0005 1332");
  });

  it("RN-APP-03 · un cobro saldado ya no pide pagar", () => {
    expect(hasDebt({ outstandingCents: 5808 })).toBe(true);
    expect(hasDebt({ outstandingCents: 0 })).toBe(false);
  });
});
