import { describe, expect, it } from "vitest";

import { loadGroups } from "./groups-load";

/**
 * RN-EST-20 · la lista de grupos no se cae si la web llega antes que la
 * migración 135, y un fallo de verdad no se enseña como "ningún grupo".
 */
type Respuesta = { data: unknown[] | null; error: { code: string } | null };

function falso(respuestas: Respuesta[]) {
  const pedidas: string[] = [];
  const cliente = {
    from: () => ({
      select: (columnas: string) => {
        pedidas.push(columnas);
        const respuesta = respuestas[pedidas.length - 1];
        const cadena = { eq: () => cadena, order: () => Promise.resolve(respuesta) };
        return cadena;
      },
    }),
  };
  return { cliente: cliente as unknown as Parameters<typeof loadGroups>[0], pedidas };
}

describe("RN-EST-20 · loadGroups", () => {
  it("con la 135, trae la descripción y deja pintar los formularios", async () => {
    const { cliente } = falso([
      { data: [{ id: "g-1", name: "Grupo A", description: "Centro", created_at: "x" }], error: null },
    ]);
    const carga = await loadGroups(cliente, "s-1");
    expect(carga).toEqual({
      rows: [{ id: "g-1", name: "Grupo A", description: "Centro", created_at: "x" }],
      failed: false,
      rn20Available: true,
    });
  });

  it("sin la columna, vuelve a pedir sin ella y dice que la 135 no está", async () => {
    const { cliente, pedidas } = falso([
      { data: null, error: { code: "42703" } },
      { data: [{ id: "g-1", name: "Grupo A", created_at: "x" }], error: null },
    ]);
    const carga = await loadGroups(cliente, "s-1");
    expect(pedidas[1]).not.toContain("description");
    expect(carga.rows[0]?.description).toBeNull();
    expect(carga.rn20Available).toBe(false);
    expect(carga.failed).toBe(false);
  });

  it("si tampoco se puede leer así, es un fallo, no una lista vacía (CA-20)", async () => {
    const { cliente } = falso([
      { data: null, error: { code: "42703" } },
      { data: null, error: { code: "500" } },
    ]);
    expect(await loadGroups(cliente, "s-1")).toEqual({ rows: [], failed: true, rn20Available: false });
  });
});
