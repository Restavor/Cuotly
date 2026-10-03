import { describe, expect, it } from "vitest";

import { newElevation } from "@/core/reservations/device";

import {
  PinSecretMissingError,
  hashDeviceToken,
  isDeviceToken,
  newDeviceToken,
  pinHmac,
  pinSecretConfigured,
  readElevation,
  signElevation,
} from "./pin";

const SECRET = "restavor-pruebas-pin-secret";

describe("RN-APP-06 · el PIN llega a la base de datos como HMAC", () => {
  it("RN-APP-06 · es el mismo cálculo que el sembrado (los PIN de Ana y Diego de Casa Pepe)", () => {
    // Lo que calcula PostgreSQL en `reservas-demo.sql`: encode(extensions.hmac('1234', 'restavor-pruebas-pin-secret', 'sha256'), 'hex').
    expect(pinHmac("1234", SECRET)).toBe("89b5d763396aef69c42d9752cad25b3abe54223672efbed7ecff8c9c1daf4b14");
  });

  it("RN-APP-06 · el mismo PIN con la misma clave da lo mismo; con otra clave o con otro PIN, no", () => {
    expect(pinHmac("1234", SECRET)).toBe(pinHmac("1234", SECRET));
    expect(pinHmac("1234", SECRET)).not.toBe(pinHmac("1235", SECRET));
    expect(pinHmac("1234", SECRET)).not.toBe(pinHmac("1234", "otra-clave"));
  });

  it("RN-APP-06 · el PIN en claro no aparece en lo que se guarda", () => {
    expect(pinHmac("1234", SECRET)).not.toContain("1234");
  });

  it("RN-APP-06 · sin clave del servidor no hay PIN: se dice, no se inventa", () => {
    const previous = process.env.AGENTS_PIN_SECRET;
    delete process.env.AGENTS_PIN_SECRET;
    try {
      expect(() => pinHmac("1234")).toThrow(PinSecretMissingError);
      expect(pinSecretConfigured()).toBe(false);
      expect(pinSecretConfigured("x")).toBe(true);
      expect(readElevation("cualquier.cosa")).toBeNull();
    } finally {
      if (previous !== undefined) process.env.AGENTS_PIN_SECRET = previous;
    }
  });
});

describe("RN-APP-08 · el token del dispositivo", () => {
  it("RN-APP-08 · es largo, aleatorio y distinto cada vez; en la base solo queda su hash", () => {
    const a = newDeviceToken();
    const b = newDeviceToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(hashDeviceToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceToken(a)).not.toBe(a);
    expect(hashDeviceToken(a)).toBe(hashDeviceToken(a));
  });

  it("RN-APP-08 · solo se consulta lo que tiene la forma de un token", () => {
    expect(isDeviceToken(newDeviceToken())).toBe(true);
    for (const malo of [undefined, "", "abc", "x".repeat(64), "A".repeat(64), `${"a".repeat(63)}`]) expect(isDeviceToken(malo)).toBe(false);
  });
});

describe("RN-APP-08 · la cookie de «Ajustes abiertos» va firmada", () => {
  const payload = newElevation("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", Date.UTC(2026, 9, 3, 12));

  it("RN-APP-08 · lo firmado se lee igual", () => {
    expect(readElevation(signElevation(payload, SECRET), SECRET)).toEqual(payload);
  });

  it("RN-APP-08 · cambiar quién, el restaurante o la hora rompe la firma", () => {
    const cookie = signElevation(payload, SECRET);
    const [body, firma] = cookie.split(".");
    const otro = Buffer.from(JSON.stringify({ ...payload, staffId: "99999999-9999-4999-8999-999999999999" })).toString("base64url");
    expect(readElevation(`${otro}.${firma}`, SECRET)).toBeNull();
    const masTarde = Buffer.from(JSON.stringify({ ...payload, expiresAt: payload.expiresAt + 9999 })).toString("base64url");
    expect(readElevation(`${masTarde}.${firma}`, SECRET)).toBeNull();
    expect(readElevation(`${body}.${"0".repeat(64)}`, SECRET)).toBeNull();
  });

  it("RN-APP-08 · con otra clave no vale", () => {
    expect(readElevation(signElevation(payload, SECRET), "otra-clave")).toBeNull();
  });

  it("RN-APP-08 · lo roto, lo vacío y lo que no es un JSON no valen", () => {
    expect(readElevation(undefined, SECRET)).toBeNull();
    expect(readElevation("", SECRET)).toBeNull();
    expect(readElevation("sin-punto", SECRET)).toBeNull();
    expect(readElevation(".abc", SECRET)).toBeNull();
    expect(readElevation("abc.", SECRET)).toBeNull();
  });

  it("RN-APP-08 · una firma de otro tipo (un PIN) no vale como cookie de Ajustes", () => {
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    // Lo que firmaría alguien que usara el HMAC de PIN directamente sobre el cuerpo.
    const firmaDePin = pinHmac(body, SECRET);
    expect(readElevation(`${body}.${firmaDePin}`, SECRET)).toBeNull();
  });
});
