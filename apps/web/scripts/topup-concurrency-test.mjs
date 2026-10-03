#!/usr/bin/env node
// Fase E2 de Restavor agents · RN-AGT-04 y RN-AGT-05 (el saldo no se duplica ni se avisa dos veces
// aunque lleguen peticiones a la vez):
//
//   1 · Veinte webhooks de Stripe a la vez con LA MISMA sesión: un solo apunte (`credited`), el resto
//       `already`, y el saldo sube el importe sin IVA una única vez.
//   2 · Veinte «crear recarga» a la vez con la misma clave de idempotencia: una sola recarga.
//   3 · Veinte «registrar recarga a mano» a la vez con la misma clave: un solo apunte.
//   4 · Diez llamadas de 1 € a la vez que llevan el saldo de 10 € a 0: un solo aviso de saldo bajo y un
//       solo aviso de saldo agotado (el disparador bloquea la fila de ajustes del restaurante; sin ese
//       bloqueo varias transacciones verían el mismo saldo y avisarían todas).
//
// El test SQL (supabase/tests/reservas_saldo.sql) no puede atrapar esto: `psql -f` usa UNA conexión y
// nunca hay dos transacciones abiertas a la vez. Por eso aquí se abren conexiones reales, igual que
// `device-concurrency-test.mjs`.
//
// Cómo ejecutarlo:
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
//     node scripts/topup-concurrency-test.mjs

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const OWNER_ID = "df000000-0000-0000-0000-00000000000f";
const ADMIN_ID = "df000000-0000-0000-0000-0000000000a1";
const SPACE_ID = "df000000-0000-0000-0000-0000000000c0";
const GROUP_ID = "df000000-0000-0000-0000-00000000000d";
const ESTABLISHMENT_ID = "df000000-0000-0000-0000-00000000000e";
const MEMBERSHIP_ID = "df000000-0000-0000-0000-0000000000e1";
const SESSION_ID = "cs_test_concurrencia_94";

function fail(message) {
  console.error(`RN-AGT-04/concurrencia FALLIDO: ${message}`);
  process.exitCode = 1;
}

async function seed(admin) {
  await admin.query(
    `insert into auth.users (id, email, role, aud) values ($1, 'topuprace-owner@example.com', 'authenticated', 'authenticated'), ($2, 'topuprace-admin@example.com', 'authenticated', 'authenticated')`,
    [OWNER_ID, ADMIN_ID],
  );
  await admin.query(
    `insert into public.profiles (id, email, full_name) values ($1, 'topuprace-owner@example.com', 'Propietario carrera'), ($2, 'topuprace-admin@example.com', 'Admin carrera') on conflict (id) do nothing`,
    [OWNER_ID, ADMIN_ID],
  );
  await admin.query(
    `insert into public.spaces (id, name, slug, created_by, reservations_enabled) values ($1, 'Espacio recarga race', 'espacio-recarga-race', $2, true)`,
    [SPACE_ID, OWNER_ID],
  );
  await admin.query(`insert into public.space_memberships (space_id, user_id, role, status) values ($1, $2, 'admin', 'active')`, [SPACE_ID, ADMIN_ID]);
  await admin.query(`insert into public.groups (id, space_id, name) values ($1, $2, 'Grupo recarga race')`, [GROUP_ID, SPACE_ID]);
  await admin.query(
    `insert into public.establishments (id, space_id, group_id, code, name) values ($1, $2, $3, 'EST-TOPRACE', 'Restaurante recarga race')`,
    [ESTABLISHMENT_ID, SPACE_ID, GROUP_ID],
  );
  await admin.query(
    `insert into public.establishment_memberships (id, establishment_id, user_id, role) values ($1, $2, $3, 'local_owner')`,
    [MEMBERSHIP_ID, ESTABLISHMENT_ID, OWNER_ID],
  );
  await admin.query(
    `insert into public.reservation_settings (space_id, establishment_id, service_status, public_slug) values ($1, $2, 'active', 'recarga-race')`,
    [SPACE_ID, ESTABLISHMENT_ID],
  );
}

