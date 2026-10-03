#!/usr/bin/env node
// Fase F de Restavor agents · RN-AGT-07 y RN-RES-10 (un aviso sale UNA vez y se cobra UNA vez aunque los
// reclamos, los informes y los webhooks lleguen a la vez, y ninguno se queda esperando al otro para siempre):
//
//   1 · Diez reclamos a la vez sobre el MISMO restaurante con saldo para tres WhatsApp: salen exactamente tres,
//       cada uno una sola vez, los otros siete quedan «sin saldo», se cobran tres veces y el saldo queda a cero
//       (nunca en negativo).
//   2 · Diez reclamos a la vez con saldo de sobra: cada uno de los diez avisos sale una sola vez y se cobra una.
//   3 · Veinte informes «enviado» del mismo aviso: uno vale, diecinueve son «stale», un solo evento.
//   4 · Veinte webhooks «no entregable» del mismo WhatsApp: una devolución y un solo SMS de respaldo.
//   5 · Veinte webhooks de precio real del mismo SMS: una sola corrección del cobro.
//   6 · «Entregado» y «no entregable» a la vez sobre el mismo aviso: quede el que quede, es coherente (un aviso
//       entregado nunca queda devuelto ni con SMS de respaldo).
//   7 · Reclamos a la vez con altas de la agenda (`book_reservation`), con la anonimización de un restaurante
//       cerrado y entre dos restaurantes cruzados: ninguna transacción termina en interbloqueo.
//
// El test SQL (supabase/tests/reservas_avisos.sql) no puede atrapar esto: `psql -f` usa UNA conexión y nunca hay dos
// transacciones abiertas a la vez. Por eso aquí se abren conexiones reales, igual que `topup-concurrency-test.mjs`.
//
// Cómo ejecutarlo:
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
//     node scripts/avisos-concurrency-test.mjs

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const P = "df200000-0000-0000-0000-";
const id = (n) => `${P}${String(n).padStart(12, "0")}`;
const OWNER_ID = id(1);
const SPACE_ID = id(10);
const GROUP_ID = id(15);
// Restaurantes: 1 saldo para tres, 2 saldo de sobra, 3 informes y webhooks, 4 agenda, 5 cerrado (anonimización), 6 cruce.
const EST = [0, 1, 2, 3, 4, 5, 6].map((n) => id(20 + n));
const SHIFT_ID = id(70);

let failed = false;
function fail(message) {
  console.error(`RN-AGT-07/concurrencia FALLIDO: ${message}`);
  failed = true;
  process.exitCode = 1;
}

async function seed(admin) {
  await admin.query(`insert into auth.users (id, email, role, aud) values ($1, 'avisosrace-owner@example.com', 'authenticated', 'authenticated')`, [OWNER_ID]);
  await admin.query(`insert into public.profiles (id, email, full_name) values ($1, 'avisosrace-owner@example.com', 'Propietario carrera avisos') on conflict (id) do nothing`, [OWNER_ID]);
  await admin.query(`insert into public.spaces (id, name, slug, created_by, reservations_enabled) values ($1, 'Espacio avisos race', 'espacio-avisos-race', $2, true)`, [SPACE_ID, OWNER_ID]);
  await admin.query(`insert into public.groups (id, space_id, name) values ($1, $2, 'Grupo avisos race')`, [GROUP_ID, SPACE_ID]);
  for (let i = 1; i <= 6; i += 1) {
    await admin.query(
      `insert into public.establishments (id, space_id, group_id, code, name, address, city) values ($1, $2, $3, $4, $5, 'Calle Carrera 1', 'Sevilla')`,
      [EST[i], SPACE_ID, GROUP_ID, `EST-AVR${i}`, `Restaurante avisos race ${i}`],
    );
    await admin.query(
      `insert into public.reservation_settings (space_id, establishment_id, service_status, public_slug, local_phone_e164) values ($1, $2, $3, $4, $5)`,
      [SPACE_ID, EST[i], "active", `avisos-race-${i}`, `+3495500000${i}`],
    );
  }
  await admin.query(
    `insert into public.reservation_shifts (id, space_id, establishment_id, name, weekdays, start_time, end_time, last_booking_time, capacity) values ($1, $2, $3, 'Cena', '{1,2,3,4,5,6,7}', '20:00', '23:30', '22:30', 500)`,
    [SHIFT_ID, SPACE_ID, EST[4]],
  );
  // Tarifas de prueba: las mismas que el sembrado.
  await admin.query(
    `insert into public.messaging_rates (channel, country, price_micros, currency, valid_from) values ('whatsapp_utility', 'ES', 16000, 'EUR', date '2026-01-01'), ('sms', 'ES', 80000, 'EUR', date '2026-01-01')
     on conflict (channel, country, valid_from) do update set price_micros = excluded.price_micros, currency = 'EUR'`,
  );
}

