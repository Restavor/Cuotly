import { describe, expect, it, vi } from "vitest";

import { ESTABLISHMENT_PHOTO_LINK_TTL_SECONDS, type StorageClient } from "@/services/file-storage";
import { loadEstablishmentPhoto, loadEstablishmentPhotos } from "@/services/establishment-photo";

/**
 * RN-EST-18 · el adaptador de la foto del restaurante (decisión 62).
 *
 * Lo que vigila, por orden de importancia:
 *
 *   · Que **una llamada resuelva toda la lista**. La lista de
 *     Restaurantes no pagina: si alguien vuelve a preguntar de una en una,
 *     la pantalla hace tantos viajes como restaurantes tenga el espacio y
 *     nadie se entera hasta que el espacio crece.
 *   · Que un restaurante **sin foto no salga en el mapa**, en vez de salir
 *     con la ruta a nulo. Son la misma cosa para la pantalla solo si
 *     alguien se acuerda de tratarlas igual, y RN-EST-18 dice que sin foto
 *     se enseña sin foto (CA-20).
 *   · Que una **firma fallida pierda la foto y no la fila**: media
 *     pantalla rota es peor que una cara de menos, y el nombre del
 *     restaurante sigue ahí.
 *   · Que la ficha y la lista **vayan por el mismo camino**, o acabarían
 *     enseñando fotos distintas del mismo restaurante.
 */
type Fila = { establishment_id: string; storage_path: string };

function supabaseFalso(filas: Fila[] | null, error: { message: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data: filas, error });
  // El doble solo necesita `rpc`; el tipo real trae cien métodos más que
  // este módulo no toca.
  return { cliente: { rpc } as unknown as Parameters<typeof loadEstablishmentPhotos>[0], rpc };
}

function almacenamientoFalso(
  responder: (path: string) => { data: { signedUrl: string } | null; error: { message: string } | null },
) {
  const createSignedUrl = vi.fn(async (path: string) => responder(path));
  const storage: StorageClient = { from: vi.fn().mockReturnValue({ createSignedUrl }) };
  return { storage, createSignedUrl };
}

const firmaBuena = (path: string) => ({
  data: { signedUrl: `https://bucket.test/${path}?token=x` },
  error: null,
});

describe("RN-EST-18 · las fotos de una lista de restaurantes", () => {
  it("las pide TODAS en una sola llamada, no una por restaurante", async () => {
    const { cliente, rpc } = supabaseFalso([
      { establishment_id: "a", storage_path: "e/a.jpg" },
      { establishment_id: "b", storage_path: "e/b.jpg" },
    ]);
    const { storage } = almacenamientoFalso(firmaBuena);

    await loadEstablishmentPhotos(cliente, storage, ["a", "b", "c"]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("establishment_photo_paths", {
      p_establishment_ids: ["a", "b", "c"],
    });
  });

  it("un restaurante sin foto NO sale en el mapa, ni siquiera con nulo", async () => {
    const { cliente } = supabaseFalso([{ establishment_id: "a", storage_path: "e/a.jpg" }]);
    const { storage } = almacenamientoFalso(firmaBuena);

    const fotos = await loadEstablishmentPhotos(cliente, storage, ["a", "b"]);

    expect(fotos.get("a")).toBe("https://bucket.test/e/a.jpg?token=x");
    expect(fotos.has("b")).toBe(false);
  });

  it("el enlace se firma con la caducidad larga, no con la de una descarga", async () => {
    const { cliente } = supabaseFalso([{ establishment_id: "a", storage_path: "e/a.jpg" }]);
    const { storage, createSignedUrl } = almacenamientoFalso(firmaBuena);

    await loadEstablishmentPhotos(cliente, storage, ["a"]);

    expect(createSignedUrl).toHaveBeenCalledWith("e/a.jpg", ESTABLISHMENT_PHOTO_LINK_TTL_SECONDS);
  });

  it("si una firma falla, se pierde ESA foto y las demás siguen", async () => {
    const { cliente } = supabaseFalso([
      { establishment_id: "a", storage_path: "e/a.jpg" },
      { establishment_id: "b", storage_path: "e/b.jpg" },
    ]);
    const { storage } = almacenamientoFalso((path) =>
      path === "e/a.jpg" ? { data: null, error: { message: "caída" } } : firmaBuena(path),
    );

    const fotos = await loadEstablishmentPhotos(cliente, storage, ["a", "b"]);

    expect(fotos.has("a")).toBe(false);
    expect(fotos.get("b")).toBe("https://bucket.test/e/b.jpg?token=x");
  });

  it("si el almacenamiento revienta, tampoco lanza: la lista se pinta igual", async () => {
    const { cliente } = supabaseFalso([{ establishment_id: "a", storage_path: "e/a.jpg" }]);
    const storage: StorageClient = {
      from: vi.fn().mockReturnValue({
        createSignedUrl: () => Promise.reject(new Error("red caída")),
      }),
    };

    await expect(loadEstablishmentPhotos(cliente, storage, ["a"])).resolves.toEqual(new Map());
  });

  it("si la consulta falla, devuelve el mapa vacío sin lanzar", async () => {
    const { cliente } = supabaseFalso(null, { message: "permiso denegado" });
    const { storage } = almacenamientoFalso(firmaBuena);

    await expect(loadEstablishmentPhotos(cliente, storage, ["a"])).resolves.toEqual(new Map());
  });

  it("si la consulta falla PERO trae filas, no se sirve ninguna", async () => {
    /*
      El caso que separa "mirar el error" de "mirar si hay datos". Hoy
      PostgREST no devuelve las dos cosas a la vez, así que comprobar el
      error parece de más — y por eso hace falta este test: sin él,
      quitarlo no rompe nada y alguien lo quita. Cuando el servidor dice
      que la lectura falló, lo que venga con ella no se sirve, y estas
      filas son rutas de archivos privados.
    */
    const { cliente } = supabaseFalso([{ establishment_id: "a", storage_path: "e/a.jpg" }], {
      message: "la lectura falló a medias",
    });
    const { storage, createSignedUrl } = almacenamientoFalso(firmaBuena);

    const fotos = await loadEstablishmentPhotos(cliente, storage, ["a"]);

    expect(fotos.size).toBe(0);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("sin restaurantes, no molesta al servidor", async () => {
    const { cliente, rpc } = supabaseFalso([]);
    const { storage } = almacenamientoFalso(firmaBuena);

    const fotos = await loadEstablishmentPhotos(cliente, storage, []);

    expect(fotos.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("RN-EST-18 · la foto de uno solo", () => {
  it("va por el mismo camino que la lista", async () => {
    const { cliente, rpc } = supabaseFalso([{ establishment_id: "a", storage_path: "e/a.jpg" }]);
    const { storage } = almacenamientoFalso(firmaBuena);

    const foto = await loadEstablishmentPhoto(cliente, storage, "a");

    expect(foto).toBe("https://bucket.test/e/a.jpg?token=x");
    expect(rpc).toHaveBeenCalledWith("establishment_photo_paths", { p_establishment_ids: ["a"] });
  });

  it("sin foto devuelve null, no una cadena vacía", async () => {
    const { cliente } = supabaseFalso([]);
    const { storage } = almacenamientoFalso(firmaBuena);

    await expect(loadEstablishmentPhoto(cliente, storage, "a")).resolves.toBeNull();
  });
});
