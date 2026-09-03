/**
 * `src/core/finance.ts` — control financiero operativo (PRD §17 RN-FIN,
 * §6 RN-COM-04). Lógica de dominio pura: sin Supabase, sin Next.js, sin
 * React (CLAUDE.md, regla de estilo de código).
 *
 * Cuotly **no procesa pagos** (RN-FIN, §80): registra cuotas, cobros,
 * vencimientos, justificantes e impagos. Aquí no hay pasarela, ni Stripe,
 * ni cálculo fiscal oficial — solo la aritmética determinista que el
 * servidor y las pantallas deben compartir para no discrepar nunca en un
 * importe.
 *
 * Todo el dinero se maneja en **céntimos enteros**, igual que `plans.
 * price_cents` desde el Hito 2: ni un solo importe en coma flotante, para
 * que "base + impuesto = total" sea cierto siempre y no "casi siempre".
 *
 * La autoridad real es la base de datos
 * (supabase/migrations/20260830000025_hito7_mensajes_archivos_finanzas.sql):
 * `financial_entries` es el libro inmutable de apuntes con signo, y el
 * estado de un cobro **no se guarda** — se deriva de ese libro (RN-DAT-04,
 * RN-DAT-05). Estas funciones son ese mismo cálculo, probable sin Postgres.
 */

/** RN-FIN-08: Restavor usa IVA 21 %; otros espacios configuran el suyo. */
import { recalculateElapsedBusinessMinutes, type TimerEvent } from "./timer-events";
import type { WorkCalendar } from "./business-clock";

export const RESTAVOR_TAX_RATE_PERCENT = 21;

export type ChargeAmounts = {
  readonly baseCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
};

/**
 * RN-FIN-08: "se muestran base imponible, impuesto y total". El impuesto
 * se redondea al céntimo más próximo una sola vez y el total es la suma de
 * los dos números que se muestran — nunca un tercer redondeo por su
 * cuenta, para que el desglose cuadre exactamente con el total (§87: los
 * cálculos deben ser deterministas).
 */
export function chargeAmounts(baseCents: number, taxRatePercent: number): ChargeAmounts {
  if (!Number.isInteger(baseCents) || baseCents < 0) {
    throw new Error("La base imponible debe ser un número entero de céntimos no negativo");
  }
  if (taxRatePercent < 0) {
    throw new Error("El tipo impositivo no puede ser negativo");
  }

  const taxCents = Math.round((baseCents * taxRatePercent) / 100);
  return { baseCents, taxCents, totalCents: baseCents + taxCents };
}

/**
 * Tipos de apunte del libro financiero. El signo es el que reduce o
 * aumenta la **deuda viva** del establecimiento:
 * - `charge`: se emite la mensualidad → la deuda sube (positivo).
 * - `payment`: se confirma un cobro → la deuda baja (negativo).
 * - `waiver`: se perdona o anula → la deuda baja (negativo, RN-FIN-02).
 * - `refund`: se reembolsa → la deuda vuelve a subir (positivo).
 * - `payment_reversal`: se corrige un cobro mal registrado (RN-FIN-04,
 *   "corregir") sin tocar el apunte original — el libro es inmutable
 *   (CLAUDE.md MUST), así que corregir es escribir el apunte contrario.
 */
export type FinancialEntryType = "charge" | "payment" | "waiver" | "refund" | "payment_reversal";

export type FinancialEntry = {
  readonly type: FinancialEntryType;
  /** Céntimos con signo, tal como los guarda `financial_entries.amount_cents`. */
  readonly amountCents: number;
};

/**
 * Deuda viva de un cobro: la **suma de sus apuntes**, nunca un contador
 * guardado (CLAUDE.md MUST, RN-DAT-04). Cero o menos = no se debe nada.
 */
export function outstandingCents(entries: readonly FinancialEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amountCents, 0);
}

/** Lo efectivamente cobrado de un cobro: pagos confirmados menos reversiones y reembolsos. */
export function collectedCents(entries: readonly FinancialEntry[]): number {
  return entries.reduce((total, entry) => {
    switch (entry.type) {
      // Los tres restan su propio signo: `payment` es negativo (baja la
      // deuda, sube lo cobrado), `payment_reversal` y `refund` positivos
      // (devuelven deuda, bajan lo cobrado). Un `waiver` no entra: perdonar
      // una deuda no es haberla cobrado.
      case "payment":
      case "payment_reversal":
      case "refund":
        return total - entry.amountCents;
      default:
        return total;
    }
  }, 0);
}

