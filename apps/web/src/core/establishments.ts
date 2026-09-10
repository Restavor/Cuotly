/**
 * `src/core/establishments.ts` — el listado de restaurantes (§20.2) y la
 * ficha del restaurante (PRD §15.2): lo que se puede decidir sin base de
 * datos. Lógica de dominio pura: sin Supabase, sin Next.js, sin React
 * (CLAUDE.md, regla de estilo de código).
 *
 * Aquí NO hay ningún umbral nuevo. Lo que necesita atención un restaurante
 * es exactamente lo que necesita atención en el Inicio del espacio, con
 * los mismos motivos y el mismo orden: se importa de `src/core/home.ts` en
 * vez de volver a decidirlo, porque dos definiciones de "esto es urgente"
 * acaban discrepando y entonces el listado y el Inicio se contradicen
 * delante de quien los mira (salvedad 18 del ROADMAP: tres listas de
 * estados llevaban meses desfasadas).
 */

import { CHANGE_CATEGORIES, type ChangeCategory } from "./classification-rules";
import { ATTENTION_KINDS, type AttentionItem, type AttentionKind } from "./home";
import type { EstablishmentState } from "./naming";

// ---------------------------------------------------------------------
// La ficha de datos (§15.2, RN-EST-11).
// ---------------------------------------------------------------------

/**
 * Los campos de la ficha, en el orden en el que se enseñan y se piden.
 *
 * La lista es la fuente y el tipo se DERIVA de ella, igual que
 * `CYCLE_CATEGORY_ORDER` se deriva de `CHANGE_CATEGORIES`: así no puede
 * existir un campo que se guarde y no se enseñe, ni al revés. Es el fallo
 * que se cuela solo — se añade una columna a la migración, se añade al
 * formulario y nadie se acuerda de la vista de lectura, que sigue
 * enseñando diez campos de once sin que falle nada.
 *
 * El nombre comercial NO está: es `establishments.name`, existe desde que
 * el restaurante se da de alta y se enseña en el encabezado, no como una
 * fila más de la ficha.
 */
