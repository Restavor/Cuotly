import { describe, expect, it } from "vitest";
import {
  assignmentOutcome,
  buildDryRunReport,
  isServiceRunning,
  selectRestaurants,
  type DryRunInput,
  type MenuInfo,
  type QueueItem,
  type RestaurantActivation,
  type RestaurantInfo,
} from "./dry-run.ts";

const MADRID = "Europe/Madrid";
const AGENT = "agent-0000";
const SPACE = "space-demo";
/** Sábado 03/10/2026, 21:30 en Madrid (CEST). */
const NOW = new Date("2026-10-03T19:30:00Z");

function restaurant(extra: Partial<RestaurantInfo> = {}): RestaurantInfo {
  return {
    id: "est-bar-demo",
    code: "EST-0001",
    name: "Bar Demo",
    spaceId: SPACE,
    status: "active",
    webPlatform: "landing_site",
    websiteUrl: "https://www.restavor.com/pruebas-agente-menu",
    permanentlyDeleted: false,
    ...extra,
  };
}

function item(id: string, targetDate: string, extra: Partial<QueueItem> = {}): QueueItem {
  return {
    menuId: id,
    publicationId: `pub-${id}`,
    establishmentId: "est-bar-demo",
    establishmentName: "Bar Demo",
    name: "Menú del día",
    kind: "daily",
    targetDate,
    state: "pending_assignment",
    requestedAt: new Date("2026-10-03T19:00:00Z"),
    publishByAt: null,
    isAssigned: false,
    assignedTo: null,
    assignmentMode: null,
    ...extra,
  };
}

function activated(r: RestaurantInfo = restaurant()): RestaurantActivation[] {
  return [{ restaurant: r, activated: true, serviceRunning: !["paused", "suspended", "read_only", "archived"].includes(r.status) }];
}

function report(queue: QueueItem[], extra: Partial<DryRunInput> = {}) {
  const r = buildDryRunReport({
    now: NOW,
    agentUserId: AGENT,
    timeZones: new Map([[SPACE, MADRID]]),
    restaurants: activated(),
    queue,
    menus: [],
    ...extra,
  });
  if (!r.ok) throw new Error(`error inesperado: ${r.error}`);
  return r.value;
}

/** «id:acción» (y la hora UTC si espera), en el orden del informe. */
function brief(queue: QueueItem[], extra: Partial<DryRunInput> = {}): string[] {
  return report(queue, extra).lines.map((l) => {
    const a = l.action;
    if (a.kind === "publish_now") return `${l.item.menuId}:publish_now(${a.order}/${a.of})`;
    if (a.kind === "wait_until") return `${l.item.menuId}:wait_until(${a.at.toISOString()})`;
    if (a.kind === "report_error") return `${l.item.menuId}:error(${a.reason})`;
    return `${l.item.menuId}:${a.kind}`;
  });
}

