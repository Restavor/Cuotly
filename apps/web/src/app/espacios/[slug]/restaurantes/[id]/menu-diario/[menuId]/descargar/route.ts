import { NextResponse } from "next/server";

import { buildMenuDocument, isMenuLayout, menuFileName } from "@/core/menu-render";
import { createClient } from "@/lib/supabase/server";
import { renderMenuPdf, renderMenuPng } from "@/services/menu-image";

/**
 * RN-MEN-04 · la descarga de un menú en PNG o PDF (§59, §61 paso 4).
 *
 * El orden importa: primero `register_menu_download()`, que es quien
 * decide si quien pide puede leer ESTE menú, si tiene contenido y
 * plantilla, y deja la descarga en el historial (RN-MEN-10) —y, si es el
 * trabajador asignado, pasa el menú a "Listo para publicar"—. Solo si esa
 * función contesta se pinta el archivo. A quien no puede se le responde
 * 404, como a los archivos: un 403 confirma que el menú existe.
 *
 * Lo que se pinta es la VERSIÓN VIGENTE con la PLANTILLA del menú, que es
 * exactamente lo que la función acaba de registrar. Las columnas se
 * enumeran porque las tres tablas tienen privilegios de columna (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string; menuId: string }> },
) {
  const { menuId } = await params;
  const formato = new URL(request.url).searchParams.get("formato");
  if (formato !== "png" && formato !== "pdf") return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 404 });

  const { error: registroError } = await supabase.rpc("register_menu_download", {
    p_menu_id: menuId,
    p_format: formato,
  });
  if (registroError) return new NextResponse(null, { status: 404 });

  const { data: menu } = await supabase
    .from("menus")
    .select("id, establishment_id, name, target_date, current_version_id, template_id")
    .eq("id", menuId)
    .maybeSingle();
  if (!menu || !menu.current_version_id || !menu.template_id) {
    return new NextResponse(null, { status: 404 });
  }

  const [{ data: version }, { data: template }, { data: establishment }] = await Promise.all([
    supabase
      .from("menu_versions")
      .select("version, starters, mains, desserts, drink, price_cents, note")
      .eq("id", menu.current_version_id)
      .maybeSingle(),
    supabase
      .from("menu_templates")
      .select("layout, background_color, text_color, accent_color, heading_text, footer_text, show_prices")
      .eq("id", menu.template_id)
      .maybeSingle(),
    supabase.from("establishments").select("name").eq("id", menu.establishment_id).maybeSingle(),
  ]);
  if (!version || !template || !establishment || !isMenuLayout(template.layout)) {
    return new NextResponse(null, { status: 404 });
  }

  const doc = buildMenuDocument({
    establishmentName: establishment.name,
    menuName: menu.name,
    targetDate: menu.target_date,
    version: version.version,
    content: {
      starters: version.starters,
      mains: version.mains,
      desserts: version.desserts,
      drink: version.drink,
      priceCents: version.price_cents,
      note: version.note,
    },
    design: {
      layout: template.layout,
      backgroundColor: template.background_color,
      textColor: template.text_color,
      accentColor: template.accent_color,
      headingText: template.heading_text,
      footerText: template.footer_text,
      showPrices: template.show_prices,
    },
  });

  const png = await renderMenuPng(doc);
  const nombre = menuFileName({ menuName: menu.name, targetDate: menu.target_date, version: version.version }, formato);
  const cuerpo = formato === "png" ? png : await renderMenuPdf(png, `${doc.heading} · ${doc.subheading}`);

  return new NextResponse(new Uint8Array(cuerpo), {
    status: 200,
    headers: {
      "Content-Type": formato === "png" ? "image/png" : "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
