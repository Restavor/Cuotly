#!/usr/bin/env node
// Fase C de Restavor agents · RN-RES-02 (garantía contra reservas simultáneas) y
// CLAUDE.md MUST ("pulsar dos veces nunca duplica el efecto"):
//
//   1 · Dos altas del agente a la vez para las ÚLTIMAS plazas de un turno: solo una
//       entra; la otra recibe `full`. El turno nunca supera su aforo.
//   2 · Ocho altas a la vez para tres plazas libres: entran las que caben, ni una más.
//   3 · La misma alta (misma clave de idempotencia) desde dos transacciones a la vez:
//       una sola reserva.
//   4 · Dos cambios de hora a la vez hacia el mismo hueco casi lleno: el turno no se pasa.
//   5 · Cancelar a la vez las dos mitades de una pareja de posibles duplicadas: ninguna
//       muere por interbloqueo (cada una tomaba su fila y luego pedía la de la otra).
//   6 · Cambiar una reserva de día mientras se crea otra con su mismo teléfono: ninguna
//       muere por interbloqueo (la edición tomaba la fila antes que el bloqueo del día).
//   7 · Dos altas a la vez, mismo teléfono y mismo día, en turnos distintos: las dos
//       quedan marcadas como posibles duplicadas.
//   8 · Quitar un turno mientras se reserva en él: nunca queda una reserva activa en un
//       turno desactivado (o se bloquea el cambio, o se rechaza la reserva).
//
// El orden de bloqueos que lo sostiene: clave de idempotencia → restaurante (compartido
// para reservar, exclusivo para cambiar horarios) → día (por fecha) → fila.
//
// El test SQL (supabase/tests/la_agenda.sql) no puede atrapar esto: `psql -f` ejecuta
// todo en UNA conexión y nunca hay dos transacciones abiertas a la vez. Por eso se
// abren conexiones reales, igual que `hito5-concurrency-test.mjs` y
// `hito7-concurrency-test.mjs`.
//
// Cómo ejecutarlo:
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
//     node scripts/agenda-concurrency-test.mjs

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const OWNER_ID = "dc000000-0000-0000-0000-00000000000f";
const SPACE_ID = "dc000000-0000-0000-0000-0000000000c0";
const GROUP_ID = "dc000000-0000-0000-0000-00000000000d";
const ESTABLISHMENT_ID = "dc000000-0000-0000-0000-00000000000e";
const SHIFT_ID = "dc000000-0000-0000-0000-0000000000a1";

function fail(message) {
  console.error(`RN-RES-02/concurrencia FALLIDO: ${message}`);
  process.exitCode = 1;
}

async function seed(admin) {
  await admin.query(`insert into auth.users (id, email, role, aud) values ($1, 'agendarace-owner@example.com', 'authenticated', 'authenticated')`, [OWNER_ID]);
  await admin.query(`insert into public.profiles (id, email, full_name) values ($1, 'agendarace-owner@example.com', 'Dueño carrera') on conflict (id) do nothing`, [OWNER_ID]);
  await admin.query(`insert into public.spaces (id, name, slug, created_by, reservations_enabled) values ($1, 'Espacio agenda race', 'espacio-agenda-race', $2, false)`, [SPACE_ID, OWNER_ID]);
  await admin.query(`insert into public.groups (id, space_id, name) values ($1, $2, 'Grupo agenda race')`, [GROUP_ID, SPACE_ID]);
  await admin.query(
    `insert into public.establishments (id, space_id, group_id, code, name) values ($1, $2, $3, 'EST-AGRACE', 'Restaurante agenda race')`,
    [ESTABLISHMENT_ID, SPACE_ID, GROUP_ID],
  );
  await admin.query(
    `insert into public.reservation_settings (space_id, establishment_id, service_status, public_slug) values ($1, $2, 'active', 'agenda-race')`,
    [SPACE_ID, ESTABLISHMENT_ID],
  );
  await admin.query(
    `insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
     values ($1, $2, $3, 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 10)`,
    [SHIFT_ID, SPACE_ID, ESTABLISHMENT_ID],
  );
}

async function cleanup(admin) {
  await admin.query(`delete from public.audit_log where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.spaces where id = $1`, [SPACE_ID]);
  await admin.query(`delete from auth.users where email like 'agendarace-%@example.com'`);
}

