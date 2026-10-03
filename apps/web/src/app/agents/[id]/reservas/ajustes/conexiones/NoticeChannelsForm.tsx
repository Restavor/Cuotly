"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import type { ChannelSwitches, NoticeChannel } from "@/core/reservations/notices";
import { es } from "@/i18n/es";

import { setNoticeChannelsAction } from "./actions";

const CHANNELS: readonly NoticeChannel[] = ["email", "whatsapp", "sms"];

/**
 * Los tres interruptores de «Avisos a tus clientes»: correo, WhatsApp y SMS por separado. Quien no puede cambiarlos
 * (la tablet del local) los ve fijos y con el motivo; el servidor vuelve a comprobarlo todo.
 */
export function NoticeChannelsForm({
  establishmentId,
  initial,
  editable,
  readOnlyNote,
}: {
  establishmentId: string;
  initial: ChannelSwitches;
  editable: boolean;
  /** Por qué no se puede cambiar, si no se puede. */
  readOnlyNote: string | null;
}) {
  const t = es.agents.notices;
  const [value, setValue] = useState<ChannelSwitches>(initial);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);
  const changed = CHANNELS.some((c) => value[c] !== initial[c]);
  const allOff = !value.email && !value.whatsapp && !value.sms;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await setNoticeChannelsAction({ establishmentId, ...value });
      setMessage(result.ok ? { ok: true, text: t.saved } : { ok: false, text: result.message });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {CHANNELS.map((channel) => {
        const texts = t.channels[channel];
        const id = `notice-channel-${channel}`;
        return (
          <label key={channel} htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3">
            <input
              id={id}
              type="checkbox"
              role="switch"
              checked={value[channel]}
              disabled={!editable || busy}
              onChange={(event) => setValue((current) => ({ ...current, [channel]: event.target.checked }))}
              className="mt-1 h-5 w-5 shrink-0 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-text">{texts.label}</span>
              <span className="text-sm text-text-secondary">{texts.help}</span>
            </span>
          </label>
        );
      })}
      {allOff ? <p className="text-sm text-text-secondary">{t.allOff}</p> : null}
      {editable ? (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} pending={busy} disabled={!changed}>
            {busy ? t.saving : t.save}
          </Button>
          {message ? (
            <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
              {message.text}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">{readOnlyNote}</p>
      )}
    </div>
  );
}
