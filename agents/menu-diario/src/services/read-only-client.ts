/**
 * El cliente de Supabase del agente en la prueba en seco: anon key + la sesión del propio usuario agente (NUNCA `service_role`),
 * sin guardar la sesión, y detrás de la puerta de solo lectura.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkPruebasProjectUrl, type ProjectError } from "./projects.ts";
import { createReadOnlyGate, type ReadOnlyGate } from "./read-only-gate.ts";

export type ReadOnlyClient = { client: SupabaseClient; gate: ReadOnlyGate };

export function createReadOnlyClient(options: {
  url: string;
  anonKey: string;
  fetchImpl: typeof fetch;
}): { ok: true; value: ReadOnlyClient } | { ok: false; error: ProjectError } {
  const project = checkPruebasProjectUrl(options.url);
  if (!project.ok) return { ok: false, error: project.error };
  const gate = createReadOnlyGate(options.fetchImpl);
  const client = createClient(project.url.origin, options.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: gate.fetch },
  });
  return { ok: true, value: { client, gate } };
}
