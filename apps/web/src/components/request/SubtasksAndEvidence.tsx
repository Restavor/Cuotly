import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { taskProgress } from "@/core/job-execution";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import type { EvidenceFile } from "@/app/espacios/[slug]/trabajos/[id]/evidence-load";
import type { JobTaskRow } from "@/app/espacios/[slug]/trabajos/[id]/tasks-load";

const t = es.establishmentSheet;

/**
 * RN-REQ-07 · las subtareas y las evidencias del trabajo, **bajo la
 * solicitud y en solo lectura** (decisión 64).
 *
 * **Lo que más decide la forma de esto es que no se toca nada desde
 * aquí.** No hay casillas, no hay botón de adjuntar y no hay menú: una
 * casilla que se pudiera marcar en dos sitios acabaría marcada en uno y no
 * en el otro. Y como una lista de tareas sin casillas parece rota, se dice
 * por qué: "se marcan en el trabajo", con el enlace al lado.
 *
 * **Tres vacíos distintos, tres frases distintas** (CA-20):
 *
 *   · No hay trabajo todavía → nace al aceptar la solicitud.
 *   · Hay trabajo y no está desglosado → nadie lo ha partido en tareas.
 *   · Hay trabajo y no tiene evidencias → nadie ha adjuntado nada.
 *
 * Los tres se parecerían en una lista vacía, y una lista vacía sin motivo
 * se lee como que algo falló.
 *
 * **Que se pinten no autoriza nada.** Las filas llegan ya filtradas por
 * `tasks_select` y `file_links_select`: al cliente no le llega ninguna
 * tarea (P7) y a un trabajador sin ese restaurante autorizado tampoco
 * (RN-ARC-05). Este componente no decide quién ve qué — solo pinta lo que
 * el servidor ya dejó pasar.
 */
type TaskStateKey = keyof typeof es.naming.states.task;

/**
 * Cómo se ve cada estado de una subtarea: icono y tono.
 *
 * `pending` e `in_progress` comparten el reloj a propósito —las dos están
 * esperando algo— y lo que las distingue es el texto de al lado, que va
 * siempre (§21.4: el estado se expresa con texto e icono, nunca solo con
 * color). Con un icono propio para cada una, la diferencia quedaría en un
 * dibujo de 16 px que nadie tiene por qué saber leer.
 */
const ASPECTO: Readonly<
  Record<string, { icon: "check" | "alert" | "close" | "clock"; tone: "success" | "danger" | "muted" | "normal" }>
> = {
  completed: { icon: "check", tone: "success" },
  blocked: { icon: "alert", tone: "danger" },
  cancelled: { icon: "close", tone: "muted" },
  in_progress: { icon: "clock", tone: "normal" },
  pending: { icon: "clock", tone: "normal" },
};

function tamaño(bytes: number | null): string | null {
  if (bytes === null) return null;
  // Con la coma del español: `toFixed()` escribe siempre un punto.
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function SubtasksAndEvidence({
  jobId,
  jobHref,
  tasks,
  evidence,
  timeZone,
}: {
  /** `null` cuando la solicitud todavía no se ha aceptado. */
  readonly jobId: string | null;
  readonly jobHref: string | null;
  readonly tasks: readonly JobTaskRow[];
  readonly evidence: readonly EvidenceFile[];
  /** La zona del espacio: las fechas se pintan en ella (CLAUDE.md). */
  readonly timeZone: string;
}) {
  const progreso = taskProgress(tasks);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
      <section>
        <h4 className="text-sm font-semibold text-text">
          {/*
            El recuento lo hace `taskProgress()` en `src/core/`, con sus
            tests, y no un `filter` aquí: una cancelada no cuenta en
            NINGUNO de los dos números, y hacerlo a ojo es como un trabajo
            con dos hechas y dos canceladas acaba leyéndose "2/4".
          */}
          {progreso.total === 0 ? t.subtasksTitle : t.subtasksTitleWithCount(progreso.done, progreso.total)}
        </h4>

        {jobId === null ? (
          <p className="mt-1 text-sm text-text-secondary">{t.subtasksNoJob}</p>
        ) : tasks.length === 0 ? (
          <p className="mt-1 text-sm text-text-secondary">{t.subtasksEmpty}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-text-secondary">{t.subtasksReadOnly}</p>
            <ul className="mt-2 space-y-1.5">
              {tasks.map((task) => {
                const aspecto = ASPECTO[task.state] ?? ASPECTO.pending;
                return (
                  <li key={task.id} className="flex items-start gap-2 text-sm">
                    {/*
                      Un icono, no una casilla: `<input type="checkbox"
                      disabled>` se ve como un control apagado e invita a
                      preguntarse por qué no se deja pulsar. Esto es una
                      marca de estado, que es lo que de verdad es.
                    */}
                    <Icon
                      name={aspecto.icon}
                      aria-hidden="true"
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        aspecto.tone === "success"
                          ? "text-success"
                          : aspecto.tone === "danger"
                            ? "text-danger"
                            : "text-text-secondary"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block ${
                          task.state === "cancelled" ? "text-text-secondary line-through" : "text-text"
                        }`}
                      >
                        {task.title}
                      </span>
                      {/*
                        §21.4 · el estado va con TEXTO, nunca solo con el
                        color del icono. Y quién la lleva al lado, que es
                        información interna del equipo: estas filas ya se
                        las ha negado RLS a quien no debe verlas.
                      */}
                      <span className="block text-xs text-text-secondary">
                        {es.naming.states.task[task.state as TaskStateKey] ?? task.state}
                        {" · "}
                        {task.assigneeName ?? t.subtasksUnassigned}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section>
        <h4 className="text-sm font-semibold text-text">{t.evidenceTitle}</h4>

        {jobId === null ? (
          <p className="mt-1 text-sm text-text-secondary">{t.evidenceNoJob}</p>
        ) : evidence.length === 0 ? (
          <p className="mt-1 text-sm text-text-secondary">{t.evidenceEmpty}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-text-secondary">{t.evidenceReadOnly}</p>
            <ul className="mt-2 space-y-1.5">
              {evidence.map((archivo) => {
                const peso = tamaño(archivo.sizeBytes);
                return (
                  <li key={archivo.id} className="text-sm">
                    {/*
                      La descarga va por `/api/archivos/<id>`, que comprueba
                      `can_read_file()` y contesta 404 —no 403— a quien no
                      puede: un 403 confirmaría que el archivo existe.

                      Descargar no es operar sobre la evidencia: es leerla,
                      que es justo lo que "solo lectura" permite.
                    */}
                    <a
                      href={`/api/archivos/${archivo.id}`}
                      className="text-cuotly-green underline focus:outline focus:outline-2 focus:outline-cuotly-green"
                    >
                      {archivo.name}
                    </a>
                    <span className="block text-xs text-text-secondary">
                      {enZona(archivo.attachedAt, timeZone, { dateStyle: "medium" })}
                      {peso === null ? null : ` · ${peso}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/*
        El enlace al trabajo, una sola vez para las dos listas: es el
        destino de "se marcan allí" y de "se adjuntan allí", y repetirlo
        arriba y abajo sería dos paradas de tabulador para el mismo sitio.

        Dice **adónde lleva**, no lo que ya dicen las dos frases de arriba.
        Al mirarlo pintado se veía el mismo hecho escrito tres veces en la
        misma tarjeta; un enlace tiene que nombrar su destino.
      */}
      {jobHref === null ? null : (
        <p className="text-sm sm:col-span-2">
          <Link
            href={jobHref}
            className="text-cuotly-green underline focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            {t.openJobLink}
          </Link>
        </p>
      )}
    </div>
  );
}
