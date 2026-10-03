"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import type { NoticeChannel } from "@/core/reservations/notices";
import { es } from "@/i18n/es";

import { processPendingAction, simulateEventAction } from "./actions";

/** «Procesar avisos pendientes ahora». */
export function ProcessPendingButton({ slug }: { slug: string }) {
  const t = es.agents.fakeMessages;
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        pending={busy}
        onClick={() =>
          startTransition(async () => {
            const result = await processPendingAction(slug);
            setMessage({ ok: result.ok, text: result.message });
          })
        }
      >
        {t.processNow}
      </Button>
      {message ? (
        <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}

/** Los botones que simulan lo que contaría el proveedor sobre un mensaje. */
export function SimulateButtons({ slug, noticeId, channel, status }: { slug: string; noticeId: string; channel: NoticeChannel; status: string }) {
  const t = es.agents.fakeMessages.actions;
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (event: "delivered" | "undeliverable" | "price" | "not_charged") =>
    startTransition(async () => {
      const result = await simulateEventAction(slug, noticeId, event);
      setMessage({ ok: result.ok, text: result.message });
    });
  const live = status === "sent" || status === "queued";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {live ? (
        <Button type="button" variant="outline" pending={busy} onClick={() => run("delivered")}>
          {t.delivered}
        </Button>
      ) : null}
      {live && channel !== "sms" ? (
        <Button type="button" variant="outline" pending={busy} onClick={() => run("undeliverable")}>
          {t.undeliverable}
        </Button>
      ) : null}
      {channel === "sms" && status !== "skipped" ? (
        <Button type="button" variant="outline" pending={busy} onClick={() => run("price")}>
          {t.price}
        </Button>
      ) : null}
      {channel === "whatsapp" && status !== "skipped" && status !== "failed" ? (
        <Button type="button" variant="outline" pending={busy} onClick={() => run("not_charged")}>
          {t.notCharged}
        </Button>
      ) : null}
      {message ? (
        <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
