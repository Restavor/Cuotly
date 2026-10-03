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

// --- Segundo paso (TOTP), Fase D de Restavor agents -------------------------------------------------------------
// El factor sembrado de `soporte@cuotly.test` (supabase/seed/reservas-demo.sql) y su secreto de prueba fijo. En la base local
// de esta emulación la tabla `auth.mfa_factors` no tiene la columna `secret` (la de las suites tampoco), así que se usa el de
// siempre; con la columna, se lee de ella. Es SOLO para ver la web en local: lo que manda es `supabase start` en CI.
const SECRETO_TOTP_DE_PRUEBA = "RESTAVORSOPORTEPRUEBASSEGUNDOPAS";

function base32(texto) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of texto.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secreto, paso) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = crypto.createHmac("sha1", base32(secreto)).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
/** El código vale en el paso actual y en el anterior y el siguiente (como GoTrue). */
function codigoValido(secreto, codigo) {
  const paso = Math.floor(Date.now() / 1000 / 30);
  return [paso - 1, paso, paso + 1].some((p) => totp(secreto, p) === String(codigo).trim());
}
async function factorsOf(userId) {
  const { rows } = await pool.query(
    "select id, friendly_name, factor_type, status, created_at, updated_at from auth.mfa_factors where user_id = $1",
    [userId],
  );
  return rows.map((f) => ({ id: f.id, friendly_name: f.friendly_name, factor_type: f.factor_type, status: f.status, created_at: f.created_at, updated_at: f.updated_at }));
}
async function secretOf(factorId) {
  const { rows } = await pool.query("select user_id from auth.mfa_factors where id = $1 and factor_type = 'totp' and status = 'verified'", [factorId]);
  if (!rows[0]) return null;
  const { rows: col } = await pool.query(
    "select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'mfa_factors' and column_name = 'secret'",
  );
  if (col[0]) {
    const { rows: s } = await pool.query("select secret from auth.mfa_factors where id = $1", [factorId]);
    if (s[0]?.secret) return { userId: rows[0].user_id, secret: s[0].secret };
  }
  return { userId: rows[0].user_id, secret: SECRETO_TOTP_DE_PRUEBA };
}

async function userRow(where, args) {
  const { rows } = await pool.query(
    `select id, email, created_at, coalesce(raw_user_meta_data, '{}'::jsonb) as meta from auth.users where ${where}`,
    args,
  );
  return rows[0] ?? null;
}
async function userJson(u) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.created_at, app_metadata: { provider: "email" },
    user_metadata: u.meta, created_at: u.created_at, updated_at: u.created_at, factors: await factorsOf(u.id),
  };
}
/** `aal2` tras pasar el código del segundo paso: el token lo dice y el refresco lo conserva (`r2-`). */
async function session(u, aal = "aal1") {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24;
  const claims = { sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", aal, iat: now, exp, session_id: crypto.randomUUID() };
  if (aal === "aal2") claims.amr = [{ method: "password", timestamp: now }, { method: "totp", timestamp: now }];
  const access_token = sign(claims);
  return { access_token, token_type: "bearer", expires_in: exp - now, expires_at: exp, refresh_token: (aal === "aal2" ? "r2-" : "r-") + u.id, user: await userJson(u) };
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
        const token = String(body.refresh_token);
        const segundoPaso = token.startsWith("r2-");
        const u = await userRow("id = $1", [token.slice(segundoPaso ? 3 : 2)]);
        return u ? send(res, 200, await session(u, segundoPaso ? "aal2" : "aal1")) : send(res, 400, { error: "invalid_grant", error_description: "Refresh Token Not Found" });
      }
      const u = await userRow("lower(email) = lower($1) and encrypted_password = extensions.crypt($2::text, encrypted_password)", [body.email, body.password]);
      return u ? send(res, 200, await session(u)) : send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials" });
    }
    if (url.pathname === "/auth/v1/user") {
      const p = verify((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
      if (!p) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const u = await userRow("id = $1", [p.sub]);
      return u ? send(res, 200, await userJson(u)) : send(res, 404, { msg: "User not found" });
    }
    if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
    // Segundo paso: POST /factors/<id>/challenge y /factors/<id>/verify (lo que llama `supabase.auth.mfa`).
    const factor = /^\/auth\/v1\/factors\/([0-9a-f-]{36})\/(challenge|verify)$/.exec(url.pathname);
    if (factor && req.method === "POST") {
      const p = verify((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
      if (!p) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const dato = await secretOf(factor[1]);
      if (!dato || dato.userId !== p.sub) return send(res, 404, { code: 404, error_code: "mfa_factor_not_found", msg: "MFA factor not found" });
      if (factor[2] === "challenge") return send(res, 200, { id: crypto.randomUUID(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!codigoValido(dato.secret, body.code)) return send(res, 400, { code: 400, error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" });
      const u = await userRow("id = $1", [p.sub]);
      return send(res, 200, await session(u, "aal2"));
    }
    if (url.pathname.startsWith("/auth/v1/factors")) return send(res, 200, []);
    if (url.pathname.startsWith("/storage/v1")) return send(res, 400, { statusCode: "400", error: "no_storage", message: "Sin almacenamiento en el Supabase local" });
    return send(res, 404, { message: "no emulado: " + url.pathname });
  } catch (e) {
    console.error(e);
    send(res, 500, { message: String(e) });
  }
}).listen(54321, () => console.log("gateway en :54321"));
