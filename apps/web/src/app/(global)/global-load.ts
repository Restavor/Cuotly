import type { SupabaseClient } from "@supabase/supabase-js";

import {
  clientItemIsOverdue,
  contextsShape,
  orderGlobalAttention,
  totalUnread,
  type ContextsShape,
  type GlobalAttentionItem,
} from "@/core/global-home";
import type { SpaceRequestState } from "@/core/space-requests";
import type { Database } from "@/lib/supabase/database.types";
import {
  myClientAttention,
  myContexts,
  myConversations,
  type ContextRow,
  type GlobalConversationRow,
} from "@/services/global-gateway";

import { loadSpaceAttention } from "../espacios/[slug]/home-load";

type Supabase = SupabaseClient<Database>;

/**
 * El Inicio del contexto global (PRD §36, RN-GLO-02), cargado **entero en
 * el servidor**: "lo calcula el servidor en una sola función, nunca el
 * navegador sumando pantallas".
 *
 * Esta es esa función. Lo que hace, y lo que deliberadamente no hace:
 *
 *   · **No define qué es urgente.** El lado del equipo se lo pregunta a
 *     `loadSpaceAttention()`, la misma que alimenta el Inicio de cada
 *     espacio (§20.4) y la columna "Necesita atención" del listado de
 *     restaurantes. Es lo que evita tener dos definiciones de "urgente" y
 *     verlas discrepar en la misma sesión; el precio es una vuelta por
 *     espacio, que se pagan en paralelo.
 *   · **No consulta nada privilegiado** (RN-GLO-01). Todo sale de las
 *     mismas políticas de RLS que deciden qué ve esa persona dentro de
 *     cada contexto. Quien pierde el acceso a un espacio deja de verlo
 *     aquí en la misma consulta.
 *   · **No lee el reloj del navegador.** `now` entra como argumento.
 */
export interface GlobalHome {
  readonly shape: ContextsShape;
  readonly spaces: readonly ContextRow[];
  readonly restaurants: readonly ContextRow[];
  readonly attention: readonly GlobalAttentionItem[];
  readonly conversations: readonly GlobalConversationRow[];
  readonly unread: number;
  readonly requests: readonly SpaceRequestSummary[];
  /**
   * Qué no se ha podido leer, para decirlo en su sitio en vez de enseñar
   * una lista corta como si estuviera entera (CLAUDE.md: si no hay dato,
   * se dice el motivo).
   */
  readonly failed: {
    readonly contexts: boolean;
    readonly attention: boolean;
    readonly conversations: boolean;
  };
}

export interface SpaceRequestSummary {
  readonly id: string;
  readonly business_name: string;
  readonly plan: string;
  readonly status: SpaceRequestState;
  readonly status_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export async function loadGlobalHome(
  supabase: Supabase,
  now: Date = new Date(),
): Promise<GlobalHome> {
  const contexts = await myContexts(supabase).catch(() => null);

  const spaces = (contexts ?? []).filter((c) => c.kind === "space");
  const restaurants = (contexts ?? []).filter((c) => c.kind === "establishment");

  const [equipo, cliente, conversaciones, solicitudes] = await Promise.all([
    // Una vuelta por espacio, en paralelo. Un espacio que falle no deja sin
    // Inicio a los demás: se marca y se sigue.
    Promise.all(
      spaces.map(async (space) => {
        try {
          const atencion = await loadSpaceAttention(
            supabase,
            space.space_id,
            space.space_slug ?? "",
            now,
          );
          return { space, items: atencion.items, failed: false as const };
        } catch {
          return { space, items: [], failed: true as const };
        }
      }),
    ),
    myClientAttention(supabase).catch(() => null),
    myConversations(supabase).catch(() => null),
    // RN-GLO-04 · las solicitudes de creación de espacio son de quien las
    // escribió, y la política ya lo garantiza; el filtro explícito está
    // por claridad, no por seguridad.
    supabase
      .from("space_requests")
      .select("id, business_name, plan, status, status_reason, created_at, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  const items: GlobalAttentionItem[] = [];

  for (const { space, items: filas } of equipo) {
    for (const fila of filas) {
      items.push({
        key: `space:${space.space_id}:${fila.kind}:${fila.id}`,
        side: "maintenance",
        kind: fila.kind,
        title: fila.title,
        contextName: space.space_name ?? "",
        href: fila.deepLink,
        // El plazo de un trabajo no está guardado en ninguna columna y no
        // lo estará (CA-10): se recalcula desde sus eventos. Lo que llega
        // aquí ya es el veredicto del reloj laborable.
        dueAt: null,
        createdAt: fila.createdAt,
        overdue: fila.kind === "job_out_of_deadline",
      });
    }
  }

  for (const fila of cliente ?? []) {
    items.push({
      key: `est:${fila.establishment_id}:${fila.kind}:${fila.entity_id}`,
      side: "restaurant",
      kind: fila.kind as GlobalAttentionItem["kind"],
      title: fila.title ?? fila.entity_type,
      contextName: fila.establishment_name,
      href: hrefDelCliente(fila.space_slug, fila.establishment_id, fila.entity_type, fila.entity_id),
      dueAt: fila.due_at,
      createdAt: fila.created_at,
      overdue: clientItemIsOverdue(fila.due_at, now),
    });
  }

  return {
    shape: contextsShape({ spaces: spaces.length, restaurants: restaurants.length }),
    spaces,
    restaurants,
    attention: orderGlobalAttention(items),
    conversations: conversaciones ?? [],
    unread: totalUnread(conversaciones ?? []),
    // RN-GLO-04 · TODAS, decididas incluidas: "su estado, el plan pedido,
    // la fecha y la acción que toca ahora". Una aprobada sigue teniendo
    // acción —ver las instrucciones de pago— y una rechazada, su motivo.
    requests: (solicitudes.data ?? []) as SpaceRequestSummary[],
    failed: {
      contexts: contexts === null,
      attention: cliente === null || equipo.some((e) => e.failed),
      conversations: conversaciones === null,
    },
  };
}

/**
 * A dónde lleva cada fila del lado del restaurante. Las rutas del panel
 * del restaurante son las que ya existen; aquí no se inventa ninguna.
 */
function hrefDelCliente(
  slug: string | null,
  establishmentId: string,
  entityType: string,
  entityId: string,
): string {
  const base = `/espacios/${slug ?? ""}/restaurantes/${establishmentId}`;
  switch (entityType) {
    case "request":
      return `${base}/solicitudes/${entityId}`;
    // §84 · los presupuestos del restaurante se ven y se deciden en
    // Facturación, no en una pantalla propia: es donde vive
    // `ClientQuoteCard`.
    case "quote":
    case "charge":
      return `${base}/facturacion`;
    case "menu":
      return `${base}/menu-diario`;
    // RN-DAT-07 · las condiciones se aceptan en la portada del panel, que
    // es donde está `AcceptTermsButton`.
    case "subscription":
      return base;
    default:
      return base;
  }
}
