import { describe, expect, it } from "vitest";
import { classifyByRules, isChangeCategory } from "./classification-rules";

describe("classification-rules — RN-CLS-02, categorías de PRD §10.1", () => {
  it("RN-CLS-02: cambia el nombre de un plato (pequeño) por palabra clave de precio/nombre", () => {
    const result = classifyByRules("Quiero cambiar el precio de la ensalada César a 9,50 €.");
    expect(result.category).toBe("small");
    expect(result.matchedKeywords).toContain("precio");
  });

  it("RN-CLS-02: sustituir una fotografía se clasifica como fotográfico", () => {
    const result = classifyByRules("Adjunto una fotografía nueva del local, sustituir la de la portada.");
    expect(result.category).toBe("photo");
  });

  it("RN-CLS-02: añadir cinco platos nuevos a la carta se clasifica como mediano", () => {
    const result = classifyByRules("Añadir cinco platos nuevos a la sección de la carta de postres.");
    expect(result.category).toBe("medium");
  });

  it("RN-CLS-02: rediseñar la carta completa se clasifica como grande", () => {
    const result = classifyByRules("Necesitamos una carta completa nueva, con menú especial de Navidad.");
    expect(result.category).toBe("large");
  });

  it("RN-CLS-02: ante varias coincidencias, prevalece la categoría de mayor alcance (large sobre small)", () => {
    const result = classifyByRules("Cambiar el precio de un plato y además rehacer la carta completa.");
    expect(result.category).toBe("large");
  });

  it("RN-CLS-02: sin ninguna coincidencia, la propuesta por defecto es la categoría mínima, sin marcarla como detectada", () => {
    const result = classifyByRules("asdfgh qwerty zxcvbn");
    expect(result.category).toBe("small");
    expect(result.matchedKeywords).toEqual([]);
  });

  it("RN-CLS-02: la coincidencia ignora mayúsculas y acentos", () => {
    const result = classifyByRules("SUSTITUIR FOTOGRAFIA del salón, sin acentos ni mayúsculas raras.");
    expect(result.category).toBe("photo");
  });

  it("isChangeCategory reconoce solo las cuatro categorías de §10.1", () => {
    expect(isChangeCategory("small")).toBe(true);
    expect(isChangeCategory("photo")).toBe(true);
    expect(isChangeCategory("medium")).toBe(true);
    expect(isChangeCategory("large")).toBe(true);
    expect(isChangeCategory("gigante")).toBe(false);
  });
});
