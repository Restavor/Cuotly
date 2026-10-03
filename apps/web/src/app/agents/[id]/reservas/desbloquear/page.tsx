import { redirect } from "next/navigation";

import { agentsPageHref } from "@/core/reservations/agents-routes";

import { requireAgentsPage } from "../../../agents-context";
import { DeviceUnlockForm } from "./DeviceUnlockForm";

export const dynamic = "force-dynamic";

/**
 * «Ajustes con PIN» (PRD de agents §3.3): la puerta de los Ajustes en la tablet del local. Solo tiene sentido en la
 * tablet y mientras los Ajustes están cerrados; en una cuenta, o con los Ajustes ya abiertos, se va directo a ellos.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "unlock");
  if (access.mode !== "device" || access.nav.elevation) redirect(agentsPageHref(id, "settings"));
  return <DeviceUnlockForm establishmentId={id} backHref={agentsPageHref(id, "today")} />;
}
