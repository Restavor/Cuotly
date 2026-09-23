/**
 * M49 · la lista de presupuestos: qué filtros hay puestos y qué filas los
 * cumplen. El estado de cada presupuesto ya viene de `quote_status()`
 * (RN-DAT-05); aquí solo se compara texto.
 */
import { isQuoteState, type QuoteState } from "./quotes";

export type QuoteListParams = {
  readonly q: string;
  readonly establishmentId: string | null;
  readonly state: QuoteState | null;
  readonly selected: string | null;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string {
  return ((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();
}

export function readQuoteListParams(params: Params): QuoteListParams {
  const estado = uno(params.estado);
  return {
    q: uno(params.q).slice(0, 100),
    establishmentId: uno(params.restaurante) || null,
    state: isQuoteState(estado) ? estado : null,
    selected: uno(params.presupuesto) || null,
  };
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Las filas que cumplen los filtros. El buscador mira el código, el
 * concepto y el restaurante, sin distinguir mayúsculas ni tildes: quien
 * busca "magarinos" quiere ver Magariños.
 */
export function filterQuotes<
  T extends {
    readonly code: string;
    readonly concept: string;
    readonly establishment_id: string;
    readonly establishmentName: string;
    readonly status: string;
  },
>(rows: readonly T[], params: QuoteListParams): T[] {
  const aguja = normalizar(params.q);
  return rows.filter(
    (r) =>
      (params.establishmentId === null || r.establishment_id === params.establishmentId) &&
      (params.state === null || r.status === params.state) &&
      (aguja === "" ||
        normalizar(`${r.code} ${r.concept} ${r.establishmentName}`).includes(aguja)),
  );
}
