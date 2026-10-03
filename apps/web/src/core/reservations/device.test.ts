import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEVICE_OPERATIONS,
  MAX_PIN_ATTEMPTS,
  SETTINGS_IDLE_SECONDS,
  decodeDeviceAuthFailure,
  deviceRoleAllows,
  elevationSecondsLeft,
  encodeDeviceAuthFailure,
  isDeviceOperation,
  isElevationLive,
  isPin,
  minimumRoleFor,
  newElevation,
  normalizePin,
  parseActingResult,
  pinLockSeconds,
  routeDeviceRpc,
  type DeviceOperation,
  type DeviceRole,
} from "./device";

const MIGRATION = readFileSync(
  join(process.cwd(), "..", "..", "supabase", "migrations", "20261003000170_reservas_equipo_tablet_y_soporte.sql"),
  "utf8",
);

describe("RN-APP-06 · el PIN son 4 cifras", () => {
  it("RN-APP-06 · solo vale una cadena de exactamente 4 cifras", () => {
    expect(isPin("1234")).toBe(true);
    expect(isPin("0000")).toBe(true);
    for (const malo of ["123", "12345", "12a4", " 123", "1 234", "", "١٢٣٤"]) expect(isPin(malo)).toBe(false);
    expect(isPin(1234)).toBe(false);
    expect(isPin(null)).toBe(false);
  });

  it("RN-APP-06 · lo que escribe el teclado se limpia y se corta a 4", () => {
    expect(normalizePin("12-3 45")).toBe("1234");
    expect(normalizePin("abc")).toBe("");
  });
});

describe("RN-APP-07 · 5 PIN erróneos bloquean y el bloqueo crece", () => {
  it("RN-APP-07 · son 5 intentos", () => {
    expect(MAX_PIN_ATTEMPTS).toBe(5);
  });

  it("RN-APP-07 · la primera tanda dura 1 minuto, como pide el PRD; luego 5, 30 y 2 horas", () => {
    expect(pinLockSeconds(0)).toBe(60);
    expect(pinLockSeconds(1)).toBe(300);
    expect(pinLockSeconds(2)).toBe(1800);
    expect(pinLockSeconds(3)).toBe(7200);
    expect(pinLockSeconds(40)).toBe(7200);
  });

  it("RN-APP-07 · la base de datos usa los mismos números que el dominio", () => {
    const fn = /create or replace function public\.reservation_pin_lock_seconds[\s\S]*?\$\$;/.exec(MIGRATION)?.[0] ?? "";
    expect(fn).toContain("p_rounds <= 0 then 60");
    expect(fn).toContain("p_rounds = 1 then 300");
    expect(fn).toContain("p_rounds = 2 then 1800");
    expect(fn).toContain("else 7200");
    expect(MIGRATION).toContain("if v_failed >= 5 then");
    expect(MIGRATION).toContain("interval '24 hours'");
  });
});

describe("RN-APP-08 · qué puede pedir cada rol desde la tablet", () => {
  const roles: readonly DeviceRole[] = ["device", "staff", "manager", "owner"];
  const ops = Object.keys(DEVICE_OPERATIONS) as DeviceOperation[];

  it("RN-APP-08 · sin PIN solo se abre la ficha", () => {
    expect(ops.filter((op) => deviceRoleAllows("device", op))).toEqual(["open"]);
  });

  it("RN-APP-08 · el Equipo lleva la agenda pero no los ajustes ni el Equipo ni los dispositivos", () => {
    const delEquipo = ops.filter((op) => deviceRoleAllows("staff", op));
    expect(delEquipo).toEqual([
      "open", "book", "confirm", "reject", "cancel", "no_show", "undo_no_show", "dismiss_duplicate", "platform_cancel_done",
    ]);
    for (const op of ["save_shifts", "set_closed_date", "save_settings", "complete_onboarding", "staff_add", "staff_set_pin", "staff_remove", "device_revoke", "people", "history_log"] as const) {
      expect(deviceRoleAllows("staff", op)).toBe(false);
    }
  });

  it("RN-APP-08 · un Encargado y un Propietario pueden todo lo de la tablet", () => {
    for (const rol of ["manager", "owner"] as const) for (const op of ops) expect(deviceRoleAllows(rol, op)).toBe(true);
  });

  it("RN-APP-08 · cada rol puede lo de los de abajo", () => {
    for (const op of ops) {
      const minimo = minimumRoleFor(op);
      const idx = roles.indexOf(minimo);
      roles.forEach((rol, i) => expect(deviceRoleAllows(rol, op)).toBe(i >= idx));
    }
  });

  it("RN-APP-08 · una operación inventada no existe", () => {
    expect(isDeviceOperation("book")).toBe(true);
    expect(isDeviceOperation("drop_everything")).toBe(false);
    expect(isDeviceOperation("toString")).toBe(false);
    expect(isDeviceOperation("__proto__")).toBe(false);
  });

  it("RN-APP-08 · la base de datos pide el mismo rol mínimo para cada operación", () => {
    const bloque = /v_min := case p_operation([\s\S]*?)end;/.exec(MIGRATION)?.[1] ?? "";
    const sql = new Map<string, string>();
    for (const m of bloque.matchAll(/when '(\w+)' then '(\w+)'/g)) sql.set(m[1], m[2]);
    expect([...sql.keys()].sort()).toEqual([...ops].sort());
    for (const op of ops) expect(sql.get(op), op).toBe(DEVICE_OPERATIONS[op]);
  });

  it("RN-APP-08 · la base de datos despacha cada operación de la lista", () => {
    for (const op of ops) expect(MIGRATION, op).toMatch(new RegExp(`when '${op}' then (public\\.|\\(select)`));
  });
});

