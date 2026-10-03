"use client";

import { useActionState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_ADMIN_STATE } from "../../action-state";
import { setMessagingRateAction, setReservationsEnabledAction } from "../actions";

/** Encender o apagar Reservas en un espacio (`spaces.reservations_enabled`). Lo vuelve a comprobar la base de datos. */
export function ReservationsEnabledForm({ spaceId, enabled, spaceName }: { spaceId: string; enabled: boolean; spaceName: string }) {
  const t = es.agents.platform;
  const [state, action, pending] = useActionState(setReservationsEnabledAction, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <Button
        type="submit"
        variant="secondary"
        pending={pending}
        className="px-3 py-1.5 text-xs"
        aria-label={`${enabled ? t.turnOff : t.turnOn} · ${spaceName}`}
        data-testid={`toggle-reservations-${spaceId}`}
      >
        {enabled ? t.turnOff : t.turnOn}
      </Button>
      {state.error ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** Una tarifa nueva de mensajería: una fila nueva con su fecha de inicio (el historial no se reescribe). */
export function MessagingRateForm({ today }: { today: string }) {
  const t = es.agents.platform;
  const [state, action, pending] = useActionState(setMessagingRateAction, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="space-y-3" data-testid="rate-form">
      <Select
        name="channel"
        label={t.rateChannel}
        defaultValue="whatsapp_utility"
        options={[
          { value: "whatsapp_utility", label: t.channels.whatsapp_utility },
          { value: "sms", label: t.channels.sms },
        ]}
      />
      <Field name="country" label={t.rateCountry} defaultValue="ES" maxLength={2} required />
      <Field name="price" label={t.ratePrice} hint={t.ratePriceHint} inputMode="decimal" required data-testid="rate-price" />
      <Field name="validFrom" label={t.rateValidFrom} type="date" min={today} defaultValue={today} required />
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm text-text-secondary" data-testid="rate-done">
          {t.rateDone}
        </p>
      ) : null}
      <Button type="submit" pending={pending} data-testid="rate-submit">
        {t.rateSubmit}
      </Button>
    </form>
  );
}
