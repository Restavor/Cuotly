import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Card } from "@/components/ui";
import { type HelpTopic } from "@/core/support";
import { es } from "@/i18n/es";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Una guía del centro de ayuda (RN-SOP-10). La lee cualquiera con sesión;
 * lo no publicado no existe para nadie, y lo dice la política.
 */
export async function HelpArticle({
  supabase,
  articleSlug,
  backHref,
}: {
  supabase: SupabaseClient<Database>;
  articleSlug: string;
  backHref: string;
}) {
  const { data: articulo } = await supabase
    .from("help_articles")
    .select("slug, topic, title, body, audience, version, updated_at")
    .eq("slug", articleSlug)
    .maybeSingle();
  if (!articulo) notFound();

  const t = es.help;
  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:p-8">
      <Link href={backHref} className="text-sm text-cuotly-green underline">
        {t.title}
      </Link>
      <Card title={articulo.title}>
        <p className="mb-4 text-xs text-text-secondary">
          {t.topics[articulo.topic as HelpTopic]} ·{" "}
          {articulo.audience.map((a) => es.roles[a as keyof typeof es.roles] ?? a).join(", ")}
        </p>
        <div className="space-y-3 text-sm text-text">
          {articulo.body.split(/\n+/).map((parrafo, i) => (
            <p key={i}>{parrafo}</p>
          ))}
        </div>
      </Card>
    </div>
  );
}