describe("RN-APP-08 · la agenda a través de la tablet", () => {
  it("RN-APP-08 · una escritura va por la puerta con su operación y sin el restaurante", () => {
    const route = routeDeviceRpc("cancel_reservation", { p_establishment_id: "e1", p_reservation_id: "r1", p_reason: "customer" });
    expect(route).toEqual({ kind: "act", operation: "cancel", args: { reservation_id: "r1", reason: "customer" } });
  });

  it("RN-APP-08 · el restaurante nunca lo pone quien llama: se descarta de los argumentos", () => {
    const route = routeDeviceRpc("book_reservation", { p_establishment_id: "OTRO", p_date: "2026-10-10", p_time: "21:00" });
    expect(route.kind).toBe("act");
    if (route.kind === "act") expect(route.args).not.toHaveProperty("establishment_id");
  });

  it("RN-APP-08 · las lecturas pasan y lo que la tablet no puede pedir se rechaza", () => {
    expect(routeDeviceRpc("reservations_search", {})).toEqual({ kind: "read" });
    expect(routeDeviceRpc("reservations_calendar", {})).toEqual({ kind: "read" });
    expect(routeDeviceRpc("agent_balance_cents", {})).toEqual({ kind: "refused" });
    expect(routeDeviceRpc("open_reservation_support_session", {})).toEqual({ kind: "refused" });
    expect(routeDeviceRpc("set_my_reservation_pin", {})).toEqual({ kind: "refused" });
    expect(routeDeviceRpc("activate_reservation_device", {})).toEqual({ kind: "refused" });
    expect(routeDeviceRpc("reservation_device_act", {})).toEqual({ kind: "refused" });
  });

  it("RN-APP-08 · todas las operaciones salvo la ficha tienen una función de la agenda que las pide", () => {
    const desdeFunciones = new Set<string>();
    for (const fn of [
      "open_reservation", "book_reservation", "confirm_reservation", "reject_reservation", "cancel_reservation", "mark_no_show",
      "undo_no_show", "dismiss_duplicate", "mark_platform_cancel_done", "save_reservation_shifts", "set_reservation_closed_date",
      "save_reservation_settings", "complete_reservations_onboarding", "add_reservation_staff", "set_reservation_staff_pin",
      "remove_reservation_staff", "revoke_reservation_device", "reservation_people", "reservation_history_log",
    ]) {
      const route = routeDeviceRpc(fn, {});
      expect(route.kind, fn).toBe("act");
      if (route.kind === "act") desdeFunciones.add(route.operation);
    }
    expect([...desdeFunciones].sort()).toEqual(Object.keys(DEVICE_OPERATIONS).sort());
  });
});

