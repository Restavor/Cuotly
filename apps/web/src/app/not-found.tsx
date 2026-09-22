import { ElementUnavailable } from "@/components/access/AccessStates";

/**
 * A07 · lo que ve quien abre un enlace a algo que no existe o no es suyo.
 *
 * Es el `notFound()` de toda la aplicación: una ficha de otro restaurante,
 * una solicitud borrada, un enlace copiado a medias. Las dos cosas se dicen
 * juntas a propósito —"puede que ya no esté disponible o que no tengas
 * permiso"— porque distinguirlas le contaría a quien prueba identificadores
 * cuáles existen.
 */
export default function NotFound() {
  return <ElementUnavailable />;
}
