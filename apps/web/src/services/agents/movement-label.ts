import { isCardTopup, type MovementKind } from "@/core/agents/balance";
import { es } from "@/i18n/es";

/** El nombre en español de un apunte del libro del saldo, para la pantalla y para el Excel. */
export function movementLabel(kind: MovementKind, sourceType: string | null): string {
  const k = es.agents.balance.movements.kinds;
  switch (kind) {
    case "topup":
      return isCardTopup(sourceType) ? k.topup : k.manualTopup;
    case "call":
      return k.call;
    case "whatsapp":
      return k.whatsapp;
    case "sms":
      return k.sms;
    case "refund":
      return k.refund;
    case "adjustment":
      return k.adjustment;
    case "payout":
      return k.payout;
  }
}
