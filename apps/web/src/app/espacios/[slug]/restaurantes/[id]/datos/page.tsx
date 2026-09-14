import { notFound, redirect } from "next/navigation";

import { DataSectionNav, DigitalSection } from "@/components/establishment/DigitalSections";
import { loadDigitalData, loadIntegrationRows } from "@/components/establishment/integrations-load";
import { OpportunitiesSection } from "@/components/establishment/Opportunities";
import { AvailableReports } from "@/components/report/AvailableReports";
import { loadEstablishmentReports } from "@/components/report/reports-load";
import { loadOpportunities } from "@/components/establishment/opportunities-load";
import { type DataSectionTab, parseDataSection } from "@/components/establishment/tabs";
import { resolveShellViewer } from "@/components/shell/viewer";
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";

/**
 * Vista 22 · "Informes y datos" del panel del restaurante: las mismas
 * seis secciones que la pestaña de la ficha del equipo, con las mismas
 * piezas (`DigitalSections.tsx`). Lo que cambia es a dónde lleva
 * "Gestionar integraciones": aquí, a "Autorizar fuentes" (vista 25.03).
 *
 * Quién ve qué no se decide aquí: `establishment_integrations()` y la
 * política de `metric_points` devuelven cero filas a quien no lee el
 * restaurante, y esta página enseña un 404. La zona horaria es la del
 * espacio, que aquí no sale de `spaces` —el restaurante no puede leer esa
 * tabla— sino de `establishment_timezone()` (migración 83).
 */
export const dynamic = "force-dynamic";

export default async function ClientDataPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, code")
    .eq("id", id)
    .maybeSingle();
  if (!establishment) notFound();

  const seccion = Array.isArray(query.seccion) ? query.seccion[0] : query.seccion;
  const section = parseDataSection(seccion);
  const base = `/espacios/${slug}/restaurantes/${id}`;
  const hrefFor = (s: DataSectionTab) => `${base}/datos?seccion=${s.slug}`;

  // RN-INT-05 · quien puede autorizar es quien acepta las condiciones; a
  // quien no, no se le ofrece un botón a una pantalla en la que no puede
  // hacer nada. El servidor lo vuelve a comprobar en esa pantalla.
  const [{ role }, { data: canAcceptTerms }, timezone] = await Promise.all([
    resolveShellViewer(supabase, user.id, slug),
    supabase.rpc("client_can_accept_terms", { p_establishment_id: id }),
    loadEstablishmentTimezone(supabase, id),
  ]);
  const gestiona = role === "owner" || role === "admin" || canAcceptTerms === true;

  const digital = await loadIntegrationRows(supabase, id)
    .then((rows) =>
      loadDigitalData(supabase, {
        establishmentId: id,
        rows,
        todayIso: todayInTimeZone(new Date(), timezone),
        timezone,
        now: new Date(),
      }),
    )
    .catch((fallo: unknown) => {
      console.error("[restaurante] no se pudieron leer los datos", { id, message: String(fallo) });
      return null;
    });

  /*
    §96 a §101 · las oportunidades del restaurante. Se leen solo cuando se
    está mirando esa sección: las otras cinco no las necesitan y son dos
    consultas de más en cada carga.

    Aquí NO se decide qué ve: la política de `opportunities` le devuelve
    solo las aprobadas y, de esas, las que su plan le deja ver (§101). Si
    su plan no incluye ninguna, la lista llega vacía y la pantalla dice
    por qué, que es lo que pide P6.
  */
  const opportunities =
    section.key === "opportunities"
      ? await loadOpportunities(supabase, id).catch((fallo: unknown) => {
          console.error("[restaurante] no se pudieron leer las oportunidades", { id, message: String(fallo) });
          return null;
        })
      : null;

  /*
    Vista 22.01 · "Informes disponibles" (§89, RN-REP-13). Solo en el
    Resumen, que es donde la maqueta los pone, y solo se leen ahí: las
    otras cinco secciones no los necesitan.

    Lo que llega son los informes **enviados**: la política de `reports`
    no le devuelve al restaurante ninguno que esté preparándose, en
    revisión, aprobado o programado. Esta pantalla no filtra nada.
  */
  const reports =
    section.key === "summary"
      ? await loadEstablishmentReports(supabase, id).catch((fallo: unknown) => {
          console.error("[restaurante] no se pudieron leer los informes", { id, message: String(fallo) });
          return [];
        })
      : [];

  const words = es.integrations.sections[section.key];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">
          {establishment.name} · {establishment.code}
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{words.title}</h1>
        <p className="text-sm text-text-secondary">{words.hint}</p>
      </header>

      <DataSectionNav active={section} hrefFor={hrefFor} />

      <DigitalSection
        section={section.key}
        view={digital}
        manageHref={gestiona ? `${base}/fuentes` : null}
        opportunities={
          <OpportunitiesSection
            view={opportunities}
            viewer="client"
            establishmentId={id}
            path={`${base}/datos`}
          />
        }
      />

      {section.key === "summary" ? (
        <AvailableReports reports={reports} base={`/espacios/${slug}/informes`} />
      ) : null}
    </div>
  );
}
