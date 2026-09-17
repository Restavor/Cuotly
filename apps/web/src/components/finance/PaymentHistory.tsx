import { es } from "@/i18n/es";
import { enZona } from "@/i18n/dates";
import { euros } from "@/i18n/money";

const t = es.teamArea.finance;

type MethodKey = keyof typeof es.teamArea.methods;

export interface ChargePaymentRow {
  readonly id: string;
  readonly amount_cents: number;
  readonly method: string;
  readonly paid_at: string;
  readonly reversed_at: string | null;
  readonly reversal_reason: string | null;
}

/**
 * M51 · el historial de cobros parciales de un cargo.
 *
 * Los pagos parciales ya funcionaban —`register_payment()` recibe un
 * importe y `charge_status()` devuelve `partially_paid`—, pero lo único que
 * se veía era el resultado: "quedan 300 €". Eso basta para saber cuánto
 * falta y no basta para nada más. Quien tiene que decir "el 12 me pagaste
 * 200 por Bizum" necesita los apuntes.
 *
 * Tres cosas que este componente hace a propósito:
 *
 *   · **No suma.** El cobrado y la deuda viva los deriva el servidor de su
 *     libro (RN-FIN-02, RN-DAT-05). Sumar aquí sería un segundo cálculo que
 *     un día daría otro número que el del servidor, y el del servidor es el
 *     que manda (CLAUDE.md).
 *   · **Un pago revertido sigue en la lista**, tachado y con su motivo.
 *     RN-FIN-04 dice que un cobro mal registrado no se edita ni se borra:
 *     se revierte con su apunte contrario. Esconder el revertido dejaría un
 *     libro que no cuadra con lo que se ve.
 * El título lo pone quien lo usa: en la ficha del presupuesto es un
 * apartado dentro de la tarjeta del cobro y en la facturación del
 * restaurante es la tarjeta entera, y repetirlo dentro lo diría dos veces.
 *
 *   · **No enseña quién lo registró.** `payments.recorded_by` es identidad
 *     del equipo y está revocada por privilegios de columna; quién hizo qué
 *     sale de `audit_log`, nunca de la columna (CLAUDE.md).
 */
export function PaymentHistory({
  payments,
  timezone,
}: {
  payments: readonly ChargePaymentRow[];
  timezone: string;
}) {
  if (payments.length === 0) {
    return <p className="text-sm text-text-secondary">{t.paymentsEmptyReason}</p>;
  }

  return (
    <ul className="space-y-2">
      {payments.map((pago) => (
        <li key={pago.id} className="rounded-[10px] bg-soft-surface p-3 text-sm">
          <p className={pago.reversed_at ? "text-text-secondary line-through" : "text-text"}>
            {t.paymentLine(
              euros(pago.amount_cents),
              es.teamArea.methods[pago.method as MethodKey] ?? pago.method,
              enZona(pago.paid_at, timezone, { dateStyle: "short" }),
            )}
          </p>
          {pago.reversed_at ? (
            <p className="text-xs text-danger">
              {t.paymentReversed(enZona(pago.reversed_at, timezone, { dateStyle: "short" }))}
              {pago.reversal_reason ? ` · ${pago.reversal_reason}` : ""}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
