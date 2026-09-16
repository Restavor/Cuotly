/**
 * RN-MOV-10 · la clave de idempotencia nace con el borrador, no al pulsar.
 *
 * No hace falta que sea criptográfica: solo tiene que ser única para esta
 * persona y este borrador, y el servidor la usa para reconocer el mismo
 * envío dos veces (`post_message`, `request_menu_publication`,
 * `register_payment`). Se compone con el instante y azar suficiente para
 * que dos borradores creados en el mismo milisegundo no choquen.
 */
export function newIdempotencyKey(prefix: string): string {
  const azar = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")).join("");
  return `${prefix}:${Date.now().toString(36)}:${azar}`;
}

/** Un identificador local para borradores y caché; no se manda al servidor. */
export function newLocalId(): string {
  return newIdempotencyKey("local");
}
