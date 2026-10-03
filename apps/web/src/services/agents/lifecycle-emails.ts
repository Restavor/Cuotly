/**
 * `src/services/agents/lifecycle-emails.ts` · los correos del ciclo de vida de Reservas
 * (PRD de agents §6.12 y §9.4, Fase E).
 *
 * Es solo el redactor: dado el aviso que reclama la cola, compone su asunto y su cuerpo con
 * el catálogo de `es.agents.lifecycleEmail`. Qué correo sale y cuándo lo deciden la base de
 * datos (`reservations_lifecycle_sweep()`, `approve_reservation_request()`…) y la cola;
 * aquí no se decide nada.
 *
 * «Aprobado: datos para pagar» lleva el importe, el IBAN, el Bizum y el concepto cuando el
 * servidor los ha leído con `reservation_payment_info()` (decisión 137). Sin ellos —por
 * ejemplo, si el correo cae en su tanda en vez de salir al momento— el cuerpo manda al
 * restaurante a Restavor a verlos, que sigue siendo verdad. Un dato de pago nunca se inventa.
 */
import { formatIban, hasDebt, paymentDetailsConfigured, type PaymentInfo } from "@/core/agents/payment-info";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { DEFAULT_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

import type { DeliveryRow, MailMessage } from "../queue-runner";

/** Los tipos de aviso de Restavor agents que redactan su correo aquí. */
export const LIFECYCLE_EMAIL_EVENTS = [
  "reservation_service_approved",
  "reservation_service_rejected",
  "reservations_activated",
  "reservations_payment_due",
  "reservations_past_due",
  "reservations_paused",
  "reservations_ending",
  "reservations_closed_purge_soon",
] as const;

export type LifecycleEmailEvent = (typeof LIFECYCLE_EMAIL_EVENTS)[number];

export function isLifecycleEmailEvent(eventType: string): eventType is LifecycleEmailEvent {
  return (LIFECYCLE_EMAIL_EVENTS as readonly string[]).includes(eventType);
}

/** Lo que el servidor ha leído antes de componer: los datos de pago por restaurante. */
export interface LifecycleMailExtras {
  readonly paymentByEstablishment?: ReadonlyMap<string, PaymentInfo>;
}

const ESTABLISHMENT_IN_LINK = /^\/agents\/([0-9a-f-]{36})(?:\/|$)/i;

/** Todos los avisos de Reservas enlazan a `/agents/<restaurante>…`: de ahí sale a qué restaurante hablan. */
export function establishmentIdFromLink(deepLink: string): string | null {
  return ESTABLISHMENT_IN_LINK.exec(deepLink)?.[1]?.toLowerCase() ?? null;
}

function paymentLines(info: PaymentInfo | undefined): string[] {
  const t = es.agents.lifecycleEmail.approved;
  if (!info || !hasDebt(info)) return [];
  const lines = [t.amount(formatCentsAsEuros(info.totalCents), formatCentsAsEuros(info.baseCents))];
  if (!paymentDetailsConfigured(info)) return [...lines, t.unconfigured];
  if (info.iban) lines.push(t.iban(formatIban(info.iban)));
  if (info.iban && info.payeeName) lines.push(t.payee(info.payeeName));
  if (info.bizumPhone) lines.push(t.bizum(info.bizumPhone));
  lines.push(t.concept(info.reference));
  lines.push(t.due(enZona(info.dueAt, DEFAULT_TIMEZONE, { day: "numeric", month: "long", year: "numeric" })));
  if (info.paymentNote) lines.push(info.paymentNote);
  return lines;
}

/**
 * El correo de un aviso de Reservas, o `null` si ese tipo no es de este módulo (quien llama
 * sigue con el texto genérico de siempre) o no hay a quién escribir.
 */
export function composeLifecycleEmail(
  delivery: DeliveryRow,
  baseUrl: string,
  extras: LifecycleMailExtras = {},
): MailMessage | null {
  if (!delivery.recipient_email || !isLifecycleEmailEvent(delivery.event_type)) return null;
  const t = es.agents.lifecycleEmail;
  const restaurant = delivery.establishment_name;
  const link = `${baseUrl.replace(/\/$/, "")}${delivery.deep_link}`;
  const establishmentId = establishmentIdFromLink(delivery.deep_link);
  const payment = establishmentId ? extras.paymentByEstablishment?.get(establishmentId) : undefined;
  const amount = delivery.amount_cents === null ? null : formatCentsAsEuros(delivery.amount_cents);

  let subject: string;
  let paragraphs: string[];

  switch (delivery.event_type) {
    case "reservation_service_approved": {
      subject = t.approved.subject;
      const lines = paymentLines(payment);
      paragraphs = [
        t.approved.intro(restaurant),
        lines.length > 0
          ? lines.join("\n")
          : amount
            ? `${t.approved.amountWithTax(amount)}\n${t.approved.unconfigured}`
            : t.approved.unconfigured,
        t.approved.outro,
      ];
      break;
    }
    case "reservation_service_rejected":
      subject = t.rejected.subject;
      paragraphs = [t.rejected.intro(restaurant), t.rejected.outro];
      break;
    case "reservations_activated":
      subject = t.activated.subject;
      paragraphs = [t.activated.intro(restaurant)];
      break;
    case "reservations_payment_due":
      subject = t.paymentDue.subject;
      paragraphs = [t.paymentDue.intro(restaurant, amount), paymentLines(payment).join("\n"), t.paymentDue.outro].filter(Boolean);
      break;
    case "reservations_past_due":
      subject = t.pastDue.subject;
      paragraphs = [t.pastDue.intro(restaurant), paymentLines(payment).join("\n"), t.pastDue.outro].filter(Boolean);
      break;
    case "reservations_paused":
      subject = t.paused.subject;
      paragraphs = [t.paused.intro(restaurant), paymentLines(payment).join("\n"), t.paused.outro].filter(Boolean);
      break;
    case "reservations_ending":
      subject = t.ending.subject;
      paragraphs = [t.ending.intro(restaurant), t.ending.outro];
      break;
    case "reservations_closed_purge_soon":
      subject = t.purgeSoon.subject;
      paragraphs = [t.purgeSoon.intro(restaurant), t.purgeSoon.outro];
      break;
  }

  return {
    to: delivery.recipient_email,
    subject,
    body: [t.greeting(restaurant), ...paragraphs, t.openLink(link), t.signature].join("\n\n"),
  };
}
