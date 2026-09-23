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
 * G05 · los avisos de la persona (RN-GLO-06), como la tabla del dibujo:
 * cada aviso en una fila y un interruptor por canal. Cambiar uno guarda esa
 * fila en el momento; sin JavaScript, cada fila lleva su botón de guardar.
 *
 * `compact` es la tarjeta de la pestaña Perfil, con los dos canales del
 * dibujo (en la app y correo). El tercero, el móvil, no se pierde: viaja
 * oculto con su valor para que guardar una fila no lo apague, y se cambia
 * en la pestaña Notificaciones, que enseña los tres.
 *
 * Los obligatorios de RN-NOT-03 se pintan bloqueados **y** el servidor los
 * vuelve a rechazar: esconder la casilla no es un control de acceso
 * (CLAUDE.md). Se enseñan igualmente, con su motivo, en vez de desaparecer
 * de la lista: que alguien no pueda apagar un aviso no significa que no
 * deba saber que existe.
 */
export function NotificationPreferences({
  rows,
  compact = false,
}: {
  rows: readonly PreferenceRow[];
  compact?: boolean;
}) {
  const t = es.globalContext.account;

  return (
    <div>
      <div
        className={`grid items-end gap-2 border-b border-border pb-2 text-xs font-medium text-text-secondary ${
          compact ? "grid-cols-[minmax(0,1fr)_64px_64px]" : "grid-cols-[minmax(0,1fr)_72px_72px_72px]"
        }`}
      >
        <span />
        <span className="text-center">{t.channelInApp}</span>
        <span className="text-center">{t.channelEmail}</span>
        {compact ? null : <span className="text-center">{t.channelPush}</span>}
      </div>
      <ul className={`divide-y divide-border ${compact ? "max-h-72 overflow-y-auto" : ""}`}>
        {rows.map((row) => (
          <li key={row.event}>
            <Fila row={row} compact={compact} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-text-secondary">{t.mandatoryReason}</p>
    </div>
  );
}

function Fila({ row, compact }: { row: PreferenceRow; compact: boolean }) {
  const [state, action, pending] = useActionState(saveNotificationPreference, ACCOUNT_INITIAL_STATE);
  const t = es.globalContext.account;
  const guardar = (e: React.ChangeEvent<HTMLInputElement>) => e.currentTarget.form?.requestSubmit();

  return (
    <form
      action={action}
      className={`grid items-center gap-2 py-2.5 ${
        compact ? "grid-cols-[minmax(0,1fr)_64px_64px]" : "grid-cols-[minmax(0,1fr)_72px_72px_72px]"
      }`}
    >
      <input type="hidden" name="event_type" value={row.event} />
      {compact && row.push ? <input type="hidden" name="push" value="on" /> : null}
      <div className="min-w-0">
        <p className="text-sm text-text">{row.label}</p>
        {row.mandatory ? <p className="text-xs text-text-secondary">{t.mandatory}</p> : null}
        {state.error ? (
          <p role="alert" className="text-xs text-danger">
            {state.error}
          </p>
        ) : null}
        <noscript>
          {row.mandatory ? null : (
            <Button type="submit" variant="secondary">
              {t.save}
            </Button>
          )}
        </noscript>
      </div>
      <Interruptor
        name="in_app"
        label={`${row.label} · ${t.channelInApp}`}
        checked={row.inApp}
        disabled={row.mandatory || pending}
        onChange={guardar}
      />
      <Interruptor
        name="email"
        label={`${row.label} · ${t.channelEmail}`}
        checked={row.email}
        disabled={row.mandatory || pending}
        onChange={guardar}
      />
      {compact ? null : (
        <Interruptor
          name="push"
          label={`${row.label} · ${t.channelPush}`}
          checked={row.push}
          disabled={row.mandatory || pending}
          onChange={guardar}
        />
      )}
    </form>
  );
}

function Interruptor({
  name,
  label,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="relative mx-auto inline-flex cursor-pointer items-center has-disabled:cursor-not-allowed">
      <input
        type="checkbox"
        role="switch"
        name={name}
        aria-label={label}
        defaultChecked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-cuotly-green peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cuotly-green" />
      <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform peer-checked:translate-x-5" />
    </label>
  );
}
