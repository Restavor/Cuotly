/**
 * R25 a R27 · los pagos del restaurante: los filtros de la lista y las
 * tres tarjetas de arriba.
 *
 * Aquí NO se suma dinero (CLAUDE.md: los cálculos financieros son del
 * servidor). El estado de cada cobro y lo que falta por pagar llegan de
 * `charge_status()` y `charge_outstanding_cents()`; este módulo solo
 * elige, cuenta filas y ordena. Por eso "Pendiente de pago" dice cuántos
 * cobros hay, y enseña un importe solo cuando es uno, que es el importe
 * que ya dio el servidor.
 */

export const BILLING_TABS = ["todos", "pendientes", "revision", "pagados"] as const;
export type BillingTab = (typeof BILLING_TABS)[number];

export const BILLING_PERIODS = ["6", "12", "todo"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = (v ?? "").trim();
  return limpio === "" ? null : limpio;
}

export function readBillingFilters(params: Params): { tab: BillingTab; period: BillingPeriod } {
  const tab = uno(params.ver);
  const periodo = uno(params.periodo);
  return {
    tab: BILLING_TABS.includes(tab as BillingTab) ? (tab as BillingTab) : "todos",
    period: BILLING_PERIODS.includes(periodo as BillingPeriod) ? (periodo as BillingPeriod) : "12",
  };
}

/** El grupo en el que cae un cobro para las pestañas de R25. */
export type BillingGroup = "paid" | "in_review" | "pending";

export function billingGroup(input: {
  readonly status: string;
  readonly outstandingCents: number;
  readonly hasReceipt: boolean;
}): BillingGroup {
  if (input.status === "paid" || input.status === "waived" || input.outstandingCents <= 0) return "paid";
  // RN-FIN-06 · el restaurante subió el justificante y el equipo aún no
  // ha registrado el pago: está en revisión, no pagado.
  return input.hasReceipt ? "in_review" : "pending";
}

export type BillingRow = {
  readonly id: string;
  readonly due_at: string;
  readonly group: BillingGroup;
  readonly outstandingCents: number;
};

export function filterCharges<T extends BillingRow>(
  rows: readonly T[],
  filters: { tab: BillingTab; period: BillingPeriod },
  now: Date,
): T[] {
  const desde =
    filters.period === "todo" ? null : new Date(now.getTime()).setUTCMonth(now.getUTCMonth() - Number(filters.period));
  return rows
    .filter((r) => {
      if (filters.tab === "pendientes" && r.group !== "pending") return false;
      if (filters.tab === "revision" && r.group !== "in_review") return false;
      if (filters.tab === "pagados" && r.group !== "paid") return false;
      // Lo que se debe no se esconde por antiguo: un cobro vencido hace un
      // año sigue saliendo aunque el periodo sea "últimos 6 meses".
      if (desde !== null && r.group === "paid" && new Date(r.due_at).getTime() < desde) return false;
      return true;
    })
    .sort((a, b) => b.due_at.localeCompare(a.due_at));
}

export type BillingSummary<T> = {
  /** Cuántos cobros tienen algo pendiente (en revisión incluidos). */
  readonly pendingCount: number;
  /** El único pendiente, cuando es uno: su importe es el del servidor. */
  readonly onlyPending: T | null;
  /** El vencimiento más cercano de lo que se debe. */
  readonly nextDue: T | null;
};

export function billingSummary<T extends BillingRow>(rows: readonly T[]): BillingSummary<T> {
  const debe = rows.filter((r) => r.group !== "paid").sort((a, b) => a.due_at.localeCompare(b.due_at));
  return {
    pendingCount: debe.length,
    onlyPending: debe.length === 1 ? debe[0] : null,
    nextDue: debe[0] ?? null,
  };
}

/** R25 "Último pago realizado": el más reciente que no se haya anulado. */
export function lastPayment<
  P extends { readonly paid_at: string; readonly reversed_at: string | null },
>(payments: readonly P[]): P | null {
  return (
    [...payments].filter((p) => p.reversed_at === null).sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0] ?? null
  );
}
