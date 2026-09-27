import Link from "next/link";

import { MenuPreview, menuDocumentFromRows } from "@/components/menu/MenuPreview";
import { PrintMenuButton } from "@/components/menu/PrintMenuButton";
import { Card } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { canSaveMenuVersion, isMenuEditable, type MenuState } from "@/core/menu-states";
import { es } from "@/i18n/es";
import type { createClient } from "@/lib/supabase/server";

import { DetailsForm, VersionEditor } from "../../restaurantes/[id]/menu-diario/[menuId]/MenuForms";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const t = es.dailyMenuTeam;

/**
 * M79 · "Editar menú diario" para el equipo (`?vista=editar`). Son las
 * mismas piezas que el editor del restaurante (R14): el contenido por
 * secciones, los datos del menú y la vista previa con su plantilla de
 * publicar, porque el menú es uno y la regla también: cada guardado es
 * una versión (RN-MEN-03; el menú del día publicado también, y vuelve a
 * borrador, RN-CRE-30) y `save_menu_version()` decide quién escribe
 * (`can_write_menus()`: el equipo con `manage_requests`). La pantalla solo
 * se ofrece a quien tiene ese permiso; la que lo impide es la función.
 *
 * Lo que el dibujo pone y aquí no está:
 *   · "Solicitar publicación". Pedir que se publique es del restaurante;
 *     el equipo publica desde la ficha, con "Marcar publicado".
 *   · Elegir plantilla. Cada restaurante tiene una para publicar y otra
 *     para imprimir, y el menú sale en las dos (RN-CRE-23, decisión 86).
 *   · El cupo de actualizaciones: ya no existe (RN-CRE-22).
 */
export async function TeamMenuEditor({
  supabase,
  menu,
  establishmentName,
  fichaHref,
  downloadHref,
}: {
  supabase: Supabase;
  menu: {
    id: string;
    establishment_id: string;
    name: string;
    kind: string;
    target_date: string;
    template_id: string | null;
    state: MenuState;
    current_version_id: string | null;
  };
  establishmentName: string;
  fichaHref: string;
  downloadHref: string;
}) {
  const p = es.panelMenus;
  const [{ data: current }, { data: templates }] = await Promise.all([
    menu.current_version_id
      ? supabase
          .from("menu_versions")
          .select("id, version, starters, mains, desserts, drink, price_cents, note, allergen_note, created_at")
          .eq("id", menu.current_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("menu_templates")
      .select("id, name, purpose, layout, background_color, text_color, accent_color, heading_text, footer_text, show_prices")
      .eq("establishment_id", menu.establishment_id)
      .is("archived_at", null)
      .order("created_at"),
  ]);

  const editable = canSaveMenuVersion(menu.state, menu.kind);
  const detailsEditable = isMenuEditable(menu.state);
  const template =
    (templates ?? []).find((tpl) => tpl.id === menu.template_id) ??
    (templates ?? []).find((tpl) => tpl.purpose === "publish") ??
    null;
  const doc =
    template !== null && current !== null
      ? menuDocumentFromRows({
          establishmentName,
          menuName: menu.name,
          targetDate: menu.target_date,
          version: current,
          template,
        })
      : null;
  const vacio = template === null ? p.previewNoTemplate : current === null ? p.previewNoContent : p.previewUnknownLayout;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href={fichaHref}
          className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          <Icon name="arrowLeft" aria-hidden="true" className="h-[18px] w-[18px]" />
          {t.editor.back}
        </Link>
        <div>
          <h1 className="text-[22px] font-bold sm:text-[26px] leading-tight tracking-tight text-primary-dark">{t.editor.title}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t.editor.establishment(establishmentName)}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <DetailsForm
            menuId={menu.id}
            name={menu.name}
            kind={menu.kind}
            targetDate={menu.target_date}
            editable={detailsEditable}
          />
          <VersionEditor
            menuId={menu.id}
            editable={editable}
            publishedDaily={menu.state === "published" && menu.kind === "daily"}
            compareHref={fichaHref}
            current={
              current
                ? {
                    version: current.version,
                    starters: current.starters,
                    mains: current.mains,
                    desserts: current.desserts,
                    drink: current.drink,
                    priceCents: current.price_cents,
                    allergenNote: current.allergen_note,
                    note: current.note,
                  }
                : null
            }
          />
        </div>
        <Card title={p.previewTitle}>
          <div className="flex flex-col items-center gap-3">
            {doc ? (
              <MenuPreview doc={doc} width={300} label={p.previewAlt(menu.name)} />
            ) : (
              <p className="text-sm text-text-secondary">{vacio}</p>
            )}
            {doc && current ? (
              <p className="text-center text-xs text-text-secondary">{p.previewOfVersion(current.version)}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-3 rounded-card border border-info/30 bg-info/10 px-5 py-4 text-sm text-text">
          <Icon name="info" aria-hidden="true" className="h-5 w-5 shrink-0 text-info" />
          <p>{editable ? t.editor.versionsNote : t.editor.notEditable}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {current !== null && template !== null ? (
            <a
              href={`${downloadHref}?formato=pdf`}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
            >
              <Icon name="download" className="h-4 w-4" />
              {t.editor.download}
            </a>
          ) : null}
          {current !== null && template !== null ? (
            <PrintMenuButton
              href={`${downloadHref}?formato=pdf&imprimir=1`}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
