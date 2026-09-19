import { describe, expect, it } from "vitest";

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

describe("RN-ALE-06 · la comparación dice si cambió la nota de alérgenos", () => {
  it("dos versiones sin nota no tienen nada que decir", () => {
    expect(diffMenuVersions(version(), version()).allergenNote).toBeNull();
    expect(diffMenuVersions(version(), version()).identical).toBe(true);
  });

  it("escribirla por primera vez es un cambio, y se dice de qué a qué", () => {
    const diff = diffMenuVersions(
      version(),
      version({ allergenNote: "Contiene gluten y lácteos." }),
    );
    expect(diff.allergenNote).toEqual({ before: null, after: "Contiene gluten y lácteos." });
    expect(diff.identical).toBe(false);
    expect(countMenuChanges(diff)).toBe(1);
  });

  it("quitarla también lo es: un menú que deja de declarar no es un menú igual", () => {
    const diff = diffMenuVersions(
      version({ allergenNote: "Contiene apio." }),
      version({ allergenNote: null }),
    );
    expect(diff.allergenNote).toEqual({ before: "Contiene apio.", after: null });
  });

  it("los espacios de sobra no son un cambio, igual que en los platos", () => {
    const diff = diffMenuVersions(
      version({ allergenNote: "Contiene apio." }),
      version({ allergenNote: "  Contiene apio.  " }),
    );
    expect(diff.allergenNote).toBeNull();
    expect(diff.identical).toBe(true);
  });

  it("cuenta como UN cambio, no como uno por alérgeno nombrado", () => {
    const diff = diffMenuVersions(
      version({ allergenNote: "Contiene gluten." }),
      version({ allergenNote: "Contiene gluten, lácteos, huevo y apio." }),
    );
    expect(countMenuChanges(diff)).toBe(1);
  });
});
