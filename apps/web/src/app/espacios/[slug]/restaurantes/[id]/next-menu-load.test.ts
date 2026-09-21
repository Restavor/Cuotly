import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadSheetNextMenu } from "./sheet-load";

/**
 * Página 24 · de dónde sale "Próxima publicación de menú".
 *
 * Sin base de datos solo se puede comprobar una cosa, y es justo la que
 * se puede romper sin que nada falle de forma visible: **qué se le pide
 * al servidor**. Las dos decisiones que viven aquí son de negocio, no de
 * presentación:
 *
 *   · Un menú **cancelado no es una publicación que venga**. Si el filtro
 *     desaparece, la ficha anuncia como próxima una que nadie va a
 *     publicar.
 *   · "De hoy en adelante" se mide con el día de hoy **en la zona del
 *     espacio** (CLAUDE.md), no con la del servidor. A las 00:30 de
 *     Madrid en UTC todavía es ayer, y el menú de hoy dejaría de ser el
 *     próximo sin que nada avisara.
 *
 * Que las filas que devuelve sean las que RLS deja ver es cosa del
 * servidor, no de este cargador.
 */
const ESTABLECIMIENTO = "11111111-1111-1111-1111-111111111111";

/** Una consulta encadenada de Supabase que recuerda con qué la llamaron. */
function consultaFalsa(filas: unknown[]) {
  const llamadas: Record<string, unknown[]> = {};
  const cadena: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "gte", "neq", "order"]) {
    cadena[metodo] = vi.fn((...args: unknown[]) => {
      llamadas[metodo] = args;
      return cadena;
    });
  }
  cadena.limit = vi.fn((...args: unknown[]) => {
    llamadas.limit = args;
    return Promise.resolve({ data: filas, error: null });
  });
  return { cadena, llamadas };
}

const rpc = vi.fn();
let consulta: ReturnType<typeof consultaFalsa>;

function cliente(filas: unknown[]) {
  consulta = consultaFalsa(filas);
  return {
    rpc,
    from: vi.fn(() => consulta.cadena),
  } as unknown as Parameters<typeof loadSheetNextMenu>[0];
}

beforeEach(() => vi.clearAllMocks());

describe("página 24 · qué se le pide al servidor para el próximo menú", () => {
  it("sin servicio contratado NI SIQUIERA pregunta por los menús", async () => {
    // `menu_update_balance()` no devuelve fila cuando no hay servicio.
    rpc.mockResolvedValue({ data: [], error: null });
    const supabase = cliente([]);

    await expect(loadSheetNextMenu(supabase, ESTABLECIMIENTO, "Europe/Madrid")).resolves.toEqual({
      kind: "no_service",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("excluye los cancelados: un menú cancelado no es una publicación que venga", async () => {
    rpc.mockResolvedValue({ data: [{ available: 3 }], error: null });
    const supabase = cliente([]);

    await loadSheetNextMenu(supabase, ESTABLECIMIENTO, "Europe/Madrid");

    expect(consulta.llamadas.neq).toEqual(["state", "cancelled"]);
  });

  it("«de hoy en adelante» se mide en la zona del ESPACIO, no en la del servidor", async () => {
    rpc.mockResolvedValue({ data: [{ available: 3 }], error: null });
    const supabase = cliente([]);

    /*
      00:30 del 21 de septiembre en Madrid. En UTC todavía es el 20, así
      que el instante separa las dos maneras de contar: en la zona del
      espacio hoy es 21, y con la fecha del servidor saldría 20.

      La primera versión de esta prueba usaba las 23:30 de Madrid, donde
      las dos fechas coinciden: no separaba nada y sobrevivía a la
      mutación que cambia `todayInTimeZone()` por la fecha del servidor.
      La prueba estaba mal, no el código.
    */
    const medianocheDeMadrid = new Date("2026-09-20T22:30:00.000Z");
    expect(medianocheDeMadrid.toISOString().slice(0, 10)).toBe("2026-09-20");

    await loadSheetNextMenu(supabase, ESTABLECIMIENTO, "Europe/Madrid", medianocheDeMadrid);

    expect(consulta.llamadas.gte).toEqual(["target_date", "2026-09-21"]);
  });

  it("pide el más próximo primero, y solo uno", async () => {
    rpc.mockResolvedValue({ data: [{ available: 3 }], error: null });
    const supabase = cliente([]);

    await loadSheetNextMenu(supabase, ESTABLECIMIENTO, "Europe/Madrid");

    expect(consulta.llamadas.order).toEqual(["target_date", { ascending: true }]);
    expect(consulta.llamadas.limit).toEqual([1]);
  });

  it("con servicio y sin menús por delante dice que no hay ninguno", async () => {
    rpc.mockResolvedValue({ data: [{ available: 3 }], error: null });

    await expect(
      loadSheetNextMenu(cliente([]), ESTABLECIMIENTO, "Europe/Madrid"),
    ).resolves.toEqual({ kind: "none" });
  });

  it("devuelve el menú tal cual lo da el servidor", async () => {
    rpc.mockResolvedValue({ data: [{ available: 3 }], error: null });
    const supabase = cliente([
      {
        id: "m1",
        name: "Menú semanal",
        kind: "daily",
        target_date: "2026-10-07",
        state: "ready_to_publish",
      },
    ]);

    await expect(loadSheetNextMenu(supabase, ESTABLECIMIENTO, "Europe/Madrid")).resolves.toEqual({
      kind: "menu",
      id: "m1",
      name: "Menú semanal",
      menuKind: "daily",
      targetDate: "2026-10-07",
      state: "ready_to_publish",
    });
  });
});