// Una alta del servidor (el agente), en su propia transacción y conexión.
async function bookAsAgent(date, time, party, name, phone, idempotencyKey = null) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
    await client.query("set local role service_role");
    const { rows } = await client.query(
      `select public.book_reservation($1, null, $2::date, $3::time, $4, $5, $6, null, null, 'es', 'agent', false, $7, false, null) as r`,
      [ESTABLISHMENT_ID, date, time, party, name, phone, idempotencyKey],
    );
    await client.query("commit");
    return { ok: true, result: rows[0].r };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { ok: false, error: error.message };
  } finally {
    await client.end();
  }
}

async function moveAsOwner(reservationId, date, time, party, name, phone) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
    await client.query("set local role service_role");
    const { rows } = await client.query(
      `select public.book_reservation($1, $2, $3::date, $4::time, $5, $6, $7, null, null, 'es', 'agent', false, null, false, null) as r`,
      [ESTABLISHMENT_ID, reservationId, date, time, party, name, phone],
    );
    await client.query("commit");
    return { ok: true, result: rows[0].r };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { ok: false, error: error.message };
  } finally {
    await client.end();
  }
}

// Cualquier llamada del servidor (service_role), en su propia transacción y conexión.
async function asServer(sql, params) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
    await client.query("set local role service_role");
    const { rows } = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, result: rows[0]?.r };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { ok: false, error: error.message };
  } finally {
    await client.end();
  }
}

const insertReservation = (admin, shiftId, date, time, party, name, phone, status = "confirmed") =>
  admin
    .query(
      `insert into public.reservations (space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, source, status)
       values ($1, $2, $3, $4::date, $5::time, now() + interval '10 days', $6, $7, $8, 'manual', $9) returning id`,
      [SPACE_ID, ESTABLISHMENT_ID, shiftId, date, time, party, name, phone, status],
    )
    .then((r) => r.rows[0].id);

async function occupancy(admin, date) {
  const { rows } = await admin.query(
    `select coalesce(sum(party_size), 0)::int as n from public.reservations
     where shift_id = $1 and date = $2::date and status in ('pending', 'confirmed')`,
    [SHIFT_ID, date],
  );
  return rows[0].n;
}

