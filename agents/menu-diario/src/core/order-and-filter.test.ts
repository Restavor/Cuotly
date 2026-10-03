import { describe, expect, it } from "vitest";
import { orderAndFilter, type OrderDecision, type OrderTask } from "./order-and-filter.ts";
import { TASK_STATES, WEB_OCCUPYING_STATES, type TaskState } from "./task-state.ts";

const MADRID = "Europe/Madrid";
/** 19:00 en Madrid (CET) del 10/02/2026. */
const NOW = new Date("2026-02-10T18:00:00Z");

let seq = 0;
/**
 * Una tarea de prueba. `createdAt` crece con el orden en que se declara, para que el desempate sea predecible.
 * `publishFrom` ya está vencido por defecto: la función se prueba aislada. Con la decisión 156, una tarea de mañana no
 * estaría lista hasta mañana a las 07:00; aquí no importa porque `orderAndFilter` es una red de seguridad.
 */
function task(
  id: string,
  establishmentId: string,
  targetDate: string,
  state: TaskState,
  extra: Partial<OrderTask> = {},
): OrderTask {
  seq += 1;
  return {
    id,
    establishmentId,
    targetDate,
    state,
    publishFrom: new Date("2026-02-10T08:00:00Z"),
    createdAt: new Date(Date.UTC(2026, 1, 1, 0, 0, seq)),
    ...extra,
  };
}

function decide(tasks: readonly OrderTask[], now: Date = NOW) {
  const r = orderAndFilter(tasks, { now, timeZone: MADRID });
  if (!r.ok) throw new Error(`error inesperado: ${r.error}`);
  return r.value;
}

/** «id:acción» o «id:error:motivo», en el orden de salida: lee mejor en los tests. */
function brief(decisions: readonly OrderDecision<OrderTask>[]): string[] {
  return decisions.map((d) => (d.action === "publish" ? `${d.task.id}:publish` : `${d.task.id}:error:${d.reason}`));
}

describe("RA-01 · regla de orden: una tarea no se publica si hay otra de un día posterior ya publicada o en curso", () => {
  it("RA-01 · el de hoy llega después de que el de mañana ya se publicó: se reporta error y no se toca la web", () => {
    const decisions = decide([task("A", "R1", "2026-02-11", "published"), task("B", "R1", "2026-02-10", "ready")]);
    expect(brief(decisions)).toEqual(["B:error:later_day_already_published"]);
    expect(decisions[0]).toMatchObject({ action: "report_error", blockedBy: "A" });
  });

  it.each(["publishing", "verifying", "published"] as const)(
    "RA-01 · una tarea posterior en estado %s bloquea a la anterior",
    (estado) => {
      expect(brief(decide([task("A", "R1", "2026-02-11", estado), task("B", "R1", "2026-02-10", "ready")]))).toEqual([
        "B:error:later_day_already_published",
      ]);
    },
  );

  it("RA-01 · los estados que ocupan la web son exactamente publishing, verifying y published", () => {
    expect([...WEB_OCCUPYING_STATES]).toEqual(["publishing", "verifying", "published"]);
  });

  it.each(["preparing", "waiting", "error", "session_blocked", "cancelled", "returned"] as const)(
    "RA-01 · una tarea posterior en estado %s NO bloquea",
    (estado) => {
      expect(brief(decide([task("A", "R1", "2026-02-11", estado), task("B", "R1", "2026-02-10", "ready")]))).toEqual([
        "B:publish",
      ]);
    },
  );

  it("RA-01 · otro restaurante no bloquea", () => {
    expect(brief(decide([task("A", "R2", "2026-02-11", "published"), task("B", "R1", "2026-02-10", "ready")]))).toEqual([
      "B:publish",
    ]);
  });

  it("RA-01 · la misma fecha no bloquea: uno de hoy a las 8:00 ya publicado y otro de hoy a las 9:00 se publica", () => {
    expect(brief(decide([task("A", "R1", "2026-02-10", "published"), task("B", "R1", "2026-02-10", "ready")]))).toEqual([
      "B:publish",
    ]);
  });

  it("RA-01 · una tarea publicada de dentro de 3 días también bloquea; una de la misma fecha no", () => {
    expect(brief(decide([task("A", "R1", "2026-02-13", "published"), task("B", "R1", "2026-02-10", "ready")]))).toEqual([
      "B:error:later_day_already_published",
    ]);
  });

  it("RA-01 · si bloquean varias, blockedBy es la de fecha más lejana (y, a igual fecha, la de id menor)", () => {
    const decisions = decide([
      task("A", "R1", "2026-02-11", "published"),
      task("C", "R1", "2026-02-13", "verifying"),
      task("B", "R1", "2026-02-13", "published"),
      task("Z", "R1", "2026-02-10", "ready"),
    ]);
    expect(decisions[0]).toMatchObject({ action: "report_error", blockedBy: "B" });
  });
});

