import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/*
 * El lint es lo que impide que `src/core` lea el reloj, use aleatoriedad, importe Supabase/Next/React/Playwright/IA o
 * adaptadores, o use `any` (CLAUDE.md, estilo de código; decisión 158). Este test lanza ESLint con la configuración real
 * del paquete sobre código de prueba y comprueba que cada forma prohibida da error, para que nadie pueda aflojar la
 * configuración sin que falle un test.
 *
 * Límite conocido, que NO se detecta: un alias de la clase (`const D = Date; D.now()`). Eso se vigila en la revisión.
 */
const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });

async function rulesFor(code: string, filePath = "src/core/probe.ts"): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? "(sin regla)");
}

describe("lint · src/core es puro (decisión 158)", () => {
  const prohibidas: [string, string, string][] = [
    ["Date.now()", "export const a = Date.now();", "no-restricted-properties"],
    ["Math.random()", "export const a = Math.random();", "no-restricted-properties"],
    ["new Date() sin argumentos", "export const a = new Date();", "no-restricted-syntax"],
    ["Date() sin new", "export const a = Date();", "no-restricted-syntax"],
    ["globalThis.Date", "export const a = globalThis.Date.now();", "no-restricted-syntax"],
    ["Intl.DateTimeFormat().format() sin fecha", 'export const a = new Intl.DateTimeFormat("es").format();', "no-restricted-syntax"],
    ["performance.now()", "export const a = performance.now();", "no-restricted-globals"],
    ["crypto.randomUUID()", "export const a = crypto.randomUUID();", "no-restricted-globals"],
    ["process.hrtime()", "export const a = process.hrtime();", "no-restricted-globals"],
    ["importar Supabase", 'import { createClient } from "@supabase/supabase-js";\nexport const a = createClient;', "no-restricted-imports"],
    ["importar Next", 'import { NextResponse } from "next/server";\nexport const a = NextResponse;', "no-restricted-imports"],
    ["importar React", 'import { useState } from "react";\nexport const a = useState;', "no-restricted-imports"],
    ["importar Playwright", 'import { chromium } from "playwright";\nexport const a = chromium;', "no-restricted-imports"],
    ["importar la IA de Anthropic", 'import Anthropic from "@anthropic-ai/sdk";\nexport const a = Anthropic;', "no-restricted-imports"],
    ["importar un adaptador", 'import { x } from "../services/reader.ts";\nexport const a = x;', "no-restricted-imports"],
    ["importar textos de pantalla", 'import { es } from "../i18n/es.ts";\nexport const a = es;', "no-restricted-imports"],
    ["any explícito", "export const a: any = 1;", "@typescript-eslint/no-explicit-any"],
  ];

  // Leer el reloj del sistema o usar aleatoriedad es lo que rompe RA-08 (el reloj es un dato); el resto es la pureza de CLAUDE.md.
  const delReloj = new Set([
    "Date.now()",
    "Math.random()",
    "new Date() sin argumentos",
    "Date() sin new",
    "globalThis.Date",
    "Intl.DateTimeFormat().format() sin fecha",
    "performance.now()",
    "crypto.randomUUID()",
    "process.hrtime()",
  ]);
  for (const [nombre, codigo, regla] of prohibidas) {
    it(`${delReloj.has(nombre) ? "RA-08" : "lint"} · ${nombre} da error en src/core`, async () => {
      expect(await rulesFor(codigo)).toContain(regla);
    });
  }

  it("lint · el código puro con fechas explícitas no da ningún error", async () => {
    const limpio = [
      'export const a = new Date("2026-02-10T10:00:00Z").getTime();',
      'export const b = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid" }).format(new Date(0));',
    ].join("\n");
    expect(await rulesFor(limpio)).toEqual([]);
  });

  it("lint · fuera de src/core (adaptadores) sí se puede leer el reloj: es donde se lee el reloj del ordenador", async () => {
    expect(await rulesFor("export const a = Date.now();", "src/services/system-clock.ts")).toEqual([]);
  });
});

describe("lint · la prueba en seco no escribe en la base", () => {
  const escrituras: [string, string][] = [
    ["insert", 'export const a = client.from("menus").insert({ name: "x" });'],
    ["update", 'export const a = client.from("menus").update({ name: "x" });'],
    ["delete", 'export const a = client.from("menus").delete();'],
    ["upsert", 'export const a = client.from("menus").upsert({ name: "x" });'],
  ];
  const archivos = ["src/dry-run/run.ts", "scripts/dry-run.ts", "src/services/dry-run-reader.ts", "src/services/read-only-gate.ts"];

  for (const [nombre, codigo] of escrituras) {
    it(`lint · .${nombre}() da error en el código de la prueba en seco`, async () => {
      for (const archivo of archivos) expect(await rulesFor(codigo, archivo)).toContain("no-restricted-syntax");
    });
  }

  it("lint · leer con .select() en la prueba en seco no da ningún error", async () => {
    const lectura = 'export const a = client.from("menus").select("id,state").eq("state", "draft");';
    expect(await rulesFor(lectura, "src/services/dry-run-reader.ts")).toEqual([]);
  });

  it("lint · el robot de las fases siguientes (otros archivos de services) sí podrá escribir", async () => {
    expect(await rulesFor('export const a = client.from("tareas").insert({});', "src/services/robot-writes.ts")).toEqual([]);
  });
});
