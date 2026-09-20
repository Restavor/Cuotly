"use client";

import { useId, useState } from "react";

import { axisScale, labelledIndexes, linePath, linePoints } from "@/core/chart-series";
import { es } from "@/i18n/es";

/**
 * Página 22 del diseño definitivo móvil · "Actividad de mantenimiento":
 * las solicitudes creadas y los trabajos completados, día a día del mes.
 *
 * **Por qué no son los dos verdes del diseño.** Medidos con el validador
 * de paletas, `#1d8a6a` y `#32b889` se separan ΔE 13,6 para vista normal
 * y el mínimo son 15: no se distinguen ni viendo bien los colores, y
 * menos en un teléfono. La segunda serie usa un índigo propio
 * (`--color-chart-2`) que pasa las cinco comprobaciones. Los dos colores
 * salen de `tokens.css`, nunca de un hexadecimal suelto (CLAUDE.md).
 *
 * **El color nunca es la única señal** (PRD §21.4): además de la leyenda,
 * cada línea lleva su nombre escrito en su extremo y debajo hay una tabla
 * con los números exactos. Quien no distinga los dos tonos lee lo mismo.
 *
 * **El eje vertical empieza en cero**, siempre, y lo impone
 * `src/core/chart-series.ts`: una gráfica de conteos que arranca en el
 * mínimo convierte "de 8 a 10" en una subida que parece el doble.
 */
