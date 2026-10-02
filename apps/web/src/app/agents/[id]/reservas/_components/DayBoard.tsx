"use client";

import { useEffect, useState } from "react";

import { CapacityMeter, ReservationRow } from "@/components/agents";
import { Icon, type IconName } from "@/components/ui/Icon";
import { isOriginFilter, ORIGIN_FILTERS, type OriginFilter } from "@/core/reservations/agenda";
import { es } from "@/i18n/es";

import type { DayBlockData, DayCounters } from "./day-types";
import { RowActions } from "./RowActions";

const FILTER_ICON: Partial<Record<OriginFilter, IconName>> = { agent: "headset", platform: "globe", web: "window", manual: "pencil" };

/** Los filtros se recuerdan en este dispositivo (RES-01), uno por restaurante. */
function storageKey(establishmentId: string): string {
  return `restavor.agents.filtro-origen.${establishmentId}`;
}

function readStoredFilter(establishmentId: string): OriginFilter {
  try {
    const value = window.localStorage.getItem(storageKey(establishmentId));
    return isOriginFilter(value) ? value : "all";
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): se ven todas, y funciona igual.
    return "all";
  }
}

function writeStoredFilter(establishmentId: string, value: OriginFilter): void {
  try {
    window.localStorage.setItem(storageKey(establishmentId), value);
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Hoy · los filtros por origen con sus contadores y un bloque por turno con su aforo y sus
 * filas (RES-01; `AgentsHoy`, `AgentsHoyMovil`). El servidor manda todas las filas del día
 * y la ocupación de cada turno del día ENTERO: el filtro solo decide qué filas se ven, no
 * cuánto aforo queda (el aforo es del turno, no de lo que se está mirando).
 */
export function DayBoard({
  establishmentId,
  date,
  counters,
  blocks,
}: {
  establishmentId: string;
  date: string;
  counters: DayCounters;
  blocks: readonly DayBlockData[];
}) {
  const t = es.agents.agenda.today;
  const [filter, setFilter] = useState<OriginFilter>("all");

  // Se lee al montar: el servidor no sabe qué filtro dejó esta tablet.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con el almacenamiento del navegador, que no existe en el servidor
    setFilter(readStoredFilter(establishmentId));
  }, [establishmentId]);

  function pick(value: OriginFilter) {
    setFilter(value);
    writeStoredFilter(establishmentId, value);
  }

  return (
    <div className="space-y-6">
      <div role="group" aria-label={t.filtersLabel} className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        {ORIGIN_FILTERS.map((value) => {
          const on = filter === value;
          const icon = FILTER_ICON[value];
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => pick(value)}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
                on ? "border-primary bg-primary text-surface" : "border-border bg-surface text-text hover:bg-soft-surface"
              }`}
            >
              {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
              {t.filters[value]}
              <span className={`rounded-full px-2 text-xs tabular-nums ${on ? "bg-surface/20" : "bg-soft-surface"}`}>
                {counters[value]}
              </span>
            </button>
          );
        })}
      </div>

      {blocks.map((block) => {
        const rows = filter === "all" ? block.rows : block.rows.filter((row) => row.origin === filter);
        return (
          <section
            key={block.key}
            aria-label={block.shift?.name ?? t.offShift}
            className="rounded-card border border-border bg-surface p-4 sm:p-5"
          >
            {block.shift && block.state !== null ? (
              <CapacityMeter name={block.shift.name} range={block.shift.range} capacity={block.shift.capacity} occupied={block.occupied} />
            ) : (
              <div>
                <h3 className="text-[17px] font-semibold sm:text-lg">{t.offShift}</h3>
                <p className="text-sm text-text-secondary">{t.offShiftHint}</p>
              </div>
            )}
            {rows.length > 0 ? (
              <ul className="mt-3 divide-y divide-border/60">
                {rows.map((row) => (
                  <ReservationRow
                    key={row.id}
                    id={`reserva-${row.id}`}
                    href={row.href}
                    time={row.time}
                    name={row.name}
                    note={row.note}
                    partySize={row.partySize}
                    origin={row.origin}
                    platformName={row.platformName}
                    status={row.status}
                    isNew={row.isNew}
                    duplicate={row.duplicate}
                    largeGroup={row.largeGroup}
                    cancelledNote={row.cancelledNote ?? undefined}
                    actions={
                      row.status === "pending" || row.duplicatePartnerId ? (
                        <RowActions
                          establishmentId={establishmentId}
                          reservationId={row.id}
                          date={date}
                          pending={row.status === "pending"}
                          duplicatePartnerId={row.duplicatePartnerId}
                          fichaHref={row.href}
                          rejectHref={`${row.href}?rechazar=1`}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
