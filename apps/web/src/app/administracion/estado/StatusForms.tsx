"use client";

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { STATUS_COMPONENTS, STATUS_SEVERITIES } from "@/core/support";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../action-state";
import { addHoliday, declareEvent, declareSecurityIncident, resolveEvent, retireHoliday } from "./actions";

const t = es.platformAdmin.status;

function Mensajes({ state, done }: { state: { error: string | null; done: boolean }; done: string }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm text-text-secondary">
          {done}
        </p>
      ) : null}
    </>
  );
}

/** RN-SOP-13 · declarar un evento sobre uno de los cinco componentes. */
export function DeclareEventForm() {
  const [state, action, pending] = useActionState(declareEvent, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="space-y-3">
      <Select
        name="component"
        label={t.component}
        options={STATUS_COMPONENTS.map((c) => ({ value: c, label: es.statusPage.components[c] }))}
        required
      />
      <Select
        name="severity"
        label={t.severity}
        options={STATUS_SEVERITIES.map((s) => ({ value: s, label: es.statusPage.severities[s] }))}
        required
      />
      <Field name="title" label={t.eventTitle} required maxLength={160} />
      <TextArea name="body" label={t.eventBody} rows={3} />
      <Button type="submit" pending={pending}>
        {t.declareSubmit}
      </Button>
      <Mensajes state={state} done={t.declared} />
    </form>
  );
}

/**
 * RN-ADM-13 (§142, decisión 38) · declarar un incidente de seguridad. El
 * servidor marca el evento y manda el aviso obligatorio a los
 * propietarios afectados; aquí solo se recoge el texto y, si se quiere,
 * qué espacios.
 */
export function DeclareSecurityIncidentForm() {
  const [state, action, pending] = useActionState(declareSecurityIncident, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="space-y-3">
      <Select
        name="component"
        label={t.component}
        options={STATUS_COMPONENTS.map((c) => ({ value: c, label: es.statusPage.components[c] }))}
        required
      />
      <Select
        name="severity"
        label={t.severity}
        options={STATUS_SEVERITIES.map((s) => ({ value: s, label: es.statusPage.severities[s] }))}
        required
      />
      <Field name="title" label={t.eventTitle} required maxLength={160} />
      <TextArea name="body" label={t.eventBody} rows={4} />
      <TextArea name="slugs" label={t.securityAffected} rows={2} />
      <p className="text-xs text-text-secondary">{t.securityAffectedHint}</p>
      <Button type="submit" variant="danger" pending={pending}>
        {t.securitySubmit}
      </Button>
      <Mensajes state={state} done={t.securityDeclared} />
    </form>
  );
}

export function ResolveEventForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(resolveEvent, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="min-w-[16rem] flex-1">
        <Field name="note" label={t.resolveNote} />
      </div>
      <Button type="submit" variant="secondary" pending={pending}>
        {t.resolveSubmit}
      </Button>
      <Mensajes state={state} done={t.resolved} />
    </form>
  );
}

/** RN-SOP-06 · los festivos de Cuotly. */
export function AddHolidayForm() {
  const [state, action, pending] = useActionState(addHoliday, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field name="date" type="date" label={t.holidayDate} required />
      <div className="min-w-[12rem] flex-1">
        <Field name="name" label={t.holidayName} required maxLength={80} />
      </div>
      <Button type="submit" variant="secondary" pending={pending}>
        {t.holidayAdd}
      </Button>
      <Mensajes state={state} done={t.holidayAdded} />
    </form>
  );
}

export function RetireHolidayForm({ holidayId }: { holidayId: string }) {
  const [state, action, pending] = useActionState(retireHoliday, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="holidayId" value={holidayId} />
      <div className="min-w-[12rem] flex-1">
        <Field name="reason" label={t.holidayRetireReason} required />
      </div>
      <Button type="submit" variant="danger" pending={pending}>
        {t.holidayRetire}
      </Button>
      <Mensajes state={state} done={t.holidayRetired} />
    </form>
  );
}
