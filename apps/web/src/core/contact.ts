/**
 * La dirección de contacto de Cuotly (decisión 67, 22/09/2026).
 *
 * Es la de "Contactar con Cuotly" en la solicitud de acceso (A03 y A04) y
 * la de "Ayuda" para quien todavía no tiene cuenta: el centro de ayuda
 * pide entrar, y quien pide acceso no puede.
 */
export const CUOTLY_CONTACT_EMAIL = "info@restavor.com";

export function contactMailto(): string {
  return `mailto:${CUOTLY_CONTACT_EMAIL}`;
}