async function cleanup(admin) {
  await admin.query(`delete from public.audit_log where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.notifications where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.reservation_incidents where space_id = $1`, [SPACE_ID]);
  // El libro no se borra a mano, pero sí en cascada al borrar el espacio. Las reservas y sus avisos cuelgan del restaurante sin cascada:
  // se quitan antes (son datos de prueba que nunca existieron).
  await admin.query(`alter table public.reservation_notifications disable trigger user`).catch(() => {});
  await admin.query(`delete from public.reservation_notifications where space_id = $1`, [SPACE_ID]);
  await admin.query(`alter table public.reservation_notifications enable trigger user`).catch(() => {});
  await admin.query(`delete from public.reservation_events where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.reservations where space_id = $1`, [SPACE_ID]);
  await admin.query(`delete from public.spaces where id = $1`, [SPACE_ID]);
  await admin.query(`delete from auth.users where email like 'avisosrace-%@example.com'`);
}

let reservationCounter = 100;
// Una reserva de solo teléfono con permiso (WhatsApp) y su aviso en cola, creados como lo haría la agenda.
async function queueWhatsApp(admin, establishmentId, count, { phonePrefix = "+346000" } = {}) {
  const notices = [];
  for (let i = 0; i < count; i += 1) {
    reservationCounter += 1;
    const resId = id(reservationCounter);
    await admin.query(
      `insert into public.reservations (id, space_id, establishment_id, date, time, starts_at, party_size, customer_name, phone_e164, language, status, source, whatsapp_consent)
       values ($1, $2, $3, current_date + 10, '21:00', (current_date + 10 + time '21:00') at time zone 'Europe/Madrid', 2, 'Cliente carrera', $4, 'es', 'confirmed', 'manual', true)`,
      [resId, SPACE_ID, establishmentId, `${phonePrefix}${String(reservationCounter).padStart(5, "0")}`],
    );
    await admin.query(`select public.reservation_log_event($1, $2, 'created', 'member', null, '{"status":"confirmed","source":"manual"}'::jsonb)`, [establishmentId, resId]);
    const { rows } = await admin.query(`select id from public.reservation_notifications where reservation_id = $1`, [resId]);
    notices.push(rows[0].id);
  }
  return notices;
}

async function balanceOf(admin, establishmentId) {
  const { rows } = await admin.query(`select coalesce(sum(amount_micros), 0)::bigint as micros from public.agent_balance_entries where establishment_id = $1`, [establishmentId]);
  return BigInt(rows[0].micros);
}

async function topup(admin, establishmentId, micros) {
  await admin.query(`insert into public.agent_balance_entries (space_id, establishment_id, kind, amount_micros) values ($1, $2, 'topup', $3)`, [SPACE_ID, establishmentId, String(micros)]);
}

// Una llamada en su propia conexión y transacción (como el servidor real). Con `deadlock`, un interbloqueo se cuenta aparte.
async function call(role, sql, params) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claim.sub', '', true)`);
    await client.query(`select set_config('request.jwt.claim.role', $1, true)`, [role]);
    await client.query(`set local role ${role}`);
    const { rows } = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, rows };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { ok: false, error: error.message, deadlock: /deadlock/i.test(error.message) };
  } finally {
    await client.end();
  }
}

const claim = (establishmentId, limit = 10) =>
  call("service_role", `select public.claim_reservation_notices($1, $2, null, false, false) as items`, [establishmentId, limit]);