describe("RN-APP-08 · un acceso denegado", () => {
  it("RN-APP-08 · se codifica y se vuelve a leer", () => {
    for (const failure of [
      { code: "wrong_pin", remaining: 3 },
      { code: "locked", lockedUntil: "2026-10-03T10:00:00Z" },
      { code: "forbidden" },
      { code: "no_device" },
    ] as const) {
      expect(decodeDeviceAuthFailure(encodeDeviceAuthFailure(failure))).toEqual(failure);
    }
  });

  it("RN-APP-08 · un mensaje corriente, roto o con un código inventado no es un acceso denegado", () => {
    expect(decodeDeviceAuthFailure("Reserva no encontrada")).toBeNull();
    expect(decodeDeviceAuthFailure("DEVICE_AUTH:{no es json")).toBeNull();
    expect(decodeDeviceAuthFailure('DEVICE_AUTH:{"code":"admin"}')).toBeNull();
    expect(decodeDeviceAuthFailure("DEVICE_AUTH:null")).toBeNull();
  });

  it("RN-APP-08 · lo que contesta la puerta se traduce a un resultado de dominio", () => {
    expect(parseActingResult({ outcome: "acted", actor_role: "staff", actor_name: "Ana Ruiz", result: { outcome: "done" } })).toEqual({
      ok: true, actorRole: "staff", actorName: "Ana Ruiz", result: { outcome: "done" },
    });
    expect(parseActingResult({ outcome: "wrong", remaining: 2 })).toEqual({ ok: false, failure: { code: "wrong_pin", remaining: 2 } });
    expect(parseActingResult({ outcome: "locked", locked_until: "2026-10-03T10:00:00Z" })).toEqual({
      ok: false, failure: { code: "locked", lockedUntil: "2026-10-03T10:00:00Z" },
    });
    expect(parseActingResult({ outcome: "forbidden" })).toEqual({ ok: false, failure: { code: "forbidden" } });
    expect(parseActingResult({ outcome: "identity_invalid" })).toEqual({ ok: false, failure: { code: "identity_invalid" } });
    expect(parseActingResult({ outcome: "no_device" })).toEqual({ ok: false, failure: { code: "no_device" } });
    // Algo que no se entiende nunca se toma por un acierto.
    expect(parseActingResult(null)).toEqual({ ok: false, failure: { code: "no_device" } });
    expect(parseActingResult({ outcome: "ok" })).toEqual({ ok: false, failure: { code: "no_device" } });
  });
});

describe("RN-APP-08 · «Ajustes abiertos con PIN» caduca a los 2 minutos", () => {
  const ahora = Date.UTC(2026, 9, 3, 12, 0, 0);

  it("RN-APP-08 · vale 2 minutos, para ese restaurante y no para otro", () => {
    const e = newElevation("staff-1", "est-1", ahora);
    expect(SETTINGS_IDLE_SECONDS).toBe(120);
    expect(isElevationLive(e, "est-1", ahora)).toBe(true);
    expect(isElevationLive(e, "est-1", ahora + 119_000)).toBe(true);
    expect(isElevationLive(e, "est-1", ahora + 120_000)).toBe(false);
    expect(isElevationLive(e, "est-2", ahora)).toBe(false);
  });

  it("RN-APP-08 · los segundos que quedan nunca son negativos", () => {
    const e = newElevation("staff-1", "est-1", ahora);
    expect(elevationSecondsLeft(e, ahora)).toBe(120);
    expect(elevationSecondsLeft(e, ahora + 30_000)).toBe(90);
    expect(elevationSecondsLeft(e, ahora + 999_000)).toBe(0);
  });
});

import { DEVICE_COOKIE, ELEVATION_COOKIE, deviceOwnsRequest, isAgentsPath } from "./device";

describe("RN-APP-08 · cuándo manda el dispositivo en una petición", () => {
  it("RN-APP-08 · solo en Restavor agents y solo con la cookie del dispositivo", () => {
    expect(isAgentsPath("/agents")).toBe(true);
    expect(isAgentsPath("/agents/abc/reservas")).toBe(true);
    for (const ruta of ["/", "/web", "/agentsfake", "/espacios/restavor", "/api/agents/v1/health", "/cuenta/verificar"]) {
      expect(isAgentsPath(ruta), ruta).toBe(false);
    }
    expect(deviceOwnsRequest("/agents/abc/reservas", true)).toBe(true);
    expect(deviceOwnsRequest("/agents/abc/reservas", false)).toBe(false);
    expect(deviceOwnsRequest("/web", true)).toBe(false);
    // La raíz también: la tablet se salta el Inicio de Restavor app (PRD §3.3).
    expect(deviceOwnsRequest("/", true)).toBe(true);
    expect(deviceOwnsRequest("/", false)).toBe(false);
  });

  it("RN-APP-08 · las dos cookies son httpOnly por nombre distinto y no se pisan", () => {
    expect(DEVICE_COOKIE).not.toBe(ELEVATION_COOKIE);
    expect(DEVICE_COOKIE.startsWith("sb-")).toBe(false);
  });
});
