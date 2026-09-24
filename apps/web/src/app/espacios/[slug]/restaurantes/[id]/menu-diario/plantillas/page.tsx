import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MenuPreview, menuDocumentFromRows } from "@/components/menu/MenuPreview";
import { Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { MenuSectionHeader } from "../MenuSectionHeader";
import { loadMenuSection } from "../section-load";

/**
 * R15 · las plantillas del restaurante (RN-MEN-11: tres incluidas una sola
 * vez; nuevas o rediseños, presupuestados aparte).
 *
 * La vista previa se pinta con los platos de verdad del último menú
 * guardado, no con "Nombre del primer plato": una pantalla de producción
 * no enseña datos de ejemplo (CLAUDE.md). Sin ningún menú guardado, la
 * plantilla sale con su cabecera y se dice por qué no hay platos.
 *
 * No hay "Cambiar logo": las plantillas no guardan logo y no se inventa un
 * botón que no lleva a ningún sitio. Una plantilla nueva se pide como una
 * solicitud más, que es por donde llega el presupuesto (§84).
 */
export const dynamic = "force-dynamic";

const t = es.panelMenus;
const d = es.dailyMenuClient;

export default async function ClientMenuTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const { plantilla } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { establishment, balance, cycleLabel } = await loadMenuSection(supabase, id);
  if (!establishment) notFound();
  const base = `/espacios/${slug}/restaurantes/${id}/menu-diario`;

  const [{ data: templates }, { data: ultimos }] = await Promise.all([
    supabase
      .from("menu_templates")
      .select("id, name, origin, layout, background_color, text_color, accent_color, heading_text, footer_text, show_prices")
      .eq("establishment_id", id)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("menus")
      .select("id, name, target_date, current_version_id")
      .eq("establishment_id", id)
      .not("current_version_id", "is", null)
      .order("target_date", { ascending: false })
      .limit(1),
  ]);

  const ultimo = ultimos?.[0] ?? null;
  const { data: version } = ultimo?.current_version_id
    ? await supabase
        .from("menu_versions")
        .select("version, starters, mains, desserts, drink, price_cents, note")
        .eq("id", ultimo.current_version_id)
        .maybeSingle()
    : { data: null };

  const lista = templates ?? [];
  const elegida = lista.find((tpl) => tpl.id === plantilla) ?? lista[0] ?? null;
  const docDe = (tpl: (typeof lista)[number]) =>
    menuDocumentFromRows({
      establishmentName: establishment.name,
      menuName: ultimo?.name ?? d.title,
      targetDate: ultimo?.target_date ?? new Date().toISOString().slice(0, 10),
      version: version ?? null,
      template: tpl,
    });

  const docElegida = elegida ? docDe(elegida) : null;

  return (
    <div className="space-y-6">
      <MenuSectionHeader
        base={base}
        active="templates"
        title={t.tabs.templates}
        subtitle={t.templatesSubtitle}
        balance={balance}
        cycleLabel={cycleLabel}
      />

      {lista.length === 0 ? (
        <Card>
          <EmptyState title={d.templatesEmptyTitle} description={d.templatesEmptyReason} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title={t.templatesAvailable}>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {lista.map((tpl) => {
                  const doc = docDe(tpl);
                  const activa = tpl.id === elegida?.id;
                  return (
                    <li key={tpl.id}>
                      <Link
                        href={`${base}/plantillas?plantilla=${tpl.id}`}
                        aria-current={activa ? "true" : undefined}
                        className={`block rounded-[10px] border-2 p-3 transition-colors hover:bg-soft-surface ${
                          activa ? "border-cuotly-green" : "border-border"
                        }`}
                      >
                        <div className="relative flex justify-center">
                          {doc ? (
                            <MenuPreview doc={doc} width={150} label={t.previewAlt(tpl.name)} />
                          ) : (
                            <span className="flex h-[212px] w-[150px] items-center justify-center rounded-md bg-soft-surface text-center text-xs text-text-secondary">
                              {t.previewUnknownLayout}
                            </span>
                          )}
                          {activa ? (
                            <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-cuotly-green text-surface">
                              <Icon name="tick" className="h-4 w-4" />
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 font-semibold text-text">{tpl.name}</p>
                        <p className="text-sm text-text-secondary">
                          {d.templateOrigin[tpl.origin as keyof typeof d.templateOrigin] ?? tpl.origin}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-sm text-text-secondary">{t.templateSelectHint}</p>
            </Card>

            <Card title={t.customTitle}>
              <p className="text-sm text-text-secondary">{t.customBody}</p>
              <Link
                href={`/espacios/${slug}/restaurantes/${id}/solicitudes/nueva`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cuotly-green underline"
              >
                {t.requestTemplate}
                <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            </Card>
          </div>

          <Card title={t.templatePreviewTitle}>
            {docElegida && elegida ? (
              <div className="flex flex-col items-center gap-3">
                <MenuPreview doc={docElegida} width={300} label={t.previewAlt(elegida.name)} />
                <p className="text-center text-xs text-text-secondary">
                  {ultimo && version ? t.templatePreviewWith(ultimo.name) : t.templatePreviewEmpty}
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">{t.previewUnknownLayout}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