/** RN-FIN-02: los seis estados de un cobro, sin inventar ninguno más. */
export type ChargeStatus = "pending" | "paid" | "partially_paid" | "overdue" | "waived" | "refunded";

/**
 * RN-FIN-02 + RN-DAT-05: el estado de un cobro es un **estado derivado**,
 * no una columna que se actualiza. Se calcula del libro y de la fecha de
 * vencimiento, así que dos pantallas no pueden discrepar y no existe la
 * posibilidad de un cobro "pagado" sin apuntes que lo respalden.
 *
 * Orden de decisión, y por qué:
 * 1. `refunded` y `waived` son actos explícitos del equipo (RN-FIN-04):
 *    describen lo que pasó con el cobro mejor que su saldo.
 * 2. `paid` cuando ya no queda deuda viva.
 * 3. `overdue` por delante de `partially_paid`: pasada la fecha de
 *    vencimiento con deuda viva, lo que importa operativamente es que hay
 *    un impago en marcha — es exactamente la condición que dispara
 *    RN-FIN-10/11, y un pago parcial no la detiene.
 * 4. `partially_paid` si se cobró algo pero no todo.
 * 5. `pending` en cualquier otro caso.
 */
export function chargeStatus(input: {
  readonly entries: readonly FinancialEntry[];
  readonly dueAt: Date;
  readonly now: Date;
}): ChargeStatus {
  const outstanding = outstandingCents(input.entries);

  // `refunded` y `waived` son actos explícitos del equipo (RN-FIN-04) y
  // describen mejor lo que pasó con el cobro que su saldo... siempre que el
  // cobro esté cerrado. Con deuda viva mienten: el ciclo de impago
  // (RN-FIN-10/11) actúa sobre el saldo, no sobre la etiqueta, así que un
  // cobro reembolsado con deuda viva suspendía el establecimiento mientras
  // la pantalla decía "Reembolsado" (H-02 de la 6ª revisión).
  if (outstanding <= 0) {
    if (input.entries.some((entry) => entry.type === "refund")) return "refunded";
    if (input.entries.some((entry) => entry.type === "waiver")) return "waived";
    return "paid";
  }

  if (input.now.getTime() > input.dueAt.getTime()) return "overdue";
  return collectedCents(input.entries) > 0 ? "partially_paid" : "pending";
}

/**
 * RN-FIN-03: transferencia o Bizum, sin inventar ninguno más. Sin Stripe:
 * los pagos se registran a mano (CLAUDE.md, decisión 10 de
 * docs/DECISIONES.md). No hay tarjeta ni domiciliación porque no hay
 * pasarela que las cobre.
 */
export const PAYMENT_METHODS = ["transfer", "bizum"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * El día natural que es "hoy" **en la zona del espacio** (CLAUDE.md MUST:
 * "las fechas se calculan en la zona horaria del espacio"), en el formato
 * `YYYY-MM-DD` que espera un `<input type="date">`.
 *
 * Existe porque el valor por defecto del formulario lo pinta el servidor,
 * que corre en UTC: a las 00:30 de Madrid, `toISOString()` propondría
 * ayer.
 */
export function todayInTimeZone(now: Date, timeZone: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const parte = (tipo: "year" | "month" | "day") =>
    partes.find((p) => p.type === tipo)?.value ?? "";

  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

/**
 * Cuántos minutos separa `timeZone` de UTC en ese instante concreto —con
 * su horario de verano ya aplicado, que es justo lo que no se puede
 * suponer fijo. Se obtiene formateando el instante en esa zona y leyendo
 * el resultado como si fuera UTC: la diferencia es el desplazamiento.
 */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const n = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? "0");

  const comoSiFueraUtc = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );

  return (comoSiFueraUtc - instant.getTime()) / 60_000;
}

