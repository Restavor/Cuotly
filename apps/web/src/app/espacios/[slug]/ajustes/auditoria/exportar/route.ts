import { NextResponse } from "next/server";

import { auditChanges, auditCsv } from "@/core/audit";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadActorNames, loadAuditRows, readAuditFilters } from "../audit-query";

/**
 * M62 · "Exportar registro": el registro de auditoría con los filtros que
 * se ven en pantalla, en CSV.
 *
 * **No autoriza por su cuenta y no hace falta**: lee con la sesión de quien
 * pide, así que la política de `audit_log` decide qué filas salen —las
 * mismas que ve en la pantalla, ni una más—. Sin sesión, 401.
 */
export const dynamic = "force-dynamic";

/** Tope de filas por exportación. El registro crece para siempre; un filtro de fechas lo acota. */
const MAX_FILAS = 5000;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { data: space } = await supabase.from("spaces").select("id, slug, timezone").eq("slug", slug).maybeSingle();
  if (!space) return new NextResponse(null, { status: 404 });

  const q = new URL(request.url).searchParams;
  const filtros = readAuditFilters(
    { familia: q.get("familia"), desde: q.get("desde"), hasta: q.get("hasta"), usuario: q.get("usuario") },
    user.id,
  );
  const { rows, failed } = await loadAuditRows(supabase, space.id, space.timezone, filtros, { from: 0, to: MAX_FILAS - 1 });
  if (failed) return new NextResponse(es.settings.auditM62.csvFailed, { status: 500 });

  const nombres = await loadActorNames(supabase, [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[]);
  const acciones = es.settings.auditActions as Readonly<Record<string, string>>;
  const entidades = es.settings.auditEntities as Readonly<Record<string, string>>;

  const csv = auditCsv(
    es.settings.auditM62.csvHeader,
    rows.map((r) => [
      enZona(r.created_at, space.timezone, { dateStyle: "short", timeStyle: "short" }),
      r.actor_id === null ? es.settings.auditNoActor : (nombres.get(r.actor_id) ?? es.settings.auditNoActor),
      acciones[r.action] ?? r.action,
      entidades[r.entity_type] ?? r.entity_type,
      r.entity_id ?? "",
      auditChanges(r.old_value, r.new_value)
        .map((c) => `${c.field}: ${c.before ?? "—"} → ${c.after ?? "—"}`)
        .join("; "),
      r.reason ?? "",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="auditoria-${space.slug}.csv"`,
    },
  });
}