async function main() {
  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();
  try {
    await cleanup(admin);
    await seed(admin);

    // 1 · Diez reclamos a la vez, saldo para tres WhatsApp (3 × 0,016 € = 48.000 millonésimas).
    const first = await queueWhatsApp(admin, EST[1], 10);
    await topup(admin, EST[1], 48000);
    const claims1 = await Promise.all(Array.from({ length: 10 }, () => claim(EST[1])));
    if (claims1.some((c) => !c.ok)) fail(`un reclamo terminó con error: ${claims1.find((c) => !c.ok).error}`);
    const out1 = claims1.filter((c) => c.ok).flatMap((c) => c.rows[0].items);
    const ids1 = out1.map((i) => i.notice_id);
    if (new Set(ids1).size !== ids1.length) fail("un aviso se reclamó dos veces a la vez");
    if (ids1.length !== 3) fail(`con saldo para tres debían salir tres avisos y salieron ${ids1.length}`);
    const { rows: states1 } = await admin.query(
      `select status, skip_reason, count(*)::int as n from public.reservation_notifications where id = any($1) group by 1, 2 order by 1, 2`,
      [first],
    );
    const queued1 = states1.find((r) => r.status === "queued")?.n ?? 0;
    const noBalance1 = states1.find((r) => r.skip_reason === "no_balance")?.n ?? 0;
    if (queued1 !== 3 || noBalance1 !== 7) fail(`debían quedar 3 en curso y 7 «sin saldo»: ${JSON.stringify(states1)}`);
    const { rows: charges1 } = await admin.query(
      `select count(*)::int as n from public.agent_balance_entries where establishment_id = $1 and source_type = 'notification' and amount_micros < 0`,
      [EST[1]],
    );
    if (charges1[0].n !== 3) fail(`debían cobrarse tres WhatsApp y se cobraron ${charges1[0].n}`);
    if ((await balanceOf(admin, EST[1])) !== 0n) fail(`el saldo debía quedar a cero y es ${await balanceOf(admin, EST[1])} (nunca en negativo)`);

    // 2 · Diez reclamos a la vez con saldo de sobra.
    const second = await queueWhatsApp(admin, EST[2], 10);
    await topup(admin, EST[2], 1000000);
    const claims2 = await Promise.all(Array.from({ length: 10 }, () => claim(EST[2], 3)));
    if (claims2.some((c) => !c.ok)) fail(`un reclamo terminó con error: ${claims2.find((c) => !c.ok).error}`);
    const ids2 = claims2.filter((c) => c.ok).flatMap((c) => c.rows[0].items.map((i) => i.notice_id));
    if (new Set(ids2).size !== 10 || ids2.length !== 10) fail(`cada uno de los diez avisos debía salir UNA vez y salieron ${ids2.length} (${new Set(ids2).size} distintos)`);
    const { rows: charges2 } = await admin.query(
      `select count(*)::int as n, count(distinct source_id)::int as distintos from public.agent_balance_entries where establishment_id = $1 and source_type = 'notification' and amount_micros < 0`,
      [EST[2]],
    );
    if (charges2[0].n !== 10 || charges2[0].distintos !== 10) fail(`debían cobrarse diez avisos, uno cada uno: ${JSON.stringify(charges2[0])}`);
    if ((await balanceOf(admin, EST[2])) !== 1000000n - 160000n) fail(`el saldo debía bajar exactamente 0,16 € y es ${await balanceOf(admin, EST[2])}`);

    // 3 · Veinte informes «enviado» del mismo aviso.
    const [sentNotice] = second;
    const attempt = (await admin.query(`select attempts from public.reservation_notifications where id = $1`, [sentNotice])).rows[0].attempts;
    const reports = await Promise.all(
      Array.from({ length: 20 }, () =>
        call("service_role", `select public.report_reservation_notice($1, $2, 'sent', 'meta', 'wamid.carrera', null) as r`, [sentNotice, attempt]),
      ),
    );
    if (reports.some((r) => !r.ok)) fail(`un informe terminó con error: ${reports.find((r) => !r.ok).error}`);
    const outcomes = reports.filter((r) => r.ok).map((r) => r.rows[0].r.outcome);
    if (outcomes.filter((o) => o === "sent").length !== 1) fail(`el mismo informe veinte veces debía valer UNA vez y valió ${outcomes.filter((o) => o === "sent").length}`);
    if (outcomes.filter((o) => o === "stale").length !== 19) fail(`los otros diecinueve debían ser «stale»: ${JSON.stringify(outcomes)}`);
    const { rows: sentEvents } = await admin.query(
      `select count(*)::int as n from public.reservation_events where reservation_id = (select reservation_id from public.reservation_notifications where id = $1) and type = 'notification_sent'`,
      [sentNotice],
    );
    if (sentEvents[0].n !== 1) fail(`debía haber UN evento «aviso enviado» y hay ${sentEvents[0].n}`);

    // 4 · Veinte webhooks «no entregable» del mismo WhatsApp: una devolución y un solo SMS de respaldo.
    const [waNotice] = await queueWhatsApp(admin, EST[3], 1);
    await topup(admin, EST[3], 1000000);
    const waClaim = await claim(EST[3], 1);
    if (!waClaim.ok || waClaim.rows[0].items.length !== 1) fail(`no se pudo reclamar el WhatsApp de la prueba 4: ${JSON.stringify(waClaim)}`);
    const waAttempt = waClaim.ok ? waClaim.rows[0].items[0]?.attempt : 1;
    await call("service_role", `select public.report_reservation_notice($1, $2, 'sent', 'meta', 'wamid.noentregable', null)`, [waNotice, waAttempt]);
    const undeliverable = await Promise.all(
      Array.from({ length: 20 }, () =>
        call("service_role", `select public.reservation_notice_provider_event($1, 'meta', 'wamid.noentregable', 'undeliverable', null, null, 'meta_131026') as r`, [waNotice]),
      ),
    );
    if (undeliverable.some((u) => !u.ok)) fail(`un webhook terminó con error: ${undeliverable.find((u) => !u.ok).error}`);
    const { rows: refunds } = await admin.query(
      `select count(*)::int as n from public.agent_balance_entries where source_id = $1 and kind = 'refund'`,
      [waNotice],
    );
    if (refunds[0].n !== 1) fail(`veinte «no entregable» debían devolver UNA vez y devolvieron ${refunds[0].n}`);
    const { rows: fallbacks } = await admin.query(`select count(*)::int as n from public.reservation_notifications where fallback_of = $1`, [waNotice]);
    if (fallbacks[0].n !== 1) fail(`debía crearse UN SMS de respaldo y se crearon ${fallbacks[0].n}`);

    // 5 · Veinte webhooks de precio real del mismo SMS: una sola corrección.
    const smsClaim = await claim(EST[3], 5);
    const smsItem = smsClaim.ok ? smsClaim.rows[0].items.find((i) => i.channel === "sms") : undefined;
    if (!smsItem) {
      fail(`no se reclamó el SMS de respaldo: ${JSON.stringify(smsClaim)}`);
    } else {
      await call("service_role", `select public.report_reservation_notice($1, $2, 'sent', 'sms', 'SMcarrera00000000', null)`, [smsItem.notice_id, smsItem.attempt]);
      const prices = await Promise.all(
        Array.from({ length: 20 }, () =>
          call("service_role", `select public.reservation_notice_provider_event($1, 'sms', 'SMcarrera00000000', 'price', 0.10, 'EUR', null) as r`, [smsItem.notice_id]),
        ),
      );
      if (prices.some((p) => !p.ok)) fail(`un webhook de precio terminó con error: ${prices.find((p) => !p.ok).error}`);
      const { rows: corrections } = await admin.query(
        `select count(*)::int as n, coalesce(sum(amount_micros), 0)::bigint as net from public.agent_balance_entries where source_id = $1 and source_type = 'notification'`,
        [smsItem.notice_id],
      );
      if (String(corrections[0].net) !== "-100000") fail(`el SMS debía quedar cobrado a 0,10 € (−100000) y está en ${corrections[0].net}`);
      if (corrections[0].n !== 2) fail(`debían ser dos apuntes (el cobro y UNA corrección) y son ${corrections[0].n}`);
    }

    // 6 · «Entregado» y «no entregable» a la vez sobre el mismo WhatsApp enviado.
    const [raceNotice] = await queueWhatsApp(admin, EST[3], 1);
    const raceClaim = await claim(EST[3], 1);
    const raceItem = raceClaim.ok ? raceClaim.rows[0].items[0] : undefined;
    if (!raceItem) {
      fail(`no se reclamó el WhatsApp de la prueba 6: ${JSON.stringify(raceClaim)}`);
    } else {
      await call("service_role", `select public.report_reservation_notice($1, $2, 'sent', 'meta', 'wamid.carrera6', null)`, [raceNotice, raceItem.attempt]);
      const mixed = await Promise.all([
        ...Array.from({ length: 5 }, () => call("service_role", `select public.reservation_notice_provider_event($1, 'meta', 'wamid.carrera6', 'delivered') as r`, [raceNotice])),
        ...Array.from({ length: 5 }, () => call("service_role", `select public.reservation_notice_provider_event($1, 'meta', 'wamid.carrera6', 'undeliverable', null, null, 'meta_131026') as r`, [raceNotice])),
      ]);
      if (mixed.some((m) => !m.ok)) fail(`un suceso mezclado terminó con error: ${mixed.find((m) => !m.ok).error}`);
      const { rows: final } = await admin.query(`select status from public.reservation_notifications where id = $1`, [raceNotice]);
      const { rows: refunded } = await admin.query(`select count(*)::int as n from public.agent_balance_entries where source_id = $1 and kind = 'refund'`, [raceNotice]);
      const { rows: backup } = await admin.query(`select count(*)::int as n from public.reservation_notifications where fallback_of = $1`, [raceNotice]);
      if (final[0].status === "delivered" && (refunded[0].n !== 0 || backup[0].n !== 0)) fail("un aviso entregado quedó devuelto o con SMS de respaldo");
      if (final[0].status === "failed" && (refunded[0].n !== 1 || backup[0].n !== 1)) fail(`un aviso no entregable debía devolverse UNA vez y tener UN respaldo: ${JSON.stringify({ refunded, backup })}`);
      if (final[0].status !== "delivered" && final[0].status !== "failed") fail(`el aviso quedó en un estado raro: ${final[0].status}`);
    }

    // 7 · Reclamos a la vez con altas de la agenda, con la anonimización de un restaurante cerrado y cruzados.
    await topup(admin, EST[4], 5000000);
    await topup(admin, EST[6], 5000000);
    await queueWhatsApp(admin, EST[4], 6, { phonePrefix: "+346100" });
    await queueWhatsApp(admin, EST[6], 6, { phonePrefix: "+346200" });
    await queueWhatsApp(admin, EST[5], 3, { phonePrefix: "+346300" });
    // El restaurante se cierra con sus avisos en cola: la anonimización los tiene que encontrar.
    await admin.query(`update public.reservation_settings set service_status = 'closed', closed_at = now() where establishment_id = $1`, [EST[5]]);
    const bookings = Array.from({ length: 10 }, (_, i) =>
      call(
        "service_role",
        `select public.book_reservation($1, null, current_date + 20 + $2::int, '21:00', 2, 'Cliente agenda carrera', null, $3, null, 'es', 'web', false, $4, false, null) as r`,
        [EST[4], i, `agenda${i}@restaurante-real.es`, `carrera-avisos-${i}`],
      ),
    );
    const mixedWork = await Promise.all([
      ...Array.from({ length: 3 }, () => claim(EST[4])),
      ...Array.from({ length: 3 }, () => claim(EST[6])),
      ...Array.from({ length: 2 }, () => call("service_role", `select public.reservations_purge($1, now()) as r`, [EST[5]])),
      ...Array.from({ length: 2 }, () => claim(EST[5])),
      ...bookings,
    ]);
    const deadlocks = mixedWork.filter((m) => !m.ok && m.deadlock);
    if (deadlocks.length > 0) fail(`interbloqueo entre el reclamo, la agenda y la anonimización: ${deadlocks[0].error}`);
    const bookingErrors = mixedWork.slice(-10).filter((b) => !b.ok);
    if (bookingErrors.length > 0) fail(`un alta de la agenda terminó con error al convivir con los reclamos: ${bookingErrors[0].error}`);
    const bookedOutcomes = mixedWork.slice(-10).filter((b) => b.ok).map((b) => b.rows[0].r.outcome);
    if (bookedOutcomes.some((o) => o !== "accepted")) fail(`un alta debía aceptarse: ${JSON.stringify(bookedOutcomes)}`);
    const { rows: agendaNotices } = await admin.query(
      `select count(*)::int as n from public.reservation_notifications where establishment_id = $1 and template = 'confirmed' and reservation_id in (select id from public.reservations where customer_name = 'Cliente agenda carrera')`,
      [EST[4]],
    );
    if (agendaNotices[0].n !== 10) fail(`cada alta debía dejar su aviso (10) y dejó ${agendaNotices[0].n}`);
    // Un restaurante anonimizado no deja avisos sin cerrar ni cobros sin devolver.
    const { rows: leftovers } = await admin.query(
      `select count(*)::int as n from public.reservation_notifications where establishment_id = $1 and status = 'queued' and anonymized_at is not null`,
      [EST[5]],
    );
    if (leftovers[0].n !== 0) fail("quedaron avisos en cola de un restaurante anonimizado");
  } finally {
    await cleanup(admin).catch((error) => console.error(`limpieza: ${error.message}`));
    await admin.end();
  }

  if (failed) {
    console.error("avisos-concurrency-test: HAY FALLOS");
  } else {
    console.log("avisos-concurrency-test: OK (un aviso sale y se cobra una vez; sin interbloqueos)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