describe("seco · cuándo tocaría publicar (RA-01, decisión 156), con el reloj fijo en el sábado 03/10/2026 21:30", () => {
  it("RA-01 · un menú de hoy sin asignar: la tomaría y publicaría ya", () => {
    expect(brief([item("hoy", "2026-10-03")])).toEqual(["hoy:publish_now(1/1)"]);
    expect(report([item("hoy", "2026-10-03")]).lines[0]?.assignment).toBe("would_take");
  });

  it("RA-01 · un menú de mañana espera a las 07:00 de mañana (05:00 UTC en horario de verano), no se publica ya", () => {
    expect(brief([item("manana", "2026-10-04")])).toEqual(["manana:wait_until(2026-10-04T05:00:00.000Z)"]);
  });

  it("RA-01 · un menú de dentro de 3 días espera a las 07:00 de ese día, no a la víspera", () => {
    expect(brief([item("tres", "2026-10-06")])).toEqual(["tres:wait_until(2026-10-06T05:00:00.000Z)"]);
  });

  it("RA-01 · el menú de ayer no se publica: se reportaría el error «fecha pasada»", () => {
    expect(brief([item("ayer", "2026-10-02")])).toEqual(["ayer:error(date_in_past)"]);
  });

  it("RA-01 · hoy y mañana a la vez: el de hoy se publica ya y el de mañana espera (las dos filas, por fecha)", () => {
    expect(brief([item("manana", "2026-10-04"), item("hoy", "2026-10-03")])).toEqual([
      "hoy:publish_now(1/1)",
      "manana:wait_until(2026-10-04T05:00:00.000Z)",
    ]);
  });

  it("RA-01 · uno de hoy pedido a las 8:00 y otro de hoy a las 9:00: los dos se publicarían al llegar, el más antiguo primero", () => {
    const a = item("a-8h", "2026-10-03", { requestedAt: new Date("2026-10-03T06:00:00Z") });
    const b = item("b-9h", "2026-10-03", { requestedAt: new Date("2026-10-03T07:00:00Z") });
    expect(brief([b, a])).toEqual(["a-8h:publish_now(1/2)", "b-9h:publish_now(2/2)"]);
  });

  it("RA-01 · cambio de hora: a las 00:30 del domingo 25/10 (aún CEST) un menú del lunes 26 espera a las 07:00 CET = 06:00 UTC", () => {
    const now = new Date("2026-10-24T22:30:00Z");
    expect(brief([item("lunes", "2026-10-26")], { now })).toEqual(["lunes:wait_until(2026-10-26T06:00:00.000Z)"]);
  });

  it("RA-01 · una vez pasadas las 07:00 del día del menú, ese día es «hoy»: se publica ya", () => {
    const now = new Date("2026-10-04T08:00:00Z"); // 10:00 CEST del 04/10
    expect(brief([item("manana", "2026-10-04")], { now })).toEqual(["manana:publish_now(1/1)"]);
  });
});

describe("seco · asignación informativa (RA-02, PRD §7.2)", () => {
  const cases: [string, Partial<QueueItem>, string][] = [
    ["sin asignar", { state: "pending_assignment", isAssigned: false }, "would_take"],
    ["ya del agente", { state: "assigned", isAssigned: true, assignedTo: AGENT, assignmentMode: "auto" }, "own"],
    ["asignada automáticamente a una persona y sin empezar", { state: "assigned", isAssigned: true, assignmentMode: "auto" }, "would_reassign"],
    ["asignada a mano a una persona", { state: "assigned", isAssigned: true, assignmentMode: "manual" }, "hands_off"],
    ["en revisión con una persona", { state: "reviewing", isAssigned: true, assignmentMode: "auto" }, "hands_off"],
    ["lista para publicar con una persona", { state: "ready_to_publish", isAssigned: true, assignmentMode: "auto" }, "hands_off"],
    ["necesita información con una persona", { state: "needs_information", isAssigned: true, assignmentMode: "auto" }, "hands_off"],
    ["con error de publicación y una persona (sin regla)", { state: "publication_error", isAssigned: true, assignmentMode: "auto" }, "no_rule"],
    ["publicación pedida y todavía sin asignar (sin regla)", { state: "publication_requested", isAssigned: false }, "no_rule"],
  ];
  it.each(cases)("RA-02 · %s → %s", (_nombre, extra, esperado) => {
    expect(assignmentOutcome(item("m", "2026-10-03", extra), AGENT)).toBe(esperado);
  });

  it("RA-02 · lo que una persona cogió a propósito no se toca: ni publicar ni esperar, aunque la fecha sea de hoy", () => {
    expect(brief([item("m", "2026-10-03", { state: "assigned", isAssigned: true, assignmentMode: "manual" })])).toEqual([
      "m:hands_off",
    ]);
  });

  it("RA-02 · lo asignado automáticamente a una persona y sin empezar se reasignaría y entonces se publicaría ya", () => {
    expect(brief([item("m", "2026-10-03", { state: "assigned", isAssigned: true, assignmentMode: "auto" })])).toEqual([
      "m:publish_now(1/1)",
    ]);
  });

  it("RA-02 · un estado sin regla en el PRD no actúa y se dice «sin regla» en vez de inventar una", () => {
    expect(brief([item("m", "2026-10-03", { state: "publication_error", isAssigned: true, assignmentMode: "auto" })])).toEqual([
      "m:no_rule",
    ]);
  });
});

