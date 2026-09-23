/**
 * M52 · Vencimientos: los cobros con deuda viva, cuándo vencen y qué
 * avisos les tocan.
 *
 * Los tres avisos son los de RN-REC-01 —el vencimiento, las +24 h y las
 * +72 h—, en horas **naturales** como dicen RN-FIN-10/11, con las mismas
 * constantes que el ciclo de impago. No se añade ningún plazo.
 *
 * Lo que esto NO sabe es si un aviso **llegó**: el aviso va a los avisos
 * del restaurante (RN-REC-05), que el equipo no lee, y además el
 * restaurante puede tener apagado el del vencimiento. Por eso cada fecha
 * dice si **ya llegó**, no si "se envió".
 */
import { NONPAYMENT_PAUSE_HOURS, NONPAYMENT_SUSPENSION_HOURS } from "./finance";

export type ReminderKind = "due" | "pause" | "suspension";

export type ReminderStep = {
  readonly kind: ReminderKind;
  readonly at: Date;
  /** La fecha ya ha llegado. */
  readonly reached: boolean;
};

export function reminderSchedule(dueAt: Date, now: Date): ReminderStep[] {
  const mas = (horas: number) => new Date(dueAt.getTime() + horas * 3_600_000);
  return [
    { kind: "due", at: dueAt, reached: now >= dueAt },
    { kind: "pause", at: mas(NONPAYMENT_PAUSE_HOURS), reached: now >= mas(NONPAYMENT_PAUSE_HOURS) },
    {
      kind: "suspension",
      at: mas(NONPAYMENT_SUSPENSION_HOURS),
      reached: now >= mas(NONPAYMENT_SUSPENSION_HOURS),
    },
  ];
}

/**
 * Días de calendario entre dos días "YYYY-MM-DD" ya cortados en la zona
 * del espacio: positivo si `to` es posterior. "Venció hace 18 días".
 */
export function calendarDaysBetween(from: string, to: string): number {
  const dia = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((dia(to) - dia(from)) / 86_400_000);
}

export const DUE_FILTERS = ["vencidos", "por_vencer"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export function isDueFilter(value: string | undefined): value is DueFilter {
  return (DUE_FILTERS as readonly string[]).includes(value ?? "");
}

/**
 * Los cobros de Vencimientos: solo los que tienen deuda viva, primero los
 * que vencieron hace más, y filtrados por restaurante y por si ya han
 * vencido. Qué es "vencido" lo dice `charge_status()`, no una fecha
 * comparada aquí.
 */
export function dueCharges<
  T extends {
    readonly establishmentId: string;
    readonly status: string;
    readonly outstanding: number;
    readonly dueAt: string;
  },
>(rows: readonly T[], filters: { readonly establishmentId: string | null; readonly state: DueFilter | null }): T[] {
  return rows
    .filter((r) => r.outstanding > 0)
    .filter((r) => filters.establishmentId === null || r.establishmentId === filters.establishmentId)
    .filter(
      (r) =>
        filters.state === null ||
        (filters.state === "vencidos" ? r.status === "overdue" : r.status !== "overdue"),
    )
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}
