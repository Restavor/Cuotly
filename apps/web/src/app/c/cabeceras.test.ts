import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

/** El enlace del comensal es su llave: la respuesta de `/c/*` no se guarda, no se indexa, no filtra el enlace ni se enmarca. */
describe("AVI-05 · las cabeceras de seguridad de /c/*", () => {
  it("AVI-05 · sin caché, sin referrer, sin indexar y sin poder enmarcarse", async () => {
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source === "/c/:path*");
    expect(rule).toBeDefined();
    const headers = Object.fromEntries(rule!.headers.map((h) => [h.key.toLowerCase(), h.value]));
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toBe("frame-ancestors 'none'");
  });

  it("AVI-05 · las cabeceras solo afectan a /c/*, no al resto de la aplicación", async () => {
    const rules = await nextConfig.headers!();
    expect(rules.every((r) => r.source.startsWith("/c/"))).toBe(true);
  });
});
