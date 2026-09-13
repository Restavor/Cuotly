import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RN-MEN-10 · lo que se entrega es lo que se REGISTRÓ.
 *
 * **Por qué este test existe.** La ruta llamaba a
 * `register_menu_download()` —que graba en `menu_downloads` la versión y
 * la plantilla exactas, con la fila del menú bloqueada— y a continuación
 * volvía a leer `menus` para pintar. Parecía equivalente y no lo es: el
 * bloqueo se suelta al devolver la función, así que un guardado del
 * restaurante entre las dos consultas entregaba un archivo distinto del
 * que consta en el historial. La revisión del Hito 10 (13/09/2026) lo
 * encontró leyendo el código; esto es lo que impide que vuelva.
 *
 * El test reproduce exactamente esa carrera: el menú cambia de versión
 * DESPUÉS de registrar. Si la ruta releyera `menus`, pintaría la versión
 * nueva; tiene que pintar la registrada.
 *
 * Lo que NO se prueba aquí y ya está cubierto en el servidor
 * (`supabase/tests/menu_diario_descargas_y_plantillas.sql`): quién puede
 * descargar, que no consuma, que registre, y el paso a "listo para
 * publicar". Eso lo decide `register_menu_download()`, no esta ruta — y
 * un test de la ruta que lo imitara probaría el imitador.
 */

const buildMenuDocumentMock = vi.hoisted(() => vi.fn());
const renderMenuPngMock = vi.hoisted(() => vi.fn());
const renderMenuPdfMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/core/menu-render", async (original) => ({
  ...(await original<typeof import("@/core/menu-render")>()),
  buildMenuDocument: buildMenuDocumentMock,
}));

vi.mock("@/services/menu-image", () => ({
  renderMenuPng: renderMenuPngMock,
  renderMenuPdf: renderMenuPdfMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock, from: fromMock }),
}));

import { GET } from "./route";

const MENU = "11111111-1111-1111-1111-111111111111";
const DESCARGA = "22222222-2222-2222-2222-222222222222";
/** La versión que la descarga registró. */
const VERSION_REGISTRADA = "33333333-3333-3333-3333-333333333333";
/** La que el restaurante guardó justo después: NO es la que se entrega. */
const VERSION_POSTERIOR = "44444444-4444-4444-4444-444444444444";
const PLANTILLA = "55555555-5555-5555-5555-555555555555";

/**
 * Una tabla falsa con el mínimo que la ruta encadena
 * (`.select().eq().maybeSingle()`).
 */
function tabla(filas: Record<string, unknown>) {
  return {
    select: () => ({
      eq: (_columna: string, valor: string) => ({
        maybeSingle: async () => ({ data: filas[valor] ?? null, error: null }),
      }),
    }),
  };
}

function peticion(formato = "png") {
  return new Request(`http://localhost:3000/x/descargar?formato=${formato}`);
}

const params = Promise.resolve({ slug: "demo", id: "est-1", menuId: MENU });

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
  rpcMock.mockResolvedValue({ data: DESCARGA, error: null });
  buildMenuDocumentMock.mockReturnValue({ heading: "H", subheading: "S" });
  renderMenuPngMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
  renderMenuPdfMock.mockResolvedValue(new Uint8Array([4, 5, 6]));

  fromMock.mockImplementation((nombre: string) => {
    if (nombre === "menu_downloads") {
      return tabla({
        [DESCARGA]: {
          menu_id: MENU,
          establishment_id: "est-1",
          version_id: VERSION_REGISTRADA,
          template_id: PLANTILLA,
        },
      });
    }
    if (nombre === "menus") {
      // El menú ya va por otra versión: es la carrera que se prueba.
      return tabla({ [MENU]: { name: "Menú del día", target_date: "2026-09-20", current_version_id: VERSION_POSTERIOR, template_id: PLANTILLA } });
    }
    if (nombre === "menu_versions") {
      return tabla({
        [VERSION_REGISTRADA]: {
          version: 3,
          starters: ["Sopa"],
          mains: ["Merluza"],
          desserts: ["Flan"],
          drink: "Agua",
          price_cents: 1500,
          note: null,
        },
        [VERSION_POSTERIOR]: {
          version: 4,
          starters: ["Otra cosa"],
          mains: [],
          desserts: [],
          drink: null,
          price_cents: null,
          note: null,
        },
      });
    }
    if (nombre === "menu_templates") {
      return tabla({
        [PLANTILLA]: {
          layout: "classic",
          background_color: "#FFFFFF",
          text_color: "#1F2937",
          accent_color: "#145C4E",
          heading_text: null,
          footer_text: null,
          show_prices: true,
        },
      });
    }
    return tabla({ "est-1": { name: "Magariños" } });
  });
});

afterEach(() => vi.clearAllMocks());

describe("RN-MEN-10 · descargar un menú entrega lo que quedó registrado", () => {
  it("pinta la versión que registró la descarga, no la que el menú tiene ahora", async () => {
    const respuesta = await GET(peticion(), { params });

    expect(respuesta.status).toBe(200);
    const documento = buildMenuDocumentMock.mock.calls[0][0];
    expect(documento.version).toBe(3);
    expect(documento.content.starters).toEqual(["Sopa"]);
  });

  it("registra ANTES de pintar: si el registro falla, no se entrega nada", async () => {
    // El permiso lo decide `register_menu_download()` (CLAUDE.md: la
    // validación es del servidor). Su negativa tiene que cortar aquí, y
    // con 404: un 403 confirmaría que el menú existe.
    rpcMock.mockResolvedValue({ data: null, error: { message: "Menú no encontrado" } });

    const respuesta = await GET(peticion(), { params });

    expect(respuesta.status).toBe(404);
    expect(renderMenuPngMock).not.toHaveBeenCalled();
  });

  it("un formato que no es png ni pdf no llega siquiera a registrar", async () => {
    const respuesta = await GET(peticion("jpg"), { params });

    expect(respuesta.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sin sesión no se registra ninguna descarga", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const respuesta = await GET(peticion(), { params });

    expect(respuesta.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
