"use server";

import type { SearchResult } from "@/components/shell/AppShell";
import { createClient } from "@/lib/supabase/server";

/**
 * HU-31 · la búsqueda global, filtrada en el servidor.
 *
 * `global_search()` es SECURITY INVOKER a propósito: se ejecuta con los
 * privilegios de quien busca, así que las mismas políticas de RLS que
 * filtran cada tabla filtran los resultados. No hay ninguna lista blanca
 * escrita aquí — buscar no puede enseñar nada que no se pudiera abrir.
 */
export async function searchEverything(query: string): Promise<readonly SearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", { p_query: term, p_limit: 20 });

  if (error) return [];

  return (data ?? []).map((row) => ({
    kind: row.kind,
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    state: row.state,
    deepLink: row.deep_link,
  }));
}
