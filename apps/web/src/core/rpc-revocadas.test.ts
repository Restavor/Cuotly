import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md · una función interna se protege con `revoke all ... from
 * public, anon, authenticated`. Si después una pantalla la llama por RPC
 * con la sesión de quien mira, la base contesta "permission denied" y la
 * pantalla se queda a medias sin decir nada.
 *
 * Así estuvo la conversación de Mensajes: llamaba a
 * `conversation_establishment_id()`, revocada en la migración 26, y toda
 * conversación de solicitud o de trabajo salía sin un solo mensaje.
 *
 * Este barrido recorre las migraciones en orden, se queda con las
 * funciones que acaban SIN `execute` para `authenticated`, y falla si un
 * archivo de la web las llama por RPC sin usar el cliente de servicio.
 */
const MIGRACIONES = join(process.cwd(), "..", "..", "supabase", "migrations");

function revocadasAAuthenticated(): Set<string> {
  const estado = new Map<string, boolean>();
  for (const archivo of readdirSync(MIGRACIONES).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRACIONES, archivo), "utf8").replace(/--[^\n]*/g, "");
    const sentencias =
      /(revoke|grant)\s+(?:all|execute)\s+on\s+function\s+(?:public\.)?([a-z_0-9]+)\s*\([^;]*?\)\s+(from|to)\s+([^;]+);/gi;
    for (const m of sql.matchAll(sentencias)) {
      const [, verbo, nombre, , a] = m;
      if (!/\bauthenticated\b/i.test(a!)) continue;
      estado.set(nombre!.toLowerCase(), verbo!.toLowerCase() === "grant");
    }
  }
  return new Set([...estado].filter(([, abierta]) => !abierta).map(([nombre]) => nombre));
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\./.test(nombre) ? [ruta] : [];
  });
}

describe("CLAUDE.md · funciones internas revocadas a authenticated", () => {
  const revocadas = revocadasAAuthenticated();

  it("el barrido encuentra las funciones internas (no es vacuo)", () => {
    expect(revocadas.has("conversation_establishment_id")).toBe(true);
    expect(revocadas.size).toBeGreaterThan(20);
  });

  it("ninguna pantalla llama por RPC con la sesión de quien mira a una función revocada", () => {
    const culpables: string[] = [];
    for (const ruta of archivos(join(process.cwd(), "src"))) {
      const codigo = readFileSync(ruta, "utf8");
      // Con el cliente de servicio sí se puede: es el camino de las
      // funciones reservadas a `service_role`.
      if (/createAdminClient|\badmin\.rpc\(/.test(codigo)) continue;
      for (const [, nombre] of codigo.matchAll(/\.rpc\(\s*"([a-z_0-9]+)"/g)) {
        if (revocadas.has(nombre!)) culpables.push(`${ruta.split("/src/")[1]} → ${nombre}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