describe("seco · lo que el agente no toca (RA-07)", () => {
  it("RA-07 · un menú que no es «daily» no se toca, aunque sea del restaurante activado", () => {
    expect(brief([item("navidad", "2026-12-24", { kind: "christmas" })])).toEqual(["navidad:not_a_daily_menu"]);
  });

  it("RA-07 · con el servicio del restaurante detenido, lo cancelaría y lo devolvería al equipo sin tocar la web", () => {
    const stopped = activated(restaurant({ status: "suspended" }));
    expect(brief([item("m", "2026-10-03")], { restaurants: stopped })).toEqual(["m:service_stopped"]);
  });

  it.each(["paused", "suspended", "read_only", "archived"])("RA-07 · el estado %s del restaurante es servicio detenido", (status) => {
    expect(isServiceRunning(status)).toBe(false);
  });

  it.each(["configuring", "active", "ending"])("RA-07 · el estado %s del restaurante deja el servicio en marcha", (status) => {
    expect(isServiceRunning(status)).toBe(true);
  });

  it("RA-07 · un restaurante no activado no aparece en el informe", () => {
    const otro = item("otro", "2026-10-03", { establishmentId: "est-otro", establishmentName: "Otro" });
    expect(report([otro]).lines).toEqual([]);
  });
});

describe("seco · restaurantes activados a efectos de la prueba", () => {
  const bar = restaurant();
  const magarinos = restaurant({ id: "est-mag", code: "EST-0003", name: "Magariños", webPlatform: "landing_site" });
  const sinWeb = restaurant({ id: "est-otra", code: "EST-0004", name: "Otra web", webPlatform: "other" });
  const borrado = restaurant({ id: "est-del", code: "EST-0005", name: "Borrado", permanentlyDeleted: true });
  const noAutorizado = restaurant({ id: "est-no", code: "EST-0009", name: "No autorizado" });
  const all = [bar, magarinos, sinWeb, borrado, noAutorizado];
  const authorized = new Set([bar.id, magarinos.id, sinWeb.id, borrado.id]);

  it("solo entran los autorizados; de ellos se activan los de LandingSite no borrados", () => {
    const r = selectRestaurants(all, authorized);
    expect(r.map((x) => `${x.restaurant.code}:${x.activated ? "activado" : (x as { reason: string }).reason}`)).toEqual([
      "EST-0001:activado",
      "EST-0003:activado",
      "EST-0004:not_landing_site",
      "EST-0005:deleted",
    ]);
  });

  it("un restaurante que el agente puede leer pero no tiene autorizado ni siquiera sale", () => {
    expect(selectRestaurants(all, authorized).some((x) => x.restaurant.id === "est-no")).toBe(false);
  });

  it("el filtro por código o por id solo restringe", () => {
    const porCodigo = selectRestaurants(all, authorized, { restaurant: "est-0001" });
    expect(porCodigo.filter((x) => x.activated).map((x) => x.restaurant.code)).toEqual(["EST-0001"]);
    const porId = selectRestaurants(all, authorized, { restaurant: "est-mag" });
    expect(porId.filter((x) => x.activated).map((x) => x.restaurant.code)).toEqual(["EST-0003"]);
  });

  it("un filtro nunca activa un restaurante que no es de LandingSite", () => {
    const r = selectRestaurants(all, authorized, { restaurant: "EST-0004" });
    expect(r.filter((x) => x.activated)).toEqual([]);
  });
});