async function cleanup(admin) {
  await admin.query(`delete from public.audit_log where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.notifications where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.reservation_incidents where space_id = $1`, [SPACE_ID]);
  // El libro no se borra a mano (RN-AGT-01), pero sí en cascada al borrar el espacio entero.
  await admin.query(`delete from public.spaces where id = $1`, [SPACE_ID]);
  await admin.query(`delete from auth.users where email like 'topuprace-%@example.com'`);
}

// Una llamada a una función en su propia conexión y transacción (como el servidor real).
async function call(role, userId, sql, params) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await client.query(`select set_config('request.jwt.claim.aal', 'aal1', true)`);
    await client.query(`select set_config('request.jwt.claim.role', $1, true)`, [role]);
    await client.query(`set local role ${role}`);
    const { rows } = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, rows };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { ok: false, error: error.message };
  } finally {
    await client.end();
  }
}

const same = (values) => values.every((v) => v === values[0]);

async function main() {
  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    await cleanup(admin);
    await seed(admin);

    // Una recarga creada por el Propietario y su sesión de Stripe.
    const created = await call("authenticated", OWNER_ID, `select * from public.create_agent_topup($1, 2000, 'race-topup-1')`, [ESTABLISHMENT_ID]);
    if (!created.ok) throw new Error(`no se pudo crear la recarga: ${created.error}`);
    const topup = created.rows[0];
    if (topup.total_cents !== 2420) fail(`20 € + 21 % de IVA deberían ser 2420 céntimos y son ${topup.total_cents}`);
    const attached = await call("service_role", null, `select public.attach_topup_session($1, $2) as ok`, [topup.topup_id, SESSION_ID]);
    if (!attached.ok || attached.rows[0].ok !== true) fail(`no se pudo apuntar la sesión de Stripe: ${JSON.stringify(attached)}`);

    // 1 · Veinte webhooks iguales a la vez.
    const hooks = await Promise.all(
      Array.from({ length: 20 }, () => call("service_role", null, `select public.complete_agent_topup($1, 2420, 'eur') as r`, [SESSION_ID])),
    );
    const hookErrors = hooks.filter((h) => !h.ok);
    if (hookErrors.length > 0) fail(`un webhook terminó con error: ${hookErrors[0].error}`);
    const outcomes = hooks.filter((h) => h.ok).map((h) => h.rows[0].r.outcome);
    const credited = outcomes.filter((o) => o === "credited").length;
    const already = outcomes.filter((o) => o === "already").length;
    if (credited !== 1) fail(`el mismo webhook veinte veces debía apuntarse UNA vez y se apuntó ${credited}`);
    if (already !== 19) fail(`los otros diecinueve debían ser «already» y fueron ${already}`);
    const { rows: entries } = await admin.query(
      `select count(*)::int as n, coalesce(sum(amount_micros), 0)::bigint as micros from public.agent_balance_entries where stripe_checkout_session_id = $1`,
      [SESSION_ID],
    );
    if (entries[0].n !== 1) fail(`debía haber un solo apunte para la sesión y hay ${entries[0].n}`);
    if (String(entries[0].micros) !== "20000000") fail(`el apunte debía ser de 20 € sin IVA (20000000) y es ${entries[0].micros}`);
    const { rows: receipts } = await admin.query(
      `select count(*)::int as n from public.notifications where establishment_id = $1 and event_type = 'agent_topup_receipt'`,
      [ESTABLISHMENT_ID],
    );
    if (receipts[0].n !== 1) fail(`el recibo debía avisar una sola vez al Propietario y avisó ${receipts[0].n}`);

    // 2 · Veinte «crear recarga» con la misma clave.
    const creates = await Promise.all(
      Array.from({ length: 20 }, () =>
        call("authenticated", OWNER_ID, `select topup_id from public.create_agent_topup($1, 5000, 'race-topup-2')`, [ESTABLISHMENT_ID]),
      ),
    );
    if (creates.some((c) => !c.ok)) fail(`una creación de recarga terminó con error: ${creates.find((c) => !c.ok).error}`);
    const ids = creates.filter((c) => c.ok).map((c) => c.rows[0].topup_id);
    if (!same(ids)) fail("las veinte creaciones con la misma clave devolvieron recargas distintas");
    const { rows: topups } = await admin.query(
      `select count(*)::int as n from public.agent_topups where establishment_id = $1 and idempotency_key = 'race-topup-2'`,
      [ESTABLISHMENT_ID],
    );
    if (topups[0].n !== 1) fail(`con la misma clave debía haber UNA recarga y hay ${topups[0].n}`);

    // 3 · Veinte recargas a mano con la misma clave.
    const manuals = await Promise.all(
      Array.from({ length: 20 }, () =>
        call("authenticated", ADMIN_ID, `select public.record_manual_topup($1, 1500, 'bizum', null, 'race-manual-1') as id`, [ESTABLISHMENT_ID]),
      ),
    );
    if (manuals.some((m) => !m.ok)) fail(`una recarga a mano terminó con error: ${manuals.find((m) => !m.ok).error}`);
    if (!same(manuals.filter((m) => m.ok).map((m) => m.rows[0].id))) fail("las veinte recargas a mano devolvieron apuntes distintos");
    const { rows: manual } = await admin.query(
      `select count(*)::int as n from public.agent_balance_entries where establishment_id = $1 and idempotency_key = 'race-manual-1'`,
      [ESTABLISHMENT_ID],
    );
    if (manual[0].n !== 1) fail(`con la misma clave debía haber UN apunte y hay ${manual[0].n}`);

    // 4 · Diez llamadas de 1 € a la vez, del saldo que quede a cero. El saldo hasta aquí es 20 € + 15 € = 35 €:
    // se lleva a 10 € con un ajuste (a mano, como Restavor) y luego a 0 con diez llamadas.
    const { rows: balance } = await admin.query(
      `select coalesce(sum(amount_micros), 0)::bigint as micros from public.agent_balance_entries where establishment_id = $1`,
      [ESTABLISHMENT_ID],
    );
    const toTen = 10000000n - BigInt(balance[0].micros);
    await admin.query(
      `insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type, note) values ($1, $2, 'adjustment', $3, 'suite94', 'dejar en 10 €')`,
      [SPACE_ID, ESTABLISHMENT_ID, toTen.toString()],
    );
    await admin.query(`delete from public.notifications where establishment_id = $1 and event_type in ('agent_balance_low', 'agent_balance_empty')`, [ESTABLISHMENT_ID]);
    await admin.query(
      `update public.reservation_settings set low_balance_notified_at = null, balance_empty_notified_at = null where establishment_id = $1`,
      [ESTABLISHMENT_ID],
    );
    const calls = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const client = new Client({ connectionString: DATABASE_URL });
        await client.connect();
        try {
          await client.query(
            `insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros, source_type) values ($1, $2, 'call', -1000000, 'call')`,
            [SPACE_ID, ESTABLISHMENT_ID],
          );
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error.message };
        } finally {
          await client.end();
        }
      }),
    );
    if (calls.some((c) => !c.ok)) fail(`un apunte de llamada terminó con error: ${calls.find((c) => !c.ok).error}`);
    const { rows: low } = await admin.query(
      `select count(*)::int as n from public.notifications where establishment_id = $1 and event_type = 'agent_balance_low'`,
      [ESTABLISHMENT_ID],
    );
    const { rows: empty } = await admin.query(
      `select count(*)::int as n from public.notifications where establishment_id = $1 and event_type = 'agent_balance_empty'`,
      [ESTABLISHMENT_ID],
    );
    if (low[0].n !== 1) fail(`el saldo cruzó el umbral una vez: debía haber UN aviso de saldo bajo y hay ${low[0].n}`);
    if (empty[0].n !== 1) fail(`el saldo llegó a 0 una vez: debía haber UN aviso de saldo agotado y hay ${empty[0].n}`);

    if (!process.exitCode) {
      console.log(
        "RN-AGT-04/concurrencia: el mismo webhook veinte veces, una sola recarga y una sola recarga a mano con la misma clave, y diez llamadas a la vez dan un aviso de saldo bajo y uno de agotado.",
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
  console.error("RN-AGT-04/concurrencia FALLIDO (excepción no esperada):", error);
  process.exitCode = 1;
});
