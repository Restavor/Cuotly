"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { formatMinutes, formatShortDate } from "@/core/reservations/format";
import { setWeekdayOpen } from "@/core/reservations/schedule-validation";
import { es } from "@/i18n/es";

import { saveSettingsAction, saveShiftsAction, setClosedDateAction } from "../actions";
import { draftIssues, emptyDraft, ShiftCard, Stepper, toDraft, toInputs, toShifts, WeekdayToggles, type DraftShift } from "./ScheduleParts";
import type { RestaurantSchedule } from "@/services/reservations-gateway";
import { withSavedIds } from "./schedule-draft";

/**
 * Ajustes › Horarios (RES-12; PRD de agents §6.2, `Ajustes`): los días que abrís (un atajo
 * sobre todos los turnos), los turnos con su aforo, las horas de reserva (cada 15 o 30
 * minutos), los grupos grandes, los días cerrados y los límites del agente y la web.
 *
 * Al guardar, el servidor repite las validaciones y, si el cambio dejaría sin sitio reservas
 * futuras (quitar un turno, quitarle un día, cerrar un día), no lo guarda y dice cuántas son:
 * hay que moverlas o cancelarlas antes (RN-RES-01).
 */
export function ScheduleEditor({ establishmentId, schedule }: { establishmentId: string; schedule: RestaurantSchedule }) {
  const t = es.agents.agenda.hours;
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [shifts, setShifts] = useState<readonly DraftShift[]>(() => schedule.shifts.filter((s) => s.active).map(toDraft));
  const [interval, setIntervalValue] = useState<15 | 30>(schedule.slotInterval);
  const [threshold, setThreshold] = useState(schedule.largeGroupThreshold);
  const [minNotice, setMinNotice] = useState(schedule.minNoticeMinutes);
  const [maxAdvance, setMaxAdvance] = useState(schedule.maxAdvanceDays);
  const [cancelLimit, setCancelLimit] = useState(schedule.customerCancelLimitMinutes);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const [closedDate, setClosedDate] = useState("");
  const [closedReason, setClosedReason] = useState("");
  const [closedFeedback, setClosedFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const issues = draftIssues(shifts);
  const openDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => shifts.some((s) => s.active && s.weekdays.includes(d)));

  function updateShift(key: string, next: DraftShift) {
    setShifts((current) => current.map((s) => (s.key === key ? next : s)));
  }

  function toggleOpenDay(day: number) {
    const open = !openDays.includes(day);
    const next = setWeekdayOpen(toShifts(shifts), day, open);
    setShifts((current) => current.map((s) => ({ ...s, weekdays: next.find((n) => n.id === s.key)?.weekdays ?? s.weekdays })));
  }

  function save() {
    setFeedback(null);
    if (issues.length > 0) {
      setFeedback({ ok: false, message: issues[0] });
      return;
    }
    startTransition(async () => {
      const shiftsResult = await saveShiftsAction({ establishmentId, shifts: toInputs(shifts) });
      if (!shiftsResult.ok) {
        setFeedback(shiftsResult);
        return;
      }
      // Los turnos nuevos ya existen: si los ajustes fallan y se vuelve a guardar, se actualizan en vez de crearse otra vez.
      setShifts((current) => withSavedIds(current, shiftsResult.shiftIds));
      const settingsResult = await saveSettingsAction({
        establishmentId,
        settings: { slotInterval: interval, largeGroupThreshold: threshold, minNoticeMinutes: minNotice, maxAdvanceDays: maxAdvance, customerCancelLimitMinutes: cancelLimit },
      });
      setFeedback(settingsResult);
      if (settingsResult.ok) router.refresh();
    });
  }

  function changeClosedDate(date: string, reason: string, closed: boolean) {
    setClosedFeedback(null);
    startTransition(async () => {
      const result = await setClosedDateAction({ establishmentId, date, reason, closed });
      setClosedFeedback(result);
      if (result.ok) {
        if (closed) {
          setClosedDate("");
          setClosedReason("");
        }
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="h-open-days" className="space-y-3">
        <h2 id="h-open-days" className="text-lg font-semibold">{t.openDays}</h2>
        <WeekdayToggles label={t.openDays} selected={openDays} onToggle={toggleOpenDay} />
        <p className="text-sm text-text-secondary">{t.openDaysHint}</p>
      </section>

      <section aria-labelledby="h-shifts" className="space-y-3">
        <h2 id="h-shifts" className="text-lg font-semibold">{t.shifts}</h2>
        {shifts.map((shift) => (
          <ShiftCard key={shift.key} shift={shift} onChange={(next) => updateShift(shift.key, next)} onRemove={() => setShifts((c) => c.filter((s) => s.key !== shift.key))} />
        ))}
        <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setShifts((c) => [...c, emptyDraft(t.newShiftName)])}>
          {t.addShift}
        </Button>
        <p className="text-sm text-text-secondary">{t.shiftHint}</p>
        {issues.length > 0 ? (
          <ul role="status" className="list-disc space-y-1 pl-5 text-sm text-danger">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="h-interval" className="space-y-3">
        <h2 id="h-interval" className="text-lg font-semibold">{t.slotInterval}</h2>
        <div className="flex gap-2">
          {([15, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={interval === value}
              onClick={() => setIntervalValue(value)}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold ${
                interval === value ? "border-primary bg-primary text-surface" : "border-border bg-surface hover:bg-soft-surface"
              }`}
            >
              {value === 15 ? t.every15 : t.every30}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="h-groups" className="space-y-3">
        <h2 id="h-groups" className="text-lg font-semibold">{t.groups}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">{t.groupThreshold}</span>
          <Stepper label={t.groupThreshold} value={threshold} onChange={setThreshold} min={2} />
        </div>
        <p className="text-sm text-text-secondary">{t.groupHint(threshold)}</p>
      </section>

      <section aria-labelledby="h-closed" className="space-y-3">
        <h2 id="h-closed" className="text-lg font-semibold">{t.closedDays}</h2>
        {schedule.closedDates.length === 0 ? <p className="text-sm text-text-secondary">{t.closedDaysEmpty}</p> : null}
        <ul className="space-y-2">
          {schedule.closedDates.map((c) => (
            <li key={c.date} className="flex items-center justify-between gap-3 rounded-field border border-border bg-surface px-4 py-2 text-sm">
              <span>
                <strong>{formatShortDate(c.date)}</strong> · {c.reason}
              </span>
              <button
                type="button"
                aria-label={t.removeClosedDay(formatShortDate(c.date))}
                disabled={busy}
                onClick={() => changeClosedDate(c.date, "", false)}
                className="flex h-11 w-11 items-center justify-center rounded-field hover:bg-soft-surface"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
          <label className="text-sm font-semibold">
            {t.closedDayDate}
            <input
              type="date"
              value={closedDate}
              onChange={(e) => setClosedDate(e.target.value)}
              className="mt-1 block min-h-[44px] rounded-field border border-border bg-surface px-3 text-[15px] font-normal"
            />
          </label>
          <label className="min-w-48 flex-1 text-sm font-semibold">
            {t.closedDayReason}
            <input
              type="text"
              value={closedReason}
              onChange={(e) => setClosedReason(e.target.value)}
              placeholder={t.closedDayReasonPlaceholder}
              className="mt-1 block min-h-[44px] w-full rounded-field border border-border bg-surface px-3 text-[15px] font-normal"
            />
          </label>
          <Button type="button" variant="outline" className="min-h-[44px]" pending={busy} disabled={closedDate === ""} onClick={() => changeClosedDate(closedDate, closedReason, true)}>
            {t.closedDayAdd}
          </Button>
        </div>
        {closedFeedback ? (
          <p role={closedFeedback.ok ? "status" : "alert"} className={`text-sm ${closedFeedback.ok ? "text-success" : "text-danger"}`}>
            {closedFeedback.message}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="h-limits" className="space-y-3">
        <h2 id="h-limits" className="text-lg font-semibold">{t.limits}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">{t.minNotice}</span>
          <Stepper label={t.minNotice} value={minNotice} onChange={setMinNotice} step={30} min={0} format={formatMinutes} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">{t.maxAdvance}</span>
          <Stepper label={t.maxAdvance} value={maxAdvance} onChange={setMaxAdvance} step={1} min={1} format={t.days} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold">{t.cancelLimit}</span>
          <Stepper label={t.cancelLimit} value={cancelLimit} onChange={setCancelLimit} step={30} min={0} format={(m) => t.cancelLimitValue(formatMinutes(m))} />
        </div>
        <p className="text-sm text-text-secondary">{t.limitsHint}</p>
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        {feedback ? (
          <p role={feedback.ok ? "status" : "alert"} className={`mb-2 text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>
            {feedback.message}
          </p>
        ) : null}
        <Button type="button" pending={busy} className="min-h-[48px] w-full sm:w-auto" onClick={save}>
          {busy ? es.agents.agenda.common.saving : es.agents.agenda.common.save}
        </Button>
      </div>
    </div>
  );
}
