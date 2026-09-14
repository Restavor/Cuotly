import type { DailyPoint, SyncWindow } from "@/core/integrations";
import { es } from "@/i18n/es";
import { fechaCorta } from "@/i18n/dates";

/**
 * Las dos gráficas de "Informes y datos" (maqueta 10): una línea por día y
 * un anillo de reparto. SVG dibujado aquí, sin librería, y componentes de
 * servidor: la ficha entera se sirve sin hidratar (CA-22) y una gráfica
 * que necesitara JavaScript para pintarse dejaría un hueco en blanco.
 *
 * Reglas que se siguen y por qué (las del método de visualización de
 * datos, que son las mismas para cualquier sistema de diseño):
 *
 *   · **Un solo eje.** Usuarios y sesiones se cuentan igual y comparten
 *     escala; dos medidas de escala distinta (clics e impresiones) van en
 *     dos gráficas, nunca en una con dos ejes.
 *   · **El color va con la entidad y hay leyenda desde dos series**, más
 *     la etiqueta directa al final de cada línea: la identidad nunca es
 *     solo el color. Los colores son los tokens de Emerald Control —el
 *     verde de Cuotly, `info` y `warning`— validados con el comprobador
 *     de la paleta: los dos primeros pasan todo; el ámbar se queda por
 *     debajo de 3:1 sobre blanco y por eso solo se usa donde hay etiqueta
 *     visible y tabla (el anillo).
 *   · **Un día sin dato es un hueco**, no un cero: la línea se corta
 *     (RN-INT-07, CLAUDE.md: nada de relleno).
 *   · **Trazos finos, rejilla recesiva, texto con los tokens de texto**
 *     (`currentColor` sobre `text-text-secondary`), nunca del color de la
 *     serie.
 *   · **Siempre hay tabla**: cada gráfica lleva debajo un `<details>` con
 *     los mismos datos, que es lo que lee un lector de pantalla y lo que
 *     queda en una impresión sin color.
 */

const t = es.integrations;

export interface LineSeries {
  readonly key: string;
  readonly label: string;
  readonly points: readonly DailyPoint[];
  readonly tone: "green" | "info";
}

