import { splitRemaining } from "@/core/home";
import { es } from "./es";

/**
 * "Quedan 2 h", "Quedan 45 min", "Quedan 2 h y 30 min".
 *
 * Vivía copiado en tres archivos —el detalle de una solicitud, la lista de
 * atención del inicio y el detalle de un trabajo— con el mismo cuerpo
 * exacto en los tres. La maqueta 03 pedía un cuarto ("Quedan 2 h para
 * comenzar", en el Resumen del restaurante) y cuatro copias de una función
 * de cinco líneas es la manera de que un día digan cosas distintas.
 *
 * Aquí y no en `src/core/`: `splitRemaining()` es la parte de dominio —los
 * minutos a horas y minutos, con su prueba— y esto es la parte que elige
 * las palabras en español, que es lo que hace el sistema de i18n.
 */
export function tiempoRestante(minutes: number): string {
  const { hours, minutes: resto } = splitRemaining(minutes);
  if (hours === 0) return es.spaceHome.attention.minutes(resto);
  if (resto === 0) return es.spaceHome.attention.hours(hours);
  return es.spaceHome.attention.hoursAndMinutes(hours, resto);
}
