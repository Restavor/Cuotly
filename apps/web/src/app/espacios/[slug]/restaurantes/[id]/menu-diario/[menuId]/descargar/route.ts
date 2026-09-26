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
 * **La versión y la plantilla son las que se REGISTRARON, no las que el
 * menú tenga ahora.** La
 * función devuelve el id de la descarga y de esa fila salen la versión y
 * la plantilla. Releer `menus` después de llamarla parecía equivalente y
 * no lo es: `register_menu_download()` bloquea la fila mientras corre,
 * pero suelta el bloqueo al devolver, así que un guardado del restaurante
 * entre las dos consultas entregaba un archivo que no era el que consta en
 * `menu_downloads` — y esa fila es la que RN-MEN-10 conserva como historial
 * ("la versión y la plantilla exactas que se llevó"). Lo encontró la
 * revisión del Hito 10 (13/09/2026).
 *
 * El nombre y la fecha objetivo SÍ salen del menú vigente, y es lo único
 * que se puede hacer hoy: `menu_downloads` no los guarda. RN-MEN-10 solo
 * manda conservar la versión y la plantilla, así que no es un
 * incumplimiento — pero conviene que esté dicho aquí y no dar a entender
 * que la fila fija el documento entero. Fijarlos sería añadir dos
 * columnas en una migración nueva.
 *
 * Las columnas se enumeran porque las cuatro tablas tienen privilegios de
 * columna (CLAUDE.md).
 *
 * **Imprimir es esta misma descarga** (`?formato=pdf&imprimir=1`): el
 * mismo registro, el mismo PDF y el mismo 404 a quien no puede. Lo único
 * que cambia es `Content-Disposition: inline`, para que el navegador lo
 * cargue en vez de guardarlo y el botón de imprimir pueda mandarlo a la
 * impresora. No hay formato `print` en `menu_downloads`: lo que salió de
 * Cuotly es el PDF, y así consta. Solo el PDF se imprime; `imprimir` con
 * `png` es un 404, igual que un formato desconocido.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string; menuId: string }> },
) {
  const { menuId } = await params;
  const busqueda = new URL(request.url).searchParams;
  const formato = busqueda.get("formato");
  if (formato !== "png" && formato !== "pdf") return new NextResponse(null, { status: 404 });
  const imprimir = busqueda.get("imprimir") === "1";
  if (imprimir && formato !== "pdf") return new NextResponse(null, { status: 404 });

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

  const [{ data: menu }, { data: version }, { data: template }, { data: establishment }] =
    await Promise.all([
      supabase.from("menus").select("name, target_date").eq("id", download.menu_id).maybeSingle(),
      supabase
        .from("menu_versions")
        .select("version, starters, mains, desserts, drink, price_cents, note")
        .eq("id", download.version_id)
        .maybeSingle(),
      supabase
        .from("menu_templates")
        .select("layout, background_color, text_color, accent_color, heading_text, footer_text, show_prices")
        .eq("id", download.template_id)
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
      "Content-Disposition": `${imprimir ? "inline" : "attachment"}; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
