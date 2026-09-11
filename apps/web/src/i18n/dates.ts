/**
 * `src/i18n/dates.ts` — fechas visibles, en español y en un solo sitio.
 *
 * Mismo motivo que `duration.ts`: la primera pantalla que necesita una
 * fecha corta se la escribe en casa, la segunda la copia, y al mes
 * siguiente una dice "13 sept" y la otra "13 de septiembre" para el mismo
 * día. Con una definición no pueden discrepar.
 */

/**
 * "13 sept", como en la maqueta 07.
 *
 * Recibe una fecha **sin hora** (`date` de PostgreSQL, `2026-09-13`). El
 * `T00:00:00` que se le añade no es decorativo: sin él, `new Date()` lee
 * la cadena como UTC y en España la pinta con un día de menos media parte
 * del año. La fecha planificada de una tarea no tiene hora ni zona — es el
 * día que alguien escribió— así que se construye en la del navegador.
 */
export function fechaCorta(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
}
