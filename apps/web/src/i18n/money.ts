/**
 * `src/i18n/money.ts` — céntimos a euros visibles, en español y en un solo
 * sitio. Los importes se guardan en céntimos enteros (decisión 7: dos
 * decimales) y se pintan aquí; ninguna pantalla divide por 100 por su
 * cuenta.
 */
const EUROS = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function euros(cents: number): string {
  return EUROS.format(cents / 100);
}

/** Gigabytes con una cifra decimal, para el almacenamiento (RN-SUB-13). */
export function gigabytes(bytes: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(bytes / 1024 ** 3);
}
