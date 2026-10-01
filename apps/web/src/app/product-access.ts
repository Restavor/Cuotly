import type { SupabaseClient } from "@supabase/supabase-js";

import { productAccess, summarizeProducts, type ProductAccess } from "@/core/app/products";
import { isPlatformPerson } from "@/core/platform-admin";
import type { Database } from "@/lib/supabase/database.types";
import { myProducts } from "@/services/app-gateway";
import { myPlatformAccess } from "@/services/platform-gateway";

/**
 * Restavor app (decisión 88) · lo que el menú del logo necesita saber de
 * quien mira: qué productos puede abrir y si se le puede ofrecer Reservas.
 *
 * Si `my_products()` falla devuelve `null` y el armazón pinta el logo como un
 * enlace, no como un menú: enseñar un menú de productos sin saber cuáles son
 * es peor que no enseñarlo. Que falle la consulta de plataforma no bloquea a
 * nadie: se sigue como una persona normal (igual que el Inicio de Restavor web).
 */
export async function loadProductAccess(
  supabase: SupabaseClient<Database>,
): Promise<ProductAccess | null> {
  const [rows, platform] = await Promise.all([
    myProducts(supabase).catch(() => null),
    myPlatformAccess(supabase).catch(() => null),
  ]);
  if (rows === null) return null;
  return productAccess(summarizeProducts(rows), {
    isPlatform: platform !== null && isPlatformPerson(platform),
  });
}
