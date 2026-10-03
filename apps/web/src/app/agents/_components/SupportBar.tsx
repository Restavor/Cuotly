"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import { leaveSupportSessionAction } from "../support-actions";

/**
 * La barra fija de la sesión de soporte de Reservas (PRD de agents §3.4): «Estás viendo Reservas de <restaurante>
 * como Restavor (soporte) · Salir». Está siempre que alguien de Restavor mira datos de comensales, para que no
 * se le olvide en casa de quién está. `Salir` cierra la sesión y devuelve a donde vino.
 */
export function SupportBar({ restaurantName, sessionId, expiresAt }: { restaurantName: string; sessionId: string; expiresAt: string }) {
  const t = es.agents.support;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));

  return (
    <div
      role="status"
      data-testid="reservations-support-bar"
      className="flex flex-wrap items-center gap-3 border-b border-border bg-info/10 px-4 py-2 text-sm text-text lg:px-6"
    >
      <Icon name="lock" className="h-4 w-4 shrink-0 text-info" />
      <span className="font-semibold">{t.bar(restaurantName)}</span>
      <span className="text-text-secondary">{t.remaining(minutes)}</span>
      <form action={leaveSupportSessionAction} className="ml-auto">
        <input type="hidden" name="sessionId" value={sessionId} />
        <button
          type="submit"
          className="min-h-11 rounded-field border border-border bg-surface px-4 py-1 text-xs font-semibold hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          {t.leave}
        </button>
      </form>
    </div>
  );
}
