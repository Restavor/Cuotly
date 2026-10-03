import { describe, expect, it } from "vitest";
import { runDryRun, type RunDeps } from "../src/dry-run/run.ts";
import { PRODUCCION_PROJECT_REF, PRUEBAS_PROJECT_REF } from "../src/services/projects.ts";

/*
 * La prueba en seco de punta a punta, SIN red: un servidor de Supabase falso que habla como el real (inicio de sesión, PostgREST)
 * y, por delante, el cliente REAL de Supabase y la puerta de solo lectura. Así se comprueba la forma exacta de las peticiones.
 */
const URL_OK = `https://${PRUEBAS_PROJECT_REF}.supabase.co`;
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const EMAIL = "menu@restavor.com";
const PASSWORD = "contrasena-secreta-que-no-debe-salir-nunca";
const ANON_KEY = "anon-key-de-prueba-que-no-debe-salir";
/** Sábado 03/10/2026, 21:30 en Madrid. */
const REAL_NOW = new Date("2026-10-03T19:30:00Z");

type Call = { method: string; path: string; query: URLSearchParams };

type Scenario = {
  /** La hora que dice el servidor en la cabecera Date. Por defecto, la misma que el ordenador. `null`: no la manda. */
  serverNow?: Date | null;
  password?: string;
  authorized?: string[];
  establishments?: Record<string, unknown>[];
  queue?: Record<string, unknown>[];
  menus?: Record<string, unknown>[];
  failOn?: "menus" | "queue" | "spaces";
};

const BAR = { id: "est-bar-demo", space_id: SPACE_ID, code: "EST-0001", name: "Bar Demo", status: "active", web_platform: "landing_site", website_url: "https://www.restavor.com/pruebas-agente-menu", permanently_deleted_at: null };
const MAGARINOS = { id: "est-magarinos", space_id: SPACE_ID, code: "EST-0003", name: "Magariños", status: "active", web_platform: "landing_site", website_url: "https://www.magarinos.es", permanently_deleted_at: null };
const OTRA = { id: "est-otra", space_id: SPACE_ID, code: "EST-0004", name: "Otra web", status: "active", web_platform: "other", website_url: null, permanently_deleted_at: null };

function queueRow(menuId: string, establishmentId: string, establishmentName: string, targetDate: string, extra: Record<string, unknown> = {}) {
  return {
    menu_id: menuId,
    establishment_id: establishmentId,
    establishment_name: establishmentName,
    name: "Menú del día",
    kind: "daily",
    target_date: targetDate,
    state: "pending_assignment",
    cutoff_at: null,
    publish_by_at: null,
    requested_at: "2026-10-03T19:00:00Z",
    guaranteed: false,
    is_assigned: false,
    assigned_to: null,
    assignment_mode: null,
    publication_id: `pub-${menuId}`,
    pending_corrections: 0,
    updated_at: "2026-10-03T19:00:00Z",
    ...extra,
  };
}

