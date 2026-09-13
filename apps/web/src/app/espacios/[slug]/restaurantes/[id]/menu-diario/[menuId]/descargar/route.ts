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
 * **Se pinta lo que se REGISTRÓ, no lo que el menú tenga ahora.** La
 * función devuelve el id de la descarga y de esa fila salen la versión y
 * la plantilla. Releer `menus` después de llamarla parecía equivalente y
 * no lo es: `register_menu_download()` bloquea la fila mientras corre,
 * pero suelta el bloqueo al devolver, así que un guardado del restaurante
 * entre las dos consultas entregaba un archivo que no era el que consta en
 * `menu_downloads` — y esa fila es la que RN-MEN-10 conserva como historial
 * ("la versión y la plantilla exactas que se llevó"). Lo encontró la
 * revisión del Hito 10 (13/09/2026).
 *
 * Las columnas se enumeran porque las cuatro tablas tienen privilegios de
 * columna (CLAUDE.md).
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

  const { data: downloadId, error: registroError } = await supabase.rpc("register_menu_download", {
    p_menu_id: menuId,
    p_format: formato,
  });
  if (registroError || !downloadId) return new NextResponse(null, { status: 404 });

  // La fila que la función acaba de escribir manda sobre lo que se pinta.
  const { data: download } = await supabase
    .from("menu_downloads")
    .select("menu_id, establishment_id, version_id, template_id")
    .eq("id", downloadId)
    .maybeSingle();
  if (!download) return new NextResponse(null, { status: 404 });

  const { data: menu } = await supabase
    .from("menus")
    .select("name, target_date, template_id")
    .eq("id", download.menu_id)
    .maybeSingle();
  const [{ data: version }, { data: template }, { data: establishment }] =
    await Promise.all([
      supabase
        .from("menu_versions")
        .select("version, starters, mains, desserts, drink, price_cents, note")
        .eq("id", download.version_id)
        .maybeSingle(),
      supabase
        .from("menu_templates")
        .select("layout, background_color, text_color, accent_color, heading_text, footer_text, show_prices")
        .eq("id", (menu as { template_id?: string } | null)?.template_id ?? download.template_id)
        .maybeSingle(),
      supabase
        .from("establishments")
        .select("name")
        .eq("id", download.establishment_id)
        .maybeSingle(),
    ]);
  if (!menu || !version || !template || !establishment || !isMenuLayout(template.layout)) {
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
