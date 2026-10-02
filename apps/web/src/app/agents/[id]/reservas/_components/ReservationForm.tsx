"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { OriginChip } from "@/components/agents";
import { Button, Field, Modal, TextArea } from "@/components/ui";
import { addDays } from "@/core/reservations/dates";
import type { BookingField } from "@/core/reservations/booking-input";
import { formatLongDate } from "@/core/reservations/format";
import { reservationHref, todayHref } from "@/core/reservations/agents-routes";
import { slotsOfDay, type Shift, type SlotInterval } from "@/core/reservations/shifts";
import { es } from "@/i18n/es";

import { dayOccupancyAction, saveReservationAction } from "../actions";
import type { SaveReservationResult } from "../action-state";
import { announceLocalChange } from "./local-change";

export interface ReservationFormInitial {
  readonly reservationId: string;
  readonly date: string;
  readonly time: string;
  readonly partySize: number;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly notes: string;
  readonly language: "es" | "en";
}

type Props = {
  establishmentId: string;
  /** `null` = Nueva reserva; con datos, Editar. */
  initial: ReservationFormInitial | null;
  shifts: readonly Shift[];
  closedDates: readonly string[];
  slotInterval: SlotInterval;
  today: string;
  /** La fecha con la que abre una reserva nueva (la de Hoy desde donde se llegó). */
  startDate: string;
  creatorName: string;
  /** Fecha, hora y personas no se pueden cambiar: plataforma sin conector, o Reservas en pausa. */
  schedulingLockedReason: string | null;
  /** El origen de la reserva que se edita, para el chip. */
  origin: { readonly origin: "agent" | "platform" | "web" | "manual"; readonly platformName: string | null } | null;
  /** Con Reservas en pausa no se crean reservas nuevas. */
  creationBlockedReason: string | null;
};

const PARTY_QUICK = [1, 2, 3, 4, 5, 6] as const;

function chip(on: boolean): string {
  return `inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border px-4 text-sm font-semibold transition-colors ${
    on ? "border-primary bg-primary text-surface" : "border-border bg-surface text-text hover:bg-soft-surface"
  }`;
}

/**
 * Nueva reserva y Editar reserva (RES-02, RES-04; `NuevaReserva`, `EditarReserva`). Un solo
 * formulario: fecha (Hoy, Mañana, Otro día), personas (1–6 y 7 o más), turno, hora, nombre,
 * teléfono, email opcional, idioma de los avisos y nota con atajos; «Quedan X de Y plazas»
 * y el aviso de aforo. Los días cerrados no dejan elegir hora.
 *
 * Esta pantalla no decide nada: `book_reservation` comprueba permiso, estado del servicio,
 * aforo y huecos, y aquí solo se enseña lo que contesta (CLAUDE.md).
 */
