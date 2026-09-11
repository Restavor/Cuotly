/**
 * `src/core/priority.ts` — mover un elemento dentro de un orden.
 *
 * Lógica pura, sin Supabase ni React (CLAUDE.md). Parece trivial y tiene
 * dos casos que se equivocan solos: mover el primero hacia arriba y el
 * último hacia abajo. Devolver la lista "como estaba" en esos dos casos no
 * vale, porque quien llama la mandaría al servidor y quedaría un apunte de
 * auditoría de un cambio que no ha cambiado nada; devolver `null` deja
 * claro que no hay nada que guardar.
 */
export function moveInOrder(
  ids: readonly string[],
  index: number,
  delta: number,
): string[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= ids.length) return null;

  const destino = index + delta;
  if (destino < 0 || destino >= ids.length) return null;

  const movido = [...ids];
  [movido[index], movido[destino]] = [movido[destino], movido[index]];
  return movido;
}

/**
 * El orden del restaurante, como criterio de comparación.
 *
 * `priority_rank` es **1 = el más importante** dentro de los cambios
 * pendientes de SU restaurante, y `null` cuando ese restaurante no lo ha
 * ordenado (o su plan no se lo concede). Lo que este comparador decide es
 * que el sin ordenar va detrás del ordenado, nunca delante.
 *
 * **Ojo con comparar rangos de restaurantes distintos**, que es lo que
 * pasa en la bandeja del equipo: un "1" de La Tasca y un "1" de Magariños
 * no son el mismo 1, son "lo más importante para cada uno". Compararlos
 * como números no dice que uno mande sobre el otro: los intercala, y el
 * resultado es que el equipo ve primero lo más importante de cada
 * restaurante y después lo segundo de cada uno. Esa es justo la propiedad
 * que se quiere — un restaurante no puede colar su lista entera por
 * delante de la de otro por el hecho de tener plan.
 */
export function compareClientRank(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

export interface JobInClientOrder {
  readonly priorityRank: number | null;
  /** ISO 8601 en UTC, tal y como lo devuelve `timestamptz`. */
  readonly createdAt: string;
}

/**
 * La bandeja del equipo, ordenada (maqueta 06 y su listado).
 *
 * Primero lo que el restaurante ha marcado como importante, por su puesto;
 * después lo demás, lo más reciente arriba, que es como estaba la bandeja
 * antes de que existiera la prioridad.
 *
 * **Esto no es la cola personal del trabajador.** Ahí manda el plazo
 * contractual y el orden del cliente entra por debajo — lo decide
 * `compareQueuedJobs()` en `worker-queue.ts`, que usa este mismo
 * `compareClientRank` para no tener dos definiciones de lo mismo. La
 * bandeja es una lista para leer, no un reparto: aquí no hay ningún plazo
 * que proteger.
 */
export function compareTeamJobs(a: JobInClientOrder, b: JobInClientOrder): number {
  const porPrioridad = compareClientRank(a.priorityRank, b.priorityRank);
  if (porPrioridad !== 0) return porPrioridad;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function orderTeamJobs<T extends JobInClientOrder>(jobs: readonly T[]): readonly T[] {
  return [...jobs].sort(compareTeamJobs);
}
