import { StatusBadge } from "@/components/ui/StatusBadge";
import { capacityFillPercent, capacityState, type CapacityState } from "@/core/reservations/capacity";
import { es } from "@/i18n/es";

/** El relleno por estado. `meter-warn` es el tramo de «casi lleno»; superado usa `danger` (decisión 104). */
const FILL: Record<CapacityState, string> = {
  ok: "bg-primary",
  warn: "bg-meter-warn",
  over: "bg-danger",
};

/**
 * La cabecera de un turno con su barra de aforo (PRD de agents §6.3, `AgentsHoy`): el
 * nombre y el horario, «23 de 40 personas» y una barra que va de verde a mostaza desde
 * el 85 % y a rojo por encima del 100 %.
 *
 * El color nunca es la única señal (PRD §21.4): «Casi lleno» y «Aforo superado» van
 * además con texto e icono, y la barra tiene su descripción para quien no la ve. La
 * regla de los estados está en `core/reservations/capacity.ts`.
 */
export function CapacityMeter({
  name,
  range,
  capacity,
  occupied,
}: {
  name: string;
  /** «13:00 – 16:00». */
  range: string;
  capacity: number;
  /** Personas de las reservas pendientes y confirmadas del turno. */
  occupied: number;
}) {
  const t = es.agents.components.meter;
  const state = capacityState(capacity, occupied);
  return (
    <div data-meter={state}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h3 className="text-[17px] font-semibold sm:text-lg">{name}</h3>
          <span className="text-sm tabular-nums text-text-secondary">{range}</span>
        </div>
        <p className="text-sm tabular-nums text-text-secondary">
          <strong className="text-lg font-bold text-text">{occupied}</strong>{" "}
          <span className="hidden sm:inline">{t.ofTotal(capacity)}</span>
          <span className="sm:hidden">{t.ofTotalShort(capacity)}</span>
        </p>
      </div>
      <span
        role="img"
        aria-label={t.label(name, occupied, capacity)}
        className="mt-3 block h-2 w-full overflow-hidden rounded-full bg-soft-surface"
      >
        <span
          className={`block h-full rounded-full ${FILL[state]}`}
          style={{ width: `${capacityFillPercent(capacity, occupied)}%` }}
        />
      </span>
      {state === "warn" ? (
        <p className="mt-2">
          <StatusBadge tone="warning" icon="warning">
            {t.almostFull}
          </StatusBadge>
        </p>
      ) : null}
      {state === "over" ? (
        <p className="mt-2">
          <StatusBadge tone="danger" icon="alert">
            {t.over}
          </StatusBadge>
        </p>
      ) : null}
    </div>
  );
}
