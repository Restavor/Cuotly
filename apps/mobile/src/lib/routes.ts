import { hrefWithoutAnchor } from "@/components/shell/navigation";

/**
 * La ruta por la que se navega **en el teléfono**.
 *
 * Los destinos son los de la web (RN-MOV-01) y desde RN-PAN-07 tres de los
 * del panel del restaurante llevan ancla —`#solicitudes`,
 * `#nueva-solicitud`, `#mensajes`—, porque en un navegador el ancla es la
 * forma honesta de decir a qué parte de una página larga lleva cada fila.
 *
 * `expo-router` casa rutas de ficheros y no sabe de fragmentos, así que
 * `/espacios/x/restaurantes/y#solicitudes` no es ninguna de sus rutas: un
 * restaurante que abriera "Más" y tocara cualquiera de los tres aterrizaba
 * en "esto está en la web" teniendo la pantalla delante. Se quita el ancla
 * y se llega a la misma pantalla, que es lo que el ancla decía.
 *
 * Que la app no pueda ir **a la parte** de la pantalla es lo que queda
 * abierto, y no se resuelve inventando tres rutas que no existen: lo dirá
 * el diseño definitivo móvil.
 */
export function navigableHref(href: string): string {
  const ruta = hrefWithoutAnchor(href);
  // R05 y R06 · en la web "Solicitudes" y "Nueva solicitud" ya son
  // pantallas propias (`PANEL_ROUTES`). En la app todavía no: la lista y
  // el formulario están en la pantalla del restaurante, y
  // `/solicitudes/nueva` casaría con `solicitudes/[requestId]` como si
  // "nueva" fuera una solicitud. Se lleva a la pantalla que sí los tiene.
  // Lo mismo con "Mensajes" (R20): en la app la conversación está en la
  // pantalla del restaurante.
  const panel = ruta.match(/^(\/espacios\/[^/]+\/restaurantes\/[^/]+)\/(?:solicitudes(?:\/nueva)?|mensajes)$/);
  return panel ? panel[1] : ruta;
}

/**
 * A dónde lleva la pantalla de entrar. Con sesión, a la portada (`/`), que
 * elige el contexto; sin ella, a ningún sitio: se queda en el formulario.
 *
 * Existe porque faltaba: `login.tsx` solo enseñaba el error cuando lo había,
 * y cuando todo iba bien **no navegaba**. En el teléfono se veía la misma
 * pantalla después de un inicio de sesión correcto, y cada pulsación volvía
 * a iniciar sesión (23/09/2026: diez en un minuto con la contraseña buena).
 * Mientras la sesión se está leyendo no se decide nada, para no enseñar el
 * formulario un instante a quien ya ha entrado.
 */
export function loginScreenDestination(hasSession: boolean, loading: boolean): "/" | null {
  if (loading) return null;
  return hasSession ? "/" : null;
}
