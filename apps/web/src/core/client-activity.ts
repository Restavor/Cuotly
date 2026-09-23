/**
 * R41 · la actividad del restaurante: el mes, el tipo de actividad, el
 * hecho elegido y los límites del mes en la zona del espacio.
 *
 * Los hechos llegan de `client_activity()` (migración 128), que ya decide
 * qué ve cada persona y no devuelve ninguna identidad (P7). Aquí solo se
 * agrupan y se filtran.
 */
import { zonedTimeToUtc } from "./business-clock";

/** Las clases de hecho que devuelve `client_activity()`. */
export const CLIENT_ACTIVITY_KINDS = [
  "request_sent",
  "request_accepted",
  "request_rejected",
  "work_started",
  "work_published",
  "request_cancelled",
  "correction_requested",
  "menu_published",
  "report_sent",
  "quote_sent",
  "quote_accepted",
  "charge_issued",
  "receipt_uploaded",
  "payment_recorded",
  "file_shared",
] as const;
export type ClientActivityKind = (typeof CLIENT_ACTIVITY_KINDS)[number];

export function isClientActivityKind(value: string): value is ClientActivityKind {
  return (CLIENT_ACTIVITY_KINDS as readonly string[]).includes(value);
}

/** El filtro "Tipo de actividad": cada clase cae en uno. */
export const ACTIVITY_GROUPS = ["solicitudes", "menus", "informes", "pagos", "archivos"] as const;
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

export function activityGroup(kind: ClientActivityKind): ActivityGroup {
  switch (kind) {
    case "menu_published":
      return "menus";
    case "report_sent":
      return "informes";
    case "quote_sent":
    case "quote_accepted":
    case "charge_issued":
    case "receipt_uploaded":
    case "payment_recorded":
      return "pagos";
    case "file_shared":
      return "archivos";
    default:
      return "solicitudes";
  }
}

export type ActivityParams = {
  /** "YYYY-MM". */
  readonly month: string;
  readonly group: ActivityGroup | null;
  readonly selected: string | null;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = (v ?? "").trim();
  return limpio === "" ? null : limpio;
}

/** Un mes mal escrito es el de hoy; un tipo que no existe, todos. */
export function readActivityParams(params: Params, today: string): ActivityParams {
  const mes = uno(params.mes);
  const tipo = uno(params.tipo);
  return {
    month: mes !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : today.slice(0, 7),
    group: tipo !== null && (ACTIVITY_GROUPS as readonly string[]).includes(tipo) ? (tipo as ActivityGroup) : null,
    selected: uno(params.evento),
  };
}

/**
 * El mes entero en la zona del espacio (CLAUDE.md: las fechas se calculan
 * en la zona del espacio): de las 00:00 del día 1 a las 00:00 del día 1
 * del mes siguiente.
 */
export function monthRange(month: string, timeZone: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  const siguiente = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return {
    from: zonedTimeToUtc(y, m, 1, 0, 0, timeZone),
    to: zonedTimeToUtc(siguiente.y, siguiente.m, 1, 0, 0, timeZone),
  };
}

export type ActivityRow = {
  readonly at: string;
  readonly kind: string;
  readonly entity_id: string;
};

/** La clave de un hecho: la misma cosa puede tener dos hechos de la misma clase. */
export function activityKey(row: ActivityRow): string {
  return `${row.kind}~${row.entity_id}~${row.at}`;
}

/** Los hechos del tipo elegido, de las clases que se saben contar, del más reciente al más antiguo. */
export function filterActivity<T extends ActivityRow>(rows: readonly T[], group: ActivityGroup | null): T[] {
  return rows
    .filter((r) => isClientActivityKind(r.kind))
    .filter((r) => group === null || activityGroup(r.kind as ClientActivityKind) === group)
    .sort((a, b) => b.at.localeCompare(a.at));
}
