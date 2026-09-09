import type { AttentionItem } from "@/core/home";
import { groupAttentionByEstablishment } from "@/core/establishments";
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
  const [{ data: establishments }, { data: groups }, { data: plans }, { data: subscriptions }, attention] =
    await Promise.all([
      supabase
        .from("establishments")
        .select("id, name, code, status, group_id")
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
    ]);

  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const planPorRestaurante = new Map(
    (subscriptions ?? []).map((s) => [s.establishment_id, s]),
  );
  const atencion = groupAttentionByEstablishment(attention.items);

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
