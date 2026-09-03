"use client";

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_CALENDAR } from "./action-state";
import { addHoliday, decideAbsence, requestAbsence, setAvailability } from "./actions";

/**
 * Los formularios del calendario. Son componentes de cliente porque
 * necesitan `useActionState` para enseñar el error o la confirmación de la
 * acción; todo lo que deciden es qué se pinta, nunca quién puede hacer qué
 * (CLAUDE.md: ocultar un botón no es un control de acceso).
 */

function Aviso({ error, done, hecho }: { error: string | null; done: boolean; hecho: string }) {
  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-text-secondary">
          {hecho}
        </p>
      ) : null}
    </>
  );
}

/** HU-31 · aprobar o rechazar una ausencia, con motivo opcional. */
export function AbsenceDecision({ absenceId }: { absenceId: string }) {
  const [state, action, pending] = useActionState(decideAbsence, INITIAL_CALENDAR);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="absenceId" value={absenceId} />
      <TextArea
        label={es.calendar.decisionNoteLabel}
        name="note"
        rows={2}
        maxLength={500}
      />
      <div className="flex flex-wrap gap-2">
        {/*
          Un único formulario con dos botones que mandan valores distintos
          en el mismo campo: así aprobar y rechazar comparten el motivo que
          se acaba de escribir, en vez de perderlo al cambiar de botón.
        */}
        <Button type="submit" name="approve" value="true" disabled={pending}>
          {pending ? es.calendar.decidePending : es.calendar.approve}
        </Button>
        <Button type="submit" name="approve" value="false" variant="secondary" disabled={pending}>
          {pending ? es.calendar.decidePending : es.calendar.reject}
        </Button>
      </div>
      <Aviso error={state.error} done={state.done} hecho={es.calendar.decideDone} />
    </form>
  );
}

/** HU-30 · disponibilidad declarada (RN-ASG-10, RN-ASG-11). */
export function AvailabilityForm({
  spaceId,
  available,
  note,
}: {
  spaceId: string;
  available: boolean;
  note: string;
}) {
  const [state, action, pending] = useActionState(setAvailability, INITIAL_CALENDAR);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <Select
        label={es.calendar.availabilityLabel}
        name="available"
        defaultValue={String(available)}
        options={[
          { value: "true", label: es.calendar.availableYes },
          { value: "false", label: es.calendar.availableNo },
        ]}
      />
      <Field label={es.calendar.availabilityNoteLabel} name="note" defaultValue={note} maxLength={200} />
      <Button type="submit" disabled={pending}>
        {pending ? es.calendar.availabilityPending : es.calendar.availabilitySave}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={es.calendar.availabilityDone} />
    </form>
  );
}

/** HU-30 · pedir una ausencia. */
export function RequestAbsenceForm({
  spaceId,
  defaultDay,
}: {
  spaceId: string;
  defaultDay: string;
}) {
  const [state, action, pending] = useActionState(requestAbsence, INITIAL_CALENDAR);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <div className="flex flex-wrap gap-3">
        <div className="min-w-40 flex-1">
          <Field
            label={es.calendar.absenceStartLabel}
            name="startsOn"
            type="date"
            defaultValue={defaultDay}
            required
          />
        </div>
        <div className="min-w-40 flex-1">
          <Field
            label={es.calendar.absenceEndLabel}
            name="endsOn"
            type="date"
            defaultValue={defaultDay}
            required
          />
        </div>
      </div>
      <TextArea label={es.calendar.absenceReasonLabel} name="reason" rows={3} maxLength={500} />
      <Button type="submit" disabled={pending}>
        {pending ? es.calendar.absencePending : es.calendar.absenceSubmit}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={es.calendar.absenceDone} />
    </form>
  );
}

/** HU-32 · añadir un festivo del espacio (RN-CLK-03). */
export function AddHolidayForm({
  spaceId,
  defaultDay,
}: {
  spaceId: string;
  defaultDay: string;
}) {
  const [state, action, pending] = useActionState(addHoliday, INITIAL_CALENDAR);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <div className="flex flex-wrap gap-3">
        <div className="min-w-40 flex-1">
          <Field
            label={es.calendar.holidayDateLabel}
            name="holidayDate"
            type="date"
            defaultValue={defaultDay}
            required
          />
        </div>
        <div className="min-w-40 flex-1">
          <Field label={es.calendar.holidayNameLabel} name="name" required maxLength={120} />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? es.calendar.holidayPending : es.calendar.holidaySubmit}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={es.calendar.holidayDone} />
    </form>
  );
}
