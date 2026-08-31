#!/usr/bin/env node
// Hito 7 · RN-MSG + CLAUDE.md MUST ("las operaciones críticas usan
// transacción + clave de idempotencia; pulsar dos veces nunca duplica el
// efecto") — post_message() con la misma clave de idempotencia desde dos
// transacciones simultáneas debe crear UN solo mensaje.
//
// Existe por un fallo real: hasta la migración 20260830000026,
// messages.idempotency_key no tenía índice único y post_message() hacía
// SELECT y luego INSERT sin bloqueo. Dos llamadas a la vez pasaban ambas
// por el SELECT vacío y creaban DOS mensajes — y como RN-MSG-08 prohíbe
// borrar mensajes, el duplicado quedaba para siempre.
//
// El test SQL (supabase/tests/hito7_mensajes_archivos_finanzas.sql) no
// puede atrapar esto: `psql -f` ejecuta cada sentencia de nivel superior
// como su propia transacción secuencial en UNA conexión, así que nunca hay
// dos transacciones abiertas a la vez y la idempotencia secuencial pasa
// aunque la concurrente esté rota. Por eso esta prueba abre dos conexiones
// reales, igual que hito5-concurrency-test.mjs.
//
// Cómo ejecutarlo:
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
//     node scripts/hito7-concurrency-test.mjs
// (En CI, job "rls-tests": tras `supabase start`, con el DATABASE_URL por
// defecto de abajo, que ya es el de la Supabase local.)

import pg from "pg";

const { Client } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const OWNER_ID = "bb000000-0000-0000-0000-00000000000f";
const CLIENT_ID = "bb000000-0000-0000-0000-00000000000c";
const SPACE_ID = "bb000000-0000-0000-0000-0000000000c0";
const GROUP_ID = "bb000000-0000-0000-0000-00000000000d";
const ESTABLISHMENT_ID = "bb000000-0000-0000-0000-00000000000e";
const IDEMPOTENCY_KEY = "hito7-race-key";

function fail(message) {
  console.error(`RN-MSG/idempotencia FALLIDO: ${message}`);
  process.exitCode = 1;
}

async function seed(admin) {
  await admin.query(
    `insert into auth.users (id, email, role, aud) values
       ($1, 'h7race-owner@example.com', 'authenticated', 'authenticated'),
       ($2, 'h7race-client@example.com', 'authenticated', 'authenticated')`,
    [OWNER_ID, CLIENT_ID],
  );
  await admin.query(
    `insert into public.spaces (id, name, slug, created_by) values ($1, 'Espacio H7 race', 'espacio-h7-race', $2)`,
    [SPACE_ID, OWNER_ID],
  );
  await admin.query(
    `insert into public.space_memberships (space_id, user_id, role, status) values ($1, $2, 'owner', 'active')`,
    [SPACE_ID, OWNER_ID],
  );
  await admin.query(`insert into public.groups (id, space_id, name) values ($1, $2, 'Grupo H7 race')`, [
    GROUP_ID,
    SPACE_ID,
  ]);
  await admin.query(
    `insert into public.establishments (id, space_id, group_id, code, name)
     values ($1, $2, $3, 'EST-H7RACE', 'Restaurante H7 race')`,
    [ESTABLISHMENT_ID, SPACE_ID, GROUP_ID],
  );
  await admin.query(
    `insert into public.establishment_memberships (establishment_id, user_id, role) values ($1, $2, 'local_owner')`,
    [ESTABLISHMENT_ID, CLIENT_ID],
  );
  const { rows } = await admin.query(
    `insert into public.conversations (space_id, type, establishment_id) values ($1, 'establishment', $2) returning id`,
    [SPACE_ID, ESTABLISHMENT_ID],
  );
  return rows[0].id;
}

async function cleanup(admin) {
  await admin.query(`delete from public.audit_log where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.spaces where id = $1`, [SPACE_ID]);
  await admin.query(`delete from auth.users where email like 'h7race-%@example.com'`);
}

// Una transacción de servidor real: se abre, se adopta la identidad del
// cliente con RLS activo, y se llama a post_message() con la clave.
async function attempt(conversationId) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [CLIENT_ID]);
    await client.query("set local role authenticated");
    const { rows } = await client.query(`select public.post_message($1, 'mensaje simultaneo', $2) as id`, [
      conversationId,
      IDEMPOTENCY_KEY,
    ]);
    await client.query("commit");
    return { ok: true, id: rows[0].id };
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

  let conversationId = null;
  try {
    conversationId = await seed(admin);

    const [a, b] = await Promise.all([attempt(conversationId), attempt(conversationId)]);

    // Las dos deben terminar bien: la que pierde la carrera no es un error
    // para quien llama, recibe el mensaje que creó la otra.
    for (const [name, result] of [
      ["primera", a],
      ["segunda", b],
    ]) {
      if (!result.ok) {
        fail(`la llamada ${name} terminó con error en vez de devolver el mensaje existente: ${result.error}`);
      }
    }

    if (a.ok && b.ok && a.id !== b.id) {
      fail(`las dos llamadas devolvieron mensajes distintos (${a.id} y ${b.id}): no es idempotente`);
    }

    const { rows } = await admin.query(
      `select count(*)::int as total from public.messages
       where conversation_id = $1 and idempotency_key = $2`,
      [conversationId, IDEMPOTENCY_KEY],
    );
    if (rows[0].total !== 1) {
      fail(`se crearon ${rows[0].total} mensajes con la misma clave de idempotencia (esperado 1)`);
    }

    if (!process.exitCode) {
      console.log("RN-MSG/idempotencia: dos post_message() simultáneos con la misma clave crearon un único mensaje.");
    }
  } finally {
    try {
      if (conversationId) {
        await cleanup(admin);
      }
    } finally {
      await admin.end();
    }
  }
}

main().catch((error) => {
  console.error("RN-MSG/idempotencia FALLIDO (excepción no esperada):", error);
  process.exitCode = 1;
});
