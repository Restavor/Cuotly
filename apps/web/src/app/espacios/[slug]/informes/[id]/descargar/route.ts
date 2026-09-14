import { NextResponse } from "next/server";

import { loadReportDetail } from "@/components/report/reports-load";
import { reportCsv } from "@/core/reports";
import { fechaCorta } from "@/i18n/dates";
import { createClient } from "@/lib/supabase/server";
import { renderReportPdf } from "@/services/report-pdf";

/**
 * §93 · las dos salidas descargables de un informe: **PDF y CSV**.
 *
 * Las dos se generan **desde la versión vigente** y ninguna se guarda
 * (RN-REP-06): la versión es el original, y un PDF archivado sería un
 * segundo original que puede dejar de coincidir.
 *
 * **No autoriza por su cuenta y tampoco hace falta**: lee con la sesión de
 * quien pide, así que la política de `reports` decide. Un restaurante
 * alcanza el informe que se le envió; cualquier otro, un 404 — el mismo
 * que vería si no existiera, que es lo que hay que contestar a quien no
 * debe saber que existe.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { id } = await params;
  const formato = new URL(request.url).searchParams.get("formato") === "csv" ? "csv" : "pdf";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const detail = await loadReportDetail(supabase, id);
  if (detail === null || detail.versions.length === 0) {
    return new NextResponse(null, { status: 404 });
  }

  const snapshot = detail.versions[0].snapshot;
  const nombre = detail.report.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "informe";

  if (formato === "csv") {
    return new NextResponse(reportCsv(snapshot), {
      headers: {
        // `text/csv` con BOM: sin él, Excel en Windows abre los acentos
        // mal y el informe llega con "MenÃº" en la primera columna.
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${nombre}.csv"`,
      },
    });
  }

  const pdf = await renderReportPdf(snapshot, {
    name: detail.report.name,
    establishmentName: detail.report.establishmentName,
    generatedAtLabel: fechaCorta(snapshot.generatedAt.slice(0, 10)),
    periodLabel: {
      from: fechaCorta(detail.report.periodStart),
      to: fechaCorta(detail.report.periodEnd),
    },
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${nombre}.pdf"`,
    },
  });
}
