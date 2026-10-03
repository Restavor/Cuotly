import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NOTICE_ERROR_CODE_PATTERN,
  NOTICE_LEASE_MINUTES,
  NOTICE_MAX_ATTEMPTS,
  NOTICE_RETRY_MINUTES,
  NOTICE_SKIP_REASONS,
  NOTICE_STATUSES,
  NOTICE_TEMPLATES,
  PHONE_COUNTRY_PREFIXES,
} from "./notices";

/**
 * Fase F · lo que el dominio sabe de los avisos es lo que hace la base de datos. La base manda (la migración 179 es lo
 * que se ejecuta); el dominio habla igual para que el servidor y las pantallas no digan otra cosa. Si una de las dos
 * cambia sola, estos tests fallan.
 */
const MIGRACIONES = join(process.cwd(), "..", "..", "supabase", "migrations");
const m179 = readFileSync(join(MIGRACIONES, "20261003000179_reservas_avisos_a_comensales.sql"), "utf8");
const m166 = readFileSync(join(MIGRACIONES, "20261002000166_reservas_el_saldo_y_los_avisos.sql"), "utf8");

function lista(sql: string, patron: RegExp): string[] {
  const match = patron.exec(sql);
  if (!match) throw new Error(`No se encontró ${patron}`);
  return [...match[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe("RN-RES-10 · el dominio dice lo mismo que la migración 179", () => {
  it("RN-RES-10 · los motivos por los que un aviso no sale son los de la restricción de la tabla", () => {
    const sql = lista(m179, /add constraint reservation_notifications_skip_reason_check\s+check \(skip_reason in \(([^)]*)\)/);
    expect([...sql].sort()).toEqual([...NOTICE_SKIP_REASONS].sort());
  });

  it("RN-RES-10 · las seis plantillas y los cinco estados son los de la tabla de avisos (migración 166)", () => {
    expect(lista(m166, /template text not null check \(template in \(([^)]*)\)/)).toEqual([...NOTICE_TEMPLATES]);
    expect(lista(m166, /status text not null default 'queued' check \(status in \(([^)]*)\)/)).toEqual([...NOTICE_STATUSES]);
  });

  it("RN-RES-10 · el prefijo de cada país es el de `reservation_phone_country()`", () => {
    const cuerpo = /create or replace function public\.reservation_phone_country[\s\S]*?\$\$;/.exec(m179)?.[0] ?? "";
    const sql = [...cuerpo.matchAll(/\('(\d+)', '([A-Z]{2})'\)/g)].map((m) => [m[1], m[2]]);
    expect(sql.length).toBeGreaterThan(40);
    expect(sql).toEqual(PHONE_COUNTRY_PREFIXES.map(([p, i]) => [p, i]));
  });

  it("decisión 155 · cuatro intentos, esperas de 1, 5 y 15 minutos y arriendo de 5", () => {
    expect(m179).toContain(`v_wait integer[] := array[${NOTICE_RETRY_MINUTES.join(", ")}]`);
    expect(m179).toContain(`if v_n.attempts >= ${NOTICE_MAX_ATTEMPTS} then`);
    expect(m179).toContain(`interval '${NOTICE_LEASE_MINUTES} minutes'`);
  });

  it("RN-RES-12 · el error de un aviso es un código con el mismo patrón en la base y en el dominio", () => {
    expect(m179).toContain(`error ~ '${NOTICE_ERROR_CODE_PATTERN.source}'`);
    expect(m179).toContain(`p_error ~ '${NOTICE_ERROR_CODE_PATTERN.source}'`);
  });

  it("decisión 154 · el enlace son los 32 primeros caracteres del token, con un índice único", () => {
    expect(m179).toContain("create unique index reservations_cancel_token_short_idx on public.reservations (left(cancel_token, 32))");
    expect(m179).toContain("p_token !~ '^[0-9a-f]{32}$'");
  });

  it("decisión 156 · el cobro del aviso usa la clave `notice:<id>:charge:<canal>` y una sola devolución por canal", () => {
    expect(m179).toContain("'notice:' || v_n.id::text || ':charge:' || v_n.channel");
    expect(m179).toContain("'notice:' || p_notice_id::text || ':refund:' || coalesce(v_n.channel, 'none')");
    expect(m179).toContain("'notice:' || v_id::text || ':price'");
  });

  it("RN-AGT-07 · el saldo se compara con «menor que» la tarifa: igual o mayor, sale", () => {
    expect(m179).toContain("if v_balance < v_rate then");
  });

  it("CLAUDE.md · toda función nueva de la migración se revoca a public, anon y authenticated (salvo las tres que comprueban permisos por su cuenta)", () => {
    // Estas tres las llama una persona con su sesión y comprueban el permiso dentro (`reservations_settings_actor`,
    // `has_capability`): se revocan a public y anon y se conceden a authenticated.
    const ABIERTAS_A_AUTHENTICATED = new Set(["set_notice_channels", "reservation_fake_notices", "reservation_fake_notice_event"]);
    const funciones = [...m179.matchAll(/create or replace function public\.([a-z_0-9]+)\(/g)].map((m) => m[1]!);
    const revocadas = new Map([...m179.matchAll(/revoke all on function public\.([a-z_0-9]+)\([^)]*\) from ([^;]+);/g)].map((m) => [m[1]!, m[2]!]));
    const sinRevocar = funciones.filter((f) => {
      if (f === "reservation_log_event" || f === "reservation_history" || f === "reservations_audit_setting") return false; // ya tenían sus privilegios
      const a = revocadas.get(f);
      if (a === undefined) return true;
      return ABIERTAS_A_AUTHENTICATED.has(f) ? !a.includes("public, anon") || a.includes("authenticated") : !a.includes("public, anon, authenticated");
    });
    expect(sinRevocar).toEqual([]);
    // Las tres abiertas se conceden solo a authenticated.
    for (const f of ABIERTAS_A_AUTHENTICATED) expect(m179).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated;`));
  });
});
