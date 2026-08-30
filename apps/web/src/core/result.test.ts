import { describe, expect, it } from "vitest";
import { err, ok } from "./result";

describe("Result", () => {
  it("ok() produce un resultado correcto con el valor dado", () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("err() produce un resultado de error con el motivo dado", () => {
    const result = err("correo ya registrado");
    expect(result).toEqual({ ok: false, error: "correo ya registrado" });
  });
});
