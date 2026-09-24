import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md · las tablas con el `select` revocado y concedido por columnas
 * no se pueden leer sin enumerar columnas. Un recuento incrustado de
 * PostgREST (`messages(count)`) no las enumera y la base lo rechaza con
 * "permission denied for table messages": así estuvo la columna
 * Comentarios de Trabajos, diciendo "No se pudo leer" en todas las filas.
 *
 * Se cuentan las filas devueltas (`messages(id)`) o con una función del
 * servidor.
 */
const TABLAS = [
  "messages", "message_edits", "files", "file_versions", "file_links", "charges", "payments",
  "payment_confirmations", "receipts", "financial_entries", "requests", "subscriptions",
  "corrections", "plan_commitments", "scheduled_plan_changes", "space_requests",
  "cuotly_payments", "cuotly_ledger_entries",
];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\./.test(nombre) ? [ruta] : [];
  });
}

describe("CLAUDE.md · privilegios de columna", () => {
  it("ningún recuento incrustado sobre una tabla con el select por columnas", () => {
    const patron = new RegExp(`\\b(${TABLAS.join("|")})\\s*\\(\\s*count\\s*\\)`);
    const culpables = archivos(join(process.cwd(), "src")).filter((ruta) =>
      patron.test(readFileSync(ruta, "utf8")),
    );
    expect(culpables).toEqual([]);
  });
});
