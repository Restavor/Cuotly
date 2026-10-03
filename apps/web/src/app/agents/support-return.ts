/**
 * De dónde viene quien abrió Reservas como soporte, para devolverle allí al salir o al caducar la sesión
 * (PRD de agents §3.4: «al caducar, vuelve a la ficha del espacio»). Solo se aceptan las dos entradas que
 * existen; cualquier otra cosa, a la raíz: una dirección que viaja en una cookie nunca lleva a otro sitio.
 */
export const SUPPORT_RETURN_COOKIE = "restavor_soporte_vuelta";

const ALLOWED = [/^\/espacios\/[a-z0-9-]+\/reservas$/, /^\/administracion\/reservas$/];

export function safeReturnPath(value: string): string {
  return ALLOWED.some((pattern) => pattern.test(value)) ? value : "/";
}
