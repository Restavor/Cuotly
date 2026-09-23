/**
 * G04 · Mis solicitudes (RN-GLO-04): los filtros de la lista y la acción
 * que toca en cada fila.
 *
 * RN-GLO-04 pide "la acción que toca ahora": continuar el borrador, aportar
 * la información que Cuotly pidió, ver las instrucciones de pago de una
 * aprobada. Una aprobada ya tiene espacio (RN-PLA-05) y su primera
 * mensualidad emitida (RN-SUB-05); mientras no se pague, la acción son esas
 * instrucciones, y cuando el espacio pasa a `active`, entrar en él.
 *
 * Nada de esto autoriza: las filas llegan filtradas por la política de
 * `space_requests` (cada uno las suyas) y cada acción la vuelve a decidir
 * su pantalla en el servidor.
 */
import { searchKey } from "./establishments";
import { isSpaceRequestState, type SpaceRequestState } from "./space-requests";

export type MyRequestFilters = {
  readonly q: string | null;
  readonly state: SpaceRequestState | null;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = (v ?? "").trim();
  return limpio === "" ? null : limpio;
}

/** Un estado que no existe se ignora: se ven todas. */
export function readMyRequestFilters(params: Params): MyRequestFilters {
  const estado = uno(params.estado);
  return {
    q: uno(params.q),
    state: estado !== null && isSpaceRequestState(estado) ? estado : null,
  };
}

/** Busca en el nombre del negocio, la razón social y el responsable, sin acentos. */
export function filterMyRequests<
  T extends {
    readonly business_name: string;
    readonly tax_name: string | null;
    readonly contact_name: string;
    readonly status: string;
  },
>(rows: readonly T[], filters: MyRequestFilters): T[] {
  const aguja = filters.q === null ? null : searchKey(filters.q);
  return rows.filter((r) => {
    if (filters.state !== null && r.status !== filters.state) return false;
    if (aguja === null) return true;
    return [r.business_name, r.tax_name ?? "", r.contact_name].some((campo) => searchKey(campo).includes(aguja));
  });
}

/** Lo que dice el espacio de una aprobada, al lado de "Aprobada". */
export type ApprovedDetail = "payment_pending" | "active" | "archived";

export function approvedDetail(spaceStatus: string | null): ApprovedDetail | null {
  switch (spaceStatus) {
    case "trial":
    case "archived_trial_ended":
    case "archived_nonpayment":
      return "payment_pending";
    case "active":
      return "active";
    case "archived_by_owner":
      return "archived";
    default:
      return null;
  }
}

export type MyRequestAction = "continue" | "view" | "complete" | "payment" | "enter" | "reason";

/**
 * La acción de la fila y si es la principal de la pantalla: solo "Necesita
 * información" lo es, porque es la única en la que Cuotly espera algo de
 * quien mira (RN-PLA-06).
 */
export function myRequestAction(
  state: SpaceRequestState,
  spaceStatus: string | null,
): { action: MyRequestAction; primary: boolean } {
  switch (state) {
    case "draft":
      return { action: "continue", primary: false };
    case "submitted":
    case "in_review":
      return { action: "view", primary: false };
    case "needs_information":
      return { action: "complete", primary: true };
    case "rejected":
      return { action: "reason", primary: false };
    case "approved": {
      const detalle = approvedDetail(spaceStatus);
      if (detalle === "payment_pending") return { action: "payment", primary: false };
      if (detalle === "active") return { action: "enter", primary: false };
      return { action: "view", primary: false };
    }
  }
}

/** La fecha de la fila: la de envío, y la de creación en un borrador que no la tiene. */
export function myRequestDate(row: { readonly submitted_at: string | null; readonly created_at: string }): string {
  return row.submitted_at ?? row.created_at;
}
