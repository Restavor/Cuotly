import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RESERVATIONS_GRACE_DAYS,
  RESERVATIONS_GRACE_NOTICE_DAYS,
  RESERVATIONS_PAYMENT_NOTICE_DAYS,
  RESERVATIONS_PURGE_AFTER_DAYS,
  RESERVATIONS_PURGE_REMINDER_DAYS,
} from "./lifecycle";

/**
 * RN-RES-11 · los números del dominio y los de la base de datos son los mismos. La base manda (el barrido
 * `reservations_lifecycle_sweep()` es lo que se ejecuta); el dominio solo enseña «quedan N días». Si se separan, la
 * pantalla dice un plazo y la base aplica otro.
 */
const leer = (archivo: string) => readFileSync(join(process.cwd(), "..", "..", "supabase", "migrations", archivo), "utf8");
const barrido = leer("20261003000174_reservas_barrido_baja_y_cierre.sql");
const ajustes = leer("20261001000158_reservas_solicitudes_y_productos.sql");

describe("RN-RES-11 · el dominio dice lo mismo que la migración 174", () => {
  it("RN-RES-11 · 7 días de margen (`grace_days` por defecto)", () => {
    expect(ajustes).toMatch(/grace_days smallint not null default 7/);
    expect(RESERVATIONS_GRACE_DAYS).toBe(7);
  });

  it("RN-RES-11 · anonimizar a los 30 días del cierre, y el recordatorio 7 días antes", () => {
    expect(barrido).toContain(`interval '${RESERVATIONS_PURGE_AFTER_DAYS} days'`);
    expect(barrido).toContain(`interval '${RESERVATIONS_PURGE_AFTER_DAYS - RESERVATIONS_PURGE_REMINDER_DAYS} days'`);
    expect(RESERVATIONS_PURGE_AFTER_DAYS - RESERVATIONS_PURGE_REMINDER_DAYS).toBe(23);
  });

  it("RN-RES-11 · aviso de vencimiento cinco días antes, y segundo aviso de margen dos días antes", () => {
    expect(barrido).toContain(`interval '${RESERVATIONS_PAYMENT_NOTICE_DAYS} days'`);
    expect(barrido).toContain(`interval '${RESERVATIONS_GRACE_NOTICE_DAYS} days'`);
  });

  it("RN-RES-11 · la base reactiva solo dentro de los 30 días y antes del borrado", () => {
    expect(barrido).toMatch(/closed_at \+ interval '30 days' <= now\(\)/);
    expect(barrido).toMatch(/data_purged_at is not null/);
  });
});
