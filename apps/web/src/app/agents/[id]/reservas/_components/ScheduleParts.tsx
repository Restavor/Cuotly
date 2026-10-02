"use client";

import { Button } from "@/components/ui";
import { weekdayName } from "@/core/reservations/format";
import { validateSchedule } from "@/core/reservations/schedule-validation";
import type { Shift } from "@/core/reservations/shifts";
import { es } from "@/i18n/es";
import type { ShiftInput } from "@/services/reservations-gateway";

/** Un turno mientras se edita: el aforo es texto porque el campo puede estar vacío. */
export interface DraftShift {
  readonly key: string;
  readonly id?: string;
  readonly name: string;
  readonly weekdays: readonly number[];
  readonly startTime: string;
  readonly lastBookingTime: string;
  readonly endTime: string;
  readonly capacity: string;
  readonly active: boolean;
}

let counter = 0;
export function newKey(): string {
  counter += 1;
  return `nuevo-${counter}`;
}

export function toDraft(shift: Shift): DraftShift {
  return {
    key: shift.id,
    id: shift.id,
    name: shift.name,
    weekdays: shift.weekdays,
    startTime: shift.startTime,
    lastBookingTime: shift.lastBookingTime,
    endTime: shift.endTime,
    capacity: String(shift.capacity),
    active: shift.active,
  };
}

export function emptyDraft(name: string): DraftShift {
  return { key: newKey(), name, weekdays: [], startTime: "", lastBookingTime: "", endTime: "", capacity: "", active: true };
}

/** Los turnos activos del borrador como los entiende el dominio, para validar al momento. Un campo vacío es un problema, no un cero. */
export function toShifts(drafts: readonly DraftShift[]): readonly Shift[] {
  return drafts.map((d) => ({
    id: d.key,
    name: d.name,
    weekdays: d.weekdays,
    startTime: d.startTime || "00:00",
    lastBookingTime: d.lastBookingTime || "00:00",
    endTime: d.endTime || "00:00",
    capacity: Number(d.capacity) || 0,
    active: d.active,
  }));
}

export function toInputs(drafts: readonly DraftShift[]): readonly ShiftInput[] {
  return drafts
    .filter((d) => d.active)
    .map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      name: d.name.trim(),
      weekdays: d.weekdays,
      startTime: d.startTime,
      lastBookingTime: d.lastBookingTime,
      endTime: d.endTime,
      capacity: Number(d.capacity),
      active: true,
    }));
}

/** Los problemas del borrador, ya redactados, para enseñarlos antes de guardar. */
export function draftIssues(drafts: readonly DraftShift[]): readonly string[] {
  const issues = es.agents.agenda.hours.issues as Record<string, string>;
  const active = drafts.filter((d) => d.active);
  const messages = new Set<string>();
  for (const d of active) {
    if (d.startTime === "" || d.lastBookingTime === "" || d.endTime === "") messages.add(issues.start_not_before_last_booking);
  }
  if (messages.size === 0) {
    for (const issue of validateSchedule(toShifts(active))) {
      messages.add(issues[issue.kind === "overlap" ? "overlap" : issue.issue]);
    }
  }
  return [...messages];
}

export function WeekdayToggles({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: readonly number[];
  onToggle: (weekday: number) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const on = selected.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={weekdayName(d, "long")}
            onClick={() => onToggle(d)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold ${
              on ? "border-primary bg-primary text-surface" : "border-border bg-surface text-text hover:bg-soft-surface"
            }`}
          >
            {weekdayName(d, "narrow")}
          </button>
        );
      })}
    </div>
  );
}

/** Un valor con «−» y «+» (la maqueta de Ajustes). Admite escribirlo también. */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  format,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  format?: (value: number) => string;
}) {
  const t = es.agents.agenda.hours;
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={t.less}
        disabled={value - step < min}
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex h-11 w-11 items-center justify-center rounded-field border border-border bg-surface text-lg font-semibold hover:bg-soft-surface disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-16 text-center text-base font-semibold tabular-nums" aria-live="polite">
        {format ? format(value) : value}
      </span>
      <button
        type="button"
        aria-label={t.more}
        onClick={() => onChange(value + step)}
        className="flex h-11 w-11 items-center justify-center rounded-field border border-border bg-surface text-lg font-semibold hover:bg-soft-surface"
      >
        +
      </button>
    </div>
  );
}

const timeInput = "mt-1 block min-h-[44px] w-full rounded-field border border-border bg-surface px-3 text-[15px]";

/**
 * Un turno del editor de horarios: nombre, días de la semana, apertura, cierre, última
 * hora de reserva y, si `withCapacity`, el aforo (PRD §6.2; `Ajustes` y `PrimerUso`).
 */
export function ShiftCard({
  shift,
  onChange,
  onRemove,
  withDays = true,
  withTimes = true,
  withCapacity = true,
}: {
  shift: DraftShift;
  onChange: (next: DraftShift) => void;
  onRemove?: () => void;
  withDays?: boolean;
  withTimes?: boolean;
  withCapacity?: boolean;
}) {
  const t = es.agents.agenda.hours;
  const capacity = Number(shift.capacity) || 0;
  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-4">
      {withDays || withTimes ? (
        <div className="flex items-end gap-3">
          <label className="flex-1 text-sm font-semibold">
            {t.shiftName}
            <input
              type="text"
              value={shift.name}
              onChange={(e) => onChange({ ...shift, name: e.target.value })}
              className={`${timeInput} font-normal`}
            />
          </label>
          {onRemove ? (
            <Button type="button" variant="secondary" className="min-h-[44px]" onClick={onRemove}>
              {t.removeShift}
            </Button>
          ) : null}
        </div>
      ) : null}
      {withDays ? (
        <WeekdayToggles
          label={t.shiftDays(shift.name || t.newShiftName)}
          selected={shift.weekdays}
          onToggle={(d) =>
            onChange({
              ...shift,
              weekdays: shift.weekdays.includes(d) ? shift.weekdays.filter((x) => x !== d) : [...shift.weekdays, d].sort((a, b) => a - b),
            })
          }
        />
      ) : null}
      {withTimes ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold">
            {t.opens}
            <input type="time" value={shift.startTime} onChange={(e) => onChange({ ...shift, startTime: e.target.value })} className={`${timeInput} font-normal tabular-nums`} />
          </label>
          <label className="text-sm font-semibold">
            {t.closes}
            <input type="time" value={shift.endTime} onChange={(e) => onChange({ ...shift, endTime: e.target.value })} className={`${timeInput} font-normal tabular-nums`} />
          </label>
          <label className="text-sm font-semibold">
            {t.lastBooking}
            <input
              type="time"
              value={shift.lastBookingTime}
              onChange={(e) => onChange({ ...shift, lastBookingTime: e.target.value })}
              className={`${timeInput} font-normal tabular-nums`}
            />
          </label>
        </div>
      ) : null}
      {withCapacity ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">{t.capacity}</span>
          <div className="flex items-center gap-2">
            <Stepper label={t.capacity} value={capacity} onChange={(n) => onChange({ ...shift, capacity: String(n) })} min={0} />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              aria-label={t.capacity}
              value={shift.capacity}
              onChange={(e) => onChange({ ...shift, capacity: e.target.value })}
              className="min-h-[44px] w-24 rounded-field border border-border bg-surface px-3 text-[15px] tabular-nums"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
