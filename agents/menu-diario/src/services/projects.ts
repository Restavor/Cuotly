/**
 * Los dos proyectos de Supabase de Restavor y cuál puede tocar el agente en cada fase.
 * Hasta la Fase 7 (que exige el OK de Bosco) el agente solo trabaja contra «Restavor pruebas» (decisión 151, PRD §3.1).
 */
export const PRUEBAS_PROJECT_REF = "bnucqykimngjwcrlpmsm";
export const PRODUCCION_PROJECT_REF = "mcajbfxhkxtdhjoyrqha";

export type ProjectError = "invalid_url" | "production_project" | "not_pruebas_project";

/** Solo se acepta `https://<ref de pruebas>.supabase.co`. Producción se rechaza con un error propio, para que se vea por qué. */
export function checkPruebasProjectUrl(raw: string): { ok: true; url: URL } | { ok: false; error: ProjectError } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  const host = url.hostname.toLowerCase();
  if (host.includes(PRODUCCION_PROJECT_REF)) return { ok: false, error: "production_project" };
  if (url.protocol !== "https:" || host !== `${PRUEBAS_PROJECT_REF}.supabase.co`) return { ok: false, error: "not_pruebas_project" };
  return { ok: true, url };
}
