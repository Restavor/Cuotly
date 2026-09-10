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
