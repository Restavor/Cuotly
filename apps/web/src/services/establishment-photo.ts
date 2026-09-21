import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import {
  ESTABLISHMENT_PHOTO_LINK_TTL_SECONDS,
  FILES_BUCKET,
  type StorageClient,
} from "@/services/file-storage";

/**
 * `src/services/establishment-photo.ts` — la foto de un restaurante,
 * resuelta a un enlace que el navegador pueda pintar (RN-EST-18,
 * decisión 62; CLAUDE.md: "los adaptadores externos viven en
 * `src/services/`").
 *
 * **Quién puede ver qué foto NO se decide aquí.** Lo decide
 * `establishment_photo_paths()` en la base de datos, que solo devuelve la
 * de los restaurantes que quien pregunta puede ver. Este módulo firma un
 * enlace a una ruta que el servidor ya ha dado por buena: pedir una firma
 * no comprueba permisos (CLAUDE.md MUST).
 *
 * **Una llamada para toda la lista, no una por fila.** Las dos pantallas
 * que más fotos pintan —el "Estado por restaurante" del Inicio y la lista
 * de Restaurantes, que no pagina— resolverían cincuenta rutas en cincuenta
 * viajes si preguntaran de una en una. Por eso la función de la base de
 * datos recibe un array y esta también.
 *
 * Las firmas sí van una por foto, porque el almacenamiento no firma en
 * lote. Es una llamada por restaurante **que tiene foto**, no por
 * restaurante, y se hacen en paralelo.
 */

/** La foto de cada restaurante que tiene una, por identificador. */
export type EstablishmentPhotos = ReadonlyMap<string, string>;

type Cliente = SupabaseClient<Database>;

/**
 * Los enlaces de las fotos de estos restaurantes.
 *
 * **Un restaurante sin foto no sale en el mapa**, que es lo mismo que dice
 * la base de datos y lo que RN-EST-18 pide de la pantalla: se enseña sin
 * foto, no con un marco esperándola (CA-20). Tampoco sale uno cuya firma
 * falle: media pantalla rota es peor que una cara de menos, y el nombre
 * del restaurante sigue ahí.
 *
 * No lanza. Que el almacenamiento no conteste es un caso previsto y la
 * lista tiene que pintarse igual.
 */
export async function loadEstablishmentPhotos(
  supabase: Cliente,
  storage: StorageClient,
  establishmentIds: readonly string[],
): Promise<EstablishmentPhotos> {
  const fotos = new Map<string, string>();
  if (establishmentIds.length === 0) return fotos;

  const { data, error } = await supabase.rpc("establishment_photo_paths", {
    p_establishment_ids: [...establishmentIds],
  });

  if (error || !data) return fotos;

  const enlaces = await Promise.all(
    data.map(async (fila) => {
      try {
        const respuesta = await storage
          .from(FILES_BUCKET)
          .createSignedUrl(fila.storage_path, ESTABLISHMENT_PHOTO_LINK_TTL_SECONDS);
        if (respuesta.error !== null || respuesta.data === null) return null;
        return [fila.establishment_id, respuesta.data.signedUrl] as const;
      } catch {
        return null;
      }
    }),
  );

  for (const enlace of enlaces) {
    if (enlace !== null) fotos.set(enlace[0], enlace[1]);
  }

  return fotos;
}

/**
 * La foto de **un** restaurante, para la ficha. Va por el mismo camino que
 * la de la lista a propósito: si la ficha resolviera la foto por su cuenta,
 * acabaría enseñando una distinta de la que enseña la lista.
 */
export async function loadEstablishmentPhoto(
  supabase: Cliente,
  storage: StorageClient,
  establishmentId: string,
): Promise<string | null> {
  const fotos = await loadEstablishmentPhotos(supabase, storage, [establishmentId]);
  return fotos.get(establishmentId) ?? null;
}
