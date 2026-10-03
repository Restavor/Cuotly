import { EmptyState, ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { formatDateTime, formatShortDate } from "@/core/reservations/format";
import { es } from "@/i18n/es";
import { loadHistory, type HistoryEntry } from "@/services/agents/team-gateway";

import { agentsDb } from "@/app/agents/db";
import { requireAgentsPage } from "../../../../agents-context";
import { SettingsTabs } from "../_components/SettingsTabs";

export const dynamic = "force-dynamic";

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** La frase de una fila del Historial. Sin la clave conocida no se inventa: «X hizo un cambio». */
function sentence(entry: HistoryEntry, timeZone: string): string {
  const t = es.agents.history.events;
  const who = entry.actorLabel;
  const name = text(entry.detail.staff_name) ?? "";
  const date = text(entry.detail.date);
  const shown = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatShortDate(date) : (date ?? "");
  switch (entry.kind) {
    case "reservations.staff_added":
      return t.staffAdded(who, name);
    case "reservations.staff_pin_changed":
      return t.staffPinChanged(who, name);
    case "reservations.staff_removed":
      return t.staffRemoved(who, name);
    case "reservations.my_pin_set":
      return t.myPinSet(who);
    case "reservations.device_activated":
      return t.deviceActivated(who);
    case "reservations.device_revoked":
      return t.deviceRevoked(who);
    case "reservations.pin_locked": {
      const seconds = typeof entry.detail.seconds === "number" ? entry.detail.seconds : 0;
      return t.pinLocked(seconds);
    }
    case "reservations.schedule_saved":
      return t.scheduleSaved(who);
    case "reservations.settings_saved":
      return t.settingsSaved(who);
    case "reservations.closed_date_set":
      return t.closedDateSet(who, shown);
    case "reservations.closed_date_removed":
      return t.closedDateRemoved(who, shown);
    case "reservations.onboarding_completed":
      return t.onboardingCompleted(who);
    case "reservations.support_session": {
      const reason = text(entry.detail.reason) ?? "";
      const ended = text(entry.detail.ended_at);
      const base = es.agents.history.supportEntered(reason);
      return ended ? `${base} · ${es.agents.history.supportEnded(formatDateTime(new Date(ended), timeZone).split(", ")[1] ?? "")}` : base;
    }
    default:
      return t.other(who);
  }
}

/**
 * Ajustes › Historial (PRD de agents §11.1): los cambios de ajustes, de Equipo y de dispositivos, los bloqueos de PIN y
 * cada vez que Restavor entró como soporte («Restavor entró como soporte · motivo · hora»). El restaurante ve su nombre
 * o «Restavor»; nunca el identificador de nadie del equipo de Restavor (P7): lo limpia la función de la base de datos.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "history");
  const t = es.agents.history;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState />
      </div>
    );
  }

  const db = await agentsDb(id);
  let entries: readonly HistoryEntry[];
  let timeZone: string;
  try {
    const [rows, settings] = await Promise.all([
      loadHistory(db, id, 100),
      db.from("reservation_settings").select("timezone").eq("establishment_id", id).maybeSingle(),
    ]);
    entries = rows;
    // La zona la manda el restaurante (CLAUDE.md): sin ella no se pinta una hora inventada, se dice que no se pudo cargar.
    if (!settings.data?.timezone) throw new Error("Sin zona horaria");
    timeZone = settings.data.timezone;
  } catch {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title={t.title} subtitle={access.nav.name} />
        <SettingsTabs establishmentId={id} current="history" />
        <ErrorState title={es.agents.agenda.common.failedLoad} description={t.loadFailed} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <SettingsTabs establishmentId={id} current="history" />
      {entries.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyReason} />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface px-4" data-testid="history-list">
          {entries.map((entry, index) => (
            <li key={`${entry.at.toISOString()}-${index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
              <span className="min-w-0 flex-1 text-[15px] text-text">{sentence(entry, timeZone)}</span>
              <time dateTime={entry.at.toISOString()} className="text-xs tabular-nums text-text-secondary">
                {formatDateTime(entry.at, timeZone)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