export function ReservationForm(props: Props) {
  const { establishmentId, initial, shifts, closedDates, slotInterval, today, startDate, creatorName, schedulingLockedReason, origin, creationBlockedReason } = props;
  const t = es.agents.agenda.newReservation;
  const router = useRouter();
  const isEdit = initial !== null;
  const locked = schedulingLockedReason !== null;
  const [pending, startTransition] = useTransition();
  // Una clave por formulario abierto: pulsar «Guardar» dos veces crea una sola reserva.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [date, setDate] = useState(initial?.date ?? startDate);
  const [datePick, setDatePick] = useState<"today" | "tomorrow" | "other">(() => {
    const d = initial?.date ?? startDate;
    return d === today ? "today" : d === addDays(today, 1) ? "tomorrow" : "other";
  });
  const [partySize, setPartySize] = useState<string>(initial ? String(initial.partySize) : "2");
  const [many, setMany] = useState(initial ? initial.partySize > 6 : false);
  const [time, setTime] = useState(initial?.time ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [language, setLanguage] = useState<"es" | "en">(initial?.language ?? "es");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Partial<Record<BookingField, true>>>({});
  const [confirm, setConfirm] = useState<Extract<SaveReservationResult, { status: "needs_confirmation" }> | null>(null);
  const [occupied, setOccupied] = useState<Readonly<Record<string, number>> | null>(null);

  // Los huecos del día elegido, por turno.
  const slots = useMemo(() => slotsOfDay(date, shifts, closedDates, slotInterval), [date, shifts, closedDates, slotInterval]);
  const dayShifts = useMemo(() => {
    const ids = [...new Set(slots.map((s) => s.shiftId))];
    return ids.map((id) => shifts.find((s) => s.id === id)).filter((s): s is Shift => s !== undefined);
  }, [slots, shifts]);
  const [shiftId, setShiftId] = useState<string>(() => slotsOfDay(initial?.date ?? startDate, shifts, closedDates, slotInterval).find((s) => s.time === initial?.time)?.shiftId ?? "");
  const activeShiftId = dayShifts.some((s) => s.id === shiftId) ? shiftId : (dayShifts[0]?.id ?? "");
  const timesOfShift = slots.filter((s) => s.shiftId === activeShiftId);
  const shift = dayShifts.find((s) => s.id === activeShiftId) ?? null;
  const closedDay = slots.length === 0;
  const pastDay = !isEdit && date < today;

  // Las plazas ocupadas del día elegido.
  useEffect(() => {
    let cancelled = false;
    void dayOccupancyAction({ establishmentId, date, excludeReservationId: initial?.reservationId ?? null }).then((r) => {
      if (!cancelled) setOccupied(r.ok ? r.occupied : null);
    });
    return () => {
      cancelled = true;
    };
  }, [establishmentId, date, initial?.reservationId]);

  const free = shift && occupied ? shift.capacity - (occupied[shift.id] ?? 0) : null;

  function chooseDate(next: string, pick: "today" | "tomorrow" | "other") {
    setDate(next);
    setDatePick(pick);
    setTime("");
  }

  function submit(force: boolean) {
    setMessage(null);
    setFields({});
    startTransition(async () => {
      const result = await saveReservationAction({
        establishmentId,
        reservationId: initial?.reservationId ?? null,
        date,
        time,
        partySize,
        name,
        phone,
        email,
        notes,
        language,
        force,
        idempotencyKey,
        ...(initial ? { previousDate: initial.date } : {}),
      });
      if (result.status === "needs_confirmation") {
        setConfirm(result);
        return;
      }
      if (result.status === "error") {
        setConfirm(null);
        setMessage(result.message);
        setFields(result.fields);
        return;
      }
      // Escrita aquí es manual: se refresca en silencio. «Hay una reserva nueva» es para agente, web y plataformas.
      announceLocalChange(establishmentId, { kind: "date", date: result.date, reason: "changed" });
      if (initial && initial.date !== result.date) announceLocalChange(establishmentId, { kind: "date", date: initial.date, reason: "changed" });
      router.push(isEdit ? reservationHref(establishmentId, result.reservationId) : todayHref(establishmentId, result.date));
      router.refresh();
    });
  }

  const fieldError = (f: BookingField) => (fields[f] ? t.errors[f] : undefined);
  const blocked = !isEdit && creationBlockedReason !== null;

  if (blocked) {
    return (
      <div role="status" className="rounded-xl border border-pending-border bg-pending-row px-4 py-3 text-sm">
        <p className="font-semibold text-pending-text">{t.pausedTitle}</p>
        <p className="text-text-secondary">{creationBlockedReason}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
      className="mx-auto max-w-2xl space-y-6"
      noValidate
    >
      {locked ? (
        <div role="status" className="rounded-xl border border-pending-border bg-pending-row px-4 py-3 text-sm">
          {schedulingLockedReason}
        </div>
      ) : null}
      {message && Object.keys(fields).length === 0 ? (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {message}
        </div>
      ) : null}

      <fieldset disabled={locked} className="space-y-6 disabled:opacity-60">
        <div>
          <span className="mb-1.5 block text-sm font-semibold">{t.date}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={datePick === "today"} className={chip(datePick === "today")} onClick={() => chooseDate(today, "today")}>
              {t.today}
            </button>
            <button type="button" aria-pressed={datePick === "tomorrow"} className={chip(datePick === "tomorrow")} onClick={() => chooseDate(addDays(today, 1), "tomorrow")}>
              {t.tomorrow}
            </button>
            <button type="button" aria-pressed={datePick === "other"} className={chip(datePick === "other")} onClick={() => setDatePick("other")}>
              {t.otherDay}
            </button>
          </div>
          {datePick === "other" ? (
            <input
              type="date"
              aria-label={t.otherDayLabel}
              value={date}
              min={isEdit ? undefined : today}
              onChange={(event) => event.target.value && chooseDate(event.target.value, "other")}
              className="mt-2 min-h-[44px] rounded-field border border-border bg-surface px-3 text-[15px]"
            />
          ) : null}
          <p className="mt-2 text-sm text-text-secondary" aria-live="polite">
            {formatLongDate(date)}
            {closedDay ? ` · ${t.closedDay}` : ""}
            {pastDay ? ` · ${t.pastDay}` : ""}
          </p>
          {fieldError("date") ? <p role="alert" className="mt-1 text-sm text-danger">{fieldError("date")}</p> : null}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold">{t.people}</span>
          <div className="flex flex-wrap gap-2">
            {PARTY_QUICK.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={!many && partySize === String(n)}
                className={chip(!many && partySize === String(n))}
                onClick={() => {
                  setMany(false);
                  setPartySize(String(n));
                }}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={many}
              className={chip(many)}
              onClick={() => {
                setMany(true);
                if (Number(partySize) < 7) setPartySize("7");
              }}
            >
              7+
            </button>
          </div>
          {many ? (
            <input
              type="number"
              inputMode="numeric"
              min={7}
              aria-label={t.manyPeopleLabel}
              value={partySize}
              onChange={(event) => setPartySize(event.target.value)}
              className="mt-2 min-h-[44px] w-28 rounded-field border border-border bg-surface px-3 text-[15px]"
            />
          ) : null}
          {fieldError("party") ? <p role="alert" className="mt-1 text-sm text-danger">{fieldError("party")}</p> : null}
        </div>

        {!closedDay ? (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">{t.shift}</span>
              <div className="flex flex-wrap gap-2">
                {dayShifts.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={s.id === activeShiftId}
                    className={chip(s.id === activeShiftId)}
                    onClick={() => {
                      setShiftId(s.id);
                      setTime("");
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              {shift && free !== null ? (
                <p className="mt-2 text-sm tabular-nums text-text-secondary" aria-label={t.seatsLabel(shift.name)}>
                  {t.seatsLeft(free, shift.capacity)}
                </p>
              ) : null}
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-semibold">{t.time}</span>
              <div className="flex flex-wrap gap-2">
                {timesOfShift.map((s) => (
                  <button key={s.time} type="button" aria-pressed={time === s.time} className={`${chip(time === s.time)} tabular-nums`} onClick={() => setTime(s.time)}>
                    {s.time}
                  </button>
                ))}
              </div>
              {timesOfShift.length === 0 ? <p className="text-sm text-text-secondary">{t.noTimes}</p> : null}
              {fieldError("time") ? <p role="alert" className="mt-1 text-sm text-danger">{fieldError("time")}</p> : null}
            </div>
          </>
        ) : null}
      </fieldset>

      <div>
        <Field label={t.name} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} autoComplete="off" error={fieldError("name")} />
        <Field
          label={t.phone}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t.phonePlaceholder}
          error={fieldError("phone") ?? fieldError("contact")}
        />
        <Field
          label={`${t.email} ${es.agents.agenda.common.optional}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder}
          hint={t.emailHint}
          error={fieldError("email")}
        />
        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-semibold">{t.language}</span>
          <div className="flex gap-2">
            <button type="button" aria-pressed={language === "es"} className={chip(language === "es")} onClick={() => setLanguage("es")}>
              {t.spanish}
            </button>
            <button type="button" aria-pressed={language === "en"} className={chip(language === "en")} onClick={() => setLanguage("en")}>
              {t.english}
            </button>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          {t.noteShortcuts.map((shortcut) => (
            <button
              key={shortcut}
              type="button"
              onClick={() => setNotes((current) => (current.trim() === "" ? shortcut : current.includes(shortcut) ? current : `${current.trim()}, ${shortcut}`))}
              className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface px-3 text-sm font-semibold hover:bg-soft-surface"
            >
              + {shortcut}
            </button>
          ))}
        </div>
        <TextArea label={t.note} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.notePlaceholder} hint={t.noteHint} error={fieldError("notes")} />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
        {origin ? <OriginChip origin={origin.origin} platformName={origin.platformName} size="md" /> : <OriginChip origin="manual" size="md" />}
        {!isEdit ? <span>{t.createdBy(creatorName)}</span> : null}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" pending={pending} className="min-h-[48px] w-full sm:w-auto" disabled={!isEdit && closedDay}>
          {pending ? es.agents.agenda.common.saving : isEdit ? es.agents.agenda.common.save : t.save}
        </Button>
      </div>

      <Modal open={confirm !== null} title={t.overCapacityTitle} onClose={() => setConfirm(null)}>
        {confirm ? (
          <div className="space-y-4">
            <p className="text-sm">{t.overCapacity(confirm.overflowBy, confirm.shiftName, confirm.occupiedAfter, confirm.capacity)}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => setConfirm(null)}>
                {t.review}
              </Button>
              <Button
                type="button"
                className="min-h-[44px]"
                pending={pending}
                onClick={() => {
                  setConfirm(null);
                  submit(true);
                }}
              >
                {t.saveAnyway}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </form>
  );
}
