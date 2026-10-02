/**
 * `src/core/reservations/money.ts` · cómo se enseña el saldo de Restavor agents
 * (PRD de agents §5.2, RN-AGT-01): en pantalla, al céntimo y en euros. El libro guarda
 * millonésimas (decisión 94); `agent_balance_cents()` ya lo da redondeado al céntimo.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */

/** «7,40 €» (con el espacio fino de `es-ES`). Un saldo negativo se enseña con su signo: «-0,12 €». */
export function formatCentsAsEuros(cents: number): string {
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
    throw new RangeError(`Importe en céntimos no válido: ${cents}`);
  }
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}
