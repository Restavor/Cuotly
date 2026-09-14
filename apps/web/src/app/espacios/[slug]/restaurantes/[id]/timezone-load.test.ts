import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_TIMEZONE, loadEstablishmentTimezone } from "./timezone-load";

/**
 * CLAUDE.md · "las fechas se guardan en `timestamptz` y se calculan en la
 * zona horaria del espacio".
 *
 * **Por qué este test existe.** Las cuatro pantallas del restaurante
 * tenían `"Europe/Madrid"` escrito en el código porque un restaurante no
 * puede leer `spaces`. Con un solo espacio eso da la hora correcta, y por
 * eso el fallo no se veía: el día que hay un espacio en otra zona, su
 * restaurante ve las fechas corridas y nada falla. Lo que se comprueba
 * aquí es lo único que un test sin base de datos puede comprobar: que el
 * cargador devuelve **lo que dice el servidor** y no una constante, y que
 * cuando el servidor no lo dice, se nota.
 *
 * Que la función del servidor devuelva la zona del espacio correcto y se
 * la niegue a un espacio ajeno lo comprueba
 * `supabase/tests/zona_horaria_del_restaurante.sql`, cuyo espacio está en
 * Atlantic/Canary a propósito.
 */

const ESTABLECIMIENTO = "11111111-1111-1111-1111-111111111111";

const rpc = vi.fn();
const supabase = { rpc } as unknown as Parameters<typeof loadEstablishmentTimezone>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("la zona horaria del restaurante sale del espacio, no del código", () => {
  it("devuelve la zona que da el servidor, y no la de Restavor", async () => {
    rpc.mockResolvedValue({ data: "Atlantic/Canary", error: null });

    const zona = await loadEstablishmentTimezone(supabase, ESTABLECIMIENTO);

    expect(zona).toBe("Atlantic/Canary");
    expect(zona).not.toBe(DEFAULT_TIMEZONE);
    expect(rpc).toHaveBeenCalledWith("establishment_timezone", {
      p_establishment_id: ESTABLECIMIENTO,
    });
  });

  it("si el servidor da error, usa el valor por defecto de la columna y lo deja dicho", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    const zona = await loadEstablishmentTimezone(supabase, ESTABLECIMIENTO);

    // Una fecha hay que pintarla: quedarse sin pantalla es peor. Pero no
    // se calla, porque entonces volvería a ser invisible.
    expect(zona).toBe(DEFAULT_TIMEZONE);
    expect(console.error).toHaveBeenCalled();
  });

  it("una respuesta vacía tampoco pasa por buena", async () => {
    rpc.mockResolvedValue({ data: "", error: null });

    expect(await loadEstablishmentTimezone(supabase, ESTABLECIMIENTO)).toBe(DEFAULT_TIMEZONE);
    expect(console.error).toHaveBeenCalled();
  });
});
