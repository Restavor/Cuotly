#!/usr/bin/env node
// Hito 5 · CA-05 — "Dos aceptaciones simultáneas sobre el último crédito
// disponible: solo una lo consume; la otra recibe un error claro. Test de
// concurrencia real."
//
// Un script `psql -f` (como supabase/tests/hito*.sql) no puede expresar
// esto: cada sentencia de nivel superior de ese archivo es su propia
// transacción secuencial en UNA conexión, así que nunca hay dos
// transacciones abiertas a la vez. Esta prueba abre dos conexiones reales
// a Postgres (node-postgres) y dispara accept_request() en las dos a la
// vez con Promise.allSettled — dos transacciones de servidor genuinamente
// simultáneas, exactamente lo que CA-05 exige, peleando por el mismo
// último crédito de un consumption_cycle real.
//
// El propio bloqueo de fila (RN-CON-06, en get_or_create_consumption_cycle
// dentro de supabase/migrations/20260830000020_hito5_consumos.sql) es
// quien decide el resultado: una transacción se queda esperando a que la
// otra confirme o deshaga antes de leer el saldo, así que el resultado es
// correcto sea cual sea el orden real de llegada — lo único que varía
// entre ejecuciones es CUÁL de las dos gana, nunca si ambas pueden ganar
// (eso sería el bug que esta prueba existe para atrapar).
//
// Cómo ejecutarlo:
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
//     node scripts/hito5-concurrency-test.mjs
// (En CI, job "rls-tests": tras `supabase start`, con el DATABASE_URL por
// defecto de abajo, que ya es el de la Supabase local.)

import pg from "pg";

const { Client } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SPACE_ID = "aa000000-0000-0000-0000-0000000000c0";
const OWNER_ID = "aa000000-0000-0000-0000-00000000000f";
const CLIENT_ID = "aa000000-0000-0000-0000-00000000000c";
const GROUP_ID = "aa000000-0000-0000-0000-00000000000d";
const ESTABLISHMENT_ID = "aa000000-0000-0000-0000-00000000000e";
const PLAN_ID = "aa000000-0000-0000-0000-00000000000a";

function fail(message) {
  console.error(`CA-05 FALLIDO: ${message}`);
  process.exitCode = 1;
}

async function setup(admin) {
  await admin.query("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [
    OWNER_ID,
    "ca05-owner@example.com",
    CLIENT_ID,
    "ca05-client@example.com",
  ]);
  await admin.query(
    "insert into public.spaces (id, name, slug, created_by) values ($1, $2, $3, $4)",
    [SPACE_ID, "Espacio CA-05", "espacio-ca05-test", OWNER_ID],
  );
  await admin.query(
    "insert into public.space_memberships (space_id, user_id, role, status) values ($1, $2, 'owner', 'active')",
    [SPACE_ID, OWNER_ID],
  );
  await admin.query(
    `insert into public.plans (id, space_id, name, price_cents, included_small, included_photo, included_medium, included_large, start_sla_hours)
     values ($1, $2, 'Impulso CA-05', 39900, 1, 0, 0, 0, 24)`,
    [PLAN_ID, SPACE_ID],
  );
  await admin.query("insert into public.groups (id, space_id, name) values ($1, $2, 'Grupo CA-05')", [
    GROUP_ID,
    SPACE_ID,
  ]);
  await admin.query(
    "insert into public.establishments (id, space_id, group_id, code, name) values ($1, $2, $3, 'EST-CA05', 'Restaurante CA-05')",
    [ESTABLISHMENT_ID, SPACE_ID, GROUP_ID],
  );
  await admin.query(
    "insert into public.establishment_memberships (establishment_id, user_id, role) values ($1, $2, 'local_owner')",
    [ESTABLISHMENT_ID, CLIENT_ID],
  );

  // Suscripción de plan con un único crédito "small" disponible — el
  // último crédito que las dos transacciones se van a disputar.
  await admin.query("set role authenticated");
  await admin.query("select set_config('request.jwt.claim.sub', $1, false)", [OWNER_ID]);
  const { rows: subRows } = await admin.query(
    "select public.create_plan_subscription($1, $2) as id",
    [ESTABLISHMENT_ID, PLAN_ID],
  );
  await admin.query("reset role");

  // Dos solicitudes ya validadas y pendientes de aceptación, listas para
  // que el cliente las acepte — ambas de categoría "small", ambas
  // apuntando al mismo establecimiento (mismo ciclo de consumo).
  async function createReadyRequest(description) {
    await admin.query("set role authenticated");
    await admin.query("select set_config('request.jwt.claim.sub', $1, false)", [CLIENT_ID]);
    const { rows } = await admin.query("select public.create_request_draft($1, $2, null) as id", [
      ESTABLISHMENT_ID,
      description,
    ]);
    const requestId = rows[0].id;
    await admin.query("select public.submit_request($1)", [requestId]);
    await admin.query("select public.begin_request_analysis($1)", [requestId]);
    await admin.query("reset role");

    await admin.query("set role service_role");
    await admin.query(
      "select public.record_classification($1, $2, 'rules', 'small', 'CA-05', null, null, null, null, null, null)",
      [requestId, CLIENT_ID],
    );
    await admin.query("reset role");

    await admin.query("set role authenticated");
    await admin.query("select set_config('request.jwt.claim.sub', $1, false)", [OWNER_ID]);
    await admin.query("select public.validate_classification($1, 'small', 'CA-05')", [requestId]);
    await admin.query("reset role");

    return requestId;
  }

  const requestA = await createReadyRequest("CA-05 solicitud A");
  const requestB = await createReadyRequest("CA-05 solicitud B");

  return { subscriptionId: subRows[0].id, requestA, requestB };
}

