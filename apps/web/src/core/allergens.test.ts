import { describe, expect, it } from "vitest";

import { linesToItems } from "./daily-menu";
import {
  ALLERGENS,
  dishAllergenState,
  dishNames,
  isAllergen,
  menuAllergenSummary,
  normalizeDishAllergens,
  resizeDeclarations,
  undeclaredCount,
  type MenuAllergens,
} from "./allergens";

const platos = {
  starters: ["Crema de calabaza", "Ensalada"],
  mains: ["Merluza"],
  desserts: ["Flan"],
  drink: "Vino de la casa",
};

const declarado = (allergens: string[], note: string | null = null) =>
  normalizeDishAllergens(allergens, note);

describe("RN-ALE-02 · los catorce del Reglamento UE 1169/2011, y ni uno más", () => {
  it("son exactamente catorce", () => {
    expect(ALLERGENS).toHaveLength(14);
  });

  it("no hay ninguno repetido", () => {
    expect(new Set(ALLERGENS).size).toBe(ALLERGENS.length);
  });

  it("van en el orden del reglamento, que no es el alfabético", () => {
    expect(ALLERGENS[0]).toBe("gluten");
    expect(ALLERGENS[ALLERGENS.length - 1]).toBe("molluscs");
    expect([...ALLERGENS]).not.toEqual([...ALLERGENS].sort());
  });

  it("un código que no es del reglamento no es un alérgeno", () => {
    expect(isAllergen("gluten")).toBe(true);
    expect(isAllergen("tomate")).toBe(false);
    expect(isAllergen("")).toBe(false);
  });
});

describe("RN-ALE-06 · «sin alérgenos» y «sin declarar» no son lo mismo", () => {
  it("un plato del que nadie ha dicho nada está sin declarar", () => {
    expect(dishAllergenState(null)).toEqual({ kind: "undeclared" });
    expect(dishAllergenState(undefined)).toEqual({ kind: "undeclared" });
  });

  it("un plato declarado sin ninguno de los catorce NO está sin declarar", () => {
    expect(dishAllergenState(declarado([]))).toEqual({ kind: "none" });
  });

  it("un plato con alérgenos los devuelve con su nota", () => {
    expect(dishAllergenState(declarado(["milk", "gluten"], "puede contener trazas"))).toEqual({
      kind: "some",
      allergens: ["gluten", "milk"],
      note: "puede contener trazas",
    });
  });

  it("una nota sola, sin casillas, ya es una declaración con contenido", () => {
    expect(dishAllergenState(declarado([], "consultar al personal")).kind).toBe("some");
  });
});

describe("RN-ALE-05 · contar los platos sin declarar, para avisar y no para bloquear", () => {
  it("sin ninguna declaración, todos los platos cuentan, y la bebida también", () => {
    const vacio: MenuAllergens = { starters: [], mains: [], desserts: [], drink: null };
    expect(undeclaredCount(platos, vacio)).toBe(5);
  });

  it("un plato declarado «ninguno» ya no cuenta como hueco", () => {
    const parcial: MenuAllergens = {
      starters: [declarado([]), null],
      mains: [],
      desserts: [],
      drink: null,
    };
    expect(undeclaredCount(platos, parcial)).toBe(4);
  });

  it("cuando todo está declarado no queda ninguno", () => {
    const todo: MenuAllergens = {
      starters: [declarado(["milk"]), declarado([])],
      mains: [declarado(["fish"])],
      desserts: [declarado(["eggs", "milk"])],
      drink: declarado(["sulphites"]),
    };
    expect(undeclaredCount(platos, todo)).toBe(0);
  });

  it("un menú sin bebida no cuenta una bebida sin declarar", () => {
    const sinBebida = { ...platos, drink: null };
    const vacio: MenuAllergens = { starters: [], mains: [], desserts: [], drink: null };
    expect(undeclaredCount(sinBebida, vacio)).toBe(4);
  });
});

