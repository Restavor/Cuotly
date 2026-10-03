/**
 * `src/services/agents/messaging/fake.ts` · el proveedor FALSO de avisos (Fase F; PRD de agents §10.3, decisión 159).
 *
 * No envía nada y no tiene tabla: cada envío «sale bien» con un identificador `fake_…` y el aviso queda en
 * `reservation_notifications` con `provider = 'fake'`; la pantalla de Pruebas › Mensajes lo redacta al vuelo con los
 * datos de ahora. Para probar los caminos difíciles sin cuentas, el final del teléfono simula casos:
 *
 *   · `…0404`  sin WhatsApp: el WhatsApp es «no entregable» y el aviso pasa a SMS, que sale bien.
 *   · `…0405`  sin nada: ni WhatsApp ni SMS son entregables (se ve el final del camino de respaldo).
 *   · `…0500`  fallo temporal: falla en el intento 1 y el 2, y sale en el 3 (se ven los reintentos).
 *
 * Solo se elige con `ENABLE_FAKE_MESSAGING=true` y fuera de producción (`selectProviders`).
 */
import type {
  EmailMessage,
  EmailProvider,
  MessagingProviders,
  SendResult,
  SmsMessage,
  SmsProvider,
  WhatsAppProvider,
  WhatsAppTemplateMessage,
} from "./provider";

/** El teléfono que simula un caso, por su final. */
export function fakeCaseOf(to: string): "no_whatsapp" | "undeliverable" | "temporary" | null {
  if (to.endsWith("0404")) return "no_whatsapp";
  if (to.endsWith("0405")) return "undeliverable";
  if (to.endsWith("0500")) return "temporary";
  return null;
}

function outcome(channel: "email" | "whatsapp" | "sms", noticeId: string, attempt: number, to: string): SendResult {
  const simulated = channel === "email" ? null : fakeCaseOf(to);
  if (simulated === "undeliverable" || (simulated === "no_whatsapp" && channel === "whatsapp")) {
    return { ok: false, kind: "undeliverable", code: channel === "whatsapp" ? "meta_131026" : "sms_30006" };
  }
  if (simulated === "temporary" && attempt < 3) {
    return { ok: false, kind: "temporary", code: channel === "whatsapp" ? "meta_131000" : "sms_30001" };
  }
  return { ok: true, providerMessageId: `fake_${channel}_${noticeId}` };
}

export function createFakeProviders(): MessagingProviders {
  const email: EmailProvider = {
    name: "fake",
    isConfigured: () => true,
    async send(message: EmailMessage) {
      return outcome("email", message.noticeId, message.attempt, message.to);
    },
  };
  const whatsapp: WhatsAppProvider = {
    name: "fake",
    isConfigured: () => true,
    async sendTemplate(message: WhatsAppTemplateMessage) {
      return outcome("whatsapp", message.noticeId, message.attempt, message.to);
    },
    async sendText() {
      return { ok: true, providerMessageId: "fake_whatsapp_text" };
    },
  };
  const sms: SmsProvider = {
    name: "fake",
    isConfigured: () => true,
    async send(message: SmsMessage) {
      return outcome("sms", message.noticeId, message.attempt, message.to);
    },
    // El precio real del SMS falso lo «simula» un botón de Pruebas › Mensajes, no se pregunta a nadie.
    async fetchPrice() {
      return null;
    },
  };
  return { mode: "fake", email, whatsapp, sms };
}
