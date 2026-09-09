/**
 * `src/core/requests.ts` — lo que la pantalla de una solicitud tiene que
 * DECIDIR, sin Supabase, sin Next y sin React (CLAUDE.md).
 *
 * La pantalla de validación interna (§20.4, HU-11) enseña tres cosas que
 * no son una columna de una tabla: el titular de la solicitud, lo que va a
 * costar aceptarla y si el reloj de primera atención sigue corriendo. Las
 * tres son cálculo, y el cálculo vive aquí para que tenga tests y para que
 * la pantalla no sea la autoridad de nada (CLAUDE.md, MUST).
 *
 * Lo que NO está aquí, a propósito: el nombre visible de un estado o de
 * una categoría, que sale de `src/i18n/es.ts` una sola vez (CA-21), y
 * cualquier comprobación de permiso, que la hace el servidor.
 */

import type { CycleBag } from "./establishments";
import type { ChangeCategory } from "./consumption-ledger";
import type { TimerEvent } from "./timer-events";

/**
 * El color de la insignia de estado. Vive aquí y no en una pantalla porque
 * lo pintan tres —la bandeja del equipo, el detalle del equipo y la ficha
 * del restaurante—, y cuando cada una tenía el suyo el mismo estado salía
 * azul en una y gris en otra.
 *
 * El color nunca es la única señal (§21.4): la insignia lleva siempre el
 * nombre del estado al lado.
 */
export type RequestTone = "success" | "warning" | "info" | "neutral" | "danger";

export function requestTone(state: string): RequestTone {
  if (state === "published" || state === "closed" || state === "accepted") return "success";
  if (state === "pending_client_acceptance" || state === "needs_information") return "warning";
  if (state.startsWith("cancelled") || state === "rejected") return "danger";
  if (state === "in_progress" || state === "in_correction" || state === "analyzing") return "info";
  return "neutral";
}

/**
 * El titular de la solicitud: la primera frase de lo que escribió el
 * restaurante.
 *
 * No hay columna "título" y no se inventa una: una solicitud es un texto
 * (`requests.description`, RN-REQ) y su titular es su primera frase, igual
 * que el asunto de un correo es su primera línea cuando no lo escribieron
 * aparte. El texto completo se sigue leyendo entero debajo, en el bloque
 * "Mensaje del restaurante": esto elige qué se pone en el `<h1>`, no
 * resume ni recorta información.
 *
 * Corta por el primer punto, interrogación o exclamación seguidos de
 * espacio o final, y si la primera frase es más larga que `maxLength`
 * corta por la última palabra entera y añade el puntos suspensivos. Un
 * texto vacío no puede darse —la base exige `length(btrim(description)) >
 * 0`— pero si llegara, devuelve cadena vacía en vez de reventar.
 */
export function requestHeadline(description: string, maxLength = 80): string {
  const texto = description.trim().replace(/\s+/g, " ");
  if (texto === "") return "";

  const corte = texto.match(/^[^.?!]+[.?!]?/);
  const frase = (corte === null ? texto : corte[0]).trim();
  const limpia = frase.replace(/[.]$/, "");

  if (limpia.length <= maxLength) return limpia;

  const recortada = limpia.slice(0, maxLength);
  const ultimoEspacio = recortada.lastIndexOf(" ");
  return `${(ultimoEspacio > 0 ? recortada.slice(0, ultimoEspacio) : recortada).trimEnd()}…`;
}

/**
 * ¿Sigue corriendo un contador? Manda el último evento de su libro
 * (RN-SLA-03: T1 se detiene al pasar a `pending_client_acceptance`,
 * `needs_information` o `rejected`, y cada una de esas transiciones deja
 * su `stopped` o su `paused`).
 *
 * Es la misma regla que `counter_is_running()` en SQL (migración 25), que
 * no se puede llamar por RPC: tiene el EXECUTE revocado a `authenticated`
 * a propósito. Se recalcula desde los eventos, nunca desde un contador
 * mutable (CA-10, CLAUDE.md MUST).
 */
export function counterIsRunning(events: readonly TimerEvent[]): boolean {
  const ultimo = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).at(-1);
  return ultimo !== undefined && (ultimo.type === "started" || ultimo.type === "resumed");
}

/**
 * Lo que le costará al restaurante aceptar esta solicitud.
 *
 * Es **estimado** y lo dice el nombre: el consumo se registra en la
 * aceptación del cliente, no antes (RN-CLS-08). Hasta entonces esto es lo
 * que va a pasar cuando acepte, no lo que ha pasado.
 *
 * Los tres desenlaces son los tres caminos de `accept_request()`
 * (migración 20) y no una interpretación de ellos:
 *
 *   `included` .. el plan incluye esa categoría y queda saldo: se
 *                 descuenta **un** apunte de -1 del libro. Uno, siempre:
 *                 una solicitud es un cambio.
 *   `budgeted` .. el plan no incluye ninguno de esa categoría
 *                 (`included = 0`, el caso del Básico y el de un
 *                 establecimiento sin plan — RN-COM-12): no toca bolsa y
 *                 va a presupuesto.
 *   `exhausted`.. el plan sí la incluye pero el ciclo está a cero. Esto
 *                 **no** es "va a presupuesto": `accept_request()` falla
 *                 con "Sin crédito disponible", así que el restaurante no
 *                 podrá aceptar. Quien valida tiene que saberlo ANTES de
 *                 mandarle una propuesta que no va a poder aceptar.
 *
 * `unknown` es el cuarto, y es el honesto: la bolsa de esa categoría no
 * llegó (sin suscripción activa, o la consulta falló). No se supone
 * ninguno de los otros tres — decir "1 cambio pequeño" sin haber leído el
 * ciclo sería afirmar algo que nadie ha comprobado (CA-20).
 */
export type ConsumptionEstimate =
  | { readonly kind: "included"; readonly category: ChangeCategory; readonly included: number; readonly remaining: number }
  | { readonly kind: "budgeted"; readonly category: ChangeCategory }
  | { readonly kind: "exhausted"; readonly category: ChangeCategory; readonly included: number }
  | { readonly kind: "unknown"; readonly category: ChangeCategory };

export function consumptionEstimate(
  category: ChangeCategory,
  bags: readonly CycleBag[],
): ConsumptionEstimate {
  const bag = bags.find((b) => b.category === category);
  if (bag === undefined) return { kind: "unknown", category };
  if (bag.included <= 0) return { kind: "budgeted", category };
  if (bag.remaining <= 0) return { kind: "exhausted", category, included: bag.included };
  return { kind: "included", category, included: bag.included, remaining: bag.remaining };
}

/**
 * Por qué está parado el reloj de primera atención, dicho por el estado de
 * la solicitud (RN-SLA-01/03).
 *
 * `null` significa que el estado no explica la parada — o porque T1 no ha
 * arrancado todavía, o porque la solicitud ya pasó de largo de este tramo.
 * Quien lo pinta dice entonces eso, no se inventa una causa.
 */
export type T1StopCause = "waiting_client" | "waiting_information" | "rejected" | "closed";

export function t1StopCause(state: string): T1StopCause | null {
  if (state === "pending_client_acceptance") return "waiting_client";
  if (state === "needs_information") return "waiting_information";
  if (state === "rejected") return "rejected";
  if (
    state === "accepted" ||
    state === "in_progress" ||
    state === "published" ||
    state === "correction_requested" ||
    state === "in_correction" ||
    state === "closed" ||
    state.startsWith("cancelled")
  ) {
    return "closed";
  }
  return null;
}