const STROKE: Readonly<Record<LineSeries["tone"], string>> = {
  green: "stroke-cuotly-green",
  info: "stroke-info",
};
const FILL: Readonly<Record<LineSeries["tone"], string>> = {
  green: "fill-cuotly-green",
  info: "fill-info",
};
const DOT: Readonly<Record<LineSeries["tone"], string>> = {
  green: "bg-cuotly-green",
  info: "bg-info",
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function formatInt(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

/**
 * El día de un punto de la serie. Es un día suelto sin zona, así que lo
 * ancla en UTC `fechaCorta()`: pintarlo en la del espacio correría un día
 * al oeste de Greenwich.
 */
function shortDay(day: string): string {
  return fechaCorta(day);
}

/**
 * Los tramos de una serie: puntos de días consecutivos. Un salto de más
 * de un día parte la línea, que es cómo se pinta el hueco.
 */
function segments(points: readonly DailyPoint[]): DailyPoint[][] {
  const out: DailyPoint[][] = [];
  let actual: DailyPoint[] = [];
  for (const p of points) {
    const anterior = actual[actual.length - 1];
    if (anterior !== undefined && daysBetween(anterior.day, p.day) !== 1) {
      out.push(actual);
      actual = [];
    }
    actual.push(p);
  }
  if (actual.length > 0) out.push(actual);
  return out;
}

/** Tres marcas "redondas" del eje: 0, la mitad y un techo que quepa. */
function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const candidates = [1, 1.5, 2, 2.5, 3, 4, 5, 10].map((m) => m * magnitude);
  return candidates.find((c) => c >= max) ?? 10 * magnitude;
}

export function LineChart({
  title,
  series,
  window,
  testId,
}: {
  title: string;
  series: readonly LineSeries[];
  window: SyncWindow;
  testId?: string;
}) {
  const width = 640;
  const height = 220;
  const pad = { top: 12, right: 88, bottom: 28, left: 44 };
  const days = daysBetween(window.from, window.to) + 1;
  const maxValue = Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const top = niceCeiling(maxValue);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (day: string) => pad.left + (daysBetween(window.from, day) / Math.max(1, days - 1)) * plotW;
  const y = (value: number) => pad.top + plotH - (value / top) * plotH;
  const ticks = [0, top / 2, top];
  const xLabels = [0, Math.floor((days - 1) / 2), days - 1].map((i) => {
    const d = new Date(`${window.from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const conDato = series.some((s) => s.points.length > 0);

  return (
    <figure data-testid={testId} className="min-w-0">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-text">{title}</span>
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-3 text-xs text-text-secondary" aria-label={title}>
            {series.map((s) => (
              <li key={s.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[s.tone]}`} />
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
      </figcaption>

      {conDato ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
          className="h-auto w-full text-text-secondary"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text x={pad.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={10} fill="currentColor">
                {formatInt(tick)}
              </text>
            </g>
          ))}
          {xLabels.map((day) => (
            <text key={day} x={x(day)} y={height - 8} textAnchor="middle" fontSize={10} fill="currentColor">
              {shortDay(day)}
            </text>
          ))}
          {series.map((s) => (
            <g key={s.key}>
              {segments(s.points).map((tramo) => (
                <path
                  key={tramo[0].day}
                  d={tramo.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ")}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className={STROKE[s.tone]}
                />
              ))}
              {s.points.map((p) => (
                <circle key={p.day} cx={x(p.day)} cy={y(p.value)} r={tramo1(s.points, p) ? 4 : 2.5} className={FILL[s.tone]}>
                  <title>{`${s.label} · ${shortDay(p.day)}: ${formatInt(p.value)}`}</title>
                </circle>
              ))}
              {s.points.length > 0 ? (
                <text
                  x={x(s.points[s.points.length - 1].day) + 8}
                  y={y(s.points[s.points.length - 1].value) + 4}
                  fontSize={11}
                  fill="currentColor"
                  className="text-text"
                >
                  {`${s.label} ${formatInt(s.points[s.points.length - 1].value)}`}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      ) : (
        <p className="text-sm text-text-secondary">{t.chartNoDays}</p>
      )}

      <details className="mt-2 text-xs text-text-secondary">
        <summary className="cursor-pointer">{t.chartTableToggle}</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 pr-3 font-semibold">{t.chartDayColumn}</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 pr-3 font-semibold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...new Set(series.flatMap((s) => s.points.map((p) => p.day)))].sort().map((day) => (
              <tr key={day}>
                <td className="py-0.5 pr-3">{shortDay(day)}</td>
                {series.map((s) => {
                  const p = s.points.find((q) => q.day === day);
                  return (
                    <td key={s.key} className="py-0.5 pr-3 text-text">
                      {p === undefined ? "—" : formatInt(p.value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** El último punto de la serie lleva la marca grande (8 px); los demás, la pequeña. */
function tramo1(points: readonly DailyPoint[], p: DailyPoint): boolean {
  return points[points.length - 1] === p;
}

export interface DonutSlice {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

const SLICE_FILL = ["fill-cuotly-green", "fill-info", "fill-warning"] as const;
const SLICE_DOT = ["bg-cuotly-green", "bg-info", "bg-warning"] as const;

/**
 * El reparto (maqueta 10, "Dispositivos"). Tres porciones como mucho y el
 * resto en "Otros": una cuarta categoría necesitaría un cuarto color que
 * la paleta no tiene validado, y un reparto de dispositivos son tres.
 */
export function DonutChart({
  title,
  slices,
  centerLabel,
  testId,
}: {
  title: string;
  slices: readonly DonutSlice[];
  centerLabel: string;
  testId?: string;
}) {
  const ordenadas = [...slices].sort((a, b) => b.value - a.value);
  const principales = ordenadas.slice(0, 3);
  const resto = ordenadas.slice(3).reduce((acc, s) => acc + s.value, 0);
  const visibles = resto > 0 ? [...principales.slice(0, 2), { key: "other", label: t.devicesOther, value: resto + (principales[2]?.value ?? 0) }] : principales;
  const total = visibles.reduce((acc, s) => acc + s.value, 0);

  const size = 160;
  const r = 60;
  const c = size / 2;
  // El ángulo de inicio de cada porción, calculado de una vez y no
  // acumulando dentro del render (la regla de inmutabilidad de React).
  const inicios = visibles.reduce<number[]>((acc, s, i) => [...acc, (i === 0 ? 0 : acc[i - 1]) + (i === 0 ? 0 : visibles[i - 1].value)], []);

  return (
    <figure data-testid={testId} className="min-w-0">
      <figcaption className="mb-2 font-semibold text-text">{title}</figcaption>
      {total <= 0 ? (
        <p className="text-sm text-text-secondary">{t.chartNoDays}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title} className="h-40 w-40 text-text">
            {visibles.map((s, i) => {
              const inicio = (inicios[i] / total) * 2 * Math.PI;
              const fin = ((inicios[i] + s.value) / total) * 2 * Math.PI;
              const largo = fin - inicio > Math.PI ? 1 : 0;
              const x1 = c + r * Math.sin(inicio);
              const y1 = c - r * Math.cos(inicio);
              const x2 = c + r * Math.sin(fin);
              const y2 = c - r * Math.cos(fin);
              const d =
                visibles.length === 1
                  ? `M${c} ${c - r} A${r} ${r} 0 1 1 ${c - 0.01} ${c - r} Z`
                  : `M${c} ${c} L${x1} ${y1} A${r} ${r} 0 ${largo} 1 ${x2} ${y2} Z`;
              return (
                <path key={s.key} d={d} className={`${SLICE_FILL[i]} stroke-surface`} strokeWidth={2}>
                  <title>{`${s.label}: ${formatInt(s.value)} (${Math.round((s.value / total) * 100)} %)`}</title>
                </path>
              );
            })}
            <circle cx={c} cy={c} r={r * 0.62} className="fill-surface" />
            <text x={c} y={c - 2} textAnchor="middle" fontSize={16} fontWeight={700} fill="currentColor">
              {formatInt(total)}
            </text>
            <text x={c} y={c + 14} textAnchor="middle" fontSize={9} fill="currentColor" className="text-text-secondary">
              {centerLabel}
            </text>
          </svg>
          <ul className="space-y-1 text-sm" aria-label={title}>
            {visibles.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${SLICE_DOT[i]}`} />
                <span className="text-text">{s.label}</span>
                <span className="font-semibold text-text">{Math.round((s.value / total) * 100)} %</span>
                <span className="text-xs text-text-secondary">({formatInt(s.value)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
