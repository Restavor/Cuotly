import type { AttentionItem } from "@/core/home";
import { groupAttentionByEstablishment } from "@/core/establishments";
import { PENDING_REQUEST_STATES } from "@/core/home";
import type { EstablishmentState } from "@/core/naming";
import type { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhotos } from "@/services/establishment-photo";

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
  /** El plan en cualquiera de sus versiones (`plans.lineage_id`, decisión 72). */
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
  /**
   * RN-EST-19 · quién del equipo lleva este restaurante, o `null` si no lo
   * lleva nadie — que es un estado normal, no un hueco que rellenar.
   *
   * `name` puede ser `null` con `id` puesto: hay responsable y quien mira
   * no puede resolver ese perfil. No es lo mismo que no tenerlo, y la
   * pantalla no lo dice igual (CA-20).
   */
  readonly manager: { readonly id: string; readonly name: string | null } | null;
  /**
   * RN-EST-18 · el enlace firmado y temporal de su foto, o `null` si no
   * tiene ninguna — que es un estado normal y la ficha lo pinta sin foto,
   * no con un marco esperándola (CA-20).
   */
  readonly photoUrl: string | null;
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
    { data: responsables },
  ] = await Promise.all([
      supabase
        .from("establishments")
        .select("id, name, code, status, group_id, city")
        .eq("space_id", spaceId)
        .order("name", { ascending: true }),
      supabase.from("groups").select("id, name").eq("space_id", spaceId).order("name"),
      // Decisión 72 · un plan por linaje para el filtro: quien sigue en una
      // versión anterior también "tiene Premium".
      supabase
        .from("plans")
        .select("lineage_id, name")
        .eq("space_id", spaceId)
        .is("superseded_at", null)
        .order("price_cents"),
      // `subscriptions` tiene privilegios de columna (migración 27): las
      // columnas se enumeran, `select *` devuelve 403.
      supabase
        .from("subscriptions")
        .select("establishment_id, plan_id, plans (name, lineage_id)")
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
      /*
        RN-EST-19 · quién lleva cada restaurante. La tabla es del equipo:
        su RLS exige pertenecer al espacio, así que un cliente que llegara
        aquí recibiría cero filas — pero un cliente no llega a esta
        pantalla, y esto no es lo que le protege (P7): le protege que el
        dato no esté en `establishments`, que sí lee.

        El nombre se pide aparte y no con un `join`: `profiles_select` no
        deja resolver cualquier perfil, y un `join` que no resuelve deja la
        fila entera fuera. Así, si el nombre no se puede leer, se pierde el
        nombre y no el hecho de que hay responsable.
      */
      supabase
        .from("establishment_managers")
        .select("establishment_id, manager_id")
        .eq("space_id", spaceId),
    ]);

  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const planPorRestaurante = new Map(
    (subscriptions ?? []).map((s) => [s.establishment_id, s]),
  );
  const atencion = groupAttentionByEstablishment(attention.items);

  const responsablePorRestaurante = new Map(
    (responsables ?? []).map((fila) => [fila.establishment_id, fila.manager_id]),
  );

  /*
    Los nombres, en una sola consulta para todos. `profiles_select` decide
    cuáles se resuelven: los que no, se quedan en `null` y la fila sigue
    diciendo que hay responsable.
  */
  const idsResponsables = [...new Set(responsablePorRestaurante.values())];
  const nombreResponsable = new Map<string, string>();
  if (idsResponsables.length > 0) {
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", idsResponsables);
    for (const perfil of perfiles ?? []) {
      const nombre = (perfil.full_name ?? perfil.email ?? "").trim();
      if (nombre !== "") nombreResponsable.set(perfil.id, nombre);
    }
  }

  const abiertasPorRestaurante = new Map<string, number>();
  for (const fila of solicitudesAbiertas ?? []) {
    abiertasPorRestaurante.set(
      fila.establishment_id,
      (abiertasPorRestaurante.get(fila.establishment_id) ?? 0) + 1,
    );
  }

  /*
    RN-EST-18 · las fotos, en UNA llamada para toda la lista. Esta pantalla
    no pagina —carga todos los restaurantes del espacio—, así que
    resolverlas de una en una serían cincuenta viajes. Va después de la
    consulta de establecimientos, y no en el `Promise.all` de arriba,
    porque necesita saber de qué restaurantes preguntar.
  */
  const fotos = await loadEstablishmentPhotos(
    supabase,
    supabase.storage,
    (establishments ?? []).map((establishment) => establishment.id),
  );

  const rows: EstablishmentListRow[] = (establishments ?? []).map((establishment) => {
    const suscripcion = planPorRestaurante.get(establishment.id);
    return {
      id: establishment.id,
      name: establishment.name,
      code: establishment.code,
      status: establishment.status as EstablishmentState,
      groupId: establishment.group_id,
      groupName: groupName.get(establishment.group_id) ?? null,
      planId: suscripcion?.plans?.lineage_id ?? suscripcion?.plan_id ?? null,
      planName: suscripcion?.plans?.name ?? null,
      // Una ciudad en blanco en la base de datos es lo mismo que no
      // tenerla: no se enseña una línea vacía bajo el nombre.
      city: (establishment.city ?? "").trim() === "" ? null : establishment.city,
      openRequests: abiertasPorRestaurante.get(establishment.id) ?? 0,
      manager: (() => {
        const id = responsablePorRestaurante.get(establishment.id);
        return id === undefined ? null : { id, name: nombreResponsable.get(id) ?? null };
      })(),
      photoUrl: fotos.get(establishment.id) ?? null,
      attention: atencion.get(establishment.id) ?? [],
    };
  });

  return {
    rows,
    activeCount: rows.filter((row) => row.status === "active").length,
    groups: groups ?? [],
    plans: (plans ?? []).map((p) => ({ id: p.lineage_id, name: p.name })),
  };
}
