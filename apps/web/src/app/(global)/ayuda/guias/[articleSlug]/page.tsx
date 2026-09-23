import { redirect } from "next/navigation";

import { HelpArticle } from "@/components/help/HelpArticle";
import { createClient } from "@/lib/supabase/server";

/**
 * G06 · una guía abierta desde la Ayuda global. La Ayuda enlazaba aquí
 * desde que existe y la ruta no estaba: daba 404. Es el mismo
 * `HelpArticle` que en los espacios y los paneles.
 */
export const dynamic = "force-dynamic";

export default async function GlobalHelpArticlePage({ params }: { params: Promise<{ articleSlug: string }> }) {
  const { articleSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <HelpArticle supabase={supabase} articleSlug={articleSlug} backHref="/ayuda" />;
}
