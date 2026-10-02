import type { DraftShift } from "./ScheduleParts";

/**
 * Tras guardar horarios, la base de datos devuelve el identificador de cada turno enviado,
 * en el orden enviado (`toInputs`: solo los activos). Los turnos nuevos pasan a tener `id`:
 * el siguiente «Guardar» los actualiza en vez de crear otros y desactivar los primeros.
 */
export function withSavedIds(drafts: readonly DraftShift[], savedIds: readonly string[] | undefined): readonly DraftShift[] {
  if (!savedIds) return drafts;
  const sent = drafts.filter((d) => d.active);
  if (sent.length !== savedIds.length) return drafts;
  const idByKey = new Map(sent.map((d, index) => [d.key, savedIds[index]]));
  return drafts.map((d) => {
    const id = idByKey.get(d.key);
    return id === undefined ? d : { ...d, id };
  });
}
