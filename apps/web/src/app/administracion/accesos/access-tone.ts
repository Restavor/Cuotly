import type { AccessRequestState } from "@/core/access-requests";

/** El tono de cada estado de una solicitud de acceso (§21.4: texto y color). */
export function accessTone(
  state: AccessRequestState,
): "success" | "info" | "warning" | "danger" | "neutral" {
  switch (state) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "needs_information":
      return "warning";
    default:
      return "info";
  }
}