async function cleanup(admin) {
  await admin.query("delete from public.audit_log where space_id = $1", [SPACE_ID]);
  await admin.query("delete from public.spaces where id = $1", [SPACE_ID]);
  await admin.query("delete from auth.users where id in ($1, $2)", [OWNER_ID, CLIENT_ID]);
}

async function acceptAs(client, actorId, requestId) {
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [actorId]);
  await client.query("select public.accept_request($1)", [requestId]);
  await client.query("reset role");
}

async function main() {
  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();

  let requestA;
  let requestB;

  try {
    ({ requestA, requestB } = await setup(admin));

    // Dos conexiones reales e independientes — dos transacciones de
    // servidor de verdad, no dos llamadas en la misma sesión.
    const clientA = new Client({ connectionString: DATABASE_URL });
    const clientB = new Client({ connectionString: DATABASE_URL });
    await clientA.connect();
    await clientB.connect();

    let results;
    try {
      // Promise.allSettled + ambas promesas creadas antes de esperar
      // ninguna: las dos peticiones están en vuelo a la vez, simultáneas
      // de verdad desde el punto de vista del cliente, exactamente lo que
      // CA-05 pide.
      results = await Promise.allSettled([
        acceptAs(clientA, CLIENT_ID, requestA),
        acceptAs(clientB, CLIENT_ID, requestB),
      ]);
    } finally {
      await clientA.end();
      await clientB.end();
    }

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    if (fulfilled.length !== 1 || rejected.length !== 1) {
      fail(
        `se esperaba exactamente una aceptación con éxito y una con error claro, se obtuvieron ${fulfilled.length} con éxito y ${rejected.length} con error`,
      );
    } else {
      const errorMessage = String(rejected[0].reason?.message ?? rejected[0].reason);
      if (!/Sin crédito disponible/.test(errorMessage)) {
        fail(`la transacción perdedora no recibió un error claro de crédito agotado (mensaje real: "${errorMessage}")`);
      } else {
        console.log("CA-05 OK: una aceptación consumió el último crédito, la otra recibió un error claro:");
        console.log(`  -> ${errorMessage}`);
      }
    }

    // El estado final de la base de datos debe ser coherente con "solo
    // una ganó": exactamente un apunte de débito en el libro, y las dos
    // solicitudes deben terminar en estados distintos.
    const { rows: entryRows } = await admin.query(
      `select count(*)::int as n from public.consumption_entries ce
       join public.consumption_cycles cc on cc.id = ce.consumption_cycle_id
       where cc.subscription_id = (select id from public.subscriptions where establishment_id = $1)
         and ce.category = 'small' and ce.entry_type = 'debit'`,
      [ESTABLISHMENT_ID],
    );
    if (entryRows[0].n !== 1) {
      fail(`CA-08: se esperaba exactamente 1 apunte de débito en el libro tras la disputa, hay ${entryRows[0].n}`);
    }

    const { rows: stateRows } = await admin.query(
      "select id, state from public.requests where id in ($1, $2)",
      [requestA, requestB],
    );
    const states = stateRows.map((r) => r.state).sort();
    if (JSON.stringify(states) !== JSON.stringify(["accepted", "pending_client_acceptance"])) {
      fail(`se esperaba una solicitud "accepted" y la otra sin cambios en "pending_client_acceptance", se obtuvo: ${JSON.stringify(states)}`);
    }

    if (!process.exitCode) {
      console.log("CA-05: base de datos coherente (1 débito, 1 aceptada, 1 sigue pendiente).");
    }
  } finally {
    try {
      if (requestA || requestB) {
        await cleanup(admin);
      }
    } finally {
      await admin.end();
    }
  }
}

main().catch((error) => {
  console.error("CA-05 FALLIDO (excepción no esperada):", error);
  process.exitCode = 1;
});
