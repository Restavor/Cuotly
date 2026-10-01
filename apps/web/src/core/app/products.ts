/**
 * Restavor app · la puerta común (PRD de agents §4, decisión 88).
 *
 * Lógica pura, sin Supabase, Next ni React: qué productos tiene una persona,
 * cuándo se le enseña el Inicio de Restavor app y cuándo se la manda directa a
 * su único producto (RN-APP-02), y qué sale en el menú del logo para cambiar de
 * producto. Los datos los calcula el servidor con `my_products()` (RN-APP-01);
 * aquí solo se lee lo que ya viene decidido.
 */

export const PRODUCT_ROW_KINDS = ["web", "agents", "agents_offer", "agents_requests"] as const;
export type ProductRowKind = (typeof PRODUCT_ROW_KINDS)[number];

/** Una fila de `my_products()`. */
export interface ProductRow {
  readonly kind: ProductRowKind;
  readonly spaceId: string;
  readonly spaceSlug: string;
  readonly establishmentId: string | null;
  readonly establishmentName: string | null;
  /** web: 'team' o 'panel'. agents: el estado del servicio. agents_requests: el de la solicitud. */
  readonly detail: string | null;
  /** agents_requests rechazada: el motivo que escribió Restavor. */
  readonly reason: string | null;
  readonly at: string | null;
}

export function isProductRowKind(value: string): value is ProductRowKind {
  return (PRODUCT_ROW_KINDS as readonly string[]).includes(value);
}

export interface ProductSummary {
  readonly webRows: readonly ProductRow[];
  readonly agentsRows: readonly ProductRow[];
  readonly offers: readonly ProductRow[];
  readonly requests: readonly ProductRow[];
  readonly hasWeb: boolean;
  readonly hasAgents: boolean;
}

export function summarizeProducts(rows: readonly ProductRow[]): ProductSummary {
  const of = (kind: ProductRowKind) => rows.filter((row) => row.kind === kind);
  const webRows = of("web");
  const agentsRows = of("agents");
  return {
    webRows,
    agentsRows,
    offers: of("agents_offer"),
    requests: of("agents_requests"),
    hasWeb: webRows.length > 0,
    hasAgents: agentsRows.length > 0,
  };
}

export type HomeDecision =
  | { readonly kind: "show" }
  | { readonly kind: "redirect"; readonly to: "/web" | "/agents" };

/**
 * RN-APP-02 · cuándo se enseña el Inicio.
 *
 * Se enseña con dos productos; con uno y algo que contratar o una solicitud;
 * y sin ninguno (entonces dice por qué). Solo se salta con un único producto y
 * nada más —un trabajador de un espacio, un restaurante solo con Reservas—: ahí
 * se entra directo en ese producto.
 *
 * `isPlatform`: quien es de Restavor web (Bosco y su equipo) entra siempre en
 * Restavor web aunque no sea miembro de ningún espacio: su entrada a
 * Administración vive en `/web`. Sin esto, el Propietario de Restavor web que
 * aún no ha creado el espacio de Restavor se quedaría sin puerta.
 */
export function homeBehavior(
  summary: ProductSummary,
  options: { readonly isPlatform?: boolean } = {},
): HomeDecision {
  const hasWeb = summary.hasWeb || options.isPlatform === true;
  const count = (hasWeb ? 1 : 0) + (summary.hasAgents ? 1 : 0);
  const somethingToDo = summary.offers.length > 0 || summary.requests.length > 0;

  if (count === 2) return { kind: "show" };
  if (count === 0) return { kind: "show" };
  if (somethingToDo) return { kind: "show" };
  return { kind: "redirect", to: hasWeb ? "/web" : "/agents" };
}

export type ProductKey = "app" | "web" | "agents";

export interface ProductSwitchItem {
  readonly key: ProductKey;
  readonly href: string;
  /** `current`: es donde está; `open`: puede entrar; `contract`: se le ofrece contratarlo. */
  readonly state: "current" | "open" | "contract";
}

/**
 * El menú del logo (`AppCambiarProducto`): "Inicio de Restavor", "Restavor
 * web" y "Restavor agents". Solo salen los productos que la persona puede
 * usar; lo que no tiene contratado sale como "Contratar" y únicamente si se
 * le puede ofrecer. Lo que no puede usar, no sale.
 */
export function productSwitchItems(
  summary: ProductSummary,
  current: ProductKey,
  options: { readonly isPlatform?: boolean } = {},
): readonly ProductSwitchItem[] {
  const hasWeb = summary.hasWeb || options.isPlatform === true;
  const items: ProductSwitchItem[] = [
    { key: "app", href: "/", state: current === "app" ? "current" : "open" },
  ];

  if (hasWeb) {
    items.push({ key: "web", href: "/web", state: current === "web" ? "current" : "open" });
  } else if (summary.hasAgents) {
    // Quien solo tiene Reservas puede querer el mantenimiento web: el Inicio
    // le explica qué es y cómo pedirlo.
    items.push({ key: "web", href: "/", state: "contract" });
  }

  if (summary.hasAgents) {
    items.push({ key: "agents", href: "/agents", state: current === "agents" ? "current" : "open" });
  } else if (summary.offers.length > 0) {
    items.push({ key: "agents", href: "/", state: "contract" });
  }

  return items;
}

/** Los estados del servicio de Reservas que `my_products()` devuelve en `detail`. */
export const RESERVATION_SERVICE_STATUSES = [
  "approved_pending_payment",
  "active",
  "past_due",
  "paused",
  "ending",
  "closed",
] as const;
export type ReservationServiceStatus = (typeof RESERVATION_SERVICE_STATUSES)[number];

export function isReservationServiceStatus(value: string | null): value is ReservationServiceStatus {
  return value !== null && (RESERVATION_SERVICE_STATUSES as readonly string[]).includes(value);
}

/** Los estados de una solicitud de Reservas que enseña el Inicio. */
export type ReservationRequestStatus = "requested" | "rejected";

export function isReservationRequestStatus(value: string | null): value is ReservationRequestStatus {
  return value === "requested" || value === "rejected";
}
