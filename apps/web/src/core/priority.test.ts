import { describe, expect, it } from "vitest";

import { compareClientRank, moveInOrder, orderTeamJobs } from "./priority";

describe("mover un cambio dentro del orden del restaurante", () => {
  const lista = ["a", "b", "c"];

  it("sube y baja intercambiando con el vecino", () => {
    expect(moveInOrder(lista, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(lista, 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("el primero no sube y el último no baja", () => {
    // `null` y no "la lista igual": devolver la lista haría que quien
    // llama la mandara al servidor y quedara un apunte de auditoría de un
    // cambio que no cambió nada.
    expect(moveInOrder(lista, 0, -1)).toBeNull();
    expect(moveInOrder(lista, 2, 1)).toBeNull();
  });

  it("una posición que no existe no mueve nada", () => {
    expect(moveInOrder(lista, 7, -1)).toBeNull();
    expect(moveInOrder(lista, -1, 1)).toBeNull();
    expect(moveInOrder(lista, 1.5, 1)).toBeNull();
    expect(moveInOrder([], 0, 1)).toBeNull();
  });

  it("no toca la lista que recibe", () => {
    const original = ["a", "b", "c"];
    moveInOrder(original, 0, 1);
    expect(original).toEqual(["a", "b", "c"]);
  });
});

describe("el orden del restaurante mueve la bandeja del equipo", () => {
  // Fechas de creación decrecientes: sin prioridad, la bandeja sale así.
  const porFecha = [
    { jobId: "nuevo", priorityRank: null, createdAt: "2026-09-10T10:00:00.000Z" },
    { jobId: "medio", priorityRank: null, createdAt: "2026-09-09T10:00:00.000Z" },
    { jobId: "viejo", priorityRank: null, createdAt: "2026-09-08T10:00:00.000Z" },
  ];

  it("sin nada ordenado, lo más reciente arriba (la bandeja de siempre)", () => {
    expect(orderTeamJobs(porFecha).map((j) => j.jobId)).toEqual(["nuevo", "medio", "viejo"]);
  });

  it("lo que el restaurante ha puesto primero se adelanta a lo más reciente", () => {
    const bandeja = [
      { jobId: "nuevo", priorityRank: null, createdAt: "2026-09-10T10:00:00.000Z" },
      { jobId: "viejo-pero-el-primero", priorityRank: 1, createdAt: "2026-09-08T10:00:00.000Z" },
    ];
    expect(orderTeamJobs(bandeja).map((j) => j.jobId)).toEqual([
      "viejo-pero-el-primero",
      "nuevo",
    ]);
  });

  it("los ordenados van por su puesto y los demás detrás, por fecha", () => {
    const bandeja = [
      { jobId: "sin-ordenar-viejo", priorityRank: null, createdAt: "2026-09-01T10:00:00.000Z" },
      { jobId: "tercero", priorityRank: 3, createdAt: "2026-09-10T10:00:00.000Z" },
      { jobId: "sin-ordenar-nuevo", priorityRank: null, createdAt: "2026-09-09T10:00:00.000Z" },
      { jobId: "primero", priorityRank: 1, createdAt: "2026-09-02T10:00:00.000Z" },
      { jobId: "segundo", priorityRank: 2, createdAt: "2026-09-03T10:00:00.000Z" },
    ];
    expect(orderTeamJobs(bandeja).map((j) => j.jobId)).toEqual([
      "primero",
      "segundo",
      "tercero",
      "sin-ordenar-nuevo",
      "sin-ordenar-viejo",
    ]);
  });

  it("dos restaurantes se intercalan: primero lo más importante de cada uno", () => {
    // El "1" de uno y el "1" de otro no son el mismo 1. Compararlos
    // intercala, que es justo lo que se quiere: ningún restaurante cuela
    // su lista entera por delante de la de otro por tener plan.
    const bandeja = [
      { jobId: "A-2", priorityRank: 2, createdAt: "2026-09-10T10:00:00.000Z" },
      { jobId: "B-1", priorityRank: 1, createdAt: "2026-09-01T10:00:00.000Z" },
      { jobId: "A-1", priorityRank: 1, createdAt: "2026-09-11T10:00:00.000Z" },
      { jobId: "B-2", priorityRank: 2, createdAt: "2026-09-02T10:00:00.000Z" },
    ];
    expect(orderTeamJobs(bandeja).map((j) => j.jobId)).toEqual(["A-1", "B-1", "A-2", "B-2"]);
  });

  it("no toca la lista que recibe", () => {
    const original = [...porFecha];
    orderTeamJobs(original);
    expect(original.map((j) => j.jobId)).toEqual(["nuevo", "medio", "viejo"]);
  });
});

describe("comparar dos puestos", () => {
  it("el menor manda y el que no tiene va detrás", () => {
    expect(compareClientRank(1, 2)).toBeLessThan(0);
    expect(compareClientRank(2, 1)).toBeGreaterThan(0);
    expect(compareClientRank(1, null)).toBeLessThan(0);
    expect(compareClientRank(null, 9)).toBeGreaterThan(0);
    expect(compareClientRank(null, null)).toBe(0);
    expect(compareClientRank(3, 3)).toBe(0);
  });
});
