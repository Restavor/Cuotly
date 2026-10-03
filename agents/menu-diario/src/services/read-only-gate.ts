/**
 * La puerta de «solo lectura» de la prueba en seco: un `fetch` que solo deja pasar
 *   - lecturas (GET) de una lista CERRADA de tablas y columnas de `/rest/v1/`;
 *   - llamadas (GET) a una lista CERRADA de funciones de lectura (`rpc/`);
 *   - el inicio de sesión con contraseña y el cierre de sesión de `/auth/v1/`.
 * Cualquier otra petición (un POST, PATCH, PUT o DELETE a la base, una tabla o columna que no esté en la lista, `select=*`,
 * una función que no sea de lectura, otros puntos de /auth/v1/) se rechaza ANTES de salir del ordenador.
 *
 * Es la segunda de tres capas: la primera es que el código del agente no escribe (lint: sin `.insert/.update/.delete/.upsert`);
 * la tercera es una comprobación externa de recuentos antes y después. Aquí además se cuenta lo que se pidió de verdad.
 */

/** Tablas que lee la prueba en seco y SOLO las columnas que necesita (la base concede muchas más; no se piden). */
export const READ_TABLES: Readonly<Record<string, readonly string[]>> = {
  spaces: ["id", "slug", "timezone"],
  establishments: ["id", "space_id", "code", "name", "status", "web_platform", "website_url", "permanently_deleted_at"],
  worker_establishments: ["establishment_id", "user_id", "revoked_at"],
  menus: ["id", "establishment_id", "kind", "name", "target_date", "state", "published_at"],
};

/**
 * Funciones que se pueden llamar por GET. Que no escriban lo fija `supabase/tests/agente_menu_seco.sql` (la función y toda su
 * cadena son STABLE); la garantía no depende de cómo las ejecute PostgREST, cosa que aquí no se ha comprobado.
 * `tests/seco-sql.test.ts` falla si esta lista y la de ese SQL dejan de coincidir.
 */
export const READ_RPCS: readonly string[] = ["team_menu_queue"];

const RESERVED_QUERY_KEYS = ["select", "order", "limit", "offset"];

export type RequestRecord = { method: string; path: string; kind: "read" | "auth" };

export class ReadOnlyViolation extends Error {
  readonly method: string;
  readonly path: string;
  constructor(method: string, path: string, why: string) {
    super(`Bloqueado por solo lectura: ${method} ${path} (${why}). No se ha enviado.`);
    this.name = "ReadOnlyViolation";
    this.method = method;
    this.path = path;
  }
}

type Verdict = { ok: true; kind: "read" | "auth" } | { ok: false; why: string };

/** Decide si una petición está permitida. Pura: no envía nada. */
export function assessRequest(method: string, url: URL): Verdict {
  const m = method.toUpperCase();
  const path = url.pathname;

  if (path === "/auth/v1/token") {
    return m === "POST" && url.searchParams.get("grant_type") === "password"
      ? { ok: true, kind: "auth" }
      : { ok: false, why: "solo se permite iniciar sesión con contraseña" };
  }
  if (path === "/auth/v1/logout") {
    return m === "POST" ? { ok: true, kind: "auth" } : { ok: false, why: "el cierre de sesión es un POST" };
  }
  if (path.startsWith("/auth/")) return { ok: false, why: "otro punto de autenticación" };

  if (!path.startsWith("/rest/v1/")) return { ok: false, why: "no es una ruta permitida" };
  if (m !== "GET") return { ok: false, why: "solo se permiten lecturas (GET) a la base" };

  const target = path.slice("/rest/v1/".length);
  if (target.startsWith("rpc/")) {
    const fn = target.slice("rpc/".length);
    if (!READ_RPCS.includes(fn)) return { ok: false, why: `la función ${fn} no está en la lista de lectura` };
    for (const key of url.searchParams.keys()) {
      if (!/^p_[a-z_]+$/.test(key)) return { ok: false, why: `argumento no válido ${key}` };
    }
    return { ok: true, kind: "read" };
  }

  const columns = READ_TABLES[target];
  if (columns === undefined || target.includes("/")) return { ok: false, why: `la tabla ${target} no está en la lista de lectura` };

  const select = url.searchParams.get("select");
  if (select === null || select === "") return { ok: false, why: "hay que enumerar las columnas (no se permite select sin columnas ni select=*)" };
  for (const col of select.split(",")) {
    if (!columns.includes(col)) return { ok: false, why: `la columna ${target}.${col} no está en la lista de lectura` };
  }
  for (const key of url.searchParams.keys()) {
    if (RESERVED_QUERY_KEYS.includes(key)) continue;
    if (!columns.includes(key)) return { ok: false, why: `filtro por ${target}.${key}, que no está en la lista de lectura` };
  }
  const order = url.searchParams.get("order");
  if (order !== null) {
    for (const part of order.split(",")) {
      const col = part.split(".")[0] ?? "";
      if (!columns.includes(col)) return { ok: false, why: `orden por ${target}.${col}, que no está en la lista de lectura` };
    }
  }
  return { ok: true, kind: "read" };
}

export type ReadOnlyGate = {
  /** El `fetch` que se le da al cliente de Supabase. */
  fetch: typeof fetch;
  /** Todo lo que SÍ salió, en orden. */
  requests: readonly RequestRecord[];
  /** Todo lo que se rechazó antes de salir. */
  blocked: readonly { method: string; path: string; why: string }[];
  /** La hora del servidor según la cabecera HTTP `Date` de la última respuesta (resolución de 1 s), o `null`. */
  serverDate: () => Date | null;
};

function urlOf(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function methodOf(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]): string {
  if (init?.method !== undefined) return init.method;
  if (typeof input === "object" && "method" in input) return input.method;
  return "GET";
}

export function createReadOnlyGate(inner: typeof fetch): ReadOnlyGate {
  const requests: RequestRecord[] = [];
  const blocked: { method: string; path: string; why: string }[] = [];
  let serverDate: Date | null = null;

  const gated: typeof fetch = async (input, init) => {
    const url = urlOf(input);
    const method = methodOf(input, init).toUpperCase();
    const verdict = assessRequest(method, url);
    if (!verdict.ok) {
      blocked.push({ method, path: url.pathname, why: verdict.why });
      throw new ReadOnlyViolation(method, url.pathname, verdict.why);
    }
    requests.push({ method, path: url.pathname, kind: verdict.kind });
    const response = await inner(input, init);
    const header = response.headers.get("date");
    if (header !== null) {
      const parsed = new Date(header);
      if (!Number.isNaN(parsed.getTime())) serverDate = parsed;
    }
    return response;
  };

  return { fetch: gated, requests, blocked, serverDate: () => serverDate };
}
