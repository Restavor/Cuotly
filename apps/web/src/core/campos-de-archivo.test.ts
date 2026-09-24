import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * El `<input type="file">` suelto lo pinta el navegador en su idioma:
 * "Choose File · No file chosen" en un teléfono en inglés, en medio de una
 * pantalla en español (CLAUDE.md: todo el texto visible por i18n). Y no
 * admite los tokens del sistema. Así estaban el logotipo del espacio, los
 * adjuntos de una solicitud y los de una incidencia.
 *
 * Todo campo de archivo va tapado (`sr-only`) dentro de un `<label>` que
 * hace de botón con texto nuestro. Este barrido falla si alguno se queda a
 * la vista.
 */
const RAIZ = join(process.cwd(), "src");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return ruta.endsWith(".tsx") && !ruta.includes(".test.") ? [ruta] : [];
  });
}

/**
 * Las etiquetas `<input …>` de un archivo, enteras. No vale una expresión
 * `[^>]*`: se pararía en el `=>` de un `onChange` y la etiqueta se quedaría
 * sin mirar, que es justo como se escapa un campo.
 */
export function etiquetasInput(texto: string): string[] {
  const salida: string[] = [];
  let desde = 0;
  for (;;) {
    const inicio = texto.indexOf("<input", desde);
    if (inicio === -1) return salida;
    let llaves = 0;
    let i = inicio + 6;
    for (; i < texto.length; i++) {
      const c = texto[i];
      if (c === "{") llaves++;
      else if (c === "}") llaves--;
      else if (c === ">" && llaves === 0) break;
    }
    salida.push(texto.slice(inicio, i + 1));
    desde = i + 1;
  }
}

describe("los campos de archivo hablan español", () => {
  it("lee la etiqueta entera aunque lleve una función flecha", () => {
    const [etiqueta] = etiquetasInput(
      '<input type="file" onChange={(e) => hacer(e)} className="sr-only" />',
    );
    expect(etiqueta).toContain('className="sr-only"');
  });

  it("ningún <input type=\"file\"> queda a la vista", () => {
    const aLaVista: string[] = [];
    let vistos = 0;
    for (const ruta of archivos(RAIZ)) {
      // Sin los comentarios: varios explican el truco citando la etiqueta.
      const codigo = readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const etiqueta of etiquetasInput(codigo)) {
        if (!/type="file"/.test(etiqueta)) continue;
        vistos++;
        if (!/className="sr-only"/.test(etiqueta)) aLaVista.push(relative(RAIZ, ruta));
      }
    }
    expect(aLaVista).toEqual([]);
    // Que el barrido de verdad los encuentre: hoy hay siete.
    expect(vistos).toBeGreaterThanOrEqual(7);
  });
});
