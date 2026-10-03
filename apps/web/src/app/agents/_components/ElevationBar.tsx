"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { SETTINGS_IDLE_SECONDS } from "@/core/reservations/device";
import { es } from "@/i18n/es";

import { lockSettingsAction, renewSettingsAction } from "../device-actions";

/** 1:45 */
function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * «Ajustes abiertos con PIN» en la tablet del local (PRD de agents §3.3): se cierran a los 2 minutos sin tocar
 * o al salir. La cuenta atrás se renueva con cada toque (como mucho cada 15 segundos hacia el servidor, que es
 * quien de verdad cierra: la cookie caduca sola). Al llegar a cero vuelve a Hoy.
 */
export function ElevationBar({
  establishmentId,
  name,
  secondsLeft,
  todayHref,
}: {
  establishmentId: string;
  name: string;
  secondsLeft: number;
  todayHref: string;
}) {
  const t = es.agents.device.elevation;
  const router = useRouter();
  const [left, setLeft] = useState(secondsLeft);
  const lastRenewal = useRef(0);

  const leave = useCallback(async () => {
    await lockSettingsAction({ establishmentId });
    router.replace(todayHref);
    router.refresh();
  }, [establishmentId, router, todayHref]);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((value) => value - 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (left <= 0) void leave();
  }, [left, leave]);

  useEffect(() => {
    function touched() {
      const now = Date.now();
      setLeft(SETTINGS_IDLE_SECONDS);
      if (now - lastRenewal.current < 15_000) return;
      lastRenewal.current = now;
      void renewSettingsAction({ establishmentId });
    }
    window.addEventListener("pointerdown", touched);
    window.addEventListener("keydown", touched);
    return () => {
      window.removeEventListener("pointerdown", touched);
      window.removeEventListener("keydown", touched);
    };
  }, [establishmentId]);

  return (
    <div
      role="status"
      data-testid="device-elevation-bar"
      className="flex flex-wrap items-center gap-3 border-b border-border bg-pending-row px-4 py-2 text-sm text-text lg:px-6"
    >
      <Icon name="lock" className="h-4 w-4 shrink-0 text-pending-text" />
      <span className="font-semibold">{t.open(name)}</span>
      <span className="tabular-nums text-text-secondary">{t.closesIn(clock(left))}</span>
      <button
        type="button"
        onClick={() => void leave()}
        className="ml-auto min-h-11 rounded-field border border-border bg-surface px-4 py-1 text-xs font-semibold hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {t.exit}
      </button>
    </div>
  );
}
