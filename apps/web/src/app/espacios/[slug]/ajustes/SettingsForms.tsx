"use client";

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SETTINGS } from "./action-state";
import {
  changeSpacePaymentTerm,
  changeSpaceTimezone,
  saveNotificationPreferences,
  saveSpaceDetails,
  saveSpaceTaxRate,
  saveSpaceLogo,
  saveSpaceName,
} from "./actions";

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

/**
 * RN-FIN-01b · el plazo de pago de las mensualidades.
 *
 * El PRD no fija ninguno, así que no lo fija tampoco una constante
 * escondida: es un dato del espacio. El `min`/`max` del campo es cortesía
 * —`set_space_payment_term()` vuelve a comprobar el rango— y el aviso de
 * que no toca lo ya emitido se enseña antes de pulsar, no después.
 */
export function PaymentTermForm({
  spaceId,
  days,
}: {
  spaceId: string;
  days: number;
}) {
  const [state, action, pending] = useActionState(changeSpacePaymentTerm, INITIAL_SETTINGS);

  return (
    <form action={action} className="mt-4 space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <Field
        label={es.settings.paymentTermLabel}
        name="paymentTermDays"
        type="number"
        defaultValue={String(days)}
        required
        min={0}
        max={90}
        hint={es.settings.paymentTermHint}
      />
      <Button type="submit" disabled={pending}>
        {pending ? es.settings.paymentTermPending : es.settings.paymentTermSubmit}
      </Button>
      <Aviso
        error={state.error}
        done={state.done}
        unchanged={state.unchanged}
        hecho={es.settings.paymentTermDone}
        igual={es.settings.paymentTermUnchanged}
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

/**
 * §9 paso 1, §125 · los datos fiscales del espacio. Sin validación de
 * identificador: el bloque legal sigue aplazado (§170.1), y validar por
 * nuestra cuenta sería inventarnos una regla fiscal.
 */
export function SpaceDetailsForm({
  spaceId,
  legalName,
  taxId,
  address,
}: {
  spaceId: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
}) {
  const [state, action, pending] = useActionState(saveSpaceDetails, INITIAL_SETTINGS);

  return (
    <form action={action} className="mb-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <Field name="legalName" label={es.settings.legalNameLabel} defaultValue={legalName ?? ""} />
      <Field name="taxId" label={es.settings.taxIdLabel} defaultValue={taxId ?? ""} />
      <Field name="address" label={es.settings.addressLabel} defaultValue={address ?? ""} />
      <p className="mb-3 text-sm text-text-secondary">{es.settings.detailsHint}</p>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? es.settings.detailsPending : es.settings.detailsSubmit}
      </Button>
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="mt-3 text-sm text-success">
          {es.settings.detailsDone}
        </p>
      ) : null}
      {state.unchanged ? (
        <p role="status" className="mt-3 text-sm text-text-secondary">
          {es.settings.detailsUnchanged}
        </p>
      ) : null}
    </form>
  );
}

/**
 * M58 · el IVA por defecto del espacio.
 *
 * El texto de ayuda no es decorativo: dice que cambiarlo **no toca los
 * cobros ya emitidos** (RN-FIN-08 congela el tipo en cada uno). Sin esa
 * frase, quien lo cambia para corregir un error se queda creyendo que ha
 * corregido las facturas de atrás, y no.
 */
export function TaxRateForm({ spaceId, percent }: { spaceId: string; percent: number }) {
  const [state, action, pending] = useActionState(saveSpaceTaxRate, INITIAL_SETTINGS);

  return (
    <form action={action} className="mb-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <Field
        name="taxRate"
        label={es.settings.taxRateLabel}
        type="number"
        min={0}
        max={100}
        step="0.01"
        defaultValue={String(percent)}
        hint={es.settings.taxRateHint}
      />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? es.settings.taxRatePending : es.settings.taxRateSubmit}
      </Button>
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="mt-3 text-sm text-success">
          {es.settings.taxRateDone}
        </p>
      ) : null}
    </form>
  );
}

/** §9 paso 2, §124 · el logotipo. Lo demás de la identidad visual no se toca. */
export function SpaceLogoForm({ spaceId, hasLogo }: { spaceId: string; hasLogo: boolean }) {
  const [state, action, pending] = useActionState(saveSpaceLogo, INITIAL_SETTINGS);

  return (
    <form action={action} className="mb-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <label className="mb-1 block text-sm font-semibold text-text" htmlFor={`logo-${spaceId}`}>
        {es.settings.logoLabel}
      </label>
      <input
        id={`logo-${spaceId}`}
        type="file"
        name="logo"
        accept="image/jpeg,image/png,image/webp"
        className="mb-3 block w-full text-sm text-text-secondary"
        required
      />
      <p className="mb-3 text-sm text-text-secondary">
        {hasLogo ? es.settings.logoPresent : es.settings.logoAbsent} {es.settings.logoHint}
      </p>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.settings.logoPendingLabel : es.settings.logoSubmit}
      </Button>
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="mt-3 text-sm text-success">
          {es.settings.logoDone}
        </p>
      ) : null}
    </form>
  );
}
