/**
 * `src/core/dry-run.ts` · qué haría el agente con cada menú, y cuándo (prueba en seco, PRD §14 «Fase 1»).
 *
 * Pura: recibe lo que el robot ha LEÍDO (restaurantes, cola de menús, menús) y devuelve un informe. No lee ni escribe
 * nada y no mira el reloj del sistema: «ahora» es un dato (decisión 158).
 *
 * Qué aplica de las reglas del PRD:
 *   - Restaurantes «activados» a efectos de la prueba (todavía no existe `agente_menu.restaurantes`, llega en la Fase 2):
 *     el agente está autorizado en ellos, su web es de LandingSite y no están borrados. La Fase 2 los sustituirá por la
 *     tabla que activa Bosco.
 *   - Asignación (PRD §7.2, RA-02), solo INFORMATIVA: qué haría el despachador de la Fase 2 con cada publicación.
 *   - Cuándo publica y en qué orden (RA-01, decisión 156): `computePublishFrom` y `orderAndFilter`.
 *   - Servicio detenido (PRD §6.2-6): si fuera suyo, lo cancelaría y lo devolvería al equipo, sin tocar la web.
 *
 * Lo que NO decide, porque el PRD no lo dice (no se inventa): un menú en `publication_requested` o en
 * `publication_error` asignado a una persona (`no_rule`), y si un menú de otro día publicado A MANO debe bloquear al
 * agente (se avisa, no se bloquea: la regla de orden solo mira tareas).
 */
import { tryLocalDateOf, type LocalDate, type TimeInputError } from "./local-time.ts";
import { orderAndFilter, type OrderReason, type OrderTask } from "./order-and-filter.ts";
import { computePublishFrom, type PublishFromError } from "./publish-from.ts";
import { err, ok, type Result } from "./result.ts";

// ---------------------------------------------------------------------------------------------- restaurantes

export type RestaurantInfo = {
  id: string;
  code: string;
  name: string;
  spaceId: string;
  /** `establishments.status`. */
  status: string;
  webPlatform: string | null;
  websiteUrl: string | null;
  permanentlyDeleted: boolean;
};

/** Estados en los que `assert_establishment_service_running` lanza error (RECONOCIMIENTO §2.6). `configuring`, `active` y `ending` pasan. */
export const SERVICE_STOPPED_STATUSES: readonly string[] = ["paused", "suspended", "read_only", "archived"];

export function isServiceRunning(status: string): boolean {
  return !SERVICE_STOPPED_STATUSES.includes(status);
}

export type RestaurantActivation =
  | { restaurant: RestaurantInfo; activated: true; serviceRunning: boolean }
  | { restaurant: RestaurantInfo; activated: false; reason: "not_landing_site" | "deleted" | "filtered_out" };

/**
 * De todos los restaurantes que el agente puede leer, solo entran en la prueba los que tiene AUTORIZADOS, y de esos se
 * activan los de LandingSite no borrados. `filter` (código `EST-0001` o id) solo RESTRINGE, nunca activa.
 */
export function selectRestaurants(
  restaurants: readonly RestaurantInfo[],
  authorizedIds: ReadonlySet<string>,
  filter: { restaurant?: string } = {},
): RestaurantActivation[] {
  const wanted = filter.restaurant?.trim().toLowerCase();
  return restaurants
    .filter((r) => authorizedIds.has(r.id))
    .map((restaurant): RestaurantActivation => {
      if (restaurant.permanentlyDeleted) return { restaurant, activated: false, reason: "deleted" };
      if (restaurant.webPlatform !== "landing_site") return { restaurant, activated: false, reason: "not_landing_site" };
      if (wanted !== undefined && wanted !== "" && restaurant.code.toLowerCase() !== wanted && restaurant.id.toLowerCase() !== wanted) {
        return { restaurant, activated: false, reason: "filtered_out" };
      }
      return { restaurant, activated: true, serviceRunning: isServiceRunning(restaurant.status) };
    })
    .sort((a, b) => (a.restaurant.code < b.restaurant.code ? -1 : a.restaurant.code > b.restaurant.code ? 1 : 0));
}

// ---------------------------------------------------------------------------------------------- lo que se lee

/** Una fila de `team_menu_queue` (solo menús con publicación viva), ya convertida a tipos de dominio. */
export type QueueItem = {
  menuId: string;
  publicationId: string | null;
  establishmentId: string;
  establishmentName: string;
  name: string;
  /** `menus.kind`: `daily`, `christmas`, `kids`, `groups`, `special_event`. */
  kind: string;
  targetDate: LocalDate;
  /** `menus.state`. */
  state: string;
  requestedAt: Date | null;
  /** Plazo objetivo (`menu_publish_by_at`). Informativo. */
  publishByAt: Date | null;
  isAssigned: boolean;
  /** La cola solo enseña `assigned_to` si es del propio agente. */
  assignedTo: string | null;
  assignmentMode: string | null;
};