describe("RN-ALE-08 · el resumen del menú se deriva de los platos", () => {
  it("junta los de todos los platos, sin repetir y en el orden del reglamento", () => {
    const declarada: MenuAllergens = {
      starters: [declarado(["milk"]), declarado(["gluten", "milk"])],
      mains: [declarado(["fish"])],
      desserts: [declarado([])],
      drink: declarado(["sulphites"]),
    };
    expect(menuAllergenSummary(declarada)).toEqual(["gluten", "fish", "milk", "sulphites"]);
  });

  it("un menú sin ningún alérgeno declarado resume en nada", () => {
    const declarada: MenuAllergens = {
      starters: [declarado([])],
      mains: [],
      desserts: [],
      drink: null,
    };
    expect(menuAllergenSummary(declarada)).toEqual([]);
  });

  it("los platos sin declarar no aportan nada al resumen: no se sabe qué llevan", () => {
    const declarada: MenuAllergens = {
      starters: [null, declarado(["eggs"])],
      mains: [],
      desserts: [],
      drink: null,
    };
    expect(menuAllergenSummary(declarada)).toEqual(["eggs"]);
  });
});

describe("normalizeDishAllergens · lo que llega del formulario", () => {
  it("ordena por el reglamento y quita repetidos", () => {
    expect(normalizeDishAllergens(["milk", "gluten", "milk"], null).allergens).toEqual([
      "gluten",
      "milk",
    ]);
  });

  it("tira lo que no es uno de los catorce", () => {
    expect(normalizeDishAllergens(["gluten", "tomate"], null).allergens).toEqual(["gluten"]);
  });

  it("una nota en blanco es no tener nota", () => {
    expect(normalizeDishAllergens([], "   ").note).toBeNull();
    expect(normalizeDishAllergens([], null).note).toBeNull();
  });

  it("la nota se guarda sin espacios de sobra", () => {
    expect(normalizeDishAllergens([], "  trazas de soja ").note).toBe("trazas de soja");
  });
});

describe("resizeDeclarations · las declaraciones siguen a los platos por posición", () => {
  const leche = normalizeDishAllergens(["milk"], null);
  const huevos = normalizeDishAllergens(["eggs"], null);

  it("al añadir un plato al final, el nuevo nace sin declarar", () => {
    expect(resizeDeclarations([leche], 2)).toEqual([leche, null]);
  });

  it("al quitar el último, su declaración se va con él", () => {
    expect(resizeDeclarations([leche, huevos], 1)).toEqual([leche]);
  });

  it("sin platos no queda ninguna declaración", () => {
    expect(resizeDeclarations([leche, huevos], 0)).toEqual([]);
  });

  it("las declaraciones NO siguen al plato si alguien reordena: siguen a la posición", () => {
    // Es la consecuencia de que un plato sea una línea de texto sin
    // identidad, y la pantalla la enseña poniendo el nombre del plato al
    // lado de su declaración en vez de esconderla tras un número.
    const mismos = resizeDeclarations([leche, huevos], 2);
    expect(mismos[0]).toEqual(leche);
    expect(mismos[1]).toEqual(huevos);
  });
});

describe("dishNames · los platos que el editor tiene escritos ahora mismo", () => {
  it("quita las líneas en blanco y los espacios de sobra", () => {
    expect(dishNames("  Crema \n\n Ensalada\n  \n")).toEqual(["Crema", "Ensalada"]);
  });

  it("un cuadro vacío no tiene platos", () => {
    expect(dishNames("")).toEqual([]);
    expect(dishNames("   \n  ")).toEqual([]);
  });

  it("cuenta lo mismo que `linesToItems()`, que es quien guarda", () => {
    // Si la pantalla contara siete platos y el servidor recibiera seis, la
    // declaración no cuadraría y el guardado fallaría con un mensaje que
    // nadie entendería.
    const texto = "Crema\r\n  Ensalada  \n\nMerluza\n";
    expect(dishNames(texto)).toEqual([...linesToItems(texto)]);
  });
});
