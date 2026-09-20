"use client";

import { AppShell, type SearchResult } from "@/components/shell/AppShell";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { es } from "@/i18n/es";

/**
 * La hermana de `/armazon` para el **contexto global** (§36, G01 a G08).
 *
 * Existe por lo mismo que aquella: el armazón del contexto global solo se
 * ve tras identificarse, así que sin esta página no había forma de mirarlo
 * —ni de comprobar por máquina la navegación por teclado (CA-22), el ancho
 * de teléfono (CA-19) y los estados sin datos (CA-20)— sin una sesión y una
 * base de datos delante.
 *
 * NO es una pantalla de producto y no enseña ningún dato: ni cifras, ni
 * nombres, ni avisos inventados (CLAUDE.md MUST NOT).
 */
export default function ArmazonGlobalPage() {
  // La búsqueda real la resuelve `global_search()` en el servidor, con RLS.
  const buscar = async (): Promise<readonly SearchResult[]> => [];

  return (
    <AppShell
      context="global"
      userInitial="·"
      userLabel="Armazón de referencia"
      notifications={[]}
      onSearch={buscar}
    >
      <h1 className="mb-4 text-xl font-semibold">{es.globalContext.home.title}</h1>
      <EmptyReason testId="contenido-vacio" reason="no_data_yet" title={es.states.emptyTitle} />
    </AppShell>
  );
}