export const IDENTITY_FIELDS = [
  "legalName",
  "taxId",
  "address",
  "postalCode",
  "city",
  "contactName",
  "contactEmail",
  "phonePrimary",
  "phoneSecondary",
  "websiteUrl",
  "instagram",
  "facebookUrl",
  "domain",
  "webPlatform",
  "openingHours",
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

/**
 * §15.2 · razón social, identificación fiscal, dirección, teléfonos,
 * correos, sitio web, dominio, horarios y plataforma web; y de la maqueta
 * 02, el nombre del contacto principal y las dos redes.
 *
 * `contactName` es el contacto DEL CLIENTE —quien firma, a quien se llama
 * cuando hay un impago—, nunca nadie del equipo de mantenimiento. Lo que
 * CLAUDE.md prohíbe es enseñarle al cliente la identidad de quien le
 * mantiene la web; su propio nombre lo escribe él.
 *
 * Todos pueden ser nulos y eso es información: un restaurante se da de
 * alta con su nombre y su código (RN-EST-06) y la ficha se rellena
 * después, así que la pantalla tiene que poder decir "sin rellenar" en vez
 * de enseñar un hueco (CA-20).
 */
export type EstablishmentIdentity = { readonly [K in IdentityField]: string | null };

/**
 * El único campo multilínea: el horario se guarda con sus saltos porque un
 * horario partido en dos tramos son dos líneas, y aplanarlo lo vuelve
 * ilegible.
 */
export const MULTILINE_IDENTITY_FIELDS: readonly IdentityField[] = ["openingHours"];

/**
 * Si la ficha está entera por rellenar. Sirve para distinguir "no hay
 * datos" de "hay algunos": lo primero se cuenta con su motivo y su enlace
 * para rellenarla, lo segundo se enseña.
 */
export function identityIsEmpty(identity: EstablishmentIdentity): boolean {
  return IDENTITY_FIELDS.every((field) => identity[field] === null);
}

// ---------------------------------------------------------------------
// Consumos del ciclo (RN-CON, §15.2 "Resumen").
// ---------------------------------------------------------------------

/**
 * El orden en el que se enseñan las cuatro bolsas del ciclo: los tres
 * tamaños de menor a mayor y la fotografía al final, que es otro eje.
 *
 * Se DERIVA de `CHANGE_CATEGORIES` en vez de escribirse suelto: si un día
 * apareciera una categoría nueva —la de más de 4 horas está aplazada en
 * CLAUDE.md, por ejemplo— esta lista dejaría de ser una permutación de
 * aquella y el test falla, en vez de que la bolsa nueva desaparezca
 * calladamente de la ficha.
 */
export const CYCLE_CATEGORY_ORDER: readonly ChangeCategory[] = [
  "small",
  "medium",
  "large",
  "photo",
];

export interface CycleBag {
  readonly category: ChangeCategory;
  /** Lo que incluye el plan en este ciclo (RN-COM-02). */
  readonly included: number;
  /** El saldo vivo: la bolsa más la suma de sus apuntes (CA-08). */
  readonly remaining: number;
}

export interface CycleUsage extends CycleBag {
  /**
   * Lo gastado del ciclo. Puede ser **negativo** cuando hay crédito
   * compensatorio (RN-CON-08): al devolver un consumo el saldo sube por
   * encima de lo incluido, y eso es un dato, no un error que redondear a
   * cero.
   */
  readonly used: number;
  /**
   * El porcentaje de la barra, o `null` cuando el plan no incluye nada de
   * esa categoría: sin bolsa no hay proporción que pintar, y una barra al
   * 0 % diría "te quedan todos", que es lo contrario de lo que pasa
   * (CA-20 · sin dato se dice el motivo, no se enseña un cero).
   */
  readonly percentUsed: number | null;
  /** Sin saldo: el siguiente cambio de esta categoría se presupuesta. */
  readonly exhausted: boolean;
}

/**
 * El estado de una bolsa del ciclo, para pintarla.
 *
 * El porcentaje se recorta a [0, 100] **solo para la barra**: una barra no
 * puede dibujar el 130 %. Los números que se leen —lo usado y lo que
 * queda— salen sin recortar, porque son los de verdad.
 */
export function cycleUsage(bag: CycleBag): CycleUsage {
  const used = bag.included - bag.remaining;
  const percentUsed =
    bag.included > 0 ? Math.min(100, Math.max(0, Math.round((used / bag.included) * 100))) : null;

  return { ...bag, used, percentUsed, exhausted: bag.remaining <= 0 };
}

/**
 * Las bolsas del ciclo en el orden de la ficha. Lo que llega del servidor
 * viene por categoría y sin orden garantizado; lo que no llega no se
 * inventa, se queda fuera.
 */
export function sortedCycleUsage(bags: readonly CycleBag[]): readonly CycleUsage[] {
  return CYCLE_CATEGORY_ORDER.flatMap((category) => {
    const bag = bags.find((b) => b.category === category);
    return bag === undefined ? [] : [cycleUsage(bag)];
  });
}

// ---------------------------------------------------------------------
// "Necesita atención", por restaurante (§20.2, columna del listado).
// ---------------------------------------------------------------------

/**
 * Lo que se lee en la columna "Necesita atención" de un restaurante: el
 * motivo más urgente que tiene, cuántas veces lo tiene, y cuántos otros
 * asuntos quedan detrás.
 *
 * `null` significa que no hay nada pendiente, y eso también es un dato:
 * la fila lo dice ("Sin pendientes") en vez de dejar la celda en blanco,
 * que se lee como "no se ha podido calcular".
 */
export interface AttentionHeadline {
  readonly kind: AttentionKind;
  /** Cuántos asuntos hay de ese mismo motivo. */
  readonly count: number;
  /** Cuántos quedan por debajo, de otros motivos menos urgentes. */
  readonly others: number;
}

/**
 * El motivo más urgente gana, con la prioridad que ya fija
 * `ATTENTION_KINDS` en `src/core/home.ts` (RN-SLA-17 primero, después lo
 * que está a punto, después lo que nadie ha asumido…). Este módulo no la
 * reordena: la usa.
 */
export function attentionHeadline(
  items: readonly AttentionItem[],
): AttentionHeadline | null {
  if (items.length === 0) return null;

  const priority = new Map(ATTENTION_KINDS.map((kind, index) => [kind, index]));
  const kind = items.reduce((worst, item) =>
    priority.get(item.kind)! < priority.get(worst.kind)! ? item : worst,
  ).kind;

  const count = items.filter((item) => item.kind === kind).length;
  return { kind, count, others: items.length - count };
}

/** Los asuntos de cada restaurante, indexados por su identificador. */
export function groupAttentionByEstablishment(
  items: readonly AttentionItem[],
): ReadonlyMap<string, readonly AttentionItem[]> {
  const porRestaurante = new Map<string, AttentionItem[]>();
  for (const item of items) {
    if (item.establishmentId === null) continue;
    const suyos = porRestaurante.get(item.establishmentId);
    if (suyos === undefined) {
      porRestaurante.set(item.establishmentId, [item]);
    } else {
      suyos.push(item);
    }
  }
  return porRestaurante;
}

// ---------------------------------------------------------------------
// Los filtros del listado (§20.2: grupo, plan, estado y buscador).
// ---------------------------------------------------------------------

export interface EstablishmentFilters {
  /** Texto libre sobre el nombre y el código. Vacío = sin filtrar. */
  readonly search: string;
  /** `null` = "Todos". */
  readonly groupId: string | null;
  /**
   * `null` = "Todos". El valor especial `"none"` filtra los restaurantes
   * **sin** plan de mantenimiento, que es un caso real (RN-COM-11: el plan
   * es opcional) y no una casilla vacía.
   */
  readonly planId: string | null;
  readonly status: EstablishmentState | null;
}

export interface FilterableEstablishment {
  readonly name: string;
  readonly code: string;
  readonly groupId: string;
  readonly planId: string | null;
  readonly status: EstablishmentState;
}

/** El valor de "sin plan" en el desplegable de planes. */
export const NO_PLAN_FILTER = "none";

/**
 * Normaliza para buscar: sin mayúsculas y sin tildes, para que "Magariños"
 * aparezca escribiendo "magarinos". Quien busca no siempre tiene el
 * teclado —ni la memoria— del acento exacto.
 */
export function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesFilters(
  establishment: FilterableEstablishment,
  filters: EstablishmentFilters,
): boolean {
  const buscado = searchKey(filters.search);
  if (buscado.length > 0) {
    const texto = `${searchKey(establishment.name)} ${searchKey(establishment.code)}`;
    if (!texto.includes(buscado)) return false;
  }

  if (filters.groupId !== null && establishment.groupId !== filters.groupId) return false;

  if (filters.planId !== null) {
    const buscaSinPlan = filters.planId === NO_PLAN_FILTER;
    if (buscaSinPlan ? establishment.planId !== null : establishment.planId !== filters.planId) {
      return false;
    }
  }

  if (filters.status !== null && establishment.status !== filters.status) return false;

  return true;
}

/**
 * Los filtros tal y como llegan de la dirección (`?buscar=…&grupo=…`).
 *
 * Viven en la URL a propósito: así una búsqueda se puede compartir y
 * volver atrás la deshace. Lo que no reconoce lo descarta en vez de
 * filtrar por un valor inventado — un `?estado=cualquiera` escrito a mano
 * enseñaría cero filas y parecería que no hay restaurantes.
 */
export function parseFilters(
  params: {
    readonly buscar?: string;
    readonly grupo?: string;
    readonly plan?: string;
    readonly estado?: string;
  },
  known: { readonly groupIds: readonly string[]; readonly planIds: readonly string[] },
  states: readonly EstablishmentState[],
): EstablishmentFilters {
  const grupo = params.grupo ?? "";
  const plan = params.plan ?? "";
  const estado = params.estado ?? "";

  return {
    search: params.buscar ?? "",
    groupId: known.groupIds.includes(grupo) ? grupo : null,
    planId:
      plan === NO_PLAN_FILTER || known.planIds.includes(plan) ? plan : null,
    status: (states as readonly string[]).includes(estado)
      ? (estado as EstablishmentState)
      : null,
  };
}

export type { AttentionItem, AttentionKind, ChangeCategory };
export { CHANGE_CATEGORIES };
