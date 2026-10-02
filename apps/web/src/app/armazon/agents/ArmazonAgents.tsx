"use client";

import { AppShell, type SearchResult } from "@/components/shell/AppShell";
import type { AgentsNavContext } from "@/components/shell/navigation";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { es } from "@/i18n/es";

/** El armazón de Restavor agents con un actor dado. Sin ningún dato: ni cifras ni nombres inventados. */
export function ArmazonAgents({ nav }: { nav: AgentsNavContext }) {
  // La búsqueda real la resuelve el servidor, con RLS.
  const buscar = async (): Promise<readonly SearchResult[]> => [];

  return (
    <AppShell
      context="agents"
      agentsNav={nav}
      userInitial="·"
      userLabel="Armazón de referencia"
      notifications={[]}
      onSearch={buscar}
    >
      <h1 className="mb-4 text-xl font-semibold">{es.agents.menu.today}</h1>
      <EmptyReason testId="contenido-vacio" reason="no_data_yet" title={es.states.emptyTitle} />
    </AppShell>
  );
}
