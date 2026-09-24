import Link from "next/link";

import { Card } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import { enZona } from "@/i18n/dates";
import type { StatusHistoryEntry } from "@/app/espacios/[slug]/restaurantes/[id]/status-history-load";

const t = es.establishmentStatus;
type StatusKey = keyof typeof es.space.statuses;

/**
 * M74 · lo que el Resumen enseña de un restaurante en solo lectura, debajo
 * del aviso de la cabecera: qué se puede y qué no, dónde está el historial
 * y los archivos, y la línea de tiempo de sus estados.
 *
 * Lo que el dibujo pide y NO se copia:
 *
 * - **"Ver condiciones de reactivación".** No hay condiciones de
 *   reactivación escritas: RN-EST-10 dice que tras las 24 h de solo
 *   lectura el restaurante queda suspendido, y de una parada por impago
 *   se sale cobrando (RN-FIN-13). Un botón que abre unas condiciones que
 *   no existen es peor que no tenerlo.
 * - **El candado "Solo lectura" en lugar de "Editar restaurante".** La
 *   ficha y los accesos se siguen pudiendo corregir en solo lectura
 *   (decisión 75: `set_establishment_data()` no pasa por la guarda del
 *   servicio, y así debe ser), así que quitar el botón diría lo contrario
 *   de lo que hace el servidor. El estado ya va en la
 *   insignia junto al nombre.
 * - **La "X" del panel de estados.** Aquí no es un cajón que se abre: es
 *   la columna derecha del Resumen mientras dura el estado.
 */
export function ReadOnlyScope({
  historyHref,
  filesHref,
  history,
  timeZone,
}: {
  historyHref: string;
  filesHref: string;
  /** `null` cuando no se pudo leer o no hay cambios que enseñar. */
  history: readonly StatusHistoryEntry[] | null;
  timeZone: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <Card>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:divide-x sm:divide-border">
            <div>
              <h2 className="mb-3 text-sm font-semibold text-text">{t.readOnlyCanTitle}</h2>
              <ul className="space-y-2 text-sm text-text-secondary">
                {t.readOnlyCan.map((linea) => (
                  <li key={linea} className="flex items-start gap-2">
                    <Icon name="check" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                    {linea}
                  </li>
                ))}
              </ul>
            </div>
            <div className="sm:pl-6">
              <h2 className="mb-3 text-sm font-semibold text-text">{t.readOnlyCannotTitle}</h2>
              <ul className="space-y-2 text-sm text-text-secondary">
                {t.readOnlyCannot.map((linea) => (
                  <li key={linea} className="flex items-start gap-2">
                    <Icon name="close" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                    {linea}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-cuotly-green"
            >
              <Icon name="document" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text">{t.historyFilesTitle}</p>
              <p className="text-sm text-text-secondary">{t.historyFilesHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={historyHref}
                className="inline-flex items-center justify-center rounded-[10px] border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green transition-colors hover:bg-cuotly-green/10"
              >
                {t.historyLink}
              </Link>
              <Link
                href={filesHref}
                className="inline-flex items-center justify-center rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-soft-surface"
              >
                {t.filesLink}
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {history === null ? null : (
        <Card title={t.timelineTitle}>
          <ol className="relative space-y-6 border-l border-border pl-6">
            {history.map((paso, indice) => (
              <li key={`${paso.state}-${paso.at}`} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 ${
                    indice === 0 ? "border-text-secondary bg-text-secondary" : "border-cuotly-green bg-surface"
                  }`}
                />
                <p className="font-semibold text-text">
                  {es.space.statuses[paso.state as StatusKey] ?? paso.state}
                </p>
                <p className="text-sm text-text-secondary">
                  {enZona(paso.at, timeZone, { dateStyle: "medium" })}
                </p>
                {paso.created ? (
                  <p className="text-sm text-text-secondary">{t.timelineCreated}</p>
                ) : paso.reason === null ? null : (
                  <p className="text-sm text-text-secondary">{paso.reason}</p>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
