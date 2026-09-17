import { describe, expect, it } from "vitest";

import type { Allergen } from "./allergens";

import {
  countMenuChanges,
  diffMenuVersions,
  parseSimultaneousEditVersion,
  type MenuVersionContent,
} from "./menu-diff";

function version(extra: Partial<MenuVersionContent> = {}): MenuVersionContent {
  return {
    starters: ["Crema de calabaza", "Ensalada"],
    mains: ["Merluza"],
    desserts: ["Flan"],
    drink: "Agua o vino",
    priceCents: 1400,
    note: null,
    ...extra,
  };
}

describe("comparar dos versiones de un menú (R18, A17)", () => {
  it("R18: dos versiones iguales no tienen nada que enseñar", () => {
    const diff = diffMenuVersions(version(), version());
    expect(diff.identical).toBe(true);
    expect(countMenuChanges(diff)).toBe(0);
  });

  it("R18: dice qué plato entró y cuál salió, con el texto tal cual se escribió", () => {
    const diff = diffMenuVersions(
      version(),
      version({ starters: ["Ensalada", "Sopa de picadillo"] }),
    );

    const entrantes = diff.courses.find((c) => c.course === "starters")!;
    expect(entrantes.added).toEqual(["Sopa de picadillo"]);
    expect(entrantes.removed).toEqual(["Crema de calabaza"]);
    expect(diff.identical).toBe(false);
  });

  it("R18: mover un plato de sitio no es cambiar la carta, y se dice aparte", () => {
    const diff = diffMenuVersions(
      version(),
      version({ starters: ["Ensalada", "Crema de calabaza"] }),
    );

    const entrantes = diff.courses.find((c) => c.course === "starters")!;
    expect(entrantes.added).toEqual([]);
    expect(entrantes.removed).toEqual([]);
    expect(entrantes.reordered).toBe(true);
    // Un reordenamiento es UN hecho, no dos platos.
    expect(countMenuChanges(diff)).toBe(1);
  });

  it("R18: un espacio de sobra o una mayúscula no son un cambio", () => {
    const diff = diffMenuVersions(
      version(),
      version({ starters: ["  crema de calabaza  ", "ENSALADA"] }),
    );
    expect(diff.identical).toBe(true);
  });

  it("R18: el precio, la bebida y la nota se comparan cada uno por su lado", () => {
    const diff = diffMenuVersions(
      version(),
      version({ priceCents: 1500, drink: "Agua", note: "Sin gluten a petición" }),
    );

    expect(diff.price).toEqual({ before: 1400, after: 1500 });
    expect(diff.drink).toEqual({ before: "Agua o vino", after: "Agua" });
    expect(diff.note).toEqual({ before: null, after: "Sin gluten a petición" });
    expect(countMenuChanges(diff)).toBe(3);
  });

  it("R18: quitar el precio es un cambio, no «lo mismo»", () => {
    const diff = diffMenuVersions(version(), version({ priceCents: null }));
    expect(diff.price).toEqual({ before: 1400, after: null });
    expect(diff.identical).toBe(false);
  });

  it("A17: del error de edición simultánea se saca el número de versión real", () => {
    expect(
      parseSimultaneousEditVersion("EDICION_SIMULTANEA: el menú va por la versión 4, no por la 2"),
    ).toBe(4);
  });

  it("A17: cualquier otro error NO se interpreta como conflicto", () => {
    // Si esto devolviera un número, un fallo de red se enseñaría como
    // "alguien guardó mientras escribías" y mandaría a comparar dos
    // versiones que son la misma.
    expect(parseSimultaneousEditVersion("No tienes permiso para editar este menú")).toBeNull();
    expect(parseSimultaneousEditVersion("")).toBeNull();
  });
});

describe("RN-ALE-07 · la comparación enseña qué cambió en los alérgenos", () => {
  const base = {
    starters: ["Crema", "Ensalada"],
    mains: ["Merluza"],
    desserts: ["Flan"],
    drink: "Vino",
    priceCents: 1450,
    note: null,
  };

  const decl = (allergens: Allergen[], note: string | null = null) => ({ allergens, note });

  it("dos versiones sin declaración no tienen nada que decir de alérgenos", () => {
    expect(diffMenuVersions(base, base).allergens).toEqual([]);
    expect(diffMenuVersions(base, base).identical).toBe(true);
  });

  it("dice el plato por su NOMBRE, no por su posición", () => {
    const antes = {
      ...base,
      allergens: { starters: [decl(["milk"]), null], mains: [null], desserts: [null], drink: null },
    };
    const despues = {
      ...base,
      allergens: { starters: [decl([]), null], mains: [null], desserts: [null], drink: null },
    };
    const cambios = diffMenuVersions(antes, despues).allergens;
    expect(cambios).toHaveLength(1);
    expect(cambios[0].dishAfter).toBe("Crema");
    expect(cambios[0].removed).toEqual(["milk"]);
    expect(cambios[0].added).toEqual([]);
  });

  it("RN-ALE-06 · pasar de sin declarar a declarado es un cambio, aunque no lleve ninguno", () => {
    const antes = {
      ...base,
      allergens: { starters: [null, null], mains: [null], desserts: [null], drink: null },
    };
    const despues = {
      ...base,
      allergens: { starters: [decl([]), null], mains: [null], desserts: [null], drink: null },
    };
    const cambios = diffMenuVersions(antes, despues).allergens;
    expect(cambios).toHaveLength(1);
    expect(cambios[0].declarationChanged).toBe("declared");
  });

  it("y quitar la declaración también lo es", () => {
    const antes = {
      ...base,
      allergens: { starters: [decl(["milk"]), null], mains: [null], desserts: [null], drink: null },
    };
    const despues = {
      ...base,
      allergens: { starters: [null, null], mains: [null], desserts: [null], drink: null },
    };
    expect(diffMenuVersions(antes, despues).allergens[0].declarationChanged).toBe("undeclared");
  });

  it("la nota de un plato cuenta como cambio", () => {
    const antes = {
      ...base,
      allergens: { starters: [decl(["milk"]), null], mains: [null], desserts: [null], drink: null },
    };
    const despues = {
      ...base,
      allergens: {
        starters: [decl(["milk"], "puede contener trazas"), null],
        mains: [null],
        desserts: [null],
        drink: null,
      },
    };
    const cambios = diffMenuVersions(antes, despues).allergens;
    expect(cambios).toHaveLength(1);
    expect(cambios[0].noteChanged).toBe(true);
  });

  it("la bebida se compara igual que un plato", () => {
    const antes = {
      ...base,
      allergens: { starters: [null, null], mains: [null], desserts: [null], drink: null },
    };
    const despues = {
      ...base,
      allergens: {
        starters: [null, null],
        mains: [null],
        desserts: [null],
        drink: decl(["sulphites"]),
      },
    };
    const cambios = diffMenuVersions(antes, despues).allergens;
    expect(cambios).toHaveLength(1);
    expect(cambios[0].course).toBe("drink");
    expect(cambios[0].added).toEqual(["sulphites"]);
  });

  it("un plato con la declaración cambiada cuenta como UN cambio, no como tres casillas", () => {
    const antes = {
      ...base,
      allergens: { starters: [decl([]), null], mains: [null], desserts: [null], drink: null },
    };
    const despues = {
      ...base,
      allergens: {
        starters: [decl(["gluten", "milk", "eggs"]), null],
        mains: [null],
        desserts: [null],
        drink: null,
      },
    };
    expect(countMenuChanges(diffMenuVersions(antes, despues))).toBe(1);
  });
});
