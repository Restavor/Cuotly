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

/**
 * Un tamaño con su unidad elegida, para enseñárselo a una persona.
 *
 * `gigabytes()` sirve donde la unidad ya está escrita al lado y el número
 * siempre es grande —el almacenamiento de un espacio entero—. Un
 * restaurante puede ocupar tres megas, y "0 GB" al lado de su nombre se
 * lee como "no tiene archivos", que es otra cosa: tiene archivos y son
 * pequeños (RN-ARC-10).
 *
 * Por eso aquí la unidad se elige por el tamaño. Los saltos son los de
 * siempre (1024) y el cero se dice "0 KB", no "0 bytes": nadie mide un
 * archivo en bytes al leerlo de un vistazo.
 */
export function readableSize(bytes: number): string {
  const numero = (valor: number, decimales: number) =>
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valor);

  if (bytes >= 1024 ** 3) return `${numero(bytes / 1024 ** 3, 1)} GB`;
  if (bytes >= 1024 ** 2) return `${numero(bytes / 1024 ** 2, 1)} MB`;
  return `${numero(Math.round(bytes / 1024), 0)} KB`;
}
