/**
 * RN-APP-03 · los avisos de una solicitud de Reservas y sus claves.
 *
 * La clave de deduplicación de cada aviso es `<tipo>:<id de la solicitud>`
 * (`reservations_notify_internal()`, migración 158): pulsar dos veces nunca
 * duplica un aviso (CA-17). Con ella se encuentra, para mandarlo al momento
 * (decisión 99), la entrega de push de cada aviso. Duplicadas a propósito con
 * el SQL: el test las compara con la migración.
 */
export const RESERVATION_NOTIFICATION_EVENTS = [
  "reservation_service_request",
  "reservation_service_received",
] as const;

export function reservationNotificationKeys(requestId: string): readonly string[] {
  return RESERVATION_NOTIFICATION_EVENTS.map((evento) => `${evento}:${requestId}`);
}
