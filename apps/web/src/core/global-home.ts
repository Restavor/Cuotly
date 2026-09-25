/**
 * `src/core/global-home.ts` — el Inicio del contexto global (PRD §36,
 * RN-GLO-02). Lógica de dominio pura: sin Supabase, sin Next, sin React
 * (CLAUDE.md).
 *
 * Este archivo **no decide qué es urgente**. Eso ya está decidido en dos
 * sitios y aquí solo se juntan:
 *
 *   · el lado del **equipo** lo calcula `loadSpaceAttention()` con el reloj
 *     laborable de `business-clock.ts` —festivos del espacio incluidos, y
 *     los que se conocían cuando arrancó el contador (RN-CLK-10)—, que es
 *     donde CLAUDE.md manda que esté;
 *   · el lado del **restaurante** lo consulta `my_client_attention()` en
 *     SQL, porque ahí no hay reloj que calcular: es el estado de una fila.
 *
 * Lo que sí decide este archivo es **el orden**, y es la parte que más
 * fácil sería equivocar. RN-GLO-02 dice dos cosas: "el orden es el del
 * vencimiento real" y "lo vencido se marca como tal". De ahí sale una
 * regla de tres tramos, y no una mezcla de prioridades inventadas:
 *
 *   1. **Lo vencido primero.** Es lo único que ya cuesta dinero o
 *      confianza, y esconderlo entre lo que todavía llega a tiempo sería
 *      exactamente el fallo que la lista existe para evitar.
 *   2. **Luego lo que tiene vencimiento, del más próximo al más lejano.**
 *   3. **Luego lo que no lo tiene, de lo más antiguo a lo más reciente.**
 *      Una solicitud, un presupuesto y unas condiciones no tienen plazo
 *      escrito en ninguna parte; inventarles uno para poder ordenarlos
 *      sería inventar un umbral (CLAUDE.md).
 *   4. **Y al final, lo que ni siquiera tiene fecha de entrada.** No se
 *      sabe si lleva ahí un día o un mes, así que no se le da un sitio que
 *      afirme lo uno o lo otro.
 *
 * `now` se recibe siempre como argumento y nunca se lee de `Date.now()`:
 * quien mira esta lista la recibe pintada desde el servidor, y el reloj
 * del navegador no es la autoridad de nada (CLAUDE.md MUST).
 */

import type { AttentionKind } from "./home";

/**
 * Los seis motivos del lado del restaurante. Están duplicados con los
 * literales de `my_client_attention()` (migración 98) a propósito —son dos
 * sistemas que no pueden importarse el uno al otro— y los vigila
 * `listas-compartidas.test.ts`.
 *
 * El orden de la declaración no es la prioridad: la prioridad la decide el
 * vencimiento, arriba. Aquí es solo el orden en que se leen.
 */
export const CLIENT_ATTENTION_KINDS = [
  "request_needs_information",
  "request_pending_acceptance",
  "quote_to_decide",
  "charge_to_pay",
  "menu_to_prepare",
  "terms_to_accept",
] as const;
export type ClientAttentionKind = (typeof CLIENT_ATTENTION_KINDS)[number];

export function isClientAttentionKind(value: string): value is ClientAttentionKind {
  return (CLIENT_ATTENTION_KINDS as readonly string[]).includes(value);
}

/** Los dos lados de RN-GLO-05, y los mismos que separan las dos pestañas. */
export type ContextSide = "maintenance" | "restaurant";

export type GlobalAttentionKind = AttentionKind | ClientAttentionKind;

export interface GlobalAttentionItem {
  /** Único en la lista: hay entidades distintas con el mismo id en contextos distintos. */
  readonly key: string;
  readonly side: ContextSide;
  readonly kind: GlobalAttentionKind;
  /** El código o el nombre de la cosa: SOL-0003, PRE-0005, "Menú del jueves". */
  readonly title: string;
  /** De dónde es: el espacio, o el restaurante. RN-GLO-02 lo exige en cada fila. */
  readonly contextName: string;
  /** Qué acción abre. */
  readonly href: string;
  /** El vencimiento real, cuando existe. */
  readonly dueAt: string | null;
  /**
   * Cuándo entró. Es `null` cuando la consulta de la que sale la fila no lo
   * trajo, y **no se sustituye por ninguna fecha**: inventarle una para
   * poder ordenarla sería inventarse un dato (CA-20), y encima se leería en
   * pantalla como si fuera cierta.
   */
  readonly createdAt: string | null;
  /**
   * Si ya se pasó. En el lado del equipo lo dice el reloj laborable
   * (`jobDeadlineRisk`); en el del restaurante, la fecha de vencimiento
   * contra el reloj del servidor.
   */
  readonly overdue: boolean;
}

