import { redirect } from "next/navigation";

import { HelpArticle } from "@/components/help/HelpArticle";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClientHelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string; id: string; articleSlug: string }>;
}) {
  const { slug, id, articleSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <HelpArticle
      supabase={supabase}
      articleSlug={articleSlug}
      backHref={`/espacios/${slug}/restaurantes/${id}/ayuda`}
    />
  );
}
