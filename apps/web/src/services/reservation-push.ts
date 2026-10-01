/**
 * `src/services/reservation-push.ts` — el push al momento de una solicitud de
 * Reservas (decisión 99: «los push, siempre al instante»; los correos, en las
 * dos tandas del día).
 *
 * Se llama justo después de la RPC que crea la solicitud y avisa. Solo manda las
 * entregas de push de los dos avisos de esa solicitud; el correo sale en su
 * tanda. Es un mejor esfuerzo: si falla, la entrega queda en la cola y la
 * recoge la tanda de siempre, y la solicitud —que ya existe— no se ve afectada.
 */

import { reservationNotificationKeys } from "@/core/app/reservation-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

import { createExpoPushTransport, createPushComposer, createSupabaseQueueGateway } from "./queue-gateway";
import { sendPushNow } from "./queue-runner";

export async function sendReservationPushNow(requestId: string): Promise<void> {
  try {
    await sendPushNow(
      createSupabaseQueueGateway(createAdminClient()),
      {
        push: createExpoPushTransport(process.env.EXPO_PUSH_ACCESS_TOKEN),
        pushComposer: createPushComposer(),
      },
      reservationNotificationKeys(requestId),
    );
  } catch (error) {
    console.error(
      `[push] no se pudo mandar al momento el aviso de la solicitud ${requestId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
