import { AgentsPlaceholder } from "@/app/agents/AgentsPlaceholder";
import { es } from "@/i18n/es";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AgentsPlaceholder
      establishmentId={id}
      page="newReservation"
      title={es.agents.menu.newReservationTitle}
      phase={es.agents.soon.phaseAgenda}
    />
  );
}
