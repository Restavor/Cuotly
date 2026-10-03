#!/usr/bin/env node
// Fase D de Restavor agents · RN-APP-07 (el bloqueo de la tablet tras cinco PIN
// equivocados no se esquiva adivinando en paralelo):
//
//   1 · Veinte intentos a la vez con PIN equivocados desde dos transacciones por
//       intento: ninguno puede ver más de cuatro «wrong» y el dispositivo queda
//       bloqueado. Si el contador no estuviera protegido por la fila del dispositivo,
//       varios intentos leerían el mismo número y se colarían más de cinco.
//   2 · Con el dispositivo bloqueado, ni el PIN BUENO entra (hasta que pase el tiempo).
//   3 · Tras la primera ronda, la ronda siguiente es más larga (60 s y luego 300 s).
//
// El test SQL (supabase/tests/reservas_equipo_tablet_soporte.sql) no puede atrapar esto:
// `psql -f` usa UNA conexión y nunca hay dos transacciones abiertas a la vez. Por eso
// aquí se abren conexiones reales, igual que `agenda-concurrency-test.mjs`.
//
// Cómo ejecutarlo:
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
//     node scripts/device-concurrency-test.mjs

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const OWNER_ID = "dd000000-0000-0000-0000-00000000000f";
const SPACE_ID = "dd000000-0000-0000-0000-0000000000c0";
const GROUP_ID = "dd000000-0000-0000-0000-00000000000d";
const ESTABLISHMENT_ID = "dd000000-0000-0000-0000-00000000000e";
const DEVICE_ID = "dd000000-0000-0000-0000-0000000000d1";
const STAFF_ID = "dd000000-0000-0000-0000-0000000000b1";

// Un hash de 64 cifras hexadecimales: el servidor real lo calcula con HMAC; aquí solo
// importa que coincida o no con el guardado.
const TOKEN_HASH = "a".repeat(64);
const GOOD_PIN = "1".repeat(64);
const wrongPin = (n) => n.toString(16).padStart(64, "e");

function fail(message) {
  console.error(`RN-APP-07/concurrencia FALLIDO: ${message}`);
  process.exitCode = 1;
}

async function seed(admin) {
  await admin.query(`insert into auth.users (id, email, role, aud) values ($1, 'devicerace-owner@example.com', 'authenticated', 'authenticated')`, [OWNER_ID]);
  await admin.query(`insert into public.profiles (id, email, full_name) values ($1, 'devicerace-owner@example.com', 'Dueño carrera') on conflict (id) do nothing`, [OWNER_ID]);
  await admin.query(`insert into public.spaces (id, name, slug, created_by, reservations_enabled) values ($1, 'Espacio tablet race', 'espacio-tablet-race', $2, false)`, [SPACE_ID, OWNER_ID]);
  await admin.query(`insert into public.groups (id, space_id, name) values ($1, $2, 'Grupo tablet race')`, [GROUP_ID, SPACE_ID]);
  await admin.query(
    `insert into public.establishments (id, space_id, group_id, code, name) values ($1, $2, $3, 'EST-TBRACE', 'Restaurante tablet race')`,
    [ESTABLISHMENT_ID, SPACE_ID, GROUP_ID],
  );
  await admin.query(
    `insert into public.reservation_settings (space_id, establishment_id, service_status, public_slug) values ($1, $2, 'active', 'tablet-race')`,
    [SPACE_ID, ESTABLISHMENT_ID],
  );
  await admin.query(
    `insert into public.reservation_devices (id, space_id, establishment_id, name, token_hash) values ($1, $2, $3, 'Tablet carrera', $4)`,
    [DEVICE_ID, SPACE_ID, ESTABLISHMENT_ID, TOKEN_HASH],
  );
  await admin.query(
    `insert into public.reservation_staff (id, space_id, establishment_id, kind, name, pin_hmac) values ($1, $2, $3, 'staff', 'Camarera carrera', $4)`,
    [STAFF_ID, SPACE_ID, ESTABLISHMENT_ID, GOOD_PIN],
  );
}

async function cleanup(admin) {
  await admin.query(`delete from public.audit_log where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.spaces where id = $1`, [SPACE_ID]);
  await admin.query(`delete from auth.users where email like 'devicerace-%@example.com'`);
}