async function main() {
  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    await seed(admin);
    const { rows } = await admin.query(`select ((now() at time zone 'Europe/Madrid')::date + 5)::text as d1,
                                               ((now() at time zone 'Europe/Madrid')::date + 6)::text as d2,
                                               ((now() at time zone 'Europe/Madrid')::date + 7)::text as d3,
                                               ((now() at time zone 'Europe/Madrid')::date + 8)::text as d4`);
    const { d1, d2, d3, d4 } = rows[0];

    // 1 · las últimas plazas: 8 ocupadas de 10, dos altas de 2 personas a la vez.
    await admin.query(
      `insert into public.reservations (space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, source)
       values ($1, $2, $3, $4::date, '21:00', now() + interval '5 days', 8, 'Ocupa Ocho', '+34600000900', 'manual')`,
      [SPACE_ID, ESTABLISHMENT_ID, SHIFT_ID, d1],
    );
    const pair = await Promise.all([
      bookAsAgent(d1, "21:30", 2, "Carrera Uno", "+34600000901"),
      bookAsAgent(d1, "21:30", 2, "Carrera Dos", "+34600000902"),
    ]);
    const errored = pair.filter((r) => !r.ok);
    if (errored.length > 0) fail(`una de las dos altas terminó con error en vez de un resultado: ${errored[0].error}`);
    const accepted = pair.filter((r) => r.ok && r.result.outcome === "accepted").length;
    const full = pair.filter((r) => r.ok && r.result.outcome === "rejected" && r.result.reason === "full").length;
    if (accepted !== 1 || full !== 1) fail(`dos altas para las últimas plazas: ${accepted} aceptada(s) y ${full} "full" (esperado 1 y 1)`);
    const occ1 = await occupancy(admin, d1);
    if (occ1 > 10) fail(`el turno quedó con ${occ1} de 10 plazas`);

    // 2 · ocho altas de 1 persona a la vez para tres plazas libres (7 ocupadas).
    await admin.query(
      `insert into public.reservations (space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, source)
       values ($1, $2, $3, $4::date, '21:00', now() + interval '6 days', 7, 'Ocupa Siete', '+34600000910', 'manual')`,
      [SPACE_ID, ESTABLISHMENT_ID, SHIFT_ID, d2],
    );
    const many = await Promise.all(
      Array.from({ length: 8 }, (_, i) => bookAsAgent(d2, "22:00", 1, `Multitud ${i}`, `+3460000092${i}`)),
    );
    const manyErrors = many.filter((r) => !r.ok);
    if (manyErrors.length > 0) fail(`una de las ocho altas terminó con error: ${manyErrors[0].error}`);
    const manyAccepted = many.filter((r) => r.ok && r.result.outcome === "accepted").length;
    if (manyAccepted !== 3) fail(`ocho altas para tres plazas: entraron ${manyAccepted} (esperado 3)`);
    const occ2 = await occupancy(admin, d2);
    if (occ2 !== 10) fail(`el turno quedó con ${occ2} de 10 plazas (esperado 10)`);

    // 3 · la misma alta (misma clave) desde dos transacciones a la vez: una reserva.
    const twin = await Promise.all([
      bookAsAgent(d3, "21:00", 2, "Doble Pulsacion", "+34600000930", "clave-carrera"),
      bookAsAgent(d3, "21:00", 2, "Doble Pulsacion", "+34600000930", "clave-carrera"),
    ]);
    const twinErrors = twin.filter((r) => !r.ok);
    if (twinErrors.length > 0) fail(`una de las dos altas con la misma clave terminó con error: ${twinErrors[0].error}`);
    const ids = new Set(twin.filter((r) => r.ok).map((r) => r.result.reservation_id));
    if (ids.size !== 1) fail(`la misma clave de idempotencia devolvió ${ids.size} reservas distintas`);
    const { rows: keyed } = await admin.query(
      `select count(*)::int as n from public.reservations where establishment_id = $1 and idempotency_key = 'clave-carrera'`,
      [ESTABLISHMENT_ID],
    );
    if (keyed[0].n !== 1) fail(`se crearon ${keyed[0].n} reservas con la misma clave de idempotencia (esperado 1)`);

    // 4 · dos cambios de hora a la vez hacia un hueco con una sola plaza libre (9 de 10).
    await admin.query(
      `insert into public.reservations (space_id, establishment_id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, source)
       values ($1, $2, $3, $4::date, '21:00', now() + interval '8 days', 9, 'Ocupa Nueve', '+34600000940', 'manual')`,
      [SPACE_ID, ESTABLISHMENT_ID, SHIFT_ID, d4],
    );
    const a = await bookAsAgent(d3, "20:30", 1, "Movida Uno", "+34600000941");
    const b = await bookAsAgent(d3, "20:30", 1, "Movida Dos", "+34600000942");
    if (!(a.ok && b.ok && a.result.outcome === "accepted" && b.result.outcome === "accepted")) {
      fail(`no se pudieron preparar las dos reservas de la prueba 4: ${JSON.stringify([a, b])}`);
    } else {
      const moves = await Promise.all([
        moveAsOwner(a.result.reservation_id, d4, "21:30", 1, "Movida Uno", "+34600000941"),
        moveAsOwner(b.result.reservation_id, d4, "21:30", 1, "Movida Dos", "+34600000942"),
      ]);
      const moveErrors = moves.filter((r) => !r.ok);
      if (moveErrors.length > 0) fail(`un cambio de hora terminó con error: ${moveErrors[0].error}`);
      const occ4 = await occupancy(admin, d4);
      if (occ4 > 10) fail(`dos cambios a la vez dejaron el turno con ${occ4} de 10 plazas`);
      const movedOk = moves.filter((r) => r.ok && r.result.outcome === "accepted").length;
      if (movedOk !== 1) fail(`dos cambios para una plaza: ${movedOk} aceptado(s) (esperado 1)`);
    }

    // 5 · cancelar a la vez las dos mitades de una pareja de duplicadas, muchas veces: ningún interbloqueo.
    const PAIRS = 30;
    let cancelErrors = 0;
    let firstCancelError = "";
    for (let i = 0; i < PAIRS; i++) {
      const date = await admin.query(`select ((now() at time zone 'Europe/Madrid')::date + $1::int)::text as d`, [20 + (i % 30)]).then((r) => r.rows[0].d);
      const phone = `+34600099${String(i).padStart(3, "0")}`;
      const first = await insertReservation(admin, SHIFT_ID, date, "21:00", 1, `Pareja ${i} A`, phone);
      const second = await insertReservation(admin, SHIFT_ID, date, "21:30", 1, `Pareja ${i} B`, phone);
      await admin.query(`select public.reservation_recompute_duplicates($1, $2::date)`, [ESTABLISHMENT_ID, date]);
      const outs = await Promise.all([
        asServer(`select public.cancel_reservation($1, $2, 'other') as r`, [ESTABLISHMENT_ID, first]),
        asServer(`select public.cancel_reservation($1, $2, 'other') as r`, [ESTABLISHMENT_ID, second]),
      ]);
      for (const out of outs) {
        if (!out.ok || out.result.outcome !== "done") {
          cancelErrors += 1;
          firstCancelError ||= out.ok ? JSON.stringify(out.result) : out.error;
        }
      }
    }
    if (cancelErrors > 0) fail(`cancelar a la vez las dos mitades de una pareja falló ${cancelErrors} de ${PAIRS * 2} veces: ${firstCancelError}`);

    // 6 · cambiar una reserva de día mientras se crea otra con su mismo teléfono: ningún interbloqueo.
    const MOVES = 30;
    let moveErrors2 = 0;
    let firstMoveError = "";
    for (let i = 0; i < MOVES; i++) {
      const dates = await admin
        .query(`select ((now() at time zone 'Europe/Madrid')::date + $1::int)::text as a, ((now() at time zone 'Europe/Madrid')::date + $2::int)::text as b`, [50 + (i % 5), 56 + (i % 5)])
        .then((r) => r.rows[0]);
      const phone = `+34600098${String(i).padStart(3, "0")}`;
      // Cada vuelta usa un día distinto (50..54): un día lleno de las vueltas anteriores no pesa en esta.
      const base = await insertReservation(admin, SHIFT_ID, dates.a, "20:30", 1, `Mueve ${i}`, phone);
      const outs = await Promise.all([
        asServer(`select public.book_reservation($1, null, $2::date, '21:30'::time, 1, $3, $4, null, null, 'es', 'manual', false, null, false, null) as r`, [ESTABLISHMENT_ID, dates.a, `Crea ${i}`, phone]),
        asServer(`select public.book_reservation($1, $2, $3::date, '20:30'::time, 1, $4, $5, null, null, 'es', 'manual', false, null, false, null) as r`, [ESTABLISHMENT_ID, base, dates.b, `Mueve ${i}`, phone]),
      ]);
      for (const out of outs) {
        if (!out.ok) {
          moveErrors2 += 1;
          firstMoveError ||= out.error;
        }
      }
    }
    if (moveErrors2 > 0) fail(`crear y cambiar de día a la vez, con el mismo teléfono, falló ${moveErrors2} de ${MOVES * 2} veces: ${firstMoveError}`);

    // Los dos turnos de las pruebas 7 y 8.
    const COMIDA_ID = "dc000000-0000-0000-0000-0000000000a2";
    await admin.query(
      `insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity)
       values ($1, $2, $3, 'Comida', '{1,2,3,4,5,6,7}', '13:00', '16:00', '15:00', 40)`,
      [COMIDA_ID, SPACE_ID, ESTABLISHMENT_ID],
    );

    // 7 · mismo teléfono y mismo día en turnos distintos, a la vez: las dos quedan marcadas.
    const SPLITS = 20;
    let unflagged = 0;
    for (let i = 0; i < SPLITS; i++) {
      const date = await admin.query(`select ((now() at time zone 'Europe/Madrid')::date + $1::int)::text as d`, [70 + (i % 10)]).then((r) => r.rows[0].d);
      const phone = `+34600097${String(i).padStart(3, "0")}`;
      const outs = await Promise.all([
        asServer(`select public.book_reservation($1, null, $2::date, '14:00'::time, 1, $3, $4, null, null, 'es', 'manual', false, null, false, null) as r`, [ESTABLISHMENT_ID, date, `Turno ${i} Comida`, phone]),
        asServer(`select public.book_reservation($1, null, $2::date, '21:00'::time, 1, $3, $4, null, null, 'es', 'manual', false, null, false, null) as r`, [ESTABLISHMENT_ID, date, `Turno ${i} Cena`, phone]),
      ]);
      if (outs.some((o) => !o.ok || o.result.outcome !== "accepted")) {
        fail(`dos altas del mismo teléfono en turnos distintos no terminaron aceptadas: ${JSON.stringify(outs)}`);
        break;
      }
      const { rows: flags } = await admin.query(
        `select count(*)::int as n from public.reservations where establishment_id = $1 and phone_e164 = $2 and date = $3::date and duplicate_flag = 'possible'`,
        [ESTABLISHMENT_ID, phone, date],
      );
      if (flags[0].n !== 2) unflagged += 1;
    }
    if (unflagged > 0) fail(`en ${unflagged} de ${SPLITS} parejas de altas simultáneas en turnos distintos no quedaron marcadas las dos como posibles duplicadas`);

    // 8 · quitar "Comida" mientras se reserva en ella: nunca una reserva activa en un turno desactivado.
    const SHIFT_RACES = 20;
    const withComida = (active) =>
      JSON.stringify([
        { id: SHIFT_ID, name: "Cena", weekdays: [1, 2, 3, 4, 5, 6, 7], start_time: "20:00", last_booking_time: "22:30", end_time: "23:30", capacity: 10, active: true },
        { id: COMIDA_ID, name: "Comida", weekdays: [1, 2, 3, 4, 5, 6, 7], start_time: "13:00", last_booking_time: "15:00", end_time: "16:00", capacity: 40, active },
      ]);
    let strandedReservations = 0;
    for (let i = 0; i < SHIFT_RACES; i++) {
      // Desde la Fase F, un aviso apunta al evento del que nace: se limpian primero los avisos de la prueba.
      await admin.query(`delete from public.reservation_notifications where establishment_id = $1`, [ESTABLISHMENT_ID]);
      await admin.query(`delete from public.reservation_events where establishment_id = $1`, [ESTABLISHMENT_ID]);
      await admin.query(`delete from public.reservations where shift_id = $1`, [COMIDA_ID]);
      const reopened = await asServer(`select public.save_reservation_shifts($1, $2::jsonb) as r`, [ESTABLISHMENT_ID, withComida(true)]);
      if (!reopened.ok) {
        fail(`no se pudo reactivar el turno de la prueba 8: ${reopened.error}`);
        break;
      }
      const date = await admin.query(`select ((now() at time zone 'Europe/Madrid')::date + 90)::text as d`).then((r) => r.rows[0].d);
      const outs = await Promise.all([
        asServer(`select public.save_reservation_shifts($1, $2::jsonb) as r`, [ESTABLISHMENT_ID, withComida(false)]),
        asServer(`select public.book_reservation($1, null, $2::date, '14:00'::time, 2, $3, $4, null, null, 'es', 'manual', false, null, false, null) as r`, [ESTABLISHMENT_ID, date, `Quita ${i}`, `+34600096${String(i).padStart(3, "0")}`]),
      ]);
      const unexpected = outs.filter((o) => !o.ok);
      if (unexpected.length > 0) {
        fail(`quitar un turno y reservar en él a la vez terminó con error: ${unexpected[0].error}`);
        break;
      }
      const { rows: stranded } = await admin.query(
        `select count(*)::int as n from public.reservations r join public.reservation_shifts s on s.id = r.shift_id
         where r.establishment_id = $1 and r.status in ('pending', 'confirmed') and not s.active`,
        [ESTABLISHMENT_ID],
      );
      strandedReservations += stranded[0].n;
    }
    if (strandedReservations > 0) fail(`quedaron ${strandedReservations} reservas activas en un turno desactivado`);

    if (!process.exitCode) {
      console.log(
        "RN-RES-02/concurrencia: las últimas plazas las gana una sola alta, ocho altas para tres plazas dejan entrar tres, la misma clave crea una reserva, dos cambios a la vez no pasan del aforo, cancelar las dos mitades de una pareja o cambiar de día mientras se crea otra no se interbloquean, las duplicadas en turnos distintos quedan marcadas y quitar un turno no deja reservas en uno desactivado.",
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
  console.error("RN-RES-02/concurrencia FALLIDO (excepción no esperada):", error);
  process.exitCode = 1;
});
