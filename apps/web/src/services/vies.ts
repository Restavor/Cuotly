import type { ViesAnswer } from "@/core/tax-id";

/**
 * Decisión 68 · la consulta a VIES, el registro de números de IVA de la
 * Comisión Europea. Es la única comprobación de que un documento **existe
 * de verdad**, no solo de que está bien formado; y solo vale para
 * empresas de la UE dadas de alta en el IVA intracomunitario.
 *
 * API pública y sin clave:
 *   POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
 *   { "countryCode": "PT", "vatNumber": "501964843" }
 *   → { "valid": true, "name": "…", … }
 *
 * Tres respuestas, y la tercera es la que importa no confundir: si VIES
 * no contesta —cada país tiene su servidor y a veces está caído—, eso es
 * "no se sabe", **nunca** "no existe". Quien decide qué hacer con cada
 * una es `decideTaxId()` en `src/core/tax-id.ts`.
 *
 * `fetch` se inyecta para los tests; en producción es el global.
 */
export const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

/** Lo que se espera a VIES antes de darlo por no disponible. */
export const VIES_TIMEOUT_MS = 6000;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function checkVies(
  viesCountryCode: string,
  vatNumber: string,
  fetchImpl: Fetch = fetch,
  timeoutMs: number = VIES_TIMEOUT_MS,
): Promise<ViesAnswer> {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), timeoutMs);
  try {
    const respuesta = await fetchImpl(VIES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ countryCode: viesCountryCode, vatNumber }),
      signal: corte.signal,
    });
    if (!respuesta.ok) return { kind: "unavailable" };

    const cuerpo = (await respuesta.json()) as {
      valid?: unknown;
      name?: unknown;
      errorWrappers?: unknown;
    };
    // Un error del país ("MS_UNAVAILABLE", "TIMEOUT"…) llega a veces con
    // un 200. No es un "no": es que no se sabe.
    if (Array.isArray(cuerpo.errorWrappers) && cuerpo.errorWrappers.length > 0) {
      return { kind: "unavailable" };
    }
    if (cuerpo.valid === true) {
      const nombre = typeof cuerpo.name === "string" ? cuerpo.name.trim() : "";
      // Algunos países no dan el nombre y devuelven "---".
      return { kind: "found", name: nombre === "" || /^-+$/.test(nombre) ? null : nombre };
    }
    if (cuerpo.valid === false) return { kind: "not_found" };
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(reloj);
  }
}
