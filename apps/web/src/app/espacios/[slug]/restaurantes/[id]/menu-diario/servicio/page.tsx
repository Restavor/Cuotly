import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import { Card, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { INCLUDED_TEMPLATE_LIMIT } from "@/core/daily-menu";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { MenuSectionHeader } from "../MenuSectionHeader";
import { loadMenuSection } from "../section-load";

/**
 * R19 · el servicio de Menú Diario: de dónde le viene y qué incluye.
 *
 * Desde la decisión 85 no hay consumo que enseñar: un menú del día por
 * fecha, que se cambia sin límite (RN-CRE-22 y RN-CRE-30), dos plantillas
 * (RN-CRE-23) y sin hora de corte (RN-CRE-24). De dónde le viene lo dice
 * `establishment_daily_menu_access()`: incluido en su plan o contratado
 * aparte (RN-CRE-21).
 *
 * Lo que el dibujo pinta y aquí no está: el precio (el restaurante no lee
 * `services`, igual que no lee `plans`; lo ve en sus cobros).
 */
export const dynamic = "force-dynamic";

const t = es.panelMenus;
const d = es.dailyMenuClient;

export default async function ClientMenuServicePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { establishment, access } = await loadMenuSection(supabase, id);
  if (!establishment) notFound();
  const base = `/espacios/${slug}/restaurantes/${id}/menu-diario`;

  const titulo = `${d.title} · ${t.tabs.service}`;

  if (!access) {
    return (
      <div className="space-y-6">
        <MenuSectionHeader base={base} active="service" title={titulo} subtitle={t.serviceSubtitle} access={null} />
        <Card title={d.noServiceTitle}>
          <p className="text-sm text-text-secondary">{d.noServiceReason}</p>
        </Card>
      </div>
    );
  }

  const { data: templates } = await supabase
    .from("menu_templates")
    .select("id, name, origin, purpose")
    .eq("establishment_id", id)
    .is("archived_at", null)
    .order("created_at");

  return (
    <div className="space-y-6">
      <MenuSectionHeader base={base} active="service" title={titulo} subtitle={t.serviceSubtitle} access={access} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title={t.serviceTitle} className="lg:col-span-2">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft-surface text-cuotly-green">
              <Icon name="dailyMenu" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-primary-dark">{t.serviceNoName}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <StatusBadge tone="success">{t.serviceActive}</StatusBadge>
                <StatusBadge tone="neutral">{access === "plan" ? t.accessPlan : t.accessService}</StatusBadge>
              </div>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-text">
            {[t.serviceOnePerDay, t.serviceTemplates(INCLUDED_TEMPLATE_LIMIT), t.serviceNoCutoff].map((linea) => (
              <li key={linea} className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                {linea}
              </li>
            ))}
          </ul>
        </Card>

        <div>
          <InfoNote title={t.serviceInfoTitle}>
            {access === "plan" ? t.serviceInfoPlan : t.serviceInfoService}
          </InfoNote>
        </div>
      </div>

      <Card title={t.templatesTitle}>
        {(templates ?? []).length === 0 ? (
          <p className="text-sm text-text-secondary">{d.templatesEmptyReason}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(templates ?? []).map((tpl) => (
              <li key={tpl.id}>
                <Link
                  href={`${base}/plantillas?plantilla=${tpl.id}`}
                  className="block rounded-[10px] border border-border p-3 hover:bg-soft-surface"
                >
                  <p className="font-semibold text-text">{tpl.name}</p>
                  <p className="text-sm text-text-secondary">
                    {t.templatePurpose[tpl.purpose as keyof typeof t.templatePurpose] ?? tpl.purpose}
                    {" · "}
                    {d.templateOrigin[tpl.origin as keyof typeof d.templateOrigin] ?? tpl.origin}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
