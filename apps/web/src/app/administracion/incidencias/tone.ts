import type { IncidentPriority, IncidentState } from "@/core/support";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** §21.4 · el estado se expresa con texto e icono; el color acompaña. */
export function stateTone(state: IncidentState): Tone {
  switch (state) {
    case "needs_information":
      return "warning";
    case "resolved":
      return "success";
    case "closed":
      return "neutral";
    default:
      return "info";
  }
}

export function priorityTone(priority: IncidentPriority | null): Tone {
  switch (priority) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    case "standard":
      return "info";
    case null:
      return "neutral";
  }
}
