/**
 * `src/core/terms.ts` — las condiciones versionadas de un plan o servicio
 * y su aceptación (maqueta 13, RN-DAT-07, §104 de la maestra).
 *
 * **Quien decide el estado es el servidor.** `subscription_terms()`
 * devuelve uno de cuatro estados calculados sobre la versión vigente y la
 * aceptada (CLAUDE.md: los estados derivados se calculan en el servidor).
 * Lo que hay aquí es lo que la pantalla necesita para PINTARLO: reconocer
 * el estado, saber si pide una acción, y con qué tono. Ni una regla nueva.
 *
 * Los cuatro, en el orden en que le pasan a una suscripción:
 *
 *   no_terms  · el plan no tiene condiciones publicadas todavía;
 *   pending   · las tiene y el restaurante no ha aceptado ninguna;
 *   accepted  · aceptó la vigente;
 *   outdated  · aceptó una anterior y el espacio publicó otra después.
 *
 * `outdated` no es `pending`, y se pinta distinto a propósito: el
 * restaurante SÍ aceptó algo, y decirle "pendiente" borraría ese hecho.
 */

export const TERMS_STATUSES = ["no_terms", "pending", "accepted", "outdated"] as const;

export type TermsStatus = (typeof TERMS_STATUSES)[number];

export function isTermsStatus(value: string): value is TermsStatus {
  return (TERMS_STATUSES as readonly string[]).includes(value);
}

/**
 * Si el restaurante tiene algo que aceptar. Solo cuando HAY una versión
 * que aceptar: sin condiciones publicadas no hay botón, hay un motivo.
 */
export function termsNeedAcceptance(status: TermsStatus): boolean {
  return status === "pending" || status === "outdated";
}

export type TermsTone = "success" | "warning" | "neutral";

/**
 * El tono del estado. `outdated` avisa como `pending` —hay algo que
 * hacer—, y `no_terms` es neutro: no es un problema del restaurante, es
 * que el espacio no ha publicado nada.
 */
export function termsTone(status: TermsStatus): TermsTone {
  if (status === "accepted") return "success";
  if (termsNeedAcceptance(status)) return "warning";
  return "neutral";
}

/**
 * Un estado que no se reconozca se trata como PENDIENTE. Es la dirección
 * segura, la misma que `statusEffects()`: enseñar de más un aviso es
 * mejor que decirle a alguien que aceptó algo que no consta.
 */
export function termsStatusOf(value: string): TermsStatus {
  return isTermsStatus(value) ? value : "pending";
}