function jwt(): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: AGENT_ID, role: "authenticated", exp: 4_102_444_800 })}.firma`;
}

/** Los valores que PostgREST recibe en `col=in.(a,b)`. */
function inList(query: URLSearchParams, column: string): string[] | null {
  const raw = query.get(column);
  if (raw === null || !raw.startsWith("in.(")) return null;
  return raw.slice(4, -1).split(",").filter(Boolean);
}

function fakeSupabase(s: Scenario = {}) {
  const calls: Call[] = [];
  const serverNow = s.serverNow === undefined ? REAL_NOW : s.serverNow;
  const authorized = s.authorized ?? [BAR.id, OTRA.id];
  const establishments = s.establishments ?? [BAR, MAGARINOS, OTRA];
  const queue = s.queue ?? [queueRow("m-hoy", BAR.id, "Bar Demo", "2026-10-03"), queueRow("m-manana", BAR.id, "Bar Demo", "2026-10-04"), queueRow("m-otro", MAGARINOS.id, "Magariños", "2026-10-03")];
  const menus = s.menus ?? [{ id: "m-borrador", establishment_id: BAR.id, kind: "daily", name: "Menú del día", target_date: "2026-10-05", state: "draft", published_at: null }];

  const reply = (status: number, body: unknown): Response => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (serverNow !== null) headers.date = serverNow.toUTCString();
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
  };

  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path: url.pathname, query: url.searchParams });

    if (url.pathname === "/auth/v1/token" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { email?: string; password?: string };
      if (body.email !== EMAIL || body.password !== (s.password ?? PASSWORD)) {
        return reply(400, { error: "invalid_grant", error_description: "Invalid login credentials", code: 400, msg: "Invalid login credentials" });
      }
      return reply(200, {
        access_token: jwt(),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh",
        user: { id: AGENT_ID, aud: "authenticated", role: "authenticated", email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: "2026-10-03T00:00:00Z" },
      });
    }
    if (url.pathname === "/auth/v1/logout") return reply(204, null);

    const q = url.searchParams;
    if (url.pathname === "/rest/v1/worker_establishments") {
      return reply(200, authorized.map((id) => ({ establishment_id: id, user_id: AGENT_ID, revoked_at: null })));
    }
    if (url.pathname === "/rest/v1/establishments") {
      const ids = inList(q, "id");
      return reply(200, establishments.filter((e) => ids === null || ids.includes(e.id as string)));
    }
    if (url.pathname === "/rest/v1/spaces") {
      if (s.failOn === "spaces") return reply(500, { message: "boom en spaces" });
      return reply(200, [{ id: SPACE_ID, slug: "demo", timezone: "Europe/Madrid" }]);
    }
    if (url.pathname === "/rest/v1/rpc/team_menu_queue") {
      if (s.failOn === "queue") return reply(500, { message: "boom en la cola" });
      return reply(200, queue);
    }
    if (url.pathname === "/rest/v1/menus") {
      if (s.failOn === "menus") return reply(500, { message: "boom en menus" });
      const ids = inList(q, "establishment_id");
      return reply(200, menus.filter((m) => ids === null || ids.includes(m.establishment_id as string)));
    }
    return reply(404, { message: `ruta inesperada ${url.pathname}` });
  }) as typeof fetch;

  return { fetchImpl, calls };
}

async function run(scenario: Scenario = {}, over: Partial<RunDeps> = {}) {
  const server = fakeSupabase(scenario);
  const result = await runDryRun({
    env: { RESTAVOR_SUPABASE_URL: URL_OK, RESTAVOR_SUPABASE_ANON_KEY: ANON_KEY, AGENTE_EMAIL: EMAIL, AGENTE_PASSWORD: PASSWORD },
    argv: [],
    fetchImpl: server.fetchImpl,
    systemNow: () => REAL_NOW,
    ...over,
  });
  return { ...result, calls: server.calls };
}

function noWrites(calls: Call[]) {
  for (const c of calls) {
    if (c.path.startsWith("/rest/")) expect(`${c.method} ${c.path}`).toMatch(/^GET /);
    else expect(`${c.method} ${c.path}`).toMatch(/^POST \/auth\/v1\/(token|logout)$/);
  }
}

describe("seco · de punta a punta con un Supabase falso (reloj fijo: sábado 03/10/2026 21:30, Madrid)", () => {
  it("lee la cola y enseña qué haría el agente con cada menú de Bar Demo, y cuándo", async () => {
    const { exitCode, output } = await run();
    expect(exitCode).toBe(0);
    expect(output).toContain("AGENTE MENÚ DIARIO · PRUEBA EN SECO · no escribe nada");
    expect(output).toContain("Hoy es sábado 3 de octubre de 2026, 21:30, hora de Madrid (UTC+02:00)");
    expect(output).toContain("Bar Demo (EST-0001): activado a efectos de la prueba");
    expect(output).toContain("Menú del día · 03/10/2026 (hoy) · sin asignar");
    expect(output).toContain("Qué haría: publicar ya (orden 1 de 1 en esta ejecución).");
    expect(output).toContain("Menú del día · 04/10/2026 (mañana) · sin asignar");
    expect(output).toContain("Qué haría: esperar hasta el 04/10/2026 a las 07:00 (hora de Madrid) y entonces publicarlo.");
    expect(output).toContain("05/10/2026 (pasado mañana): borrador: no actúa hasta que el restaurante pida publicarlo.");
    expect(output).toContain("publicaría ya: 1 · esperaría: 1");
  });

  it("un restaurante autorizado pero que no es de LandingSite sale como NO activado, y uno no autorizado no sale", async () => {
    const { output } = await run();
    expect(output).toContain("Otra web (EST-0004): autorizado pero NO activado: su web no es de LandingSite");
    expect(output).not.toContain("Magariños");
    expect(output).not.toContain("EST-0003");
  });

  it("pide a la base solo lo suyo: filtra por sus restaurantes y no pide los de nadie más", async () => {
    const { calls } = await run();
    const est = calls.find((c) => c.path === "/rest/v1/establishments");
    expect(inList(est?.query ?? new URLSearchParams(), "id")?.sort()).toEqual(["est-bar-demo", "est-otra"]);
    const menus = calls.find((c) => c.path === "/rest/v1/menus");
    expect(inList(menus?.query ?? new URLSearchParams(), "establishment_id")).toEqual(["est-bar-demo"]);
    expect(menus?.query.get("select")).toBe("id,establishment_id,kind,name,target_date,state,published_at");
  });

  it("NO ESCRIBE: todo lo que salió son lecturas (GET) y el inicio y el cierre de sesión", async () => {
    const { calls, output } = await run();
    noWrites(calls);
    expect(calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`)).toEqual(["POST /auth/v1/token", "POST /auth/v1/logout"]);
    expect(calls.some((c) => c.path === "/rest/v1/rpc/team_menu_queue" && c.method === "GET")).toBe(true);
    expect(output).toContain("Escrituras en la base de datos: 0 (se hicieron 5 lecturas y 2 peticiones de inicio y cierre de sesión; ninguna otra).");
  });

  it("la contraseña y la clave de la base NUNCA salen por pantalla", async () => {
    for (const scenario of [{}, { password: "otra-contrasena" }, { failOn: "menus" as const }, { serverNow: new Date("2026-10-03T19:40:00Z") }]) {
      const { output } = await run(scenario);
      expect(output).not.toContain(PASSWORD);
      expect(output).not.toContain("otra-contrasena");
      expect(output).not.toContain(ANON_KEY);
    }
  });

  it("RA-08 · --ahora enseña un cartel bien visible de reloj simulado y calcula con esa hora (el domingo 04/10 a las 10:00, el de mañana ya es «hoy»)", async () => {
    const { exitCode, output } = await run({}, { argv: ["--ahora=2026-10-04T10:00:00+02:00"] });
    expect(exitCode).toBe(0);
    expect(output).toContain("*** RELOJ SIMULADO (--ahora): esto NO es la hora de verdad ***");
    expect(output).toContain("Hoy es domingo 4 de octubre de 2026, 10:00, hora de Madrid (UTC+02:00)");
    expect(output).toContain("04/10/2026 (hoy)");
    expect(output).toContain("03/10/2026 (ayer)");
    expect(output).toContain("no publicar y avisar con el error «La fecha del menú ya ha pasado»");
  });

  it("RA-08 · sin --ahora no hay cartel", async () => {
    expect((await run()).output).not.toContain("RELOJ SIMULADO");
  });

  it("--restaurante solo restringe", async () => {
    const { output } = await run({ authorized: [BAR.id, OTRA.id] }, { argv: ["--restaurante=EST-0004"] });
    expect(output).toContain("Bar Demo (EST-0001): no entra en esta prueba por el filtro --restaurante");
    expect(output).toContain("No hay ningún menú con la publicación pedida");
  });
});

