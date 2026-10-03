/**
 * `agente:seco` · la prueba en seco del Agente Menú Diario (PRD §14, Fase 1).
 *
 * Entra como el usuario agente, lee la cola y dice qué haría con cada menú y cuándo. NO ESCRIBE NADA: el cliente que usa solo
 * puede leer (`read-only-gate.ts`) y al final cuenta lo que pidió de verdad.
 *
 * Todo lo de fuera entra por `RunDeps` (entorno, argumentos, `fetch`, reloj del ordenador): así se prueba entero sin red.
 * Códigos de salida: 0 todo bien · 1 error de lectura · 2 configuración, inicio de sesión o reloj dudoso (el agente se para).
 */
import { checkClockSkew, DEFAULT_MAX_CLOCK_SKEW_MS, localClock } from "../core/clock.ts";
import { buildDryRunReport, selectRestaurants } from "../core/dry-run.ts";
import { PRUEBAS_PROJECT_REF } from "../services/projects.ts";
import { readQueueAndMenus, readSurroundings } from "../services/dry-run-reader.ts";
import { createReadOnlyClient } from "../services/read-only-client.ts";
import { formatDryRunReport } from "../i18n/dry-run-report.ts";
import { es, formatClock } from "../i18n/es.ts";

export const REQUIRED_ENV = ["RESTAVOR_SUPABASE_URL", "RESTAVOR_SUPABASE_ANON_KEY", "AGENTE_EMAIL", "AGENTE_PASSWORD"] as const;

export type RunDeps = {
  env: Readonly<Record<string, string | undefined>>;
  argv: readonly string[];
  fetchImpl: typeof fetch;
  /** El reloj del ordenador. Solo se lee fuera de `src/core`; el núcleo lo recibe como dato. */
  systemNow: () => Date;
};

export type RunResult = { exitCode: 0 | 1 | 2; output: string };

type Args = { simulatedNow: Date | null; restaurant: string | undefined };

function parseArgs(argv: readonly string[]): { ok: true; args: Args } | { ok: false; message: string } {
  const args: Args = { simulatedNow: null, restaurant: undefined };
  for (const arg of argv) {
    if (arg.startsWith("--ahora=")) {
      const value = arg.slice("--ahora=".length);
      const date = new Date(value);
      // Se exige zona explícita: sin ella, la fecha se leería en la zona del ordenador, que en Actions es UTC.
      if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value) || Number.isNaN(date.getTime())) return { ok: false, message: es.dryRun.errors.badNow(value) };
      args.simulatedNow = date;
    } else if (arg.startsWith("--restaurante=")) {
      args.restaurant = arg.slice("--restaurante=".length);
    } else {
      return { ok: false, message: es.dryRun.errors.badArgument(arg) };
    }
  }
  return { ok: true, args };
}

const fail = (exitCode: 1 | 2, message: string): RunResult => ({ exitCode, output: `${message}\n` });

export async function runDryRun(deps: RunDeps): Promise<RunResult> {
  const parsed = parseArgs(deps.argv);
  if (!parsed.ok) return fail(2, parsed.message);
  const { args } = parsed;

  const missing = REQUIRED_ENV.filter((name) => (deps.env[name] ?? "") === "");
  if (missing.length > 0) return fail(2, es.dryRun.errors.missingEnv(missing));
  const url = deps.env.RESTAVOR_SUPABASE_URL as string;
  const anonKey = deps.env.RESTAVOR_SUPABASE_ANON_KEY as string;
  const email = deps.env.AGENTE_EMAIL as string;
  const password = deps.env.AGENTE_PASSWORD as string;

  const created = createReadOnlyClient({ url, anonKey, fetchImpl: deps.fetchImpl });
  if (!created.ok) return fail(2, es.dryRun.errors.project[created.error] ?? created.error);
  const { client, gate } = created.value;

  // 1) Iniciar sesión como el agente.
  let agentUserId: string;
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error !== null || data.user === null) return fail(2, es.dryRun.errors.signIn(error?.message ?? "no devolvió usuario"));
    agentUserId = data.user.id;
  } catch (e) {
    return fail(2, es.dryRun.errors.signIn(e instanceof Error ? e.message : "error desconocido"));
  }

  try {
    // 2) El agente siempre sabe qué día y hora es (decisión 158): contrasta su reloj con el de Supabase y, si difieren, se para.
    const realNow = deps.systemNow();
    const serverNow = gate.serverDate();
    if (serverNow === null) return fail(2, es.dryRun.errors.clockUnreadable);
    const skew = checkClockSkew(realNow, serverNow);
    if (!skew.ok) {
      return fail(
        2,
        skew.error.code === "clock_skew"
          ? es.dryRun.errors.clockSkew(Math.round(skew.error.skewMs / 1000), DEFAULT_MAX_CLOCK_SKEW_MS / 60_000)
          : es.dryRun.errors.clockUnreadable,
      );
    }
    const now = args.simulatedNow ?? realNow;

    // 3) Leer: restaurantes autorizados, y de los activados su cola y sus menús.
    const around = await readSurroundings(client, agentUserId);
    if (!around.ok) return fail(1, es.dryRun.errors.read(around.error.step, around.error.message));
    const restaurants = selectRestaurants(around.value.restaurants, around.value.authorizedIds, { restaurant: args.restaurant });
    const activated = restaurants.flatMap((r) => (r.activated ? [r.restaurant] : []));
    const data = await readQueueAndMenus(client, {
      spaceIds: [...new Set(activated.map((r) => r.spaceId))],
      establishmentIds: activated.map((r) => r.id),
    });
    if (!data.ok) return fail(1, es.dryRun.errors.read(data.error.step, data.error.message));

    // 4) Decidir (puro) y enseñar.
    const report = buildDryRunReport({
      now,
      agentUserId,
      timeZones: around.value.timeZones,
      restaurants,
      queue: data.value.queue,
      menus: data.value.menus,
    });
    if (!report.ok) return fail(2, `${es.clock.invalidClock} (${report.error})`);

    const clockZone = [...around.value.timeZones.values()].sort()[0] ?? "UTC";
    const clock = localClock(now, clockZone);
    const reads = gate.requests.filter((r) => r.kind === "read").length;
    const auth = gate.requests.filter((r) => r.kind === "auth").length + 1; // +1: el cierre de sesión de abajo
    const output = formatDryRunReport(report.value, {
      clockLine: clock.ok ? formatClock(clock.value) : es.clock.invalidClock,
      simulatedClock: args.simulatedNow !== null,
      environment: `Restavor pruebas (${PRUEBAS_PROJECT_REF.slice(0, 8)}…)`,
      skewSeconds: Math.round(Math.abs(skew.value.skewMs) / 1000),
      maxSkewMinutes: DEFAULT_MAX_CLOCK_SKEW_MS / 60_000,
      requests: { reads, auth },
    });
    return { exitCode: 0, output };
  } finally {
    // 5) Cerrar sesión. Si fallara, no cambia el resultado de la prueba.
    try {
      await client.auth.signOut();
    } catch {
      /* el informe ya está hecho */
    }
  }
}
