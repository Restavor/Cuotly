import { describe, expect, it } from "vitest";

import {
  CLIENT_ACTIVITY_KINDS,
  activityGroup,
  activityKey,
  filterActivity,
  monthRange,
  readActivityParams,
} from "./client-activity";

describe("R41 · la actividad del restaurante", () => {
  it("lee el mes, el tipo y el hecho elegido; lo mal escrito cae en lo de hoy", () => {
    expect(readActivityParams({ mes: "2026-08", tipo: "pagos", evento: "x" }, "2026-09-23")).toEqual({
      month: "2026-08",
      group: "pagos",
      selected: "x",
    });
    expect(readActivityParams({ mes: "2026-13", tipo: "otro" }, "2026-09-23")).toEqual({
      month: "2026-09",
      group: null,
      selected: null,
    });
  });

  it("CLAUDE.md · el mes va de medianoche a medianoche en la zona del espacio", () => {
    const { from, to } = monthRange("2026-09", "Europe/Madrid");
    // En septiembre Madrid va dos horas por delante de UTC.
    expect(from.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    // Y el 1 de octubre todavía en verano.
    expect(to.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    // Diciembre pasa al año siguiente, y en invierno la diferencia es una hora.
    expect(monthRange("2026-12", "Europe/Madrid").to.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("cada clase de hecho cae en un tipo de actividad", () => {
    for (const kind of CLIENT_ACTIVITY_KINDS) expect(activityGroup(kind)).toBeTruthy();
    expect(activityGroup("work_published")).toBe("solicitudes");
    expect(activityGroup("payment_recorded")).toBe("pagos");
    expect(activityGroup("menu_published")).toBe("menus");
  });

  it("filtra por tipo, ordena del más reciente y descarta clases que no se saben contar", () => {
    const filas = [
      { at: "2026-09-02T10:00:00Z", kind: "request_sent", entity_id: "a" },
      { at: "2026-09-05T10:00:00Z", kind: "payment_recorded", entity_id: "b" },
      { at: "2026-09-04T10:00:00Z", kind: "algo_nuevo", entity_id: "c" },
    ];
    expect(filterActivity(filas, null).map((f) => f.entity_id)).toEqual(["b", "a"]);
    expect(filterActivity(filas, "pagos").map((f) => f.entity_id)).toEqual(["b"]);
  });

  it("la clave distingue dos hechos de la misma clase sobre la misma cosa", () => {
    const a = activityKey({ at: "2026-09-02T10:00:00Z", kind: "receipt_uploaded", entity_id: "c1" });
    const b = activityKey({ at: "2026-09-03T10:00:00Z", kind: "receipt_uploaded", entity_id: "c1" });
    expect(a).not.toBe(b);
  });
});
