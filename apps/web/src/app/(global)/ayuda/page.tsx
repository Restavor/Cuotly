import { redirect } from "next/navigation";

import { readHelpParams } from "@/core/global-help";
import { helpAudienceFor } from "@/core/support";
import { createClient } from "@/lib/supabase/server";
import { myContexts } from "@/services/global-gateway";
import { searchHelpArticles, supportIsOpenNow, type HelpArticleHit } from "@/services/support-gateway";

import { HelpView, type HelpContact } from "./HelpView";

/**
 * G06 · la Ayuda global (RN-GLO-07): el centro de ayuda de RN-SOP visto
 * desde fuera de los espacios. Los artículos son los mismos
 * (`help_articles`, por `search_help_articles()`), y las guías se abren en
 * `/ayuda/guias/<slug>` con el mismo `HelpArticle` de siempre.
 *
 * El dibujo pone un formulario de "Asunto" y "Descripción". No se copia:
 * una consulta abierta desde aquí es una **incidencia** de RN-SOP-03, que
 * tiene sus propios campos (tipo, categoría, impacto, descripción) y es de
 * un espacio, con su prioridad. Por eso la tarjeta de contacto ofrece
 * abrirla en cada espacio donde quien mira puede (`contact_cuotly`, que se
 * pregunta al servidor espacio a espacio), y a quien no puede le dice a
 * quién pedírselo. Un formulario aquí que no supiera de qué espacio es
 * acabaría rechazado por el servidor.
 */
export const dynamic = "force-dynamic";

export default async function GlobalHelpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = readHelpParams(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const contextos = await myContexts(supabase).catch(() => []);
  const espacios = contextos.filter((c) => c.kind === "space");

  // Con qué papel se ordenan las guías. NO es un permiso: solo decide qué
  // guía sale primero, así que con varios espacios se toma el rol del
  // primero en vez de inventar una mezcla.
  const audiencia = helpAudienceFor(espacios[0]?.role ?? "client");

  const [busqueda, abierto, puede] = await Promise.all([
    searchHelpArticles(supabase, params.q, audiencia, 60).then(
      (hits) => ({ hits, failed: false }),
      () => ({ hits: [] as readonly HelpArticleHit[], failed: true }),
    ),
    supportIsOpenNow(supabase).catch(() => null),
    Promise.all(
      espacios.map(async (e) => {
        const { data } = await supabase.rpc("has_capability", {
          p_space_id: e.space_id,
          p_capability: "contact_cuotly",
        });
        return data === true ? { slug: e.space_slug ?? "", name: e.space_name ?? "" } : null;
      }),
    ),
  ]);

  const conPermiso = puede.filter((e): e is { slug: string; name: string } => e !== null && e.slug !== "");
  const contact: HelpContact =
    conPermiso.length > 0
      ? { kind: "spaces", spaces: conPermiso }
      : espacios.length > 0
        ? { kind: "cannot" }
        : { kind: "client" };

  return (
    <HelpView params={params} hits={busqueda.hits} failed={busqueda.failed} contact={contact} supportOpen={abierto} />
  );
}