/** Una fila de `menus`: sirve para enseñar los borradores y los menús ya publicados. */
export type MenuInfo = {
  id: string;
  establishmentId: string;
  kind: string;
  name: string;
  targetDate: LocalDate;
  state: string;
  publishedAt: Date | null;
};

// ---------------------------------------------------------------------------------------------- asignación (RA-02, informativa)

export type AssignmentOutcome = "own" | "would_take" | "would_reassign" | "hands_off" | "no_rule";

const STARTED_STATES: readonly string[] = ["reviewing", "ready_to_publish", "needs_information"];

/**
 * PRD §7.2, tabla de `agente_menu_asignar`. Solo informa de lo que haría el despachador (Fase 2): hoy no asigna nada.
 *   - ya es del agente → `own`;
 *   - sin asignar (`pending_assignment`) → `would_take`;
 *   - asignada A MANO a una persona, o con trabajo empezado → `hands_off` (la cogió una persona a propósito);
 *   - asignada automáticamente a una persona y el menú sigue en `assigned` → `would_reassign`;
 *   - cualquier otro caso (p. ej. `publication_requested` o `publication_error` con una persona) → `no_rule`.
 */
export function assignmentOutcome(item: QueueItem, agentUserId: string): AssignmentOutcome {
  if (item.assignedTo !== null && item.assignedTo === agentUserId) return "own";
  if (!item.isAssigned) return item.state === "pending_assignment" ? "would_take" : "no_rule";
  if (item.assignmentMode === "manual" || STARTED_STATES.includes(item.state)) return "hands_off";
  if (item.assignmentMode === "auto" && item.state === "assigned") return "would_reassign";
  return "no_rule";
}

// ---------------------------------------------------------------------------------------------- informe

export type DryRunAction =
  /** Tocaría publicar ya. `order` de `of`: posición en la ejecución (menús por fecha ascendente). */
  | { kind: "publish_now"; order: number; of: number }
  /** Aún no toca: `at` es el instante desde el que tocaría. */
  | { kind: "wait_until"; at: Date }
  | { kind: "report_error"; reason: OrderReason | PublishFromError }
  | { kind: "hands_off" }
  | { kind: "no_rule" }
  | { kind: "not_a_daily_menu" }
  /** Si fuera suyo: lo cancelaría y lo devolvería al equipo, sin tocar la web (PRD §6.2-6). */
  | { kind: "service_stopped" };

export type DryRunLine = {
  item: QueueItem;
  timeZone: string;
  /** La fecha de «hoy» en la zona del espacio de ese restaurante. */
  today: LocalDate;
  assignment: AssignmentOutcome;
  action: DryRunAction;
};

export type DraftLine = { menu: MenuInfo; restaurantName: string; timeZone: string; today: LocalDate };

export type DryRunWarning = {
  kind: "later_day_published_by_hand";
  restaurantName: string;
  menuDate: LocalDate;
  laterDate: LocalDate;
};

export type DryRunReport = {
  now: Date;
  restaurants: readonly RestaurantActivation[];
  lines: readonly DryRunLine[];
  drafts: readonly DraftLine[];
  warnings: readonly DryRunWarning[];
  summary: Readonly<Record<DryRunAction["kind"], number>>;
};

export type DryRunInput = {
  now: Date;
  agentUserId: string;
  /** Zona horaria de cada espacio (`spaces.timezone`), por id de espacio. */
  timeZones: ReadonlyMap<string, string>;
  restaurants: readonly RestaurantActivation[];
  queue: readonly QueueItem[];
  menus: readonly MenuInfo[];
};

const TAKES_THE_MENU: readonly AssignmentOutcome[] = ["own", "would_take", "would_reassign"];

function byQueueOrder(a: QueueItem, b: QueueItem): number {
  if (a.targetDate !== b.targetDate) return a.targetDate < b.targetDate ? -1 : 1;
  const ra = a.requestedAt?.getTime() ?? 0;
  const rb = b.requestedAt?.getTime() ?? 0;
  if (ra !== rb) return ra - rb;
  return a.menuId < b.menuId ? -1 : a.menuId > b.menuId ? 1 : 0;
}

