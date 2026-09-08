import Link from "next/link";

import { splitRemaining, type AttentionItem, type AttentionKind } from "@/core/home";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";

/**
 * "Necesita atención": la lista central del Inicio (§20.4, "solicitudes y
 * trabajos críticos ... incidencias").
 *
 * El orden llega decidido desde `src/core/home.ts` y esta lista no lo
 * toca: pintar en un orden y calcular en otro es la forma más fácil de que
 * la pantalla y las pruebas dejen de hablar de lo mismo.
 *
 * CA-21 · el nombre de cada estado sale de `naming.states`, el único sitio
 * donde un estado tiene nombre. Aquí no hay ni una etiqueta de estado
 * escrita a mano: la insignia de "Pendiente de validar" es literalmente la
 * misma cadena que se lee en la bandeja de solicitudes.
 *
 * §21.4 · el estado va con texto e icono, nunca solo con color.
 */
type Tone = "danger" | "warning" | "info" | "neutral";

const ASPECTO: Readonly<Record<AttentionKind, { tone: Tone; icon: IconName; entity: IconName }>> = {
  job_out_of_deadline: { tone: "danger", icon: "alert", entity: "job" },
  job_about_to_expire: { tone: "warning", icon: "clock", entity: "job" },
  job_pending_assignment: { tone: "warning", icon: "alert", entity: "job" },
  request_pending_validation: { tone: "warning", icon: "alert", entity: "request" },
  request_correction_requested: { tone: "info", icon: "alert", entity: "request" },
  job_blocked_by_client: { tone: "neutral", icon: "clock", entity: "job" },
};

/** El tiempo restante, en horas y minutos laborables. */
function tiempoRestante(minutes: number): string {
  const { hours, minutes: resto } = splitRemaining(minutes);
  if (hours === 0) return es.spaceHome.attention.minutes(resto);
  if (resto === 0) return es.spaceHome.attention.hours(hours);
  return es.spaceHome.attention.hoursAndMinutes(hours, resto);
}

function etiqueta(item: AttentionItem): string {
  switch (item.kind) {
    case "job_out_of_deadline":
      // RN-SLA-17 · condición calculada, no estado. Por eso sale de
      // `space.jobs`, donde vive esa condición, y no de `naming.states`.
      return es.space.jobs.outOfDeadline;
    case "job_about_to_expire": {
      // El plazo de inicio (T2, RN-SLA-05) y el de entrega (T3,
      // RN-SLA-11) no se dicen igual: "quedan 2 h" sin decir para qué no
      // significa nada.
      const restante = tiempoRestante(item.remainingMinutes ?? 0);
      return item.counter === "t3"
        ? es.spaceHome.attention.remainingToDeliver(restante)
        : es.spaceHome.attention.remainingToStart(restante);
    }
    case "job_pending_assignment":
      return es.naming.states.job.pending_assignment;
    case "job_blocked_by_client":
      return es.naming.states.job.blocked_by_client;
    case "request_pending_validation":
      return es.naming.states.request.pending_internal_validation;
    case "request_correction_requested":
      return es.naming.states.request.correction_requested;
  }
}

export function AttentionList({ items }: { items: readonly AttentionItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const aspecto = ASPECTO[item.kind];
        return (
          <li key={item.id} className="border-b border-border last:border-b-0">
            <Link
              href={item.deepLink}
              className="flex items-center gap-3 rounded-[10px] px-2 py-3 hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-text-secondary"
              >
                <Icon name={aspecto.entity} className="h-[18px] w-[18px]" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{item.title}</span>
                {item.establishment === null ? null : (
                  <span className="block truncate text-xs text-text-secondary">
                    {item.establishment}
                  </span>
                )}
              </span>

              <StatusBadge tone={aspecto.tone} icon={aspecto.icon}>
                {etiqueta(item)}
              </StatusBadge>

              {/*
                La acción principal de la fila, con el aspecto de un botón
                pero sin serlo: la fila ENTERA es el enlace, así que un
                `<button>` aquí dentro sería un control dentro de otro
                —HTML inválido y un tabulador de más— para llevar
                exactamente al mismo sitio. Pulsarlo hace lo que dice.
              */}
              {item.kind === "request_pending_validation" ? (
                <span className="hidden shrink-0 rounded-[10px] bg-primary px-3 py-1.5 text-xs font-medium text-surface sm:inline">
                  {es.spaceHome.attention.reviewRequest}
                </span>
              ) : null}

              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-text-secondary" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
