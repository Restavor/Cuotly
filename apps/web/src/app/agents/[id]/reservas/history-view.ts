import { formatDateTime } from "@/core/reservations/format";
import { es } from "@/i18n/es";
import type { HistoryEvent } from "@/services/reservations-gateway";

type Texts = typeof es.agents.agenda.ficha.historyEvents;

function hhmm(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 5) : "";
}

/** Una línea del historial: cuándo y qué, sin datos personales (el evento no los lleva) y con el nombre de quien es del restaurante. */
export function describeEvent(event: HistoryEvent, platformName: string | null, timeZone: string): { readonly when: string; readonly text: string } {
  const t: Texts = es.agents.agenda.ficha.historyEvents;
  const data = event.data;
  let text: string;

  switch (event.type) {
    case "created": {
      const source = typeof data.source === "string" ? data.source : "manual";
      text =
        source === "agent" ? t.created.agent : source === "web" ? t.created.web : source === "platform" ? t.created.platform(platformName) : t.created.manual;
      break;
    }
    case "updated": {
      const parts: string[] = [];
      if (data.date_from !== undefined && data.date_to !== undefined) parts.push(t.dateFromTo(String(data.date_from), String(data.date_to)));
      if (data.time_from !== undefined && data.time_to !== undefined) parts.push(t.timeFromTo(hhmm(data.time_from), hhmm(data.time_to)));
      if (typeof data.party_size_from === "number" && typeof data.party_size_to === "number") {
        parts.push(t.partyFromTo(data.party_size_from, data.party_size_to));
      }
      const changed = Array.isArray(data.changed) ? data.changed.filter((c): c is string => typeof c === "string") : [];
      const others = changed.filter((c) => c !== "date" && c !== "time" && c !== "party_size");
      const labels = t.updatedFields as Record<string, string>;
      if (others.length > 0) parts.push(t.changedWhat(others.map((c) => labels[c] ?? c).join(", ")));
      if (typeof data.status_to === "string" && data.status_to in t.statusTo) {
        parts.push(t.statusChange((t.statusTo as Record<string, string>)[data.status_to]));
      }
      text = [t.updated, ...parts].join(" · ");
      break;
    }
    case "cancelled": {
      const reasons = t.cancelledReasons as Record<string, string>;
      const reason = typeof data.reason === "string" ? reasons[data.reason] : undefined;
      text = reason ? `${t.cancelled} · ${reason}` : t.cancelled;
      break;
    }
    case "confirmed":
      text = t.confirmed;
      break;
    case "rejected":
      text = t.rejected;
      break;
    case "no_show":
      text = t.no_show;
      break;
    case "no_show_undone":
      text = t.no_show_undone;
      break;
    case "opened":
      text = t.opened;
      break;
    case "duplicate_dismissed":
      text = t.duplicate_dismissed;
      break;
    case "platform_cancel_done":
      text = t.platform_cancel_done;
      break;
    default:
      text = t.other;
  }

  // Quién: el nombre de quien es del restaurante o la etiqueta del soporte; el agente, la web y la plataforma ya se dicen en el texto.
  const showsActor = event.actorType === "member" || event.actorType === "staff" || event.actorType === "restavor_support";
  if (showsActor && event.actorName) text = `${text} · ${t.by(event.actorName)}`;

  return { when: formatDateTime(event.createdAt, timeZone), text };
}
