/**
 * `src/core/chart-series.ts` — la geometría de una gráfica de líneas.
 * Lógica pura, sin React ni DOM (CLAUDE.md), para poder probarla sin
 * pintar nada.
 *
 * Qué decide este archivo y qué no: decide **dónde cae cada punto** y qué
 * marcas de eje se escriben; no decide colores, ni tamaños de tipografía,
 * ni qué se dice en español. Eso es del componente y de `es.ts`.
 *
 * La escala vertical **siempre empieza en cero**. Una gráfica de conteos
 * que arranca en el mínimo exagera cualquier subida: de 8 a 10 parece que
 * se ha doblado. Es el fallo más común de una gráfica y por eso está aquí
 * y no como opción.
 */

export interface SeriesPointXY {
  readonly x: number;
  readonly y: number;
}

export interface ChartGeometry {
  /** El alto de la caja de dibujo, sin contar los ejes. */
  readonly plotWidth: number;
  readonly plotHeight: number;
  /** El máximo del eje vertical, ya redondeado a algo legible. */
  readonly max: number;
}

/**
 * El eje vertical entero: su techo y sus marcas, decididos **a la vez**.
 *
 * Por qué a la vez y no en dos funciones sueltas: separados, el techo salía
 * "redondo" (25) y luego se partía en cuatro tramos iguales, que daban
 * 6,25 · 12,5 · 18,75. Un eje que dice **6,3 solicitudes** está contando
 * cosas que van de una en una con decimales, y eso no existe. Lo encontró
 * mirar la gráfica dibujada, no el tipo ni la prueba.
 *
 * La regla: el salto entre marcas es un número entero de la familia
 * 1 · 2 · 5 · 10 · 20 · 50 … —los saltos que la gente lee sin pensar— y se
 * coge el más pequeño que deje **seis marcas o menos**. El techo es ese
 * salto multiplicado hasta cubrir el valor más alto, así que todas las
 * marcas son enteras por construcción.
 *
 * Con todo a cero el techo es 1 y no 0: una caja de alto cero no se puede
 * dibujar, y las marcas serían todas la misma.
 */
const SALTOS_BASE = [1, 2, 5] as const;
const MARCAS_MAXIMAS = 6;

export interface AxisScale {
  readonly max: number;
  readonly ticks: readonly number[];
}

export function axisScale(values: readonly number[]): AxisScale {
  const mayor = values.reduce((alto, v) => Math.max(alto, v), 0);
  const techoMinimo = mayor <= 0 ? 1 : Math.ceil(mayor);

  for (let magnitud = 1; ; magnitud *= 10) {
    for (const base of SALTOS_BASE) {
      const salto = base * magnitud;
      const tramos = Math.ceil(techoMinimo / salto);
      if (tramos + 1 > MARCAS_MAXIMAS) continue;

      const max = salto * tramos;
      const ticks: number[] = [];
      for (let i = 0; i <= tramos; i += 1) ticks.push(salto * i);
      return { max, ticks };
    }
  }
}

/**
 * Los puntos de una serie, ya en coordenadas de la caja de dibujo.
 *
 * Con un solo punto se dibuja **en el centro** y no en el borde: una serie
 * de un día pegada al eje parece el final de una línea que no existe.
 */
export function linePoints(
  values: readonly number[],
  geometry: Pick<ChartGeometry, "plotWidth" | "plotHeight" | "max">,
): readonly SeriesPointXY[] {
  if (values.length === 0) return [];
  if (values.length === 1) {
    return [
      {
        x: geometry.plotWidth / 2,
        y: geometry.plotHeight - (values[0] / geometry.max) * geometry.plotHeight,
      },
    ];
  }

  const paso = geometry.plotWidth / (values.length - 1);
  return values.map((valor, indice) => ({
    x: paso * indice,
    y: geometry.plotHeight - (valor / geometry.max) * geometry.plotHeight,
  }));
}

/** El atributo `d` de una polilínea. Vacío si no hay puntos. */
export function linePath(points: readonly SeriesPointXY[]): string {
  if (points.length === 0) return "";
  return points
    .map((punto, indice) => `${indice === 0 ? "M" : "L"}${punto.x.toFixed(2)} ${punto.y.toFixed(2)}`)
    .join(" ");
}

/**
 * Qué días llevan etiqueta en el eje horizontal. En un mes caben unas
 * cinco en un teléfono; escribir las 31 las convierte en una mancha.
 *
 * Siempre entran el primero y el último: son los que dicen de cuándo a
 * cuándo va la gráfica, y sin ellos el eje no tiene principio ni fin.
 */
export function labelledIndexes(count: number, wanted = 5): readonly number[] {
  if (count <= wanted) return Array.from({ length: count }, (_, i) => i);

  const paso = (count - 1) / (wanted - 1);
  const indices = new Set<number>();
  for (let i = 0; i < wanted; i += 1) indices.add(Math.round(paso * i));
  indices.add(0);
  indices.add(count - 1);
  return [...indices].sort((a, b) => a - b);
}