export function buildDryRunReport(input: DryRunInput): Result<DryRunReport, TimeInputError> {
  const { now, agentUserId } = input;
  const activated = new Map<string, Extract<RestaurantActivation, { activated: true }>>();
  for (const a of input.restaurants) if (a.activated) activated.set(a.restaurant.id, a);

  const zoneOf = (spaceId: string): Result<{ timeZone: string; today: LocalDate }, TimeInputError> => {
    const timeZone = input.timeZones.get(spaceId);
    if (timeZone === undefined) return err("invalid_time_zone");
    const today = tryLocalDateOf(now, timeZone);
    if (!today.ok) return err(today.error);
    return ok({ timeZone, today: today.value });
  };

  type Pending = { item: QueueItem; timeZone: string; today: LocalDate; assignment: AssignmentOutcome; action?: DryRunAction; task?: OrderTask };
  const pending: Pending[] = [];

  for (const item of [...input.queue].sort(byQueueOrder)) {
    const restaurant = activated.get(item.establishmentId);
    if (restaurant === undefined) continue; // un restaurante que no está activado no se enseña ni se toca (RA-07)
    const zone = zoneOf(restaurant.restaurant.spaceId);
    if (!zone.ok) return err(zone.error);
    const assignment = assignmentOutcome(item, agentUserId);
    const entry: Pending = { item, timeZone: zone.value.timeZone, today: zone.value.today, assignment };
    pending.push(entry);

    if (item.kind !== "daily") {
      entry.action = { kind: "not_a_daily_menu" };
    } else if (!restaurant.serviceRunning) {
      entry.action = { kind: "service_stopped" };
    } else if (assignment === "hands_off") {
      entry.action = { kind: "hands_off" };
    } else if (!TAKES_THE_MENU.includes(assignment)) {
      entry.action = { kind: "no_rule" };
    } else {
      const from = computePublishFrom({ targetDate: item.targetDate, now, timeZone: zone.value.timeZone });
      if (!from.ok) {
        entry.action = { kind: "report_error", reason: from.error };
      } else {
        entry.task = {
          id: item.menuId,
          establishmentId: item.establishmentId,
          targetDate: item.targetDate,
          state: from.value.at.getTime() <= now.getTime() ? "ready" : "waiting",
          publishFrom: from.value.at,
          createdAt: item.requestedAt ?? now,
        };
        if (entry.task.state === "waiting") entry.action = { kind: "wait_until", at: from.value.at };
      }
    }
  }

  // Las tareas que ya tocan pasan por la regla de orden, por zona horaria (una ejecución por espacio).
  const zones = new Set(pending.filter((p) => p.task?.state === "ready").map((p) => p.timeZone));
  for (const timeZone of [...zones].sort()) {
    const group = pending.filter((p) => p.timeZone === timeZone && p.task !== undefined).map((p) => p.task as OrderTask);
    const decided = orderAndFilter(group, { now, timeZone });
    if (!decided.ok) return err(decided.error);
    const publishing = decided.value.filter((d) => d.action === "publish").length;
    let order = 0;
    for (const d of decided.value) {
      const entry = pending.find((p) => p.task?.id === d.task.id);
      if (entry === undefined) continue;
      if (d.action === "publish") {
        order += 1;
        entry.action = { kind: "publish_now", order, of: publishing };
      } else {
        entry.action = { kind: "report_error", reason: d.reason };
      }
    }
  }

  const lines: DryRunLine[] = pending.map((p) => {
    // Toda línea tiene acción: si falta es un fallo de esta función, y se cuenta como «sin regla» en vez de callar.
    const action: DryRunAction = p.action ?? { kind: "no_rule" };
    return { item: p.item, timeZone: p.timeZone, today: p.today, assignment: p.assignment, action };
  });

  // Menús de los restaurantes activados que no están en la cola: los borradores y los preparados todavía no se han pedido.
  const inQueue = new Set(input.queue.map((q) => q.menuId));
  const drafts: DraftLine[] = [];
  const warnings: DryRunWarning[] = [];
  for (const menu of [...input.menus].sort((a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0))) {
    const restaurant = activated.get(menu.establishmentId);
    if (restaurant === undefined || inQueue.has(menu.id)) continue;
    if (menu.kind === "daily" && (menu.state === "draft" || menu.state === "prepared")) {
      const zone = zoneOf(restaurant.restaurant.spaceId);
      if (!zone.ok) return err(zone.error);
      drafts.push({ menu, restaurantName: restaurant.restaurant.name, timeZone: zone.value.timeZone, today: zone.value.today });
    }
  }
  // Un menú de otro día publicado A MANO por una persona no bloquea al agente (la regla de orden solo mira tareas): se avisa.
  for (const line of lines) {
    if (!TAKES_THE_MENU.includes(line.assignment) || line.item.kind !== "daily") continue;
    for (const menu of input.menus) {
      if (menu.establishmentId !== line.item.establishmentId || menu.kind !== "daily") continue;
      if (menu.state !== "published" || menu.targetDate <= line.item.targetDate) continue;
      warnings.push({
        kind: "later_day_published_by_hand",
        restaurantName: line.item.establishmentName,
        menuDate: line.item.targetDate,
        laterDate: menu.targetDate,
      });
    }
  }

  const summary: Record<DryRunAction["kind"], number> = {
    publish_now: 0,
    wait_until: 0,
    report_error: 0,
    hands_off: 0,
    no_rule: 0,
    not_a_daily_menu: 0,
    service_stopped: 0,
  };
  for (const line of lines) summary[line.action.kind] += 1;

  return ok({ now: new Date(now.getTime()), restaurants: input.restaurants, lines, drafts, warnings, summary });
}
