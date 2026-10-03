/**
 * `pnpm agente:seco` · la prueba en seco. Solo cablea el entorno real: todo lo demás está en `src/dry-run/run.ts`.
 *
 *   pnpm agente:seco
 *   pnpm agente:seco --restaurante=EST-0001
 *   pnpm agente:seco --ahora=2026-10-04T08:00:00+02:00   (reloj simulado: solo aquí, con cartel; nunca en una publicación)
 *
 * Variables de entorno (nunca por el chat ni en el repositorio): RESTAVOR_SUPABASE_URL, RESTAVOR_SUPABASE_ANON_KEY,
 * AGENTE_EMAIL y AGENTE_PASSWORD.
 */
import { runDryRun } from "../src/dry-run/run.ts";

const result = await runDryRun({
  env: process.env,
  argv: process.argv.slice(2),
  fetchImpl: fetch,
  systemNow: () => new Date(),
});
process.stdout.write(result.output);
process.exitCode = result.exitCode;
