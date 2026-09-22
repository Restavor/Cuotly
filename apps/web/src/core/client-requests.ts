/**
 * R05 a R12 · las solicitudes vistas por el restaurante: los filtros del
 * listado y el camino de cada una.
 *
 * Nada de esto autoriza: las filas ya llegan filtradas por RLS y cada
 * acción la vuelve a decidir el servidor. Aquí solo se decide qué se
 * enseña de lo que ya se puede ver.
 */

/** Las solicitudes que el equipo todavía no ha clasificado (RN-CLS-03). */
export const UNCLASSIFIED = "unclassified";

/** R05 · "Fecha": los últimos 30, 90 o 365 días, o todas. */
export const CLIENT_REQUEST_PERIODS = ["30", "90", "365"] as const;
export type ClientRequestPeriod = (typeof CLIENT_REQUEST_PERIODS)[number];

export const CLIENT_REQUESTS_PAGE_SIZE = 10;

export type ClientRequestFilters = {
  readonly state: string | null;
  readonly category: string | null;
  readonly period: ClientRequestPeriod | null;
  readonly page: number;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = (v ?? "").trim();
  return limpio === "" ? null : limpio;
}

/**
 * Lo que viene en la dirección. Un periodo que no es de los tres se
 * ignora, y una página rara es la primera: un enlace viejo o escrito a
 * mano nunca deja la pantalla en blanco.
 */
export function readClientRequestFilters(params: Params): ClientRequestFilters {
  const periodo = uno(params.fecha);
  const pagina = Number.parseInt(uno(params.pagina) ?? "1", 10);
  return {
    state: uno(params.estado),
    category: uno(params.tipo),
    period: CLIENT_REQUEST_PERIODS.includes(periodo as ClientRequestPeriod)
      ? (periodo as ClientRequestPeriod)
      : null,
    page: Number.isFinite(pagina) && pagina >= 1 ? pagina : 1,
  };
}

export type FilterableRequest = {
  readonly state: string;
  readonly validated_category: string | null;
  /** La fecha de envío, o la de creación si todavía no se envió. */
  readonly sentAt: string;
};

export function filterClientRequests<T extends FilterableRequest>(
  rows: readonly T[],
  filters: ClientRequestFilters,
  now: Date,
): T[] {
  const desde =
    filters.period === null ? null : now.getTime() - Number(filters.period) * 24 * 60 * 60 * 1000;
  return rows.filter((r) => {
    if (filters.state !== null && r.state !== filters.state) return false;
    if (filters.category !== null) {
      const categoria = r.validated_category ?? UNCLASSIFIED;
      if (categoria !== filters.category) return false;
    }
    if (desde !== null && new Date(r.sentAt).getTime() < desde) return false;
    return true;
  });
}

