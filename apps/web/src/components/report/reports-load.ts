/**
 * Lo que las pantallas de informes leen de la base (Fase 3, Hito 16).
 *
 * **No decide quién ve qué.** La política de `reports` de la migración 85
 * devuelve al equipo lo suyo y al restaurante solo lo enviado (RN-REP-13);
 * si alguien no tiene acceso, estas funciones devuelven cero filas y la
 * pantalla dice el motivo. Y las columnas se enumeran una a una porque el
 * `select` está concedido columna a columna: `select *` sobre `reports`
 * devuelve 403 (CLAUDE.md).
 */

import {
  type ReportCategory,
  type ReportSectionKey,
  type ReportSectionState,
  type ReportSnapshot,
  type ReportState,
  isReportCategory,
  isReportSectionKey,
  isReportState,
} from "@/core/reports";

import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

/** El cliente tipado de siempre: la frontera con `any` que tenía este
 * archivo mientras la migración 85 estaba sin aplicar desapareció al
 * aplicarla y regenerar los tipos (14/09/2026). */
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Las columnas que el `grant` deja leer. Ni una más: el resto es 403. */
/**
 * Las columnas que pinta la lista. **Una sola cadena literal y sin
 * concatenar**: el cliente tipado la compara con el esquema en tiempo de
 * compilación, y una suma de dos trozos no la puede leer —devolvía
 * `GenericStringError[]` y, con la frontera puesta, nadie se enteraba—.
 * `select *` no vale aquí: `reports` tiene columnas de actor tapadas al
 * cliente y devolvería 403 (CLAUDE.md).
 */
const REPORT_COLUMNS =
  "id, space_id, establishment_id, category, name, period_start, period_end, status, status_reason, delivery_channel, include_csv, scheduled_for, sent_at, approved_at, created_at, updated_at" as const;

export interface ReportRow {
  readonly id: string;
  readonly establishmentId: string | null;
  readonly establishmentName: string | null;
  readonly category: ReportCategory;
  readonly name: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: ReportState;
  readonly statusReason: string | null;
  readonly deliveryChannel: string;
  readonly includeCsv: boolean;
  readonly scheduledFor: string | null;
  readonly sentAt: string | null;
  readonly approvedAt: string | null;
  readonly createdAt: string;
}

export interface ReportVersionRow {
  readonly id: string;
  readonly versionNumber: number;
  readonly generatedAt: string;
  readonly snapshot: ReportSnapshot;
}

export interface ReportDetail {
  readonly report: ReportRow;
  readonly sections: readonly (ReportSectionState & { readonly note: string | null })[];
  readonly versions: readonly ReportVersionRow[];
  readonly pendingOpportunities: number;
}

/**
 * La fila tal y como la devuelve `REPORT_COLUMNS`, sacada de los tipos
 * generados en vez de escrita a mano. Mientras la migración 85 estuvo sin
 * aplicar esto era `any`, porque `database.types.ts` no conocía la tabla;
 * al aplicarla y regenerar (14/09/2026) esa frontera desapareció. La
 * ventaja de que sea un `Pick` y no una interfaz copiada: si una columna
 * cambia de nombre o de tipo en la base, esto deja de compilar.
 */
type ReportDbRow = Pick<
  Database["public"]["Tables"]["reports"]["Row"],
  | "id"
  | "space_id"
  | "establishment_id"
  | "category"
  | "name"
  | "period_start"
  | "period_end"
  | "status"
  | "status_reason"
  | "delivery_channel"
  | "include_csv"
  | "scheduled_for"
  | "sent_at"
  | "approved_at"
  | "created_at"
  | "updated_at"
>;

function fila(row: ReportDbRow, establishmentName: string | null): ReportRow | null {
  // Guardas y no aserciones: un CHECK de la base es `text` para
  // TypeScript, y una fila imposible se deja fuera en vez de inventarle
  // una categoría para poder pintarla (lección del Hito 15).
  //
  // Se estrechan las VARIABLES y no `String(row.category)`: una guarda
  // sobre una copia no estrecha el original, así que lo que se asignaba
  // abajo seguía siendo `string`. Con `any` eso no se notaba; al quitar la
  // frontera, el compilador lo dijo.
  const { category, status } = row;
  if (!isReportCategory(category) || !isReportState(status)) return null;

  return {
    id: String(row.id),
    establishmentId: row.establishment_id ?? null,
    establishmentName,
    category,
    name: String(row.name),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    status,
    statusReason: row.status_reason ?? null,
    deliveryChannel: String(row.delivery_channel ?? "none"),
    includeCsv: row.include_csv === true,
    scheduledFor: row.scheduled_for ?? null,
    sentAt: row.sent_at ?? null,
    approvedAt: row.approved_at ?? null,
    createdAt: String(row.created_at),
  };
}

/**
 * §93 · los filtros que la pantalla aplica. El **grupo** y el **plan** no
 * son columnas de `reports`: se resuelven antes a la lista de
 * restaurantes que cumplen, y se filtra por ella. Hacerlo así —y no con
 * un `join` en la consulta— mantiene enumeradas las columnas de `reports`,
 * que es obligatorio porque su `select` está concedido columna a columna.
 */
