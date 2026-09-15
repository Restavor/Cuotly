import type { SpaceRequestState } from "@/core/space-requests";

/** El tono con el que se pinta cada estado de una solicitud de espacio (§21.4: texto y color). */
export function requestTone(
  state: SpaceRequestState,
): "success" | "info" | "warning" | "danger" | "neutral" {
  switch (state) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "needs_information":
      return "warning";
    case "draft":
      return "neutral";
    default:
      return "info";
  }
}