describe("seco · borradores y avisos", () => {
  const menu = (id: string, targetDate: string, state: string, extra: Partial<MenuInfo> = {}): MenuInfo => ({
    id,
    establishmentId: "est-bar-demo",
    kind: "daily",
    name: "Menú del día",
    targetDate,
    state,
    publishedAt: null,
    ...extra,
  });

  it("los menús daily en borrador o preparados que no están en la cola salen como «sin publicación pedida»", () => {
    const r = report([], { menus: [menu("b1", "2026-10-05", "draft"), menu("b2", "2026-10-04", "prepared")] });
    expect(r.drafts.map((d) => d.menu.id)).toEqual(["b2", "b1"]); // por fecha
  });

  it("no salen los publicados, los cancelados, los de otro tipo ni los que ya están en la cola", () => {
    const menus = [
      menu("p", "2026-10-05", "published", { publishedAt: new Date("2026-10-04T05:00:00Z") }),
      menu("c", "2026-10-06", "cancelled"),
      menu("k", "2026-12-24", "draft", { kind: "christmas" }),
      menu("q", "2026-10-04", "draft"),
    ];
    expect(report([item("q", "2026-10-04")], { menus }).drafts).toEqual([]);
  });

  it("un menú de un día posterior publicado a mano da un aviso «sin regla» y NO bloquea al agente", () => {
    const menus = [menu("pub", "2026-10-05", "published", { publishedAt: new Date("2026-10-03T10:00:00Z") })];
    const r = report([item("hoy", "2026-10-03")], { menus });
    expect(r.warnings).toEqual([
      { kind: "later_day_published_by_hand", restaurantName: "Bar Demo", menuDate: "2026-10-03", laterDate: "2026-10-05" },
    ]);
    expect(r.lines[0]?.action.kind).toBe("publish_now");
  });
});

describe("seco · resumen, determinismo y errores", () => {
  it("el resumen cuenta cada acción", () => {
    const r = report([
      item("hoy", "2026-10-03"),
      item("manana", "2026-10-04"),
      item("ayer", "2026-10-02"),
      item("mano", "2026-10-03", { state: "assigned", isAssigned: true, assignmentMode: "manual" }),
    ]);
    expect(r.summary).toEqual({
      publish_now: 1,
      wait_until: 1,
      report_error: 1,
      hands_off: 1,
      no_rule: 0,
      not_a_daily_menu: 0,
      service_stopped: 0,
    });
  });

  it("el resultado no depende del orden en que llegan las filas de la cola", () => {
    const rows = [item("c", "2026-10-06"), item("a", "2026-10-03"), item("d", "2026-10-02"), item("b", "2026-10-04")];
    const esperado = brief(rows);
    expect(brief([...rows].reverse())).toEqual(esperado);
    expect(brief([rows[2] as QueueItem, rows[0] as QueueItem, rows[3] as QueueItem, rows[1] as QueueItem])).toEqual(esperado);
  });

  it("no muta lo que recibe", () => {
    const queue = Object.freeze([Object.freeze(item("hoy", "2026-10-03"))]) as unknown as QueueItem[];
    expect(() => report(queue)).not.toThrow();
  });

  it("cada línea trae la fecha de «hoy» en la zona del espacio (a las 23:30 UTC de invierno ya es mañana en Madrid)", () => {
    const now = new Date("2026-02-10T23:30:00Z");
    const r = report([item("x", "2026-02-11")], { now });
    expect(r.lines[0]?.today).toBe("2026-02-11");
    expect(r.lines[0]?.action.kind).toBe("publish_now");
  });

  it("una zona horaria que falta, o un reloj inválido, son un error explícito", () => {
    const base = { agentUserId: AGENT, restaurants: activated(), queue: [item("m", "2026-10-03")], menus: [] };
    expect(buildDryRunReport({ ...base, now: NOW, timeZones: new Map() })).toEqual({ ok: false, error: "invalid_time_zone" });
    expect(buildDryRunReport({ ...base, now: new Date("x"), timeZones: new Map([[SPACE, MADRID]]) })).toEqual({
      ok: false,
      error: "invalid_now",
    });
  });
});
