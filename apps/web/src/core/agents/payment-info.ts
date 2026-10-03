/**
 * `src/core/agents/payment-info.ts` · «Aprobado: datos para pagar» (PRD de agents §4.4,
 * RN-APP-03; decisión 132).
 *
 * Lo que dice `reservation_payment_info()` del cobro de Reservas más antiguo con deuda, y
 * cuatro funciones puras para enseñarlo. El concepto (`reference`) lo genera la base; aquí
 * no se reconstruye.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */

export interface PaymentInfo {
  readonly chargeId: string;
  readonly concept: string;
  /** El concepto de la transferencia o del Bizum: `Reservas <restaurante> <AAAA-MM>`. */
  readonly reference: string;
  readonly baseCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly outstandingCents: number;
  readonly dueAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly iban: string | null;
  readonly bizumPhone: string | null;
  readonly paymentNote: string | null;
  /** La razón social a cuyo nombre se paga (`spaces.legal_name`), si el espacio la tiene cargada. */
  readonly payeeName: string | null;
}

/** ¿Hay alguna forma de pago que enseñar? Sin ninguna se dice «sin configurar», nunca un dato inventado. */
export function paymentDetailsConfigured(info: Pick<PaymentInfo, "iban" | "bizumPhone">): boolean {
  return Boolean(info.iban) || Boolean(info.bizumPhone);
}

/** `ES9121000418450200051332` → `ES91 2100 0418 4502 0005 1332`. */
export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Importe con IVA de una base en céntimos, como lo calcula el motor de cobros:
 * 4.800 + 21 % = 1.008 de IVA = 5.808 (58,08 €, el precio que enseña «Contratar Reservas»).
 */
export function priceWithTax(baseCents: number, taxRatePercent: number): { baseCents: number; taxCents: number; totalCents: number } {
  const taxCents = Math.round((baseCents * taxRatePercent) / 100);
  return { baseCents, taxCents, totalCents: baseCents + taxCents };
}

/** ¿Queda algo por pagar? Un cobro saldado no se enseña como «datos para pagar». */
export function hasDebt(info: Pick<PaymentInfo, "outstandingCents">): boolean {
  return info.outstandingCents > 0;
}
