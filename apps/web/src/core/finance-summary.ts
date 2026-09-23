/**
 * M16 y M17 · lo que la pantalla de Finanzas decide por su cuenta: qué mes
 * se mira, qué meses lleva el gráfico, cómo se compara con el anterior y
 * en qué orden va el historial de un cobro.
 *
 * **Aquí no se calcula dinero.** Lo cobrado, lo pendiente y lo vencido de
 * cada mes los da `financial_dashboard()` del libro de apuntes (RN-FIN-02),
 * y el estado de cada cobro, `charge_status()`. Esto solo ordena, cuenta
 * filas y compara dos cifras que ya vienen hechas.
 */
import { addMonths } from "./client-calendar";

export const FINANCE_TABS = ["resumen", "cobros"] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

export type FinanceParams = {
  /** "YYYY-MM", en la zona del espacio. */
  readonly month: string;
  readonly tab: FinanceTab;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string {
  return ((Array.isArray(valor) ? valor[0] : valor) ?? "").trim();
}

/**
 * El mes que se mira y la pestaña. Un mes mal escrito, o posterior al de
 * hoy, es el de hoy: del futuro no hay nada emitido que enseñar.
 */
export function readFinanceParams(params: Params, today: string): FinanceParams {
  const actual = today.slice(0, 7);
  const mes = uno(params.mes);
  const tab = uno(params.tab);
  return {
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= actual ? mes : actual,
    tab: (FINANCE_TABS as readonly string[]).includes(tab) ? (tab as FinanceTab) : "resumen",
  };
}

/** Los `n` meses que acaban en `month`, del más antiguo al más reciente. */
export function monthsEndingAt(month: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(month, i - (n - 1)));
}

/**
 * "+12 % vs. mes anterior". `null` cuando el anterior es cero o no se
 * pudo leer: un porcentaje sobre cero no existe, y "+∞ %" o "+100 %"
 * serían inventarlo.
 */
export function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Cuántos cobros hay detrás de "Pendiente" y de "Vencido". Cuenta filas
 * con el estado que ya dio el servidor; no mira importes. Un pago parcial
 * que aún está en plazo cuenta como pendiente.
 */
export function countChargesByBucket(
  rows: readonly { readonly status: string; readonly outstanding: number }[],
): { pending: number; overdue: number } {
  let pending = 0;
  let overdue = 0;
  for (const fila of rows) {
    if (fila.status === "overdue") overdue += 1;
    else if (fila.outstanding > 0 && (fila.status === "pending" || fila.status === "partially_paid")) pending += 1;
  }
  return { pending, overdue };
}

/** M17 · lo que ha pasado en un cobro. */
export type ChargeEvent =
  | { readonly kind: "issued"; readonly at: string }
  | { readonly kind: "receipt"; readonly at: string; readonly side: string; readonly name: string | null }
  | {
      readonly kind: "payment";
      readonly at: string;
      readonly amountCents: number;
      readonly method: string;
      readonly reversedAt: string | null;
    }
  | { readonly kind: "reversal"; readonly at: string; readonly amountCents: number; readonly reason: string | null };

/**
 * El historial de un cobro, del más antiguo al más reciente, como el
 * dibujo. Un pago revertido aparece dos veces: cuando se registró y
 * cuando se revirtió (RN-FIN-04: se corrige con un apunte contrario, y
 * los dos se ven).
 */
export function chargeTimeline(input: {
  readonly issuedAt: string;
  readonly receipts: readonly { readonly at: string; readonly side: string; readonly name: string | null }[];
  readonly payments: readonly {
    readonly paidAt: string;
    readonly amountCents: number;
    readonly method: string;
    readonly reversedAt: string | null;
    readonly reversalReason: string | null;
  }[];
}): ChargeEvent[] {
  const eventos: ChargeEvent[] = [{ kind: "issued", at: input.issuedAt }];
  for (const r of input.receipts) eventos.push({ kind: "receipt", at: r.at, side: r.side, name: r.name });
  for (const p of input.payments) {
    eventos.push({
      kind: "payment",
      at: p.paidAt,
      amountCents: p.amountCents,
      method: p.method,
      reversedAt: p.reversedAt,
    });
    if (p.reversedAt !== null) {
      eventos.push({ kind: "reversal", at: p.reversedAt, amountCents: p.amountCents, reason: p.reversalReason });
    }
  }
  return eventos.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
