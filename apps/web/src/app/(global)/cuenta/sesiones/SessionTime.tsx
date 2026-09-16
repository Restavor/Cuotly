"use client";

import { enZona, zonaDelNavegador } from "@/i18n/dates";

/**
 * HU-05 · cuándo se usó por última vez una sesión.
 *
 * **Por qué es un componente de cliente.** Es la única pantalla de Cuotly
 * que no cuelga de ningún espacio: son las sesiones de una persona. No hay
 * zona del espacio que aplicar, y la hora que esa persona espera leer es
 * la de su reloj ("entré a las nueve"). En el servidor eso no se puede
 * saber, así que se pinta en el navegador.
 *
 * `suppressHydrationWarning` es necesario y está puesto a sabiendas: el
 * servidor pinta esta misma fecha en su zona y el navegador la corrige al
 * montar. Es la diferencia que el atributo existe para permitir, y la
 * alternativa —no pintar nada hasta montar— dejaría la tarjeta a medias.
 */
export function SessionTime({ value }: { value: string | null }) {
  if (!value) return <>—</>;

  return (
    <time dateTime={value} suppressHydrationWarning>
      {enZona(value, zonaDelNavegador(), { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