/**
 * RN-GLO-02 · el orden de la lista, en los tres tramos de la cabecera.
 *
 * Devuelve una copia: ordenar en el sitio un array que viene de otra capa
 * es la forma más fácil de que dos pantallas que comparten datos se pinten
 * distinto según cuál cargue primero.
 */
export function orderGlobalAttention(
  items: readonly GlobalAttentionItem[],
): readonly GlobalAttentionItem[] {
  return [...items].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;

    const conA = a.dueAt !== null;
    const conB = b.dueAt !== null;
    if (conA !== conB) return conA ? -1 : 1;

    if (conA && conB) {
      const orden = Date.parse(a.dueAt!) - Date.parse(b.dueAt!);
      if (orden !== 0) return orden;
    }

    const fechaA = a.createdAt !== null;
    const fechaB = b.createdAt !== null;
    if (fechaA !== fechaB) return fechaA ? -1 : 1;
    if (!fechaA) return 0;

    return Date.parse(a.createdAt!) - Date.parse(b.createdAt!);
  });
}

/**
 * Si una fila del lado del restaurante ya se ha pasado. Sin fecha de
 * vencimiento no se pasa nunca: un presupuesto sin decidir no está
 * "vencido", está esperando.
 */
export function clientItemIsOverdue(dueAt: string | null, now: Date): boolean {
  return dueAt !== null && Date.parse(dueAt) < now.getTime();
}

/**
 * RN-GLO-02 · el filtro de un solo contexto. Se compara por el nombre del
 * contexto porque es lo que la persona elige en pantalla y lo que la fila
 * enseña; comparar por id obligaría a la lista a llevar dos identidades
 * distintas para la misma cosa.
 */
export function filterByContext(
  items: readonly GlobalAttentionItem[],
  contextName: string | null,
): readonly GlobalAttentionItem[] {
  if (contextName === null) return items;
  return items.filter((item) => item.contextName === contextName);
}

/**
 * RN-GLO-05 · el contador de no leídos que la barra lateral enseña junto a
 * "Mensajes". Suma los de los dos lados: la bandeja reúne, así que el
 * número de fuera tiene que ser el mismo que el de dentro.
 */
export function totalUnread(
  conversations: readonly { readonly unread_count: number | null }[],
): number {
  return conversations.reduce((total, c) => total + (c.unread_count ?? 0), 0);
}

/**
 * RN-GLO-03 · con qué contextos se encuentra alguien al entrar, dicho de
 * una vez para que la pantalla no tenga que contar dos listas.
 *
 * "Ninguno" es un estado legítimo y con nombre propio: quien acaba de
 * entrar por una solicitud de acceso aprobada (RN-ACC-03) está aquí, y lo
 * que tiene que ver es el motivo y qué puede hacer, nunca una pantalla
 * vacía sin explicación (CLAUDE.md).
 */
export type ContextsShape = "none" | "only_spaces" | "only_restaurants" | "both";

export function contextsShape(counts: {
  readonly spaces: number;
  readonly restaurants: number;
}): ContextsShape {
  if (counts.spaces === 0 && counts.restaurants === 0) return "none";
  if (counts.restaurants === 0) return "only_spaces";
  if (counts.spaces === 0) return "only_restaurants";
  return "both";
}

/**
 * RN-GLO-03 · la pestaña que se abre en "Restaurantes" del contexto
 * global (`/restaurantes`), que separa los mismos contextos que el Inicio
 * en dos: **Mantenimiento**, los espacios de mantenimiento, y
 * **Restaurantes**, los paneles de restaurante.
 *
 * La de la dirección (`?lado=`, con los mismos valores que la bandeja)
 * manda. Sin ella se abre la que tenga algo, igual que la bandeja: quien
 * solo es restaurante no aterriza en una pestaña de Mantenimiento vacía.
 */
export function contextsTab(
  lado: string | null,
  counts: { readonly spaces: number; readonly restaurants: number },
): ContextSide {
  if (lado === "mantenimiento") return "maintenance";
  if (lado === "restaurantes") return "restaurant";
  return counts.spaces === 0 && counts.restaurants > 0 ? "restaurant" : "maintenance";
}
