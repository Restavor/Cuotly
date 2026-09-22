/**
 * R13 a R19, A18 · el Menú Diario visto por el restaurante: los filtros
 * del listado, qué decir de los cambios que todavía no están publicados y
 * el camino de una publicación.
 *
 * Nada de esto autoriza ni cuenta dinero ni actualizaciones: las filas ya
 * llegan filtradas por RLS, el saldo lo da `menu_update_balance()` y cada
 * acción la decide su función en el servidor.
 */
import { isMenuInFlight, type MenuState } from "./menu-states";

export type ClientMenuFilters = {
  /** "YYYY-MM" del mes de la fecha del menú. */
  readonly month: string | null;
  readonly state: string | null;
  /** El id de la plantilla, o `NO_TEMPLATE`. */
  readonly template: string | null;
};

export const NO_TEMPLATE = "sin-plantilla";

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = (v ?? "").trim();
  return limpio === "" ? null : limpio;
}

export function readClientMenuFilters(params: Params): ClientMenuFilters {
  const mes = uno(params.mes);
  return {
    month: mes !== null && /^\d{4}-\d{2}$/.test(mes) ? mes : null,
    state: uno(params.estado),
    template: uno(params.plantilla),
  };
}

export function filterClientMenus<
  T extends { readonly target_date: string; readonly state: string; readonly template_id: string | null },
>(rows: readonly T[], filters: ClientMenuFilters): T[] {
  return rows.filter((m) => {
    if (filters.month !== null && m.target_date.slice(0, 7) !== filters.month) return false;
    if (filters.state !== null && m.state !== filters.state) return false;
    if (filters.template !== null && (m.template_id ?? NO_TEMPLATE) !== filters.template) return false;
    return true;
  });
}

/** Los meses que tienen algún menú, del más reciente al más antiguo. */
export function menuMonths(dates: readonly string[]): string[] {
  return [...new Set(dates.map((d) => d.slice(0, 7)))].sort().reverse();
}

// ---------------------------------------------------------------------------
// A18 · cambios que todavía no están publicados
// ---------------------------------------------------------------------------

export type PendingChanges =
  /** Hay contenido y nadie ha pedido publicarlo todavía. */
  | { readonly kind: "not_requested"; readonly version: number }
  /**
   * Se pidió la publicación y DESPUÉS se guardaron más versiones. El
   * equipo publica la versión vigente (RN-MEN-06: descarga la plantilla
   * generada con ella), pero si se guardó pasadas las 21:00 del día
   * anterior no se garantiza que entre (RN-MEN-07).
   */
  | {
      readonly kind: "saved_after_request";
      readonly version: number;
      readonly afterCutoff: boolean;
    };

export function menuPendingChanges(input: {
  readonly state: MenuState;
  readonly versions: readonly { readonly version: number; readonly created_at: string; readonly after_cutoff: boolean }[];
  /** La última vez que el menú pasó a "Publicación solicitada", o `null`. */
  readonly lastRequestAt: string | null;
}): PendingChanges | null {
  const ultima = [...input.versions].sort((a, b) => b.version - a.version)[0];
  if (ultima === undefined) return null;

  if (input.state === "draft" || input.state === "prepared") {
    return { kind: "not_requested", version: ultima.version };
  }

  if (isMenuInFlight(input.state) && input.lastRequestAt !== null) {
    const despues = input.versions.filter((v) => v.created_at > (input.lastRequestAt as string));
    if (despues.length === 0) return null;
    return {
      kind: "saved_after_request",
      version: ultima.version,
      afterCutoff: despues.some((v) => v.after_cutoff),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// R17 · el camino de una publicación
// ---------------------------------------------------------------------------

export type PublicationStepKey = "received" | "preparing" | "published";
export type PublicationStepStatus = "done" | "current" | "waiting" | "pending" | "stopped";

/**
 * Los tres pasos que el dibujo enseña ("Recibida", "En preparación",
 * "Publicada") sobre los once estados de RN-MEN-09. No es una máquina
 * nueva: es la misma agrupada para leerla de un vistazo.
 */
export function publicationSteps(state: MenuState): { key: PublicationStepKey; status: PublicationStepStatus }[] {
  const paso = (key: PublicationStepKey, status: PublicationStepStatus) => ({ key, status });
  switch (state) {
    case "draft":
    case "prepared":
      return [paso("received", "pending"), paso("preparing", "pending"), paso("published", "pending")];
    case "publication_requested":
    case "pending_assignment":
      return [paso("received", "done"), paso("preparing", "current"), paso("published", "pending")];
    case "needs_information":
      return [paso("received", "done"), paso("preparing", "waiting"), paso("published", "pending")];
    case "assigned":
    case "reviewing":
    case "ready_to_publish":
      return [paso("received", "done"), paso("preparing", "current"), paso("published", "pending")];
    case "published":
      return [paso("received", "done"), paso("preparing", "done"), paso("published", "done")];
    case "publication_error":
      return [paso("received", "done"), paso("preparing", "done"), paso("published", "stopped")];
    case "cancelled":
      return [paso("received", "stopped"), paso("preparing", "pending"), paso("published", "pending")];
  }
}
