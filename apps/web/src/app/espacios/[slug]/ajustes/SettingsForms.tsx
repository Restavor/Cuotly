"use client";

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SETTINGS } from "./action-state";
import { changeSpaceTimezone, saveNotificationPreferences, saveSpaceName } from "./actions";

/**
 * HU-36 · los formularios de Ajustes.
 *
 * Se pintan solo a quien tiene `manage_space` (los dos primeros), pero eso
 * es cortesía: `set_space_name()` y `set_space_timezone()` lo comprueban, y
 * desde la migración 49 son la única forma de tocar `spaces` — la tabla se
 * quedó sin política de UPDATE a propósito. Enviar el formulario con otra
 * sesión, o llamar a la RPC a pelo, falla igual.
 */

function Aviso({
  error,
  done,
  unchanged,
  hecho,
  igual,
}: {
  error: string | null;
  done: boolean;
  unchanged: boolean;
  hecho: string;
  igual?: string;
}) {
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
      {unchanged && igual ? (
        <p role="status" className="text-sm text-text-secondary">
          {igual}
        </p>
      ) : null}
    </>
  );
}

/** §124 · el nombre del espacio. */
export function SpaceNameForm({ spaceId, name }: { spaceId: string; name: string }) {
  const [state, action, pending] = useActionState(saveSpaceName, INITIAL_SETTINGS);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <Field
        label={es.settings.nameLabel}
        name="name"
        defaultValue={name}
        required
        maxLength={120}
        hint={es.settings.identityHint}
      />
      <Button type="submit" disabled={pending}>
        {pending ? es.settings.namePending : es.settings.nameSubmit}
      </Button>
      <Aviso
        error={state.error}
        done={state.done}
        unchanged={state.unchanged}
        hecho={es.settings.nameDone}
        igual={es.settings.nameUnchanged}
      />
    </form>
  );
}

/**
 * §125 · la zona horaria contractual.
 *
 * El motivo es un campo del formulario y no un adorno: el servidor rechaza
 * el cambio sin él. Y el aviso de qué mueve este cambio se enseña ANTES de
 * pulsar, no después, porque después ya se ha movido.
 */
export function TimezoneForm({
  spaceId,
  timezone,
  zones,
}: {
  spaceId: string;
  timezone: string;
  zones: readonly string[];
}) {
  const [state, action, pending] = useActionState(changeSpaceTimezone, INITIAL_SETTINGS);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <p className="text-sm text-text-secondary">{es.settings.timezoneWarning}</p>
      <Select
        label={es.settings.timezoneLabel}
        name="timezone"
        defaultValue={timezone}
        required
        options={zones.map((zone) => ({ value: zone, label: zone }))}
      />
      <TextArea
        label={es.settings.timezoneReasonLabel}
        name="reason"
        required
        rows={2}
        placeholder={es.settings.timezoneReasonPlaceholder}
      />
      <Button type="submit" disabled={pending}>
        {pending ? es.settings.timezonePending : es.settings.timezoneSubmit}
      </Button>
      <Aviso
        error={state.error}
        done={state.done}
        unchanged={state.unchanged}
        hecho={es.settings.timezoneDone}
        igual={es.settings.timezoneUnchanged}
      />
    </form>
  );
}

export type NotificationPreference = {
  readonly eventType: keyof typeof es.notifications.events;
  readonly inApp: boolean;
  readonly email: boolean;
  readonly mandatory: boolean;
};

/**
 * §123 · Notificaciones. Un formulario con una fila por aviso: la
 * alternativa —un botón de guardar por fila— convierte veintidós avisos en
 * veintidós formularios y en veintidós sitios donde equivocarse.
 *
 * Los avisos obligatorios (RN-NOT-03) se pintan marcados y bloqueados, con
 * su motivo escrito al lado. Que no se puedan desactivar lo decide
 * `set_notification_preference()`, no este `disabled`.
 */
export function NotificationPreferencesForm({
  spaceId,
  preferences,
}: {
  spaceId: string;
  preferences: readonly NotificationPreference[];
}) {
  const [state, action, pending] = useActionState(saveNotificationPreferences, INITIAL_SETTINGS);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="spaceId" value={spaceId} />
      <p className="text-sm text-text-secondary">{es.settings.notificationsHint}</p>

      <ul className="divide-y divide-border">
        {preferences.map((pref) => (
          <li key={pref.eventType} className="flex flex-wrap items-center gap-4 py-2">
            <span className="min-w-52 flex-1 text-sm text-text">
              {es.notifications.events[pref.eventType]}
              {pref.mandatory ? (
                <span className="block text-xs text-text-secondary">
                  {es.settings.notificationsMandatory}
                </span>
              ) : null}
            </span>
            {/*
              Un aviso obligatorio no viaja en el envío: sin su `eventType`
              la acción ni siquiera lo mira. Mandarlo con las casillas
              desactivadas sería peor que inútil — una casilla `disabled` no
              se envía, así que llegaría como "desactívalo" y el servidor
              respondería con un error a algo que nadie pidió.
            */}
            {pref.mandatory ? null : (
              <>
                <input type="hidden" name="eventType" value={pref.eventType} />
                <input
                  type="hidden"
                  name={`previous:${pref.eventType}`}
                  value={`${pref.inApp ? "1" : "0"}${pref.email ? "1" : "0"}`}
                />
              </>
            )}
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                name={`inApp:${pref.eventType}`}
                defaultChecked={pref.inApp}
                disabled={pref.mandatory}
              />
              {es.settings.notificationsInApp}
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                name={`email:${pref.eventType}`}
                defaultChecked={pref.email}
                disabled={pref.mandatory}
              />
              {es.settings.notificationsEmail}
            </label>
          </li>
        ))}
      </ul>

      <Button type="submit" disabled={pending}>
        {pending ? es.settings.notificationsPending : es.settings.notificationsSubmit}
      </Button>
      <Aviso
        error={state.error}
        done={state.done}
        unchanged={false}
        hecho={es.settings.notificationsDone}
      />
    </form>
  );
}
