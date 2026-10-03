/**
 * `src/services/agents/reservations-export.ts` · el Excel con todas las reservas de un restaurante
 * (COB-02; PRD de agents §6.13 y §11.1).
 *
 * Una fila por reserva, de más antigua a más reciente, con los textos en español. Los datos personales
 * son los que hay —si ya se anonimizaron, el nombre sale «Anónimo» y el teléfono y el email, vacíos—.
 * Quién puede descargarlo lo decide la ruta (`export_all_reservations`) y la base de datos (RLS); aquí no
 * se autoriza nada. Toda lectura enumera sus columnas: `reservations` tiene privilegios de columna y
 * `select *` devuelve 403 (CLAUDE.md), y nunca se pide `cancel_token`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import type { Database } from "@/lib/supabase/database.types";

import { buildXlsx, type XlsxCell } from "./xlsx";

type Client = SupabaseClient<Database>;

const COLUMNS =
  "id, date, time, party_size, customer_name, phone_e164, email, notes, language, status, source, platform_name, cancel_reason, cancelled_at";
const PAGE = 1000;
/** Tope de seguridad: 100.000 reservas. Más que eso, se avisa en vez de agotar la memoria del servidor. */
const MAX_PAGES = 100;

export interface ExportRow {
  readonly date: string;
  readonly time: string;
  readonly party_size: number;
  readonly customer_name: string;
  readonly phone_e164: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly language: string;
  readonly status: string;
  readonly source: string;
  readonly platform_name: string | null;
  readonly cancel_reason: string | null;
  readonly cancelled_at: string | null;
}

export class ExportTooLargeError extends Error {
  constructor() {
    super("Hay demasiadas reservas para descargarlas de una vez");
  }
}

/** Todas las reservas del restaurante, de más antigua a más reciente. */
export async function loadAllReservations(client: Client, establishmentId: string): Promise<readonly ExportRow[]> {
  const rows: ExportRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await client
      .from("reservations")
      .select(COLUMNS)
      .eq("establishment_id", establishmentId)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
  throw new ExportTooLargeError();
}

function label<T extends string>(map: Record<T, string>, key: string | null): string | null {
  if (key === null) return null;
  return key in map ? map[key as T] : key;
}

/** Las filas del libro: fechas locales tal cual, y los instantes en la zona del restaurante. */
export function exportBook(rows: readonly ExportRow[], timeZone: string): Uint8Array {
  const t = es.agents.billing.export;
  const instant = (iso: string | null): string | null =>
    iso === null
      ? null
      : enZona(iso, timeZone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  return buildXlsx({
    sheetName: t.sheetName,
    columns: [
      { header: t.columns.date, width: 12 },
      { header: t.columns.time, width: 8 },
      { header: t.columns.people, width: 10 },
      { header: t.columns.name, width: 26 },
      { header: t.columns.phone, width: 16 },
      { header: t.columns.email, width: 28 },
      { header: t.columns.notes, width: 36 },
      { header: t.columns.status, width: 12 },
      { header: t.columns.origin, width: 12 },
      { header: t.columns.platform, width: 16 },
      { header: t.columns.language, width: 12 },
      { header: t.columns.cancelReason, width: 22 },
      { header: t.columns.cancelledAt, width: 18 },
    ],
    rows: rows.map((r): XlsxCell[] => [
      r.date,
      r.time.slice(0, 5),
      r.party_size,
      r.customer_name,
      r.phone_e164,
      r.email,
      r.notes,
      label(t.status, r.status),
      label(t.origin, r.source),
      r.platform_name,
      r.language.toUpperCase(),
      label(t.cancelReason, r.cancel_reason),
      instant(r.cancelled_at),
    ]),
  });
}
