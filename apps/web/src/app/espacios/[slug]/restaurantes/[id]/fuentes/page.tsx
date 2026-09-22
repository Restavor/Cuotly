import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SettingsTabs } from "@/components/panel/SettingsTabs";

import { IntegrationsBlock } from "@/components/establishment/IntegrationsBlock";
import { loadIntegrationsView } from "@/components/establishment/integrations-load";
import { isStaffRole } from "@/components/shell/navigation";
import { resolveShellViewer } from "@/components/shell/viewer";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { INTEGRATION_FLASH_PARAM } from "../integraciones/action-state";
import { loadEstablishmentTimezone } from "../timezone-load";

/**
 * Vista 25.03 · "Autorizar fuentes y exportar", sin la exportación (Fase
 * 4): las cuentas conectadas del restaurante y, para su propietario, el
 * botón de autorizar cada una con su cuenta de Google.
 *
 * RN-INT-05 · el propietario del restaurante (la misma lista que acepta
 * las condiciones, y por eso se reutiliza `client_can_accept_terms()`)
 * autoriza; el Editor y Consulta ven el estado. Es lo que se PINTA:
 * `assert_can_manage_integrations()` y `store_integration_credential()`
 * lo vuelven a comprobar con la sesión de quien envía.
 *
 * Alguien del equipo que llegue aquí ve la misma pantalla con sus
 * propios botones: la ficha (Gestión › Integraciones) es la suya, pero
 * un enlace pegado en un mensaje no tiene por qué darle un 404.
 */
export const dynamic = "force-dynamic";

export default async function ClientSourcesPage({
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
    .select("id, name, code, status, website_url, web_platform, domain")
    .eq("id", id)
    .maybeSingle();
  if (!establishment) notFound();

  const [{ role }, { data: canAcceptTerms }, timezone] = await Promise.all([
    resolveShellViewer(supabase, user.id, slug),
    supabase.rpc("client_can_accept_terms", { p_establishment_id: id }),
    loadEstablishmentTimezone(supabase, id),
  ]);

  const flash = Array.isArray(query[INTEGRATION_FLASH_PARAM])
    ? query[INTEGRATION_FLASH_PARAM]?.[0]
    : (query[INTEGRATION_FLASH_PARAM] as string | undefined);
  const base = `/espacios/${slug}/restaurantes/${id}`;

  const view = await loadIntegrationsView(supabase, {
    establishmentId: id,
    actor: isStaffRole(role)
      ? { kind: "staff", role }
      : { kind: "client", role: canAcceptTerms === true ? "local_owner" : "editor" },
    establishmentStatus: establishment.status,
    websiteUrl: establishment.website_url,
    webPlatform: establishment.web_platform,
    domain: establishment.domain,
    timezone,
    flash,
  }).catch((fallo: unknown) => {
    console.error("[restaurante] no se pudieron leer las integraciones", { id, message: String(fallo) });
    return null;
  });

  return (
    <div className="space-y-6">
      {/* R44 · las fuentes de siempre (RN-INT-05) dentro de "Ajustes y ayuda". */}
      <SettingsTabs base={base} active="fuentes" subtitle={es.clientArea.sourcesHint} />
      <p className="text-sm">
        <Link href={`${base}/datos`} className="text-cuotly-green underline">
          {es.clientArea.dataLink}
        </Link>
      </p>

      {view === null ? (
        <p className="text-sm text-danger">{es.emptyReasons.error}</p>
      ) : (
        <IntegrationsBlock
          view={view}
          establishmentId={id}
          slug={slug}
          returnTo={`${base}/fuentes`}
          title={es.clientArea.sourcesConnectedTitle}
          hint={es.integrations.clientOwnerHint}
        />
      )}

      <p className="text-xs text-text-secondary">{es.clientArea.sourcesExportNote}</p>
    </div>
  );
}
