/**
 * G07 y G08 · la bandeja global (RN-GLO-05): qué pestaña, qué contexto,
 * qué búsqueda y qué conversación se miran, y cómo se agrupa la lista.
 *
 * Las filas llegan enteras de `list_my_conversations()`, que ya decide qué
 * conversaciones puede leer cada persona y de qué lado las mira. Aquí solo
 * se reparte y se filtra: no se autoriza nada ni se calcula ningún "sin
 * leer" (lo cuenta el servidor, RN-MSG-06).
 */
import { searchKey } from "./establishments";
import type { ContextSide } from "./global-home";

export type InboxRow = {
  readonly id: string;
  readonly side: string;
  readonly space_id: string | null;
  readonly space_name: string | null;
  readonly establishment_id: string | null;
  readonly establishment_name: string | null;
  readonly request_code: string | null;
  readonly job_code: string | null;
  readonly last_message_preview: string | null;
  readonly unread_count: number | null;
};

export type InboxParams = {
  readonly side: ContextSide;
  /** El espacio (Mantenimiento) o el restaurante (Restaurantes) elegido. */
  readonly context: string | null;
  readonly q: string | null;
  readonly unreadOnly: boolean;
  readonly selected: string | null;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = (v ?? "").trim();
  return limpio === "" ? null : limpio;
}

/** En la dirección, las pestañas se escriben como se leen. */
export const SIDE_PARAM: Readonly<Record<ContextSide, string>> = {
  maintenance: "mantenimiento",
  restaurant: "restaurantes",
};

/**
 * Sin pestaña en la dirección se abre la que tenga algo: la de
 * mantenimiento si hay alguna conversación de ese lado, si no la de
 * restaurantes. Quien solo es cliente no aterriza en una pestaña vacía.
 */
export function readInboxParams(params: Params, rows: readonly InboxRow[]): InboxParams {
  const lado = uno(params.lado);
  const side: ContextSide =
    lado === SIDE_PARAM.restaurant
      ? "restaurant"
      : lado === SIDE_PARAM.maintenance
        ? "maintenance"
        : rows.some((r) => r.side === "maintenance")
          ? "maintenance"
          : "restaurant";
  return {
    side,
    context: uno(params.contexto),
    q: uno(params.q),
    unreadOnly: uno(params.sinleer) === "1",
    selected: uno(params.c),
  };
}

/** El contexto de una fila en su pestaña: el espacio o el restaurante. */
export function contextOf(row: InboxRow, side: ContextSide): { key: string; name: string } | null {
  const key = side === "maintenance" ? row.space_id : row.establishment_id;
  const name = side === "maintenance" ? row.space_name : row.establishment_name;
  return key === null || name === null ? null : { key, name };
}

/** Los contextos de la pestaña, para el selector, en el orden en que aparecen. */
export function inboxContexts(rows: readonly InboxRow[], side: ContextSide): { key: string; name: string }[] {
  const vistos = new Map<string, string>();
  for (const r of rows) {
    if (r.side !== side) continue;
    const c = contextOf(r, side);
    if (c && !vistos.has(c.key)) vistos.set(c.key, c.name);
  }
  return [...vistos].map(([key, name]) => ({ key, name }));
}

export function filterInbox<T extends InboxRow>(rows: readonly T[], params: InboxParams): T[] {
  const aguja = params.q === null ? null : searchKey(params.q);
  return rows.filter((r) => {
    if (r.side !== params.side) return false;
    if (params.context !== null && contextOf(r, params.side)?.key !== params.context) return false;
    if (params.unreadOnly && (r.unread_count ?? 0) === 0) return false;
    if (aguja === null) return true;
    return [r.establishment_name, r.space_name, r.request_code, r.job_code, r.last_message_preview].some(
      (campo) => campo !== null && searchKey(campo).includes(aguja),
    );
  });
}

/**
 * La lista de la izquierda: un grupo por contexto, con sus conversaciones
 * en el orden en que llegaron (la última con mensaje primero, como las
 * devuelve el servidor). Los grupos van en el orden de su primera fila.
 */
export function groupInbox<T extends InboxRow>(
  rows: readonly T[],
  side: ContextSide,
): { key: string; name: string; rows: T[] }[] {
  const grupos = new Map<string, { key: string; name: string; rows: T[] }>();
  for (const r of rows) {
    const c = contextOf(r, side) ?? { key: "", name: "" };
    const grupo = grupos.get(c.key) ?? { key: c.key, name: c.name, rows: [] };
    grupo.rows.push(r);
    grupos.set(c.key, grupo);
  }
  return [...grupos.values()];
}

/** El número de cada pestaña: lo que hay sin leer de ese lado. */
export function unreadBySide(rows: readonly InboxRow[]): Record<ContextSide, number> {
  const total = { maintenance: 0, restaurant: 0 };
  for (const r of rows) {
    if (r.side === "maintenance" || r.side === "restaurant") total[r.side] += r.unread_count ?? 0;
  }
  return total;
}
