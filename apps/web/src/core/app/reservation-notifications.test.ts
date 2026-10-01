import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOTIFICATION_EVENTS } from "../notifications";
import { RESERVATION_NOTIFICATION_EVENTS, reservationNotificationKeys } from "./reservation-notifications";

const MIGRACION = readFileSync(
  join(process.cwd(), "..", "..", "supabase", "migrations", "20261001000158_reservas_solicitudes_y_productos.sql"),
  "utf8",
);

describe("RN-APP-03 · los avisos de una solicitud de Reservas", () => {
  it("RN-APP-03 · cada aviso lleva la clave <tipo>:<solicitud>", () => {
    expect(reservationNotificationKeys("abc")).toEqual([
      "reservation_service_request:abc",
      "reservation_service_received:abc",
    ]);
  });

  it("RN-APP-03 · las claves y los tipos son los que escribe la migración 158", () => {
    for (const evento of RESERVATION_NOTIFICATION_EVENTS) {
      expect(MIGRACION, `la 158 no escribe la clave de «${evento}»`).toContain(`'${evento}:' || v_req.id::text`);
      expect(NOTIFICATION_EVENTS as readonly string[]).toContain(evento);
    }
  });
});
