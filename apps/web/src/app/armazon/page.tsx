"use client";

import { AppShell, type SearchResult } from "@/components/shell/AppShell";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { es } from "@/i18n/es";

/**
 * Página interna de referencia del armazón, hermana de `/styleguide`.
 *
 * NO es una pantalla de producto y no muestra datos de negocio: no hay
 * cifras inventadas aquí (CLAUDE.md MUST NOT y CA-20). Enseña el armazón
 * vacío —menú, barra de móvil, búsqueda, avisos— para poder comprobar en
 * tests reales la navegación por teclado (CA-22), el comportamiento en
 * anchura de teléfono (CA-19) y que los estados sin datos explican el
 * motivo (CA-20), sin necesitar una sesión ni una base de datos.
 *
 * Las pantallas con datos de verdad llegan enganchadas a Supabase; esta
 * existe para que los cuatro criterios de experiencia sean comprobables
 * por máquina y no por buena voluntad.
 */
export default function ArmazonPage() {
  // La búsqueda real la resuelve `global_search()` en el servidor, con RLS.
  // Aquí no se simula ningún resultado: devolver una lista inventada haría
  // que el test pasara sin que la búsqueda funcione.
  const buscar = async (): Promise<readonly SearchResult[]> => [];

  return (
    <AppShell
      spaceSlug="referencia"
      spaceName="Armazón de referencia"
      role="owner"
      notifications={[]}
      onSearch={buscar}
    >
      <h1 className="mb-4 text-xl font-semibold">Armazón de referencia</h1>
      <EmptyReason testId="contenido-vacio" reason="no_data_yet" title={es.states.emptyTitle} />
    </AppShell>
  );
}