describe("RA-01 · orden de proceso", () => {
  it("RA-01 · dos tareas del mismo restaurante en la misma ejecución: primero la de hoy, luego la de mañana", () => {
    expect(brief(decide([task("A", "R1", "2026-02-11", "ready"), task("B", "R1", "2026-02-10", "ready")]))).toEqual([
      "B:publish",
      "A:publish",
    ]);
  });

  it("RA-01 · dos tareas listas del mismo restaurante y fecha: la más antigua primero, así la última queda en la web", () => {
    const vieja = task("zeta", "R1", "2026-02-10", "ready");
    const nueva = task("alfa", "R1", "2026-02-10", "ready");
    expect(brief(decide([nueva, vieja]))).toEqual(["zeta:publish", "alfa:publish"]);
  });

  it("RA-01 · a igual fecha y creación, el id desempata", () => {
    const mismoInstante = new Date("2026-02-01T00:00:00Z");
    const b = task("b", "R1", "2026-02-10", "ready", { createdAt: mismoInstante });
    const a = task("a", "R2", "2026-02-10", "ready", { createdAt: mismoInstante });
    expect(brief(decide([b, a]))).toEqual(["a:publish", "b:publish"]);
  });

  it("RA-01 · orden global por fecha de menú ascendente entre restaurantes", () => {
    const tasks = [
      task("r1-12", "R1", "2026-02-12", "ready"),
      task("r2-10", "R2", "2026-02-10", "ready"),
      task("r1-11", "R1", "2026-02-11", "ready"),
      task("r2-11", "R2", "2026-02-11", "ready"),
    ];
    expect(brief(decide(tasks))).toEqual(["r2-10:publish", "r1-11:publish", "r2-11:publish", "r1-12:publish"]);
  });

  it("RA-01 · el resultado no depende del orden en que llegan las tareas (24 permutaciones)", () => {
    const base = [
      task("p1", "R1", "2026-02-12", "ready"),
      task("p2", "R2", "2026-02-10", "ready"),
      task("p3", "R1", "2026-02-11", "ready"),
      task("p4", "R2", "2026-02-11", "ready"),
    ];
    const esperado = brief(decide(base));
    const permutaciones = (xs: OrderTask[]): OrderTask[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
    const todas = permutaciones(base);
    expect(todas).toHaveLength(24);
    for (const p of todas) expect(brief(decide(p))).toEqual(esperado);
  });

  it("RA-01 · solo las tareas ready generan decisión (las otras nueve no salen)", () => {
    const tasks = TASK_STATES.map((estado) => task(`t-${estado}`, "R1", "2026-02-10", estado));
    expect(brief(decide(tasks))).toEqual(["t-ready:publish"]);
  });

  it("RA-01 · una lista vacía da una lista vacía", () => {
    expect(decide([])).toEqual([]);
  });

  it("RA-01 · una tarea ready cuya hora aún no ha llegado se ignora; la que llega justo ahora se procesa", () => {
    const futura = task("futura", "R1", "2026-02-10", "ready", { publishFrom: new Date("2026-02-10T18:00:00.001Z") });
    const justo = task("justo", "R1", "2026-02-10", "ready", { publishFrom: NOW });
    expect(brief(decide([futura, justo]))).toEqual(["justo:publish"]);
  });
});

describe("RA-01 · fecha pasada se vuelve a comprobar al decidir", () => {
  it("RA-01 · una tarea lista de ayer se reporta como fecha pasada", () => {
    expect(brief(decide([task("B", "R1", "2026-02-09", "ready")]))).toEqual(["B:error:date_in_past"]);
  });

  it("RA-01 · fecha pasada gana sobre «día posterior ya publicado»", () => {
    const decisions = decide([task("A", "R1", "2026-02-11", "published"), task("B", "R1", "2026-02-09", "ready")]);
    expect(brief(decisions)).toEqual(["B:error:date_in_past"]);
    expect(decisions[0]).not.toHaveProperty("blockedBy");
  });

  it("RA-01 · cambio de hora de marzo: a las 00:30 del lunes 30 el menú del domingo 29 ya es pasado y el del lunes se publica", () => {
    const ahora = new Date("2026-03-29T22:30:00Z"); // 00:30 CEST del lunes 30
    const tasks = [task("dom", "R1", "2026-03-29", "ready"), task("lun", "R1", "2026-03-30", "ready")];
    expect(brief(decide(tasks, ahora))).toEqual(["dom:error:date_in_past", "lun:publish"]);
  });

  it("RA-01 · cambio de hora de octubre: a las 23:30 del domingo 25 el menú del domingo aún se publica; a las 00:00 ya es pasado", () => {
    const tasks = [task("dom", "R1", "2026-10-25", "ready", { publishFrom: new Date("2026-10-25T05:00:00Z") })];
    expect(brief(decide(tasks, new Date("2026-10-25T22:30:00Z")))).toEqual(["dom:publish"]);
    expect(brief(decide(tasks, new Date("2026-10-25T23:00:00Z")))).toEqual(["dom:error:date_in_past"]);
  });
});

describe("RA-01 · una tarea lista con datos corruptos se reporta, no se publica ni se descarta en silencio", () => {
  it("RA-01 · una fecha que no es «AAAA-MM-DD» real se reporta (sin esto, '2026-2-9' se compararía como texto y publicaría el menú de ayer)", () => {
    const decisions = decide([task("mala", "R1", "2026-2-9", "ready"), task("buena", "R1", "2026-02-10", "ready")]);
    expect(brief(decisions)).toEqual(["buena:publish", "mala:error:invalid_task_data"]);
  });

  it.each(["2026-02-30", "10/02/2026", ""])("RA-01 · la fecha %j se reporta como datos no válidos", (fecha) => {
    expect(brief(decide([task("t", "R1", fecha, "ready")]))).toEqual(["t:error:invalid_task_data"]);
  });

  it("RA-01 · una hora ilegible (publishFrom) se reporta: antes se descartaba sin aviso", () => {
    const mala = task("mala", "R1", "2026-02-10", "ready", { publishFrom: new Date("x") });
    expect(brief(decide([mala]))).toEqual(["mala:error:invalid_task_data"]);
  });

  it("RA-01 · una creación ilegible (createdAt) se reporta y no descuadra el orden de las demás (24 permutaciones)", () => {
    const base = [
      task("c1", "R1", "2026-02-11", "ready"),
      task("c2", "R1", "2026-02-10", "ready"),
      task("c3", "R2", "2026-02-10", "ready"),
      task("rota", "R2", "2026-02-10", "ready", { createdAt: new Date("x") }),
    ];
    const esperado = ["c2:publish", "c3:publish", "c1:publish", "rota:error:invalid_task_data"];
    const permutaciones = (xs: OrderTask[]): OrderTask[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
    for (const p of permutaciones(base)) expect(brief(decide(p))).toEqual(esperado);
  });

  it("RA-01 · las corruptas salen al final, por id", () => {
    const decisions = decide([
      task("z", "R1", "x", "ready"),
      task("a", "R1", "y", "ready"),
      task("ok", "R1", "2026-02-10", "ready"),
    ]);
    expect(brief(decisions)).toEqual(["ok:publish", "a:error:invalid_task_data", "z:error:invalid_task_data"]);
  });

  it("RA-01 · una tarea de otro estado con datos corruptos no genera decisión", () => {
    expect(decide([task("t", "R1", "x", "published"), task("u", "R1", "y", "waiting")])).toEqual([]);
  });

  it("RA-01 · una tarea posterior con fecha corrupta no bloquea ni rompe la comparación", () => {
    expect(brief(decide([task("A", "R1", "2026-2-11", "published"), task("B", "R1", "2026-02-10", "ready")]))).toEqual([
      "B:publish",
    ]);
  });
});

describe("RA-01 · pureza", () => {
  it("RA-01 · no muta la entrada ni su orden", () => {
    const tasks = Object.freeze([
      Object.freeze(task("A", "R1", "2026-02-11", "ready")),
      Object.freeze(task("B", "R1", "2026-02-10", "ready")),
    ]);
    expect(() => decide(tasks)).not.toThrow();
    expect(tasks.map((t) => t.id)).toEqual(["A", "B"]);
  });

  it("RA-01 · una zona horaria o un reloj inválidos son un error explícito, no una excepción", () => {
    expect(orderAndFilter([], { now: NOW, timeZone: "No/Existe" })).toEqual({ ok: false, error: "invalid_time_zone" });
    expect(orderAndFilter([], { now: new Date("x"), timeZone: MADRID })).toEqual({ ok: false, error: "invalid_now" });
  });
});
