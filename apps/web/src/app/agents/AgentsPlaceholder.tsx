import { EmptyReason } from "@/components/ui/EmptyReason";
import { NoPermissionState, PageHeader } from "@/components/ui";
import type { AgentsPage } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";

import { requireAgentsPage } from "./agents-context";

/**
 * Una pantalla de Restavor agents que existe en el armazón y cuyo contenido llega en otra
 * fase. **No simula nada** (CLAUDE.md): dice qué pantalla es, de quién es, y en qué fase se
 * construye. Lo que sí hace desde ya es lo que cuesta caro hacer después: cada pantalla
 * pasa por la puerta del restaurante (`requireAgentsPage`), así que quien no puede abrirla
 * por la dirección tampoco la abre desde el menú.
 */
export async function AgentsPlaceholder({
  establishmentId,
  page,
  title,
  phase,
  subtitle,
}: {
  establishmentId: string;
  page: AgentsPage;
  title: string;
  /** La fase que la construye, ya redactada: «Fase C (la agenda)». */
  phase: string;
  subtitle?: string;
}) {
  const access = await requireAgentsPage(establishmentId, page);
  const t = es.agents.soon;

  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={title} />
        <NoPermissionState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle ?? access.nav.name} />
      <EmptyReason reason="no_data_yet" title={t.title} />
      <p className="text-center text-sm text-text-secondary">{t.reason(phase)}</p>
    </div>
  );
}