/**
 * RN-FIN-05 / HU-26: "indica **fecha**, importe y método". La fecha se
 * elige en un calendario, así que llega como un día natural suelto
 * ("2026-09-03"), sin hora y sin zona; `payments.paid_at` es `timestamptz`
 * (CLAUDE.md MUST), de modo que alguien tiene que ponerle una hora.
 *
 * Cuál se elige no da igual. Guardar `2026-09-03T00:00:00Z` hace que
 * cualquier espacio al oeste de Greenwich vea el pago fechado el día
 * **anterior** al que marcó la persona. Aquí se ancla al **mediodía de la
 * zona del espacio**, que es lo que pide CLAUDE.md ("las fechas se
 * calculan en la zona horaria del espacio") y lo que deja el día natural
 * intacto en cualquier huso, incluidos los de UTC+13 y UTC+14. El mediodía
 * y no las 00:00 locales porque los saltos de horario de verano ocurren de
 * madrugada: a mediodía no hay ninguna hora que no exista o que exista dos
 * veces.
 *
 * Devuelve `null` —y no lanza— si el texto no es un día real: un error de
 * negocio se devuelve como resultado explícito (CLAUDE.md, estilo de
 * código). Rechaza también `2026-02-31`, que `new Date()` aceptaría
 * corriéndolo al 3 de marzo sin avisar.
 */
export function paymentDayToTimestamp(day: string, timeZone: string): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!partes) return null;

  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const mediodiaComoUtc = Date.UTC(anio, mes - 1, dia, 12, 0, 0);
  // Descarta los días que no existen: `Date.UTC` desborda el 31 de febrero
  // al 3 de marzo en silencio.
  if (new Date(mediodiaComoUtc).toISOString().slice(0, 10) !== day) return null;

  let desplazamiento: number;
  try {
    desplazamiento = zoneOffsetMinutes(new Date(mediodiaComoUtc), timeZone);
  } catch {
    // Una zona inexistente hace lanzar a Intl. Se trata como dato
    // inválido, no como caída.
    return null;
  }

  return new Date(mediodiaComoUtc - desplazamiento * 60_000).toISOString();
}

// ---------------------------------------------------------------------
// Ciclo de impago (RN-FIN-10 a 14)
// ---------------------------------------------------------------------

/** RN-FIN-10: +24 h **naturales** desde el vencimiento → Pausado por impago. */
export const NONPAYMENT_PAUSE_HOURS = 24;
/** RN-FIN-11: +72 h naturales → servicio detenido y Suspendido por impago. */
export const NONPAYMENT_SUSPENSION_HOURS = 72;

/**
 * Horas naturales, no laborables: RN-FIN-10/11 dicen "naturales"
 * explícitamente, así que el reloj contractual (RN-CLK) **no** interviene
 * aquí. Es la única familia de plazos de Cuotly que no pasa por
 * `business-clock.ts`, y por eso se dice en voz alta.
 */
export type NonpaymentStage = "current" | "paused" | "suspended";

export function nonpaymentStage(input: {
  readonly dueAt: Date;
  readonly outstandingCents: number;
  readonly now: Date;
}): NonpaymentStage {
  if (input.outstandingCents <= 0) return "current";

  const elapsedHours = (input.now.getTime() - input.dueAt.getTime()) / 3_600_000;
  if (elapsedHours >= NONPAYMENT_SUSPENSION_HOURS) return "suspended";
  if (elapsedHours >= NONPAYMENT_PAUSE_HOURS) return "paused";
  return "current";
}

/**
 * La fase del establecimiento entero: manda el cobro vencido más antiguo
 * que siga con deuda viva. Un cobro nuevo y todavía en plazo no rescata a
 * un establecimiento ya suspendido por otro anterior.
 */
export function establishmentNonpaymentStage(
  charges: readonly { readonly dueAt: Date; readonly outstandingCents: number }[],
  now: Date,
): NonpaymentStage {
  const stages = charges.map((charge) => nonpaymentStage({ ...charge, now }));
  if (stages.includes("suspended")) return "suspended";
  if (stages.includes("paused")) return "paused";
  return "current";
}

