import { describe, expect, it } from "vitest";

import {
  NO_TEMPLATE,
  filterClientMenus,
  menuMonths,
  menuPendingChanges,
  publicationSteps,
  readClientMenuFilters,
} from "./client-menus";

const menus = [
  { id: "a", target_date: "2026-09-16", state: "draft", template_id: "t1" },
  { id: "b", target_date: "2026-09-15", state: "published", template_id: "t2" },
  { id: "c", target_date: "2026-08-30", state: "published", template_id: null },
];

describe("R13 · los filtros del listado de menús", () => {
  it("lee mes, estado y plantilla, y descarta un mes mal escrito", () => {
    expect(readClientMenuFilters({ mes: "2026-09", estado: "draft", plantilla: "t1" })).toEqual({
      month: "2026-09",
      state: "draft",
      template: "t1",
    });
    expect(readClientMenuFilters({ mes: "septiembre" }).month).toBeNull();
  });

  it("filtra por mes, por estado y por plantilla, con «sin plantilla»", () => {
    const sin = { month: null, state: null, template: null };
    expect(filterClientMenus(menus, { ...sin, month: "2026-09" }).map((m) => m.id)).toEqual(["a", "b"]);
    expect(filterClientMenus(menus, { ...sin, state: "published" }).map((m) => m.id)).toEqual(["b", "c"]);
    expect(filterClientMenus(menus, { ...sin, template: NO_TEMPLATE }).map((m) => m.id)).toEqual(["c"]);
  });

  it("los meses salen de los menús que hay, el más reciente primero", () => {
    expect(menuMonths(menus.map((m) => m.target_date))).toEqual(["2026-09", "2026-08"]);
  });
});

const v = (version: number, created_at: string) => ({ id: `v${version}`, version, created_at });

describe("A18 · los cambios que todavía no están publicados", () => {
  it("con contenido y sin pedir, dice qué versión se pediría", () => {
    expect(
      menuPendingChanges({
        state: "prepared",
        versions: [v(1, "2026-09-15T10:00:00Z"), v(2, "2026-09-15T11:00:00Z")],
        lastRequestAt: null,
        publishedVersionId: null,
      }),
    ).toEqual({ kind: "not_requested", version: 2, publishedVersion: null });
  });

  it("RN-CRE-30 · el menú del día publicado y editado vuelve a borrador y dice qué versión sigue en la web", () => {
    expect(
      menuPendingChanges({
        state: "draft",
        versions: [v(1, "2026-09-15T10:00:00Z"), v(2, "2026-09-16T09:00:00Z")],
        lastRequestAt: "2026-09-15T12:00:00Z",
        publishedVersionId: "v1",
      }),
    ).toEqual({ kind: "not_requested", version: 2, publishedVersion: 1 });
  });

  it("sin ninguna versión no hay nada que publicar", () => {
    expect(menuPendingChanges({ state: "draft", versions: [], lastRequestAt: null, publishedVersionId: null })).toBeNull();
  });

  it("RN-CRE-24 · guardado después de pedir: lo avisa, sin marca de hora de corte", () => {
    expect(
      menuPendingChanges({
        state: "assigned",
        versions: [v(1, "2026-09-15T10:00:00Z"), v(2, "2026-09-15T22:30:00Z")],
        lastRequestAt: "2026-09-15T12:00:00Z",
        publishedVersionId: null,
      }),
    ).toEqual({ kind: "saved_after_request", version: 2 });
  });

  it("pedido y sin cambios después, no hay aviso; publicado, tampoco", () => {
    expect(
      menuPendingChanges({
        state: "assigned",
        versions: [v(1, "2026-09-15T10:00:00Z")],
        lastRequestAt: "2026-09-15T12:00:00Z",
        publishedVersionId: null,
      }),
    ).toBeNull();
    expect(
      menuPendingChanges({
        state: "published",
        versions: [v(1, "2026-09-15T10:00:00Z")],
        lastRequestAt: "2026-09-15T12:00:00Z",
        publishedVersionId: "v1",
      }),
    ).toBeNull();
  });
});

describe("R17 · RN-MEN-09 · los tres pasos de la publicación sobre los once estados", () => {
  const resumen = (s: Parameters<typeof publicationSteps>[0]) => publicationSteps(s).map((p) => p.status).join(",");
  it("sin pedir, nada; pedida, en preparación; falta información, espera al restaurante", () => {
    expect(resumen("prepared")).toBe("pending,pending,pending");
    expect(resumen("pending_assignment")).toBe("done,current,pending");
    expect(resumen("needs_information")).toBe("done,waiting,pending");
  });
  it("publicada, los tres hechos; con error, el último se corta", () => {
    expect(resumen("published")).toBe("done,done,done");
    expect(resumen("publication_error")).toBe("done,done,stopped");
  });
});
