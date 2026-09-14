import { notFound, redirect } from "next/navigation";

import { DataSectionNav, DigitalSection } from "@/components/establishment/DigitalSections";
import { loadDigitalData, loadIntegrationRows } from "@/components/establishment/integrations-load";
import { type DataSectionTab, parseDataSection } from "@/components/establishment/tabs";
import { resolveShellViewer } from "@/components/shell/viewer";
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * Vista 22 · "Informes y datos" del panel del restaurante: las mismas
 * seis secciones que la pestaña de la ficha del equipo, con las mismas
 * piezas (`DigitalSections.tsx`). Lo que cambia es a dónde lleva
 * "Gestionar integraciones": aquí, a "Autorizar fuentes" (vista 25.03).
 *
 * Quién ve qué no se decide aquí: `establishment_integrations()` y la
 * política de `metric_points` devuelven cero filas a quien no lee el
 * restaurante, y esta página enseña un 404. La zona horaria es la del
 * espacio de Restavor, como en el resto del panel del restaurante (no
 * puede leer `spaces`).
 */
export const dynamic = "force-dynamic";

const CLIENT_TIMEZONE = "Europe/Madrid";

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
  const [{ role }, { data: canAcceptTerms }] = await Promise.all([
    resolveShellViewer(supabase, user.id, slug),
    supabase.rpc("client_can_accept_terms", { p_establishment_id: id }),
  ]);
  const gestiona = role === "owner" || role === "admin" || canAcceptTerms === true;

  const digital = await loadIntegrationRows(supabase, id)
    .then((rows) =>
      loadDigitalData(supabase, {
        establishmentId: id,
        rows,
        todayIso: todayInTimeZone(new Date(), CLIENT_TIMEZONE),
        timezone: CLIENT_TIMEZONE,
        now: new Date(),
      }),
    )
    .catch((fallo: unknown) => {
      console.error("[restaurante] no se pudieron leer los datos", { id, message: String(fallo) });
      return null;
    });

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

      <DigitalSection section={section.key} view={digital} manageHref={gestiona ? `${base}/fuentes` : null} />
    </div>
  );
}
