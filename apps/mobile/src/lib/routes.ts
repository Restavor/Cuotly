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
  return hrefWithoutAnchor(href);
}
