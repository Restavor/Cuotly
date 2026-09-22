import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import { Card, ProgressBar, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { INCLUDED_TEMPLATE_LIMIT } from "@/core/daily-menu";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { MenuSectionHeader } from "../MenuSectionHeader";
import { loadMenuSection } from "../section-load";

/**
 * R19 · el servicio de Menú Diario y su consumo.
 *
 * El consumo es el de `menu_update_balance()`, que suma el libro
 * (RN-MEN-05): aquí solo se resta para decir cuántas se han usado.
 *
 * Lo que el dibujo pinta y aquí no está: el precio (el restaurante no lee
 * `services`, igual que no lee `plans`; lo ve en sus cobros), el
 * "Compromiso de 3 meses" (esa permanencia es la del mantenimiento, no la
 * de Menú Diario) y los botones "Solicitar actualización adicional" y
 * "Presupuesto previo": no existe esa operación ni una regla que diga cómo
 * se cobra, y no se inventa (CLAUDE.md). Con el ciclo agotado se dice y se
 * lleva a hablar con el equipo.
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

  const { establishment, balance, cycleLabel, fecha } = await loadMenuSection(supabase, id);
  if (!establishment) notFound();
  const base = `/espacios/${slug}/restaurantes/${id}/menu-diario`;

  const titulo = `${d.title} · ${t.tabs.service}`;

  if (!balance) {
    return (
      <div className="space-y-6">
        <MenuSectionHeader base={base} active="service" title={titulo} subtitle={t.serviceSubtitle} balance={null} cycleLabel={null} />
        <Card title={d.noServiceTitle}>
          <p className="text-sm text-text-secondary">{d.noServiceReason}</p>
        </Card>
      </div>
    );
  }

  const { data: templates } = await supabase
    .from("menu_templates")
    .select("id, name, origin")
    .eq("establishment_id", id)
    .is("archived_at", null)
    .order("created_at");

  const usadas = Math.max(0, balance.included_updates - balance.available);
  const incluidas = (templates ?? []).filter((tpl) => tpl.origin === "included").length;

  return (
    <div className="space-y-6">
      <MenuSectionHeader
        base={base}
        active="service"
        title={titulo}
        subtitle={t.serviceSubtitle}
        balance={balance}
        cycleLabel={cycleLabel}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t.serviceTitle}>
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft-surface text-cuotly-green">
              <Icon name="dailyMenu" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-primary-dark">{t.serviceNoName}</p>
              <div className="mt-1">
                <StatusBadge tone="success">{t.serviceActive}</StatusBadge>
              </div>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-text">
            {[t.serviceIncluded(balance.included_updates), t.serviceTemplates(INCLUDED_TEMPLATE_LIMIT), t.serviceRenews].map(
              (linea) => (
                <li key={linea} className="flex gap-2">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                  {linea}
                </li>
              ),
            )}
          </ul>
        </Card>

        <Card title={t.consumptionTitle}>
          <p className="text-2xl font-bold text-primary-dark">{t.usageLine(usadas, balance.included_updates)}</p>
          <div className="my-3">
            <ProgressBar
              percent={balance.included_updates > 0 ? Math.round((usadas / balance.included_updates) * 100) : 0}
              label={t.consumptionTitle}
            />
          </div>
          <p className="text-sm text-text-secondary">
            {t.consumptionPeriod(fecha(balance.cycle_start), fecha(balance.cycle_end))}
          </p>
          {balance.available <= 0 ? (
            <div className="mt-4 rounded-[10px] bg-warning/25 p-3 text-sm text-text">
              <p className="flex gap-2">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-primary-dark" />
                {t.consumptionExhausted}
              </p>
              <Link
                href={`/espacios/${slug}/restaurantes/${id}#mensajes`}
                className="mt-2 inline-flex items-center gap-1 font-semibold text-cuotly-green underline"
              >
                {t.consumptionAskTeam}
                <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </Card>

        <div>
          <InfoNote title={t.serviceInfoTitle}>{t.serviceInfoBody}</InfoNote>
        </div>
      </div>

      <Card title={t.templatesIncluded(incluidas)}>
        {(templates ?? []).length === 0 ? (
          <p className="text-sm text-text-secondary">{d.templatesEmptyReason}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {(templates ?? []).map((tpl) => (
              <li key={tpl.id}>
                <Link
                  href={`${base}/plantillas?plantilla=${tpl.id}`}
                  className="block rounded-[10px] border border-border p-3 hover:bg-soft-surface"
                >
                  <p className="font-semibold text-text">{tpl.name}</p>
                  <p className="text-sm text-text-secondary">
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