// Un intento de identificación, en su propia transacción y conexión (como el servidor real).
async function identify(pinHmac) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
    await client.query("set local role service_role");
    const { rows } = await client.query(`select public.reservation_device_identify($1, $2) as r`, [TOKEN_HASH, pinHmac]);
    await client.query("commit");
    return { ok: true, result: rows[0].r };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { ok: false, error: error.message };
  } finally {
    await client.end();
  }
}

async function main() {
  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    await cleanup(admin);
    await seed(admin);

    // 1 · Veinte intentos equivocados a la vez.
    const attempts = await Promise.all(Array.from({ length: 20 }, (_, i) => identify(wrongPin(i + 1))));
    const errors = attempts.filter((a) => !a.ok);
    if (errors.length > 0) fail(`un intento terminó con error: ${errors[0].error}`);
    const outcomes = attempts.filter((a) => a.ok).map((a) => a.result.outcome);
    const wrongs = outcomes.filter((o) => o === "wrong").length;
    const locked = outcomes.filter((o) => o === "locked").length;
    if (wrongs !== 4) fail(`se esperaban exactamente 4 «wrong» antes de bloquear y hubo ${wrongs}`);
    if (locked !== 16) fail(`se esperaban 16 intentos rechazados por bloqueo y hubo ${locked}`);

    const { rows: afterFirst } = await admin.query(
      `select lock_rounds, locked_until from public.reservation_pin_attempts where device_id = $1`,
      [DEVICE_ID],
    );
    if (afterFirst[0]?.lock_rounds !== 1) fail(`tras la primera ronda lock_rounds debería ser 1 y es ${afterFirst[0]?.lock_rounds}`);
    const { rows: audits } = await admin.query(
      `select count(*)::int as n from public.audit_log where space_id = $1 and action = 'reservations.pin_locked'`,
      [SPACE_ID],
    );
    if (audits[0].n !== 1) fail(`el bloqueo debía dejar UN registro de auditoría y dejó ${audits[0].n}`);

    // 2 · Bloqueado, ni el PIN bueno entra.
    const good = await identify(GOOD_PIN);
    if (!good.ok || good.result.outcome !== "locked") fail(`con el dispositivo bloqueado el PIN bueno debía recibir «locked» y recibió ${JSON.stringify(good)}`);

    // 3 · Pasada la primera ronda, la segunda dura más.
    await admin.query(`update public.reservation_pin_attempts set locked_until = now() - interval '1 second' where device_id = $1`, [DEVICE_ID]);
    const second = await Promise.all(Array.from({ length: 10 }, (_, i) => identify(wrongPin(100 + i))));
    const secondLocked = second.filter((a) => a.ok && a.result.outcome === "locked");
    if (second.some((a) => !a.ok)) fail(`un intento de la segunda ronda terminó con error`);
    const { rows: afterSecond } = await admin.query(
      `select lock_rounds, extract(epoch from (locked_until - now())) as secs from public.reservation_pin_attempts where device_id = $1`,
      [DEVICE_ID],
    );
    if (afterSecond[0]?.lock_rounds !== 2) fail(`tras la segunda ronda lock_rounds debería ser 2 y es ${afterSecond[0]?.lock_rounds}`);
    if (!(Number(afterSecond[0]?.secs) > 60)) fail(`la segunda ronda debía durar más de 60 s y dura ${afterSecond[0]?.secs}`);
    if (secondLocked.length < 5) fail(`en la segunda ronda debían quedar al menos 5 rechazos por bloqueo y hubo ${secondLocked.length}`);

    if (!process.exitCode) {
      console.log(
        "RN-APP-07/concurrencia: veinte PIN equivocados a la vez dejan pasar solo cuatro avisos y un único bloqueo, el PIN bueno no entra bloqueado y la segunda ronda dura más que la primera.",
      );
    }
  } finally {
    try {
      await cleanup(admin);
    } finally {
      await admin.end();
    }
  }
}

main().catch((error) => {
  console.error("RN-APP-07/concurrencia FALLIDO (excepción no esperada):", error);
  process.exitCode = 1;
});
