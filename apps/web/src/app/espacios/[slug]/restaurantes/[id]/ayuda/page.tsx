import { notFound, redirect } from "next/navigation";

import { HelpCenter } from "@/components/help/HelpCenter";
import { resolveShellViewer } from "@/components/shell/viewer";
import { createClient } from "@/lib/supabase/server";

/**
 * §131, §133 · el centro de ayuda visto desde el restaurante: las mismas
 * guías, colgadas de su restaurante como todo lo suyo. Un restaurante
 * consulta artículos; las incidencias a Cuotly las abre su equipo, y aquí
 * no se le ofrecen (sin `spaceId`, el servidor ni se lo pregunta).
 */
export const dynamic = "force-dynamic";

export default async function ClientHelpPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug, id } = await params;
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Que el restaurante sea suyo lo decide la RLS: si no lo ve, no existe.
  const { data: establecimiento } = await supabase.from("establishments").select("id").eq("id", id).maybeSingle();
  if (!establecimiento) notFound();

  const { role } = await resolveShellViewer(supabase, user.id, slug);

  return (
    <HelpCenter
      supabase={supabase}
      role={role}
      base={`/espacios/${slug}/restaurantes/${id}/ayuda`}
      spaceId={null}
      consulta={(q ?? "").trim()}
    />
  );
}
