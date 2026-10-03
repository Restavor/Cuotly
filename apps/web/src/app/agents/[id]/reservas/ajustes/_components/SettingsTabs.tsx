import Link from "next/link";

import { agentsPageHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";

type Tab = "hours" | "team" | "history" | "connections";

/**
 * Las pestañas de Ajustes (`Ajustes`, `AjustesEquipo`): Horarios · Equipo · Historial · Conexiones. Cada una es
 * una pantalla con su ruta; esta barra solo las une. Qué ve cada cual lo decide la puerta de cada pantalla.
 */
export function SettingsTabs({ establishmentId, current }: { establishmentId: string; current: Tab }) {
  const t = es.agents.agenda.hours;
  const tabs: readonly (readonly [Tab, string, string])[] = [
    ["hours", t.tabs.hours, agentsPageHref(establishmentId, "settings")],
    ["team", t.tabs.team, agentsPageHref(establishmentId, "team")],
    ["history", t.tabs.history, agentsPageHref(establishmentId, "history")],
    ["connections", t.tabs.connections, agentsPageHref(establishmentId, "connections")],
  ];
  return (
    <nav aria-label={t.tabsLabel} className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(([key, label, href]) => (
        <Link
          key={key}
          href={href}
          aria-current={key === current ? "page" : undefined}
          className={`inline-flex min-h-[44px] shrink-0 items-center border-b-2 px-4 text-sm font-semibold ${
            key === current ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
