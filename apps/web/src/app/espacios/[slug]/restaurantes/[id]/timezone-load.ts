import { DEFAULT_TIMEZONE } from "@/i18n/dates";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * La zona horaria del espacio al que pertenece un restaurante, para las
 * pantallas del restaurante.
 *
 * **Por qué existe.** CLAUDE.md manda calcular las fechas en la zona
 * horaria del espacio. Las pantallas del equipo leen `spaces.timezone` y
 * lo cumplen; las del restaurante no pueden —`spaces_select` exige ser
 * miembro del espacio, y un restaurante no lo es—, así que las cuatro que
 * tiene acabaron con `"Europe/Madrid"` escrito en el código. Eso da la
 * hora correcta mientras Cuotly sea solo Restavor, y deja de darla en
 * cuanto hay un espacio en otra zona, sin que nada falle de forma
 * visible. `establishment_timezone()` (migración 83) da ese dato y solo
 * ese, comprobando que quien pregunta es de ese restaurante.
 *
 * Si la llamada falla se devuelve el valor por defecto de la columna y se
 * deja dicho en el registro del servidor: una fecha hay que pintarla, y
 * la alternativa —una pantalla entera en blanco porque no se sabe la
 * zona— es peor que una hora que para casi todos los espacios es la suya.
 */
export async function loadEstablishmentTimezone(
  supabase: Supabase,
  establishmentId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("establishment_timezone", {
    p_establishment_id: establishmentId,
  });

  if (error || typeof data !== "string" || data.length === 0) {
    console.error("[restaurante] no se pudo leer la zona horaria del espacio", {
      establishmentId,
      message: error?.message ?? "sin dato",
    });
    return DEFAULT_TIMEZONE;
  }

  return data;
}