describe("seco · el agente se para en vez de decidir con datos dudosos", () => {
  it("RA-08 · si el reloj del ordenador y el de Supabase difieren más de 5 minutos, se para y NO lee nada de la base", async () => {
    const { exitCode, output, calls } = await run({ serverNow: new Date("2026-10-03T19:36:00Z") });
    expect(exitCode).toBe(2);
    expect(output).toContain("difieren 360 s (el máximo es 5 min)");
    expect(calls.some((c) => c.path.startsWith("/rest/"))).toBe(false);
  });

  it("RA-08 · con 5 minutos justos de diferencia sigue (el máximo está incluido)", async () => {
    const { exitCode } = await run({ serverNow: new Date("2026-10-03T19:35:00Z") });
    expect(exitCode).toBe(0);
  });

  it("RA-08 · si la respuesta no trae la hora del servidor, se para", async () => {
    const { exitCode, output, calls } = await run({ serverNow: null });
    expect(exitCode).toBe(2);
    expect(output).toContain("No se pudo contrastar la hora del ordenador con la de Supabase");
    expect(calls.some((c) => c.path.startsWith("/rest/"))).toBe(false);
  });

  it("un error de lectura es un ERROR DE LECTURA (código 1), nunca una cola vacía", async () => {
    for (const failOn of ["menus", "queue", "spaces"] as const) {
      const { exitCode, output } = await run({ failOn });
      expect(exitCode).toBe(1);
      expect(output).toContain("ERROR DE LECTURA, no una cola vacía");
      expect(output).not.toContain("No hay ningún menú");
    }
  });

  it("una contraseña mala da un error claro y no enseña la contraseña", async () => {
    const { exitCode, output, calls } = await run({ password: "la-buena" });
    expect(exitCode).toBe(2);
    expect(output).toContain("No se pudo iniciar sesión como el agente: Invalid login credentials");
    expect(calls.some((c) => c.path.startsWith("/rest/"))).toBe(false);
  });

  it("sin variables de entorno dice cuáles faltan (solo los nombres) y no hace ninguna petición", async () => {
    const server = fakeSupabase();
    const r = await runDryRun({ env: { AGENTE_EMAIL: EMAIL }, argv: [], fetchImpl: server.fetchImpl, systemNow: () => REAL_NOW });
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("RESTAVOR_SUPABASE_URL, RESTAVOR_SUPABASE_ANON_KEY, AGENTE_PASSWORD");
    expect(r.output).not.toContain(EMAIL);
    expect(server.calls).toEqual([]);
  });

  it("se niega a trabajar contra PRODUCCIÓN y no hace ninguna petición", async () => {
    const server = fakeSupabase();
    const r = await runDryRun({
      env: { RESTAVOR_SUPABASE_URL: `https://${PRODUCCION_PROJECT_REF}.supabase.co`, RESTAVOR_SUPABASE_ANON_KEY: ANON_KEY, AGENTE_EMAIL: EMAIL, AGENTE_PASSWORD: PASSWORD },
      argv: [],
      fetchImpl: server.fetchImpl,
      systemNow: () => REAL_NOW,
    });
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain("PRODUCCIÓN");
    expect(server.calls).toEqual([]);
  });

  it("un argumento desconocido o un --ahora sin zona horaria se rechazan", async () => {
    expect((await run({}, { argv: ["--escribir"] })).exitCode).toBe(2);
    const sinZona = await run({}, { argv: ["--ahora=2026-10-04T10:00:00"] });
    expect(sinZona.exitCode).toBe(2);
    expect(sinZona.output).toContain("--ahora no es una fecha y hora válidas con zona");
    expect((await run({}, { argv: ["--ahora=no-es-una-fecha"] })).exitCode).toBe(2);
  });
});