export interface ReportListFilters {
  readonly establishmentId?: string | null;
  readonly groupId?: string | null;
  readonly planId?: string | null;
  readonly category?: ReportCategory | null;
  readonly status?: ReportState | null;
  readonly periodStart?: string | null;
  readonly periodEnd?: string | null;
}

/** Los restaurantes de un grupo o de un plan, para filtrar por ellos. */
async function establishmentsMatching(
  supabase: Supabase,
  spaceId: string,
  filters: ReportListFilters,
): Promise<readonly string[] | null> {
  if (!filters.groupId && !filters.planId) return null;

  let query = supabase.from("establishments").select("id").eq("space_id", spaceId);
  if (filters.groupId) query = query.eq("group_id", filters.groupId);

  const { data, error } = await query;
  if (error) throw new Error(`establishments: ${error.message}`);
  let ids = (data ?? []).map((row) => String(row.id));

  if (filters.planId) {
    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select("establishment_id")
      .eq("space_id", spaceId)
      .eq("kind", "plan")
      .eq("status", "active")
      .eq("plan_id", filters.planId);
    if (subsError) throw new Error(`subscriptions: ${subsError.message}`);
    const conPlan = new Set((subs ?? []).map((row) => String(row.establishment_id)));
    ids = ids.filter((id) => conPlan.has(id));
  }

  return ids;
}

export async function loadReports(
  client: Supabase,
  spaceId: string,
  filters: ReportListFilters = {},
): Promise<readonly ReportRow[]> {
  const supabase = client;

  let query = supabase.from("reports").select(REPORT_COLUMNS).eq("space_id", spaceId);

  const porGrupoOPlan = await establishmentsMatching(supabase, spaceId, filters);
  if (porGrupoOPlan !== null) {
    // Ningún restaurante cumple: la lista es vacía, no "todos".
    if (porGrupoOPlan.length === 0) return [];
    query = query.in("establishment_id", porGrupoOPlan);
  }

  if (filters.establishmentId) query = query.eq("establishment_id", filters.establishmentId);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.periodStart) query = query.gte("period_start", filters.periodStart);
  if (filters.periodEnd) query = query.lte("period_end", filters.periodEnd);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`reports: ${error.message}`);

  return await conNombres(supabase, data ?? []);
}

/**
 * Los informes de un restaurante. Vale para las dos pantallas que los
 * enseñan por restaurante —la ficha del equipo y "Informes y datos" del
 * cliente—: la RLS es la que decide cuáles devuelve a cada uno.
 */
export async function loadEstablishmentReports(
  client: Supabase,
  establishmentId: string,
): Promise<readonly ReportRow[]> {
  const supabase = client;
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_COLUMNS)
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`reports: ${error.message}`);
  return await conNombres(supabase, data ?? []);
}

async function conNombres(supabase: Supabase, rows: readonly ReportDbRow[]): Promise<readonly ReportRow[]> {
  const ids = [...new Set(rows.map((row) => row.establishment_id).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();

  if (ids.length > 0) {
    const { data } = await supabase.from("establishments").select("id, name").in("id", ids);
    for (const row of data ?? []) nombres.set(String(row.id), String(row.name));
  }

  return rows
    .map((row) => fila(row, row.establishment_id ? (nombres.get(String(row.establishment_id)) ?? null) : null))
    .filter((row): row is ReportRow => row !== null);
}

export async function loadReportDetail(client: Supabase, reportId: string): Promise<ReportDetail | null> {
  const supabase = client;

  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_COLUMNS)
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(`reports: ${error.message}`);
  if (!data) return null;

  const [detalle] = await conNombres(supabase, [data]);
  if (detalle === undefined) return null;

  const { data: sections } = await supabase
    .from("report_sections")
    .select("section_key, position, included, note")
    .eq("report_id", reportId)
    .order("position");

  const { data: versions } = await supabase
    .from("report_versions")
    .select("id, version_number, generated_at, snapshot")
    .eq("report_id", reportId)
    .order("version_number", { ascending: false });

  const { data: pending } = await supabase.rpc("report_pending_opportunities", {
    p_report_id: reportId,
  });

  return {
    report: detalle,
    sections: (sections ?? [])
      .filter((row) => isReportSectionKey(row.section_key))
      .map((row) => ({
        key: row.section_key as ReportSectionKey,
        position: Number(row.position),
        included: row.included === true,
        note: row.note ?? null,
      })),
    versions: (versions ?? []).map((row) => ({
      id: String(row.id),
      versionNumber: Number(row.version_number),
      generatedAt: String(row.generated_at),
      // `snapshot` es `jsonb` y por tanto `Json`, más ancho que
      // `ReportSnapshot`. La conversión pasa por `unknown` a propósito:
      // lo escribió `generate_report_version()` con la forma que
      // `report-generation.ts` produce, y no hay guarda que lo demuestre
      // aquí. Antes era `any` y no se veía que fuera una conversión.
      snapshot: row.snapshot as unknown as ReportSnapshot,
    })),
    pendingOpportunities: typeof pending === "number" ? pending : 0,
  };
}
