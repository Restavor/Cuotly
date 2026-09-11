import { ESTABLISHMENT_STATUSES, statusEffects } from "@/core/establishment-status";
import { es } from "@/i18n/es";

/**
 * Maqueta 20 · "Estados del restaurante": los siete, con lo que significa
 * cada uno y el actual resaltado.
 *
 * **Por qué una leyenda merece existir.** Los estados no son etiquetas
 * decorativas: deciden si se puede pedir un cambio, si corren los
 * contadores y si el restaurante sigue en la lista activa. "Pausado" y
 * "Solo lectura" se parecen y no son lo mismo, y quien recibe uno de los
 * dos necesita saber cuál le ha tocado sin preguntar.
 *
 * Lo que dice cada tarjeta sale de las reglas escritas —RN-EST-08, 09 y
 * 10, RN-FIN-10/12— y de la guarda del servidor, no de la maqueta: lo que
 * la pantalla promete y lo que el servidor permite tienen que ser la misma
 * cosa (`statusEffects`, con sus tests).
 */
export function StatusLegend({ current }: { current: string }) {
  const textos = es.establishmentStatus.notices as Readonly<
    Record<string, { readonly title: string; readonly meaning: string }>
  >;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ESTABLISHMENT_STATUSES.map((status) => {
        const actual = status === current;
        const efectos = statusEffects(status);

        return (
          <li
            key={status}
            // El actual se marca con borde y fondo, no solo con color:
            // §21.4 pide que un estado no se exprese únicamente con color.
            className={`rounded-[10px] border p-3 ${
              actual ? "border-cuotly-green bg-cuotly-green/10" : "border-border bg-surface"
            }`}
          >
            <p className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-primary-dark">
              {es.space.statuses[status]}
              {actual ? (
                <span className="text-xs font-normal text-cuotly-green">
                  {es.establishmentStatus.currentMark}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-text-secondary">{textos[status].meaning}</p>
            {/*
              Y si el servicio está detenido en ese estado, se dice aquí
              también: es el dato por el que alguien mira esta lista.
            */}
            {efectos.serviceRunning ? null : (
              <p className="mt-1 text-xs font-medium text-text">
                {es.establishmentStatus.serviceStoppedMark}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
