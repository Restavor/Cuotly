import { redirect } from "next/navigation";

import { HelpCenter } from "@/components/help/HelpCenter";
import { resolveShellViewer } from "@/components/shell/viewer";
import { createClient } from "@/lib/supabase/server";

/** §133 · el centro de ayuda visto desde el espacio de mantenimiento. */
export const dynamic = "force-dynamic";

export default async function HelpPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { role } = await resolveShellViewer(supabase, user.id, slug);
  // Un restaurante no es miembro del espacio: `spaces` le devuelve nada, y
  // sin `spaceId` no se le pregunta al servidor si puede abrir incidencias.
  const { data: space } = await supabase.from("spaces").select("id").eq("slug", slug).maybeSingle();

  return (
    <HelpCenter
      supabase={supabase}
      role={role}
      base={`/espacios/${slug}/ayuda`}
      spaceId={space?.id ?? null}
      consulta={(q ?? "").trim()}
    />
  );
}