/**
 * RN-FIN-13: "al confirmarse el pago, se reactiva y los contadores
 * continúan **exactamente** donde se pausaron, sin duplicar solicitudes ni
 * trabajos."
 *
 * Que continúen exactos no es una promesa: es una consecuencia de cómo se
 * miden. Un contador de Cuotly no guarda "minutos restantes" en ninguna
 * columna — se recalcula sumando los tramos cerrados de `timer_events`
 * (src/core/timer-events.ts, CA-10). Pausar escribe un `paused`, reactivar
 * escribe un `resumed`, y el tramo pausado simplemente no existe para la
 * suma. Esta función es la comprobación de esa propiedad: los minutos
 * consumidos antes de la pausa financiera y después de la reactivación son
 * el mismo número.
 */
export function elapsedIsPreservedAcrossPause(input: {
  /** El libro completo de eventos del contador, pausa y reanudación incluidas. */
  readonly events: readonly TimerEvent[];
  readonly calendar: WorkCalendar;
  /** Instante de la pausa financiera (RN-FIN-11). */
  readonly pausedAt: Date;
  /** Instante de la reactivación tras confirmarse el pago (RN-FIN-13). */
  readonly resumedAt: Date;
}): boolean {
  // Se recalcula el consumido en los dos instantes a partir del MISMO libro
  // de eventos, con el mismo recalculador que usa el resto del sistema
  // (CA-10). Si la pausa se hubiera implementado descontando de un número
  // guardado — o si el tramo pausado contara — los dos valores diferirían.
  const atPause = recalculateElapsedBusinessMinutes(input.events, input.calendar, input.pausedAt);
  const atResume = recalculateElapsedBusinessMinutes(input.events, input.calendar, input.resumedAt);
  return atPause === atResume;
}

/** RN-COM-04/05: permanencia mínima de 3 meses; después, renovación mensual. */
export const COMMITMENT_MONTHS = 3;

/**
 * RN-FIN-14: "la suspensión por impago **no cancela el compromiso**. La
 * deuda se mantiene y, para causar baja, el establecimiento debe abonar
 * las mensualidades restantes de su permanencia" (§85 añade: "además de
 * cualquier importe ya vencido").
 *
 * `elapsedFullMonths` es cuántas mensualidades completas lleva vigente la
 * suscripción, contadas en la zona horaria del espacio (RN-DAT-08). No se
 * calcula aquí a propósito: quien llama ya tiene esa cuenta hecha por el
 * servidor, con el mismo criterio que `get_or_create_consumption_cycle()`
 * usa para saber en qué ciclo está — duplicar esa aritmética de meses en
 * dos sitios es exactamente el fallo que RN-CON-05/CA-09 no perdona.
 *
 * En Fase 1 no existe todavía ninguna pantalla de baja (RN-EST-09 la
 * describe, el ROADMAP no la sitúa en esta fase): esta función es el
 * cálculo que esa pantalla usará, y el número que ya se puede enseñar hoy
 * al preguntar "¿qué debe este establecimiento si quiere irse?".
 */
export function terminationSettlementCents(input: {
  readonly outstandingCents: number;
  readonly elapsedFullMonths: number;
  readonly monthlyTotalCents: number;
}): { readonly remainingCommitmentMonths: number; readonly totalCents: number } {
  const remainingCommitmentMonths = Math.max(COMMITMENT_MONTHS - input.elapsedFullMonths, 0);
  return {
    remainingCommitmentMonths,
    totalCents: input.outstandingCents + remainingCommitmentMonths * input.monthlyTotalCents,
  };
}

// ---------------------------------------------------------------------
// Quién puede hacer qué (RN-FIN-04, RN-FIN-05, RN-FIN-07, CA-03)
// ---------------------------------------------------------------------

export type FinanceAction =
  | "view_dashboard"
  | "issue_charge"
  | "register_payment"
  | "correct_payment"
  | "waive_charge"
  | "refund_charge";

export type FinanceActor =
  | { readonly side: "space"; readonly role: "owner" | "admin" }
  | {
      readonly side: "space";
      readonly role: "worker";
      /** RN-FIN-05: "desde la ficha de un restaurante asignado". */
      readonly isAuthorizedForEstablishment: boolean;
    }
  | { readonly side: "client" };

/**
 * RN-FIN-04: propietario y administradores confirman, corrigen y gestionan
 * cobros. RN-FIN-05: el trabajador **solo** marca "Pagado" en un
 * establecimiento asignado — no cambia precios, no perdona deuda, no
 * reembolsa y no ve ingresos globales (CA-03). El cliente no ejecuta
 * ninguna acción financiera: puede subir un justificante (RN-FIN-06), que
 * no es una confirmación.
 */
