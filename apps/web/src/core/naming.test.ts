import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { ALLOWED_MIME_TYPES } from "./files";
import { ENTITY_KINDS, STATE_CATALOGUE, type StatefulEntity } from "./naming";

/**
 * CA-21 · "Cada entidad y cada estado se llama igual en escritorio, móvil,
 * correo, PDF e historial."
 *
 * Se sostiene porque solo hay UN diccionario. Estos tests comprueban las
 * dos formas de romperlo:
 *   · añadir un estado a la base y olvidarse de nombrarlo (la pantalla
 *     enseñaría el valor crudo en inglés, `blocked_by_client`);
 *   · dejar un nombre huérfano, que casi siempre es el resto de un estado
 *     renombrado a medias o un segundo nombre para lo mismo.
 */
describe("CA-21 · un solo juego de nombres", () => {
  it("cada entidad del catálogo tiene nombre en el diccionario", () => {
    for (const kind of ENTITY_KINDS) {
      expect(es.naming.entities[kind], `falta el nombre de la entidad "${kind}"`).toBeTruthy();
    }
  });

  it("el diccionario de entidades no tiene nombres de más", () => {
    expect(Object.keys(es.naming.entities).sort()).toEqual([...ENTITY_KINDS].sort());
  });

  it("cada estado de cada entidad tiene nombre, y ninguno sobra", () => {
    for (const entity of Object.keys(STATE_CATALOGUE) as StatefulEntity[]) {
      const canonicos = [...STATE_CATALOGUE[entity]].sort();
      const nombrados = Object.keys(es.naming.states[entity]).sort();
      expect(nombrados, `los estados de "${entity}" no coinciden con el catálogo`).toEqual(canonicos);
    }
  });

  it("ningún nombre visible se queda en el valor crudo de la base", () => {
    // Un estado sin traducir se detecta porque el nombre sigue siendo el
    // identificador: minúsculas con guiones bajos.
    for (const entity of Object.keys(STATE_CATALOGUE) as StatefulEntity[]) {
      const nombres: Record<string, string> = es.naming.states[entity];
      for (const [valor, nombre] of Object.entries(nombres)) {
        expect(nombre, `"${entity}.${valor}" sigue mostrando el valor crudo`).not.toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it("RN-ARC-06 · cada tipo de archivo admitido tiene nombre corto, y ninguno sobra", () => {
    // La fila de un adjunto lee "PDF · 320 KB". Ese "PDF" sale del
    // `mime_type` guardado, así que un tipo admitido sin nombre dejaría la
    // fila diciendo "application/pdf", y un nombre huérfano es casi
    // siempre el resto de un tipo que se dejó de admitir.
    expect(Object.keys(es.files.types).sort()).toEqual([...ALLOWED_MIME_TYPES].sort());
  });

  it("CA-20: los cuatro motivos de pantalla vacía del PRD, y ninguno más", () => {
    expect(Object.keys(es.emptyReasons).sort()).toEqual(
      ["error", "insufficient_period", "no_data_yet", "not_connected"].sort(),
    );
    for (const texto of Object.values(es.emptyReasons)) {
      expect(texto.length).toBeGreaterThan(20); // un motivo, no una etiqueta
    }
  });
});
