// Supabase mínimo para ver la web con datos en local (ver arrancar.sh):
//   /rest/v1/*  -> PostgREST (puerto 3001)
//   /auth/v1/*  -> contraseña contra auth.users (bcrypt de pgcrypto) y JWT HS256
//   /storage/v1 -> sin almacenamiento: 400 con motivo
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";

// `pg` no es dependencia directa de ningún paquete: viene con las
// herramientas de desarrollo. Se busca en el almacén de pnpm.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pgDir = readdirSync(join(RAIZ, "node_modules/.pnpm")).find((d) => /^pg@\d/.test(d));
const pg = createRequire(import.meta.url)(join(RAIZ, "node_modules/.pnpm", pgDir, "node_modules/pg"));

// Secreto SOLO de esta emulación local. No es el del proyecto real.
const SECRET = process.env.JWT_SECRET ?? "cuotly-local-secreto-de-prueba-de-32-caracteres-o-mas";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5433/cuotly" });

const b64 = (b) => Buffer.from(b).toString("base64url");
function sign(payload) {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = (token ?? "").split(".");
  if (!s) return null;
  const good = crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  if (good !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp * 1000 > Date.now() ? p : null;
}

async function userRow(where, args) {
  const { rows } = await pool.query(
    `select id, email, created_at, coalesce(raw_user_meta_data, '{}'::jsonb) as meta from auth.users where ${where}`,
    args,
  );
  return rows[0] ?? null;
}
function userJson(u) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.created_at, app_metadata: { provider: "email" },
    user_metadata: u.meta, created_at: u.created_at, updated_at: u.created_at, factors: [],
  };
}
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24;
  const access_token = sign({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", aal: "aal1", iat: now, exp, session_id: crypto.randomUUID() });
  return { access_token, token_type: "bearer", expires_in: exp - now, expires_at: exp, refresh_token: "r-" + u.id, user: userJson(u) };
}

const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d)); });

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); return res.end(); }

    if (url.pathname.startsWith("/rest/v1")) {
      const body = await readBody(req);
      const headers = { ...req.headers, host: "127.0.0.1:3001" };
      delete headers["content-length"];
      const up = http.request({ host: "127.0.0.1", port: 3001, method: req.method, path: url.pathname.slice(8) + url.search, headers }, (r) => {
        res.writeHead(r.statusCode, r.headers); r.pipe(res);
      });
      up.on("error", (e) => send(res, 502, { message: String(e) }));
      return up.end(body || undefined);
    }

    if (url.pathname === "/auth/v1/token") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const u = await userRow("id = $1", [String(body.refresh_token).slice(2)]);
        return u ? send(res, 200, session(u)) : send(res, 400, { error: "invalid_grant", error_description: "Refresh Token Not Found" });
      }
      const u = await userRow("lower(email) = lower($1) and encrypted_password = extensions.crypt($2::text, encrypted_password)", [body.email, body.password]);
      return u ? send(res, 200, session(u)) : send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials" });
    }
    if (url.pathname === "/auth/v1/user") {
      const p = verify((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
      if (!p) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const u = await userRow("id = $1", [p.sub]);
      return u ? send(res, 200, userJson(u)) : send(res, 404, { msg: "User not found" });
    }
    if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
    if (url.pathname.startsWith("/auth/v1/factors")) return send(res, 200, []);
    if (url.pathname.startsWith("/storage/v1")) return send(res, 400, { statusCode: "400", error: "no_storage", message: "Sin almacenamiento en el Supabase local" });
    return send(res, 404, { message: "no emulado: " + url.pathname });
  } catch (e) {
    console.error(e);
    send(res, 500, { message: String(e) });
  }
}).listen(54321, () => console.log("gateway en :54321"));
