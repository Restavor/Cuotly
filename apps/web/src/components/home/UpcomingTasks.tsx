import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * Página 22 del diseño definitivo móvil · "Próximas tareas": lo que viene
 * por delante en el calendario del espacio.
 *
 * **No hay una lista de tareas propia.** Cada fila es un evento DERIVADO
 * de su propia fecha —una publicación de menú, un plazo de trabajo, un
 * cobro, una renovación, un festivo— tal como los devuelve
 * `space_calendar()` (RN-DAT-05). Por eso no se puede reordenar: el
 * diseño dibuja un asa de arrastre (⋮) a la izquierda de cada fila, y no
 * va, porque no hay ningún orden que guardar. Un asa que no puede mover
 * nada es un botón que miente.
 *
 * **"Hoy" lo decide el servidor.** `today` llega calculado en la zona del
 * espacio y se compara como texto con el día de la tarea: no hay ningún
 * instante que convertir aquí, así que el huso de quien mira —que puede
 * estar en otro país— no se cuela (CLAUDE.md MUST).
 */
export type UpcomingTask = {
  readonly key: string;
  /** Día civil `AAAA-MM-DD` en la zona del espacio. */
  readonly day: string;
  readonly title: string;
  /** El tipo de evento, para cuando la tarea no es de ningún restaurante. */
  readonly kind: string;
  readonly establishmentName: string | null;
  /** A dónde lleva la fila, o `null` si eso no tiene ficha propia. */
  readonly href: string | null;
};

export function UpcomingTasks({
  tasks,
  today,
  kindLabel,
}: {
  readonly tasks: readonly UpcomingTask[];
  readonly today: string;
  /**
   * Cómo se llama cada tipo de evento. Llega de fuera, del calendario, a
   * propósito: si esta lista tuviera su propio diccionario, el mismo
   * evento se llamaría de dos maneras según la pantalla desde la que se
   * mirara.
   */
  readonly kindLabel: (kind: string) => string;
}) {
  const t = es.spaceHome.upcoming;

  return (
    <ul className="divide-y divide-border">
      {tasks.map((tarea) => {
        const esHoy = tarea.day === today;
        const fecha = esHoy
          ? t.today
          : t.day(Number(tarea.day.slice(8, 10)), Number(tarea.day.slice(5, 7)));

        const contenido = (
          <span className="flex items-baseline gap-3 py-3">
            <span
              className={`w-14 shrink-0 text-xs font-semibold ${
                esHoy ? "text-cuotly-green" : "text-text-secondary"
              }`}
            >
              {fecha}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-text">{tarea.title}</span>
              {/*
                Debajo, de quién es. Un festivo o una ausencia no son de
                ningún restaurante: entonces va el tipo de evento, que sí
                dice algo, en lugar de una línea en blanco.
              */}
              <span className="block truncate text-xs text-text-secondary">
                {tarea.establishmentName ?? kindLabel(tarea.kind)}
              </span>
            </span>
            {tarea.href !== null ? (
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-text-secondary" />
            ) : null}
          </span>
        );

        return (
          <li key={tarea.key}>
            {tarea.href === null ? (
              // Un festivo y una ausencia se gestionan en el calendario y
              // no tienen ficha propia: la fila se queda quieta en vez de
              // llevar a una pantalla que no existe.
              <span className="block">{contenido}</span>
            ) : (
              <Link
                href={tarea.href}
                className="block transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                {contenido}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
