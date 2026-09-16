"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { saveNotificationPreference } from "./actions";
import { ACCOUNT_INITIAL_STATE } from "./form-state";

export interface PreferenceRow {
  readonly event: string;
  readonly label: string;
  readonly inApp: boolean;
  readonly email: boolean;
  readonly push: boolean;
  readonly mandatory: boolean;
}

/**
 * G05 · los avisos de la persona (RN-GLO-06).
 *
 * Los obligatorios de RN-NOT-03 se pintan bloqueados **y** el servidor los
 * vuelve a rechazar: esconder la casilla no es un control de acceso
 * (CLAUDE.md). Aquí se enseñan igualmente, con su motivo, en vez de
 * desaparecer de la lista — que alguien no pueda apagar un aviso no
 * significa que no deba saber que existe.
 */
export function NotificationPreferences({ rows }: { rows: readonly PreferenceRow[] }) {
  const t = es.globalContext.account;

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">{t.notificationsBody}</p>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.event} className="py-3">
            <Fila row={row} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-text-secondary">{t.mandatoryReason}</p>
    </div>
  );
}

function Fila({ row }: { row: PreferenceRow }) {
  const [state, action, pending] = useActionState(
    saveNotificationPreference,
    ACCOUNT_INITIAL_STATE,
  );
  const t = es.globalContext.account;

  return (
    <form action={action} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <input type="hidden" name="event_type" value={row.event} />
      <span className="min-w-48 flex-1 text-sm font-semibold text-text">{row.label}</span>

      <Casilla name="in_app" label={t.channelInApp} checked={row.inApp} disabled={row.mandatory} />
      <Casilla name="email" label={t.channelEmail} checked={row.email} disabled={row.mandatory} />
      <Casilla name="push" label={t.channelPush} checked={row.push} disabled={row.mandatory} />

      {row.mandatory ? (
        <span className="text-xs text-text-secondary">{t.mandatory}</span>
      ) : (
        <Button type="submit" variant="secondary" pending={pending}>
          {pending ? t.savePending : t.save}
        </Button>
      )}

      {state.error ? (
        <span role="alert" className="w-full text-sm text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function Casilla({
  name,
  label,
  checked,
  disabled,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-text">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        disabled={disabled}
        className="size-4 accent-[var(--color-primary)]"
      />
      {label}
    </label>
  );
}
