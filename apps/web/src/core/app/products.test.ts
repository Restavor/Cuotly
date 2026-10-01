import { describe, expect, it } from "vitest";

import {
  homeBehavior,
  productSwitchItems,
  summarizeProducts,
  type ProductRow,
  type ProductRowKind,
} from "./products";

function fila(kind: ProductRowKind, nombre: string | null = null, detail: string | null = null): ProductRow {
  return {
    kind,
    spaceId: "e1",
    spaceSlug: "espacio",
    establishmentId: nombre === null ? null : `id-${nombre}`,
    establishmentName: nombre,
    detail,
    reason: null,
    at: null,
  };
}

describe("RN-APP-02 · cuándo se enseña el Inicio de Restavor app", () => {
  it("RN-APP-02 · con dos productos se enseña el Inicio", () => {
    const s = summarizeProducts([fila("web", "A", "panel"), fila("agents", "A", "active")]);
    expect(homeBehavior(s)).toEqual({ kind: "show" });
  });

  it("RN-APP-02 · un trabajador del espacio, con solo Restavor web, entra directo en Restavor web", () => {
    const s = summarizeProducts([fila("web", null, "team")]);
    expect(homeBehavior(s)).toEqual({ kind: "redirect", to: "/web" });
  });

  it("RN-APP-02 · un restaurante solo con Reservas entra directo en Restavor agents", () => {
    const s = summarizeProducts([fila("agents", "A", "active")]);
    expect(homeBehavior(s)).toEqual({ kind: "redirect", to: "/agents" });
  });

  it("RN-APP-02 · con un producto y algo que contratar se enseña el Inicio", () => {
    const s = summarizeProducts([fila("web", "A", "panel"), fila("agents_offer", "A")]);
    expect(homeBehavior(s)).toEqual({ kind: "show" });
  });

  it("RN-APP-02 · con un producto y una solicitud enviada se enseña el Inicio", () => {
    const s = summarizeProducts([fila("web", "A", "panel"), fila("agents_requests", "A", "requested")]);
    expect(homeBehavior(s)).toEqual({ kind: "show" });
  });

  it("RN-APP-02 · sin ningún producto se enseña el Inicio, que dice por qué", () => {
    expect(homeBehavior(summarizeProducts([]))).toEqual({ kind: "show" });
    const soloSolicitud = summarizeProducts([fila("agents_requests", "A", "requested")]);
    expect(homeBehavior(soloSolicitud)).toEqual({ kind: "show" });
  });

  it("RN-APP-02 · quien es de Restavor web entra en Restavor web aunque no sea miembro de ningún espacio", () => {
    expect(homeBehavior(summarizeProducts([]), { isPlatform: true })).toEqual({
      kind: "redirect",
      to: "/web",
    });
    // ...y con Reservas contratada, tiene los dos.
    const dos = summarizeProducts([fila("agents", "A", "active")]);
    expect(homeBehavior(dos, { isPlatform: true })).toEqual({ kind: "show" });
  });
});

describe("RN-APP-01 · qué ofrece el menú del logo", () => {
  it("RN-APP-01 · con los dos productos salen los tres destinos y se marca dónde está", () => {
    const s = summarizeProducts([fila("web", "A", "panel"), fila("agents", "A", "active")]);
    expect(productSwitchItems(s, "agents")).toEqual([
      { key: "app", href: "/", state: "open" },
      { key: "web", href: "/web", state: "open" },
      { key: "agents", href: "/agents", state: "current" },
    ]);
  });

  it("RN-APP-01 · quien solo tiene Reservas ve Restavor web con «Contratar»", () => {
    const s = summarizeProducts([fila("agents", "A", "active")]);
    expect(productSwitchItems(s, "agents")[1]).toEqual({ key: "web", href: "/", state: "contract" });
  });

  it("RN-APP-01 · quien solo tiene web y se le puede ofrecer Reservas ve «Contratar»; si no, no sale", () => {
    const conOferta = summarizeProducts([fila("web", "A", "panel"), fila("agents_offer", "A")]);
    expect(productSwitchItems(conOferta, "web").map((i) => [i.key, i.state])).toEqual([
      ["app", "open"],
      ["web", "current"],
      ["agents", "contract"],
    ]);
    const sinOferta = summarizeProducts([fila("web", null, "team")]);
    expect(productSwitchItems(sinOferta, "web").map((i) => i.key)).toEqual(["app", "web"]);
  });
});
