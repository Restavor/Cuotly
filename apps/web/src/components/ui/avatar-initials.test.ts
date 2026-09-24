import { describe, expect, it } from "vitest";

import { initials } from "./Avatar";

describe("initials", () => {
  it("toma la primera letra del nombre y la del último apellido", () => {
    expect(initials("Nuria Magariños Pérez")).toBe("NP");
    expect(initials("  ana  ")).toBe("A");
  });

  it("se salta lo que no empieza por letra: el paréntesis del rol no es una inicial", () => {
    expect(initials("Marta Gil (trabajadora)")).toBe("MG");
    expect(initials("Diego Sanz (trabajador)")).toBe("DS");
  });

  it("acepta letras con tilde y eñe como inicial", () => {
    expect(initials("Íñigo Ñúñez")).toBe("ÍÑ");
  });

  it("sin ninguna palabra que empiece por letra devuelve «?»", () => {
    expect(initials("")).toBe("?");
    expect(initials("(—) 123")).toBe("?");
  });
});
