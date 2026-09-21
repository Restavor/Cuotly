import type { AttentionItem } from "@/core/home";
import { groupAttentionByEstablishment } from "@/core/establishments";
import { PENDING_REQUEST_STATES } from "@/core/home";
import type { EstablishmentState } from "@/core/naming";
import type { createClient } from "@/lib/supabase/server";

import { loadSpaceAttention } from "../home-load";

/**
 * El listado de restaurantes del espacio (§20.2), leído del servidor.
 *
 * Es un adaptador: consulta, junta y deja las decisiones en
 * `src/core/establishments.ts`. Lo único que hace de más es reutilizar
 * `loadSpaceAttention()`, para que la columna "Necesita atención" diga
 * exactamente lo mismo que la lista del Inicio — con dos cálculos
 * distintos acabarían discrepando en la misma pantalla.
 *
 * **Ningún filtro de permisos escrito a mano.** Qué restaurantes se ven lo
 * decide RLS sobre `establishments`: un trabajador ve los que tiene
 * autorizados y un cliente no llega aquí.
 */
type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface EstablishmentListRow {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly status: EstablishmentState;
  readonly groupId: string;
  readonly groupName: string | null;
  readonly planId: string | null;
  readonly planName: string | null;
  /**
   * Página 23 del diseño · la ciudad, bajo el nombre. Puede faltar: una
   * ficha recién creada no la tiene todavía, y entonces no se escribe
   * nada — ni "—", ni una ciudad supuesta (P6).
   */
  readonly city: string | null;
  /**
   * Página 23 · "Solicitudes abiertas". Son las que esperan a alguien
   * **antes** de que empiece el trabajo (`PENDING_REQUEST_STATES`, la
   * misma lista derivada que cuenta el Inicio): a partir de aceptar, lo
   * que hay es un trabajo y los trabajos se cuentan aparte.
   */
  readonly openRequests: number;
  readonly attention: readonly AttentionItem[];
}

export interface EstablishmentList {
  readonly rows: readonly EstablishmentListRow[];
  readonly activeCount: number;
  /** Los grupos y planes que EXISTEN, para poblar los desplegables. */
  readonly groups: readonly { readonly id: string; readonly name: string }[];
  readonly plans: readonly { readonly id: string; readonly name: string }[];
}

export async function loadEstablishmentList(
  supabase: Supabase,
  spaceId: string,
  spaceSlug: string,
  now: Date = new Date(),
): Promise<EstablishmentList> {
  const [
    { data: establishments },
    { data: groups },
    { data: plans },
    { data: subscriptions },
    attention,
    { data: solicitudesAbiertas },
  ] = await Promise.all([
      supabase
        .from("establishments")
        .select("id, name, code, status, group_id, city")
        .eq("space_id", spaceId)
        .order("name", { ascending: true }),
      supabase.from("groups").select("id, name").eq("space_id", spaceId).order("name"),
      supabase.from("plans").select("id, name").eq("space_id", spaceId).order("price_cents"),
      // `subscriptions` tiene privilegios de columna (migración 27): las
      // columnas se enumeran, `select *` devuelve 403.
      supabase
        .from("subscriptions")
        .select("establishment_id, plan_id, plans (name)")
        .eq("space_id", spaceId)
        .eq("kind", "plan")
        .eq("status", "active"),
      loadSpaceAttention(supabase, spaceId, spaceSlug, now),
      /*
        Página 23 · las solicitudes abiertas de cada restaurante. Se piden
        **solo las dos columnas** que hacen falta: `requests` tiene
        privilegios de columna y un `select *` devolvería 403 (CLAUDE.md).

        Se cuentan aquí y no con un `count` por restaurante porque serían
        tantas consultas como restaurantes; y no se derivan de
        `attention`, que es otra cosa: ahí solo entra lo que está en
        riesgo, no todo lo que sigue abierto.
      */
      supabase
        .from("requests")
        .select("id, establishment_id")
        .eq("space_id", spaceId)
        .in("state", [...PENDING_REQUEST_STATES]),
    ]);

  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const planPorRestaurante = new Map(
    (subscriptions ?? []).map((s) => [s.establishment_id, s]),
  );
  const atencion = groupAttentionByEstablishment(attention.items);

  const abiertasPorRestaurante = new Map<string, number>();
  for (const fila of solicitudesAbiertas ?? []) {
    abiertasPorRestaurante.set(
      fila.establishment_id,
      (abiertasPorRestaurante.get(fila.establishment_id) ?? 0) + 1,
    );
  }

  const rows: EstablishmentListRow[] = (establishments ?? []).map((establishment) => {
    const suscripcion = planPorRestaurante.get(establishment.id);
    return {
      id: establishment.id,
      name: establishment.name,
      code: establishment.code,
      status: establishment.status as EstablishmentState,
      groupId: establishment.group_id,
      groupName: groupName.get(establishment.group_id) ?? null,
      planId: suscripcion?.plan_id ?? null,
      planName: suscripcion?.plans?.name ?? null,
      // Una ciudad en blanco en la base de datos es lo mismo que no
      // tenerla: no se enseña una línea vacía bajo el nombre.
      city: (establishment.city ?? "").trim() === "" ? null : establishment.city,
      openRequests: abiertasPorRestaurante.get(establishment.id) ?? 0,
      attention: atencion.get(establishment.id) ?? [],
    };
  });

  return {
    rows,
    activeCount: rows.filter((row) => row.status === "active").length,
    groups: groups ?? [],
    plans: plans ?? [],
  };
}
