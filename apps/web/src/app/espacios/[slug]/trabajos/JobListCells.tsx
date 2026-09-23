import { StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { ProjectedDeadline } from "@/core/job-board";
import { es } from "@/i18n/es";

import { fechaDelPlazo } from "./JobsOverview";

/**
 * M09 · la columna Plazo: cuándo vence lo que corre, "Fuera de plazo" si
 * ya se ha pasado (RN-SLA-17), "En pausa" si el contador está parado
 * (RN-SLA-14) y "Sin plazo" si no hay ninguno que mande en su estado.
 */
export function CeldaPlazo({
  deadline,
  counter,
  timeZone,
  now,
}: {
  /** `null`: no se ha podido leer; `"none"`: no hay ningún plazo corriendo. */
  deadline: ProjectedDeadline | "none" | null;
  counter: "t2" | "t3" | null;
  timeZone: string;
  now: Date;
}) {
  const t = es.teamArea.jobs;
  if (deadline === null) return <span className="text-xs text-text-secondary">{t.countFailed}</span>;
  if (deadline === "none") return <span className="text-text-secondary">{t.deadlineNone}</span>;
  if (deadline.kind === "overdue") {
    return <StatusBadge tone="danger">{es.space.jobs.outOfDeadline}</StatusBadge>;
  }
  return (
    <span className="block whitespace-nowrap">
      <span className="block text-sm font-medium text-text">
        {deadline.kind === "paused" ? t.deadlinePaused : fechaDelPlazo(deadline.at, timeZone, now)}
      </span>
      {counter === null ? null : (
        <span className="block text-xs text-text-secondary">{t.deadlinesCounter[counter]}</span>
      )}
    </span>
  );
}

/** M09 · Evidencia y Comentarios: el número, con lo que cuenta dicho para el lector de pantalla. */
export function Recuento({
  total,
  icon,
  label,
}: {
  total: number | null;
  icon: "document" | "messages";
  label: (total: number) => string;
}) {
  if (total === null) {
    return <span className="text-xs text-text-secondary">{es.teamArea.jobs.countFailed}</span>;
  }
  return (
    <span
      title={label(total)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-medium ${
        total === 0 ? "text-text-secondary" : "bg-soft-surface text-text"
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      <span className="sr-only">{label(total)}</span>
      <span aria-hidden="true">{total}</span>
    </span>
  );
}