export function ActivityChart({
  days,
  failed,
}: {
  readonly days: readonly { readonly day: string; readonly requests: number; readonly jobs: number }[];
  readonly failed: boolean;
}) {
  const [tablaVisible, setTablaVisible] = useState(false);
  const idTabla = useId();
  const t = es.spaceHome.activityChart;

  if (failed) {
    return <p className="text-sm text-text-secondary">{t.failed}</p>;
  }
  if (days.length === 0) {
    return <p className="text-sm text-text-secondary">{t.empty}</p>;
  }

  // La caja de dibujo, en unidades del `viewBox`. El SVG escala solo al
  // ancho que tenga: en un teléfono de 360 px y en un portátil se dibuja
  // la misma geometría.
  const PAD_IZQ = 26;
  const PAD_ABAJO = 18;
  const PAD_ARRIBA = 6;
  // El margen derecho existe por el punto marcado del último día: con el
  // dibujo acabando justo en el borde, su círculo y su anillo se salían
  // del `viewBox` y el navegador los cortaba por la mitad.
  const PAD_DER = 6;
  const ANCHO = 320;
  const ALTO = 150;
  const plotWidth = ANCHO - PAD_IZQ - PAD_DER;
  const plotHeight = ALTO - PAD_ABAJO - PAD_ARRIBA;

  const solicitudes = days.map((d) => d.requests);
  const trabajos = days.map((d) => d.jobs);
  const { max, ticks } = axisScale([...solicitudes, ...trabajos]);
  const caja = { plotWidth, plotHeight, max };

  const puntosSolicitudes = linePoints(solicitudes, caja);
  const puntosTrabajos = linePoints(trabajos, caja);
  const etiquetas = labelledIndexes(days.length);

  // `day` llega como "AAAA-MM-DD" ya resuelto en la zona del espacio
  // (`home-load.ts`), así que aquí se lee por trozos y nunca con `new
  // Date(...)`: convertirlo a fecha volvería a moverlo de zona horaria y
  // un día cambiaría de sitio.
  const diaCorto = (iso: string) => String(Number(iso.slice(8, 10)));
  const diaEje = (iso: string) => t.axisDay(Number(iso.slice(8, 10)), Number(iso.slice(5, 7)));

  return (
    <div>
      {/* La leyenda va arriba y siempre: con dos series, la identidad no
          puede depender de recordar cuál era cuál. */}
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        <li className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-chart-2" />
          {t.requests}
        </li>
        <li className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-chart-1" />
          {t.jobs}
        </li>
      </ul>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={t.title}
        aria-describedby={idTabla}
      >
        {/* Rejilla discreta y sin trazos discontinuos: el punteado añade
            ruido y compite con las líneas de datos. */}
        {ticks.map((valor) => {
          const y = PAD_ARRIBA + plotHeight - (valor / max) * plotHeight;
          return (
            <g key={valor}>
              <line
                x1={PAD_IZQ}
                y1={y}
                x2={ANCHO - PAD_DER}
                y2={y}
                className="stroke-border"
                strokeWidth={0.5}
              />
              <text
                x={PAD_IZQ - 5}
                y={y + 3}
                textAnchor="end"
                className="fill-text-secondary text-[8px]"
              >
                {valor}
              </text>
            </g>
          );
        })}

        {/*
          La primera y la última se anclan por su borde y no por el centro:
          centradas se salían del `viewBox` —la última empezaba en 320, que
          es justo donde acaba el dibujo— y el navegador las recorta.
        */}
        {etiquetas.map((indice, posicion) => (
          <text
            key={days[indice].day}
            x={PAD_IZQ + (puntosSolicitudes[indice]?.x ?? 0)}
            y={ALTO - 4}
            textAnchor={
              posicion === 0 ? "start" : posicion === etiquetas.length - 1 ? "end" : "middle"
            }
            className="fill-text-secondary text-[8px]"
          >
            {diaEje(days[indice].day)}
          </text>
        ))}

        <g transform={`translate(${PAD_IZQ} ${PAD_ARRIBA})`}>
          <path
            d={linePath(puntosSolicitudes)}
            fill="none"
            className="stroke-chart-2"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={linePath(puntosTrabajos)}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Un mes tiene hasta 31 puntos: marcarlos todos emborrona la
              línea. Se marca el último de cada serie, que es donde el ojo
              va a buscar "cómo vamos". */}
          {puntosSolicitudes.length > 0 ? (
            <circle
              cx={puntosSolicitudes[puntosSolicitudes.length - 1].x}
              cy={puntosSolicitudes[puntosSolicitudes.length - 1].y}
              r={3}
              className="fill-chart-2 stroke-surface"
              strokeWidth={2}
            />
          ) : null}
          {puntosTrabajos.length > 0 ? (
            <circle
              cx={puntosTrabajos[puntosTrabajos.length - 1].x}
              cy={puntosTrabajos[puntosTrabajos.length - 1].y}
              r={3}
              className="fill-chart-1 stroke-surface"
              strokeWidth={2}
            />
          ) : null}

          {/*
            La capa de consulta: una banda invisible por día, más ancha que
            la línea, con el dato escrito dentro. En un ratón sale el globo
            del navegador; en un teléfono no hay «encima del punto», y por
            eso el camino de verdad para el número exacto es la tabla de
            abajo, que está siempre.
          */}
          {days.map((dia, indice) => {
            const punto = puntosSolicitudes[indice];
            if (punto === undefined) return null;
            const ancho = days.length > 1 ? plotWidth / (days.length - 1) : plotWidth;
            return (
              <rect
                key={dia.day}
                x={Math.max(0, punto.x - ancho / 2)}
                y={0}
                width={ancho}
                height={plotHeight}
                fill="transparent"
              >
                <title>{t.point(diaCorto(dia.day), dia.requests, dia.jobs)}</title>
              </rect>
            );
          })}
        </g>
      </svg>

      {/*
        La tabla. Está siempre en el árbol para el lector de pantalla
        —`aria-describedby` de la gráfica apunta aquí— y se despliega para
        quien quiera el número exacto.
      */}
      <button
        type="button"
        onClick={() => setTablaVisible((v) => !v)}
        aria-expanded={tablaVisible}
        aria-controls={idTabla}
        className="mt-2 text-xs font-semibold text-cuotly-green underline focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {tablaVisible ? t.hideTable : t.showTable}
      </button>

      <div id={idTabla} className={tablaVisible ? "mt-2 overflow-x-auto" : "sr-only"}>
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{t.tableCaption}</caption>
          <thead>
            <tr className="text-text-secondary">
              <th scope="col" className="py-1 pr-3 font-medium">
                {t.columnDay}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t.requests}
              </th>
              <th scope="col" className="py-1 font-medium">
                {t.jobs}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((dia) => (
              <tr key={dia.day} className="border-t border-border">
                <td className="py-1 pr-3 text-text">{diaCorto(dia.day)}</td>
                <td className="py-1 pr-3 text-text">{dia.requests}</td>
                <td className="py-1 text-text">{dia.jobs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
