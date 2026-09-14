import { redirect } from "next/navigation";

import { PersonalReport } from "@/components/report/PersonalReport";
import { loadPersonalReport } from "@/components/report/personal-load";
import { CreateReportForm, ReportFilters } from "@/components/report/ReportForms";
import { ReportsTable } from "@/components/report/ReportsTable";
import { loadReports } from "@/components/report/reports-load";
import { isClientRole } from "@/components/shell/navigation";
import { resolveShellViewer } from "@/components/shell/viewer";
import { Card, NoPermissionState } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { defaultReportPeriod, isReportCategory, isReportState } from "@/core/reports";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * Vista 10.01 · la biblioteca de informes (§89 a §95, RN-REP).
 *
 * **La misma ruta sirve dos pantallas distintas, y no es un atajo.** §89
 * da los informes de un restaurante a propietario y administradores; §90
 * le da al trabajador **su informe personal**, que no es un informe de
 * §89 ni pasa por sus estados. Así que quien entra aquí ve lo suyo: la
 * biblioteca si gestiona la cartera, su informe personal si es trabajador.
 * La alternativa —un destino del menú que a un trabajador le contesta "sin
 * permiso"— sería peor y además falso: sí tiene un informe.
 *
 * Quién ve qué no lo decide esta pantalla: la política de `reports`
 * devuelve cero filas a quien no gestiona la cartera, y
 * `worker_report_dataset()` rechaza pedir el informe de otra persona.
 */
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const viewer = await resolveShellViewer(supabase, user.id, slug);
  if (viewer.spaceId === null) redirect("/espacios");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, timezone")
    .eq("id", viewer.spaceId)
    .maybeSingle();
  const timezone = space?.timezone ?? "Europe/Madrid";
  const period = defaultReportPeriod(new Date(), timezone);

  /*
    Un restaurante no tiene nada que hacer en la biblioteca del espacio:
    sus informes están en su propia pantalla (vista 22.01), y lo que
    vería aquí sería una lista vacía por RLS y un formulario que el
    servidor rechazaría. Se le dice, que es lo que pide CA-20.
  */
  if (isClientRole(viewer.role)) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <NoPermissionState description={es.reportsPage.clientSubtitle} />
      </div>
    );
  }

  // §90 · el trabajador tiene su informe personal y no los del §89.
  if (viewer.role === "worker") {
    const personal = await loadPersonalReport(supabase, {
      spaceId: viewer.spaceId,
      userId: user.id,
      period,
      timezone,
    });
    return <PersonalReport report={personal} period={period} />;
  }

  const solo = (clave: string): string | null => {
    const valor = Array.isArray(query[clave]) ? query[clave][0] : query[clave];
    return typeof valor === "string" && valor !== "" ? valor : null;
  };

  const categoria = solo("categoria");
  const estado = solo("estado");
  const restaurante = solo("restaurante");
  const grupo = solo("grupo");
  const plan = solo("plan");
  const desde = solo("desde");
  const hasta = solo("hasta");

  // Los seis filtros que dibuja la maqueta 10.01 y que §93 enumera:
  // restaurante, grupo, plan, periodo, categoría y estado.
  const [{ data: establishments }, { data: groups }, { data: plans }, reports] = await Promise.all([
    supabase.from("establishments").select("id, name").eq("space_id", viewer.spaceId).order("name"),
    supabase.from("groups").select("id, name").eq("space_id", viewer.spaceId).order("name"),
    supabase.from("plans").select("id, name").eq("space_id", viewer.spaceId).order("name"),
    loadReports(supabase, viewer.spaceId, {
      establishmentId: restaurante,
      groupId: grupo,
      planId: plan,
      category: categoria !== null && isReportCategory(categoria) ? categoria : null,
      status: estado !== null && isReportState(estado) ? estado : null,
      periodStart: desde,
      periodEnd: hasta,
    }).catch(() => null),
  ]);

  const t = es.reportsPage;
  const base = `/espacios/${slug}/informes`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <Card title={t.filters.title}>
        <ReportFilters
          base={base}
          establishments={(establishments ?? []).map((row) => ({ id: row.id, name: row.name }))}
          groups={(groups ?? []).map((row) => ({ id: row.id, name: row.name }))}
          plans={(plans ?? []).map((row) => ({ id: row.id, name: row.name }))}
          selected={{
            establishmentId: restaurante,
            groupId: grupo,
            planId: plan,
            category: categoria,
            status: estado,
            from: desde,
            to: hasta,
          }}
        />
      </Card>

      <Card title={t.create}>
        <CreateReportForm
          slug={slug}
          period={period}
          establishments={(establishments ?? []).map((row) => ({ id: row.id, name: row.name }))}
        />
      </Card>

      {reports === null ? (
        <Card>
          <EmptyReason reason="error" title={es.states.errorTitle} />
        </Card>
      ) : (
        <ReportsTable rows={reports} base={base} />
      )}
    </div>
  );
}