export type Page<T> = {
  readonly rows: readonly T[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
};

/** Una página que se sale del final es la última, no una lista vacía. */
export function paginate<T>(rows: readonly T[], page: number, size = CLIENT_REQUESTS_PAGE_SIZE): Page<T> {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const actual = Math.min(Math.max(1, page), pages);
  return {
    rows: rows.slice((actual - 1) * size, actual * size),
    page: actual,
    pages,
    total: rows.length,
  };
}

/**
 * Las opciones de un desplegable, sacadas de lo que el restaurante tiene y
 * no de la lista entera de estados: un filtro que ofrece "En corrección" a
 * quien nunca ha tenido una corrección solo lleva a una tabla vacía.
 */
export function presentValues(values: readonly (string | null)[], nullValue: string): string[] {
  return [...new Set(values.map((v) => v ?? nullValue))];
}

// ---------------------------------------------------------------------------
// El camino de la solicitud (R08 vertical, R11 horizontal)
// ---------------------------------------------------------------------------

export type TimelineStepKey =
  | "received"
  | "review"
  | "waiting"
  | "accepted"
  | "in_progress"
  | "published"
  | "correction"
  | "closed"
  | "rejected"
  | "cancelled";

/**
 * `done` — ya pasó; `current` — es donde está; `waiting` — es donde está y
 * espera algo del restaurante; `pending` — todavía no; `stopped` — el
 * final de una solicitud rechazada o cancelada.
 */
export type TimelineStepStatus = "done" | "current" | "waiting" | "pending" | "stopped";

export type TimelineStep = {
  readonly key: TimelineStepKey;
  readonly status: TimelineStepStatus;
  /** `null` cuando esa fecha no existe o no se guarda: se dice, no se inventa. */
  readonly at: string | null;
};

export type TimelineInput = {
  readonly state: string;
  readonly createdAt: string;
  readonly submittedAt: string | null;
  readonly validatedAt: string | null;
  readonly acceptedAt: string | null;
  readonly rejectedAt: string | null;
  readonly startedAt: string | null;
  readonly publishedAt: string | null;
  readonly closedAt: string | null;
  readonly cancelledAt: string | null;
};

const MAIN: readonly TimelineStepKey[] = ["received", "review", "accepted", "in_progress", "published"];

/** Cuántos pasos del camino principal están hechos, y cuál es el actual. */
function where(state: string): {
  done: number;
  current: TimelineStepKey | null;
  extra: TimelineStepKey | null;
} {
  switch (state) {
    case "draft":
      return { done: 0, current: null, extra: null };
    case "received":
    case "analyzing":
    case "pending_internal_validation":
      return { done: 1, current: "review", extra: null };
    // El equipo ya la ha mirado y espera al restaurante: contestar
    // (needs_information) o aceptar (pending_client_acceptance).
    case "needs_information":
    case "pending_client_acceptance":
      return { done: 2, current: null, extra: "waiting" };
    case "accepted":
      return { done: 3, current: null, extra: null };
    case "in_progress":
      return { done: 3, current: "in_progress", extra: null };
    case "published":
      return { done: 5, current: null, extra: null };
    case "correction_requested":
    case "in_correction":
      return { done: 5, current: null, extra: "correction" };
    case "closed":
      return { done: 5, current: null, extra: "closed" };
    default:
      return { done: 1, current: null, extra: null };
  }
}

export function requestTimeline(input: TimelineInput): TimelineStep[] {
  const fechas: Record<TimelineStepKey, string | null> = {
    received: input.submittedAt ?? (input.state === "draft" ? null : input.createdAt),
    review: input.validatedAt,
    waiting: null,
    accepted: input.acceptedAt,
    in_progress: input.startedAt,
    published: input.publishedAt,
    correction: null,
    closed: input.closedAt,
    rejected: input.rejectedAt,
    cancelled: input.cancelledAt,
  };

  // Rechazada o cancelada: el camino se corta donde se cortó. Se enseñan
  // los pasos que llegaron a ocurrir —los que tienen fecha, y "Recibida"
  // siempre— y el final.
  if (input.state === "rejected" || input.state.startsWith("cancelled")) {
    const final: TimelineStepKey = input.state === "rejected" ? "rejected" : "cancelled";
    const hechos = MAIN.filter((k) => k === "received" || fechas[k] !== null).map(
      (key): TimelineStep => ({ key, status: "done", at: fechas[key] }),
    );
    return [...hechos, { key: final, status: "stopped", at: fechas[final] }];
  }

  const { done, current, extra } = where(input.state);
  const pasos: TimelineStep[] = MAIN.map((key, i) => ({
    key,
    status: i < done ? "done" : key === current ? "current" : "pending",
    at: i < done || key === current ? fechas[key] : null,
  }));

  if (extra === "waiting") {
    pasos.splice(2, 0, { key: "waiting", status: "waiting", at: null });
  } else if (extra === "correction") {
    pasos.push({ key: "correction", status: "current", at: null });
  } else if (extra === "closed") {
    pasos.push({ key: "closed", status: "done", at: fechas.closed });
  }
  return pasos;
}
