import Image from "next/image";

import { Icon } from "@/components/ui/Icon";

/**
 * RN-EST-18 · la foto de un restaurante (decisión 62), en las cuatro
 * pantallas que la enseñan: el "Estado por restaurante" del Inicio
 * (página 22), la lista de Restaurantes (23), la ficha (24) y Gestión.
 *
 * **Está en un solo sitio por la regla que tiene que cumplir**, no por
 * ahorrar líneas. RN-EST-18 dice que un restaurante sin foto **se enseña
 * sin foto**: sin marco vacío, sin silueta gris, sin nada que dé a
 * entender que la imagen no cargó (CA-20). Esa regla repetida en cuatro
 * componentes se cumple en tres y medio.
 *
 * Lo que se pinta cuando no hay foto es el mismo icono de local que ya
 * pintaba el Inicio antes de que las fotos existieran: no es un hueco
 * esperando una imagen, es cómo se ve un restaurante en una lista.
 *
 * **El enlace caduca.** Viene firmado del bucket privado (RN-ARC-08), así
 * que `unoptimized`: `next/image` guardaría en su caché una URL que dejará
 * de servir dentro de una hora, y la foto se rompería para todo el mundo
 * hasta que la caché venciera.
 *
 * **`alt` vacío, a propósito.** El nombre del restaurante está siempre
 * escrito al lado, así que la foto no añade información: describirla haría
 * que un lector de pantalla dijera el nombre dos veces por fila. Es
 * decoración, y se declara como tal.
 */
export function EstablishmentPhoto({
  photoUrl,
  size,
  className = "",
}: {
  /** Enlace firmado y temporal, o `null` si el restaurante no tiene foto. */
  readonly photoUrl: string | null;
  /** El lado del cuadrado, en píxeles. */
  readonly size: number;
  readonly className?: string;
}) {
  const lado = { width: `${size}px`, height: `${size}px` };

  if (photoUrl === null) {
    return (
      <span
        aria-hidden="true"
        style={lado}
        className={`flex shrink-0 items-center justify-center rounded-[10px] bg-soft-surface ${className}`}
      >
        <Icon name="building" style={{ width: size / 2, height: size / 2 }} className="text-primary-dark" />
      </span>
    );
  }

  return (
    <Image
      src={photoUrl}
      alt=""
      width={size}
      height={size}
      style={lado}
      className={`shrink-0 rounded-[10px] object-cover ${className}`}
      unoptimized
    />
  );
}
