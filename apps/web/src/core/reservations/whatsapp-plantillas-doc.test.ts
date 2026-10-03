import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { NOTICE_TEMPLATES } from "./notices";
import { WHATSAPP_MAX_VARIABLES, WHATSAPP_TEMPLATES } from "./notice-texts";

/**
 * `docs/agents/plantillas-whatsapp.md` es lo que se da de alta en Meta: tiene que decir exactamente lo mismo que el
 * código (RN-RES-10, AVI-03). Si una plantilla cambia en un sitio y no en el otro, Meta la rechazaría al enviar.
 */
const DOC = readFileSync(resolve(__dirname, "../../../../../docs/agents/plantillas-whatsapp.md"), "utf8");

function sectionOf(name: string, language: "es" | "en"): string {
  const marker = `### \`${name}\` · ${language === "es" ? "Español (es)" : "Inglés (en)"}`;
  const start = DOC.indexOf(marker);
  expect(start, `falta la sección ${marker}`).toBeGreaterThanOrEqual(0);
  const next = DOC.indexOf("\n### ", start + marker.length);
  return DOC.slice(start, next === -1 ? undefined : next);
}

describe("RN-RES-10 · las plantillas de WhatsApp del documento son las del código", () => {
  it("RN-RES-10 · hay exactamente doce secciones: seis avisos en español y en inglés", () => {
    expect(DOC.match(/^### `restavor_/gm)).toHaveLength(NOTICE_TEMPLATES.length * 2);
  });

  for (const template of NOTICE_TEMPLATES) {
    for (const language of ["es", "en"] as const) {
      const spec = WHATSAPP_TEMPLATES[template][language];

      it(`RN-RES-10 · ${spec.name} (${language}): cuerpo, variables y botón coinciden con el código`, () => {
        const section = sectionOf(spec.name, language);
        const body = /```text\n([\s\S]*?)\n```/.exec(section)?.[1];
        expect(body).toBe(spec.body);

        const variables = [...section.matchAll(/^ {2}- `\{\{(\d)\}\}` (\w+) →/gm)].map((m) => ({ n: Number(m[1]), name: m[2] }));
        expect(variables.map((v) => v.name)).toEqual([...spec.variables]);
        expect(variables.map((v) => v.n)).toEqual(spec.variables.map((_, i) => i + 1));
        expect(spec.variables.length).toBeLessThanOrEqual(WHATSAPP_MAX_VARIABLES);

        const button = /^- Botón: (.*)$/m.exec(section)?.[1] ?? "";
        if (spec.button === null) expect(button).toBe("ninguno.");
        else expect(button).toContain(`«${spec.button}»`);

        expect(section).toContain("**Utilidad**");
      });
    }
  }
});