describe("seco · casos de la cola y de las autorizaciones", () => {
  it("un agente sin ningún restaurante autorizado lo dice y no pide más nada", async () => {
    const { exitCode, output, calls } = await run({ authorized: [] });
    expect(exitCode).toBe(0);
    expect(output).toContain("El agente no tiene ningún restaurante autorizado");
    expect(calls.some((c) => c.path === "/rest/v1/rpc/team_menu_queue")).toBe(false);
  });

  it("con restaurantes activados pero sin menús pedidos, dice que la cola está vacía (y esto SÍ es una cola vacía)", async () => {
    const { exitCode, output } = await run({ queue: [], menus: [] });
    expect(exitCode).toBe(0);
    expect(output).toContain("No hay ningún menú con la publicación pedida en los restaurantes activados.");
  });

  it("si ningún restaurante autorizado es de LandingSite no se lee ni la cola ni los menús", async () => {
    const { exitCode, calls } = await run({ authorized: [OTRA.id] });
    expect(exitCode).toBe(0);
    expect(calls.some((c) => c.path === "/rest/v1/rpc/team_menu_queue" || c.path === "/rest/v1/menus")).toBe(false);
  });

  it("un menú que ya es del agente, uno que cogió una persona a mano y uno de ayer", async () => {
    const queue = [
      queueRow("m-suyo", BAR.id, "Bar Demo", "2026-10-03", { state: "assigned", is_assigned: true, assigned_to: AGENT_ID, assignment_mode: "auto" }),
      queueRow("m-mano", BAR.id, "Bar Demo", "2026-10-04", { state: "assigned", is_assigned: true, assignment_mode: "manual" }),
      queueRow("m-ayer", BAR.id, "Bar Demo", "2026-10-02"),
    ];
    const { output } = await run({ queue, menus: [] });
    expect(output).toContain("ya es del agente");
    expect(output).toContain("la ha cogido una persona a propósito o ya está empezada: no la toca");
    expect(output).toContain("no publicar y avisar con el error «La fecha del menú ya ha pasado»");
    expect(output).toContain("reportaría un error: 1");
    expect(output).toContain("no tocaría (lo tiene una persona): 1");
  });

  it("una fila rara de la base (sin id de menú) se nota como error de lectura, no se ignora en silencio", async () => {
    const queue = [{ ...queueRow("x", BAR.id, "Bar Demo", "2026-10-03"), menu_id: null }];
    const { exitCode, output } = await run({ queue });
    expect(exitCode).toBe(1);
    expect(output).toContain("menu_id no es un texto");
  });

  it("todas las peticiones de TODOS los escenarios son de solo lectura", async () => {
    const scenarios: [Scenario, Partial<RunDeps>][] = [
      [{}, {}],
      [{ authorized: [] }, {}],
      [{ queue: [] }, { argv: ["--ahora=2026-10-04T10:00:00+02:00"] }],
      [{ failOn: "menus" }, {}],
      [{ serverNow: new Date("2026-10-03T19:36:00Z") }, {}],
    ];
    for (const [scenario, over] of scenarios) noWrites((await run(scenario, over)).calls);
  });
});