export function canPerformFinanceAction(actor: FinanceActor, action: FinanceAction): boolean {
  if (actor.side === "client") return false;
  if (actor.role !== "worker") return true;
  return action === "register_payment" && actor.isAuthorizedForEstablishment;
}

/**
 * RN-FIN-07: "propietario global ve el grupo completo; propietario local,
 * su establecimiento; Editor solo con el permiso `view_billing`; Consulta,
 * nada."
 */
export function canClientViewBilling(input: {
  readonly role: "global_owner" | "local_owner" | "editor" | "consulta";
  readonly hasViewBillingPermission: boolean;
}): boolean {
  switch (input.role) {
    case "global_owner":
    case "local_owner":
      return true;
    case "editor":
      return input.hasViewBillingPermission;
    case "consulta":
      return false;
  }
}

// ---------------------------------------------------------------------
// Panel financiero (§17.2, HU-28)
// ---------------------------------------------------------------------

/** Un cobro tal como lo necesita el panel, ya resuelto por el servidor. */
export type DashboardCharge = {
  readonly baseCents: number;
  readonly totalCents: number;
  readonly dueAt: Date;
  readonly entries: readonly FinancialEntry[];
};

/**
 * §17.2 pide el resumen "con y sin IVA", así que cada figura lleva sus dos
 * caras: `baseCents` (sin impuesto) y `totalCents` (con impuesto).
 */
export type MoneyPair = { readonly baseCents: number; readonly totalCents: number };

export type FinancialSummary = {
  /** Ingresos mensuales previstos: todo lo emitido en el periodo. */
  readonly forecast: MoneyPair;
  /** Ingresos cobrados: lo efectivamente confirmado, neto de reversiones y reembolsos. */
  readonly collectedCents: number;
  /** Deuda viva todavía en plazo. */
  readonly pendingCents: number;
  /** Deuda viva pasada la fecha de vencimiento (RN-FIN-02, `overdue`). */
  readonly overdueCents: number;
  /** Ingreso recurrente mensual: suma de las suscripciones activas, no de lo emitido. */
  readonly recurringMonthly: MoneyPair;
};

/**
 * HU-28: "ver el panel financiero con previsto, cobrado, pendiente,
 * vencido e ingreso recurrente".
 *
 * `charges` son los cobros **emitidos dentro del periodo** que se está
 * mirando; el ingreso recurrente, en cambio, no sale de los cobros sino de
 * las suscripciones activas ahora mismo (`subscriptions` × precio del plan):
 * es lo que se espera facturar cada mes mientras nada cambie, y por eso se
 * pasa aparte en vez de deducirlo de un histórico.
 *
 * P6 ("no inventar datos"): esta función suma lo que recibe y nada más. No
 * extrapola, no proyecta tendencias y no rellena meses sin datos.
 */
export function financialSummary(input: {
  readonly charges: readonly DashboardCharge[];
  readonly activeSubscriptions: readonly MoneyPair[];
  readonly now: Date;
}): FinancialSummary {
  let forecastBase = 0;
  let forecastTotal = 0;
  let collected = 0;
  let pending = 0;
  let overdue = 0;

  for (const charge of input.charges) {
    forecastBase += charge.baseCents;
    forecastTotal += charge.totalCents;
    collected += collectedCents(charge.entries);

    const outstanding = outstandingCents(charge.entries);
    if (outstanding > 0) {
      if (input.now.getTime() > charge.dueAt.getTime()) {
        overdue += outstanding;
      } else {
        pending += outstanding;
      }
    }
  }

  const recurringBase = input.activeSubscriptions.reduce((total, item) => total + item.baseCents, 0);
  const recurringTotal = input.activeSubscriptions.reduce((total, item) => total + item.totalCents, 0);

  return {
    forecast: { baseCents: forecastBase, totalCents: forecastTotal },
    collectedCents: collected,
    pendingCents: pending,
    overdueCents: overdue,
    recurringMonthly: { baseCents: recurringBase, totalCents: recurringTotal },
  };
}
