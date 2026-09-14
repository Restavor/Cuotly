/**
 * `src/i18n/dates.ts` — fechas visibles, en español, en una zona horaria
 * dicha en voz alta y en un solo sitio.
 *
 * Mismo motivo que `duration.ts`: la primera pantalla que necesita una
 * fecha corta se la escribe en casa, la segunda la copia, y al mes
 * siguiente una dice "13 sept" y la otra "13 de septiembre" para el mismo
 * día. Con una definición no pueden discrepar.
 *
 * **Y hay un segundo motivo, que costó más caro.** CLAUDE.md manda
 * calcular las fechas en la zona horaria del espacio. `Intl.DateTimeFormat`
 * sin `timeZone` usa la del entorno, y en una pantalla de servidor el
 * entorno es el servidor: en Vercel, UTC. Treinta llamadas repartidas por
 * casi todos los hitos lo hacían así, y no se veía porque en España el
 * desfase es de una o dos horas: solo se nota en un apunte de última hora
 * de la tarde, que aparece con el día anterior. El 14/09/2026 se pasaron
 * todas por aquí.
 *
 * Por eso `enZona()` pide la zona como argumento y no tiene valor por
 * defecto: olvidarla deja de ser un descuido invisible y pasa a ser un
 * error de compilación. Que nadie vuelva a construir un
 * `Intl.DateTimeFormat` por su cuenta lo vigila
 * `src/i18n/dates.test.ts`, que barre el código y falla si aparece uno
 * fuera de los sitios que pueden tenerlo.
 */

/**
 * La zona que se usa cuando el servidor no puede decir la del espacio. Es
 * el valor por defecto de `spaces.timezone` (migración 2), no "la de
 * Restavor": para un espacio que nunca la cambió es exactamente la suya.
 *
 * Usarla es siempre el último recurso y va acompañada de un registro en el
 * servidor. Nunca es la primera opción de una pantalla.
 */
export const DEFAULT_TIMEZONE = "Europe/Madrid";

/** Un día sin hora, como lo guarda un `date` de PostgreSQL: `2026-09-13`. */
const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una fecha en la zona que se le diga.
 *
 * `value` puede ser un instante (`timestamptz`, que trae su zona dentro) o
 * un día suelto (`date`, que no la trae). **Son dos cosas distintas y aquí
 * se tratan distinto**, que es justo lo que se hacía mal:
 *
 *   · Un instante se pinta en `timeZone`. Es lo que pide CLAUDE.md: el
 *     mismo cobro vencido lo ven a la misma hora el equipo y el
 *     restaurante, y esa hora es la del espacio, no la del servidor ni la
 *     del navegador de quien mira.
 *   · Un día suelto **no tiene hora ni zona**: la fecha planificada de una
 *     tarea es el día que alguien escribió. Se ancla en UTC y se pinta en
 *     UTC, para que salga ese día y no el anterior. Pintarlo en la zona
 *     del espacio funcionaría en Madrid y correría un día en cualquier
 *     zona al oeste de Greenwich.
 *
 * Las opciones son las de `Intl` y se pasan tal cual: cada pantalla
 * conserva exactamente el aspecto que tenía. Lo único que esta función
 * impone es la zona.
 */
export function enZona(
  value: string,
  timeZone: string,
  opciones: Intl.DateTimeFormatOptions,
): string {
  const esDiaSuelto = SOLO_DIA.test(value);
  const instante = new Date(esDiaSuelto ? `${value}T00:00:00Z` : value);

  return new Intl.DateTimeFormat("es-ES", {
    ...opciones,
    timeZone: esDiaSuelto ? "UTC" : timeZone,
  }).format(instante);
}

/**
 * "13 sept", como en la maqueta 07. Para un día suelto (`date`).
 *
 * No pide zona porque un día suelto no la tiene: `enZona()` lo ancla en
 * UTC. Antes se le pegaba `T00:00:00` y se pintaba en la del entorno, que
 * daba el día correcto en España y el anterior en América.
 */
export function fechaCorta(value: string): string {
  return enZona(value, "UTC", { day: "numeric", month: "short" });
}

/**
 * "Hoy, 10:24" para lo de hoy; la fecha corta con su hora para lo demás.
 *
 * Qué día es "hoy" depende de la zona, así que se compara en la zona del
 * espacio y no con `getFullYear()` del servidor. Lo usan la ficha del
 * restaurante y la evidencia de un trabajo, que antes tenían cada una su
 * copia de esta comparación.
 */
export function instanteRelativo(
  value: string,
  timeZone: string,
  ahora: Date,
  hoyEtiqueta: (hora: string) => string,
): string {
  const hora = enZona(value, timeZone, { timeStyle: "short" });
  const dia = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  return dia(new Date(value)) === dia(ahora)
    ? hoyEtiqueta(hora)
    : `${enZona(value, timeZone, { dateStyle: "short" })}, ${hora}`;
}

/**
 * La zona del navegador de quien mira.
 *
 * **Solo para lo que no cuelga de ningún espacio**, que hoy es una sola
 * pantalla: "Mis sesiones" (HU-05). Ahí no hay espacio del que sacar la
 * zona —son las sesiones de una persona, no de un restaurante— y la hora
 * que esa persona espera ver es la suya: "entré a las nueve".
 *
 * Para cualquier pantalla dentro de un espacio esto sería el fallo otra
 * vez, con otro disfraz: la zona la manda el espacio (CLAUDE.md), no el
 * portátil de quien abre la página.
 *
 * Fuera del navegador no hay tal zona, así que devuelve la de la columna.
 */
export function zonaDelNavegador(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
