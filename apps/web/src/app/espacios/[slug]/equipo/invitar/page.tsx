import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InviteMemberForm } from "@/components/InviteMemberForm";
import { Card, NoPermissionState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * HU-03 y HU-04 · invitar a alguien al equipo, con caducidad de 7 días, y
 * el camino de "este usuario ya está registrado". Es el destino "Invitar a
 * alguien al equipo" del botón Crear (§20.5), que llevaba a un 404.
 *
 * El formulario es el mismo del Hito 2, sin tocar: lo que cambia es que
 * ahora tiene una ruta propia además de vivir dentro del inicio del
 * espacio. Quién puede invitar lo decide el servidor; la capacidad se
 * consulta aquí solo para no enseñar un formulario condenado a fallar.
 */
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: puedeInvitar } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "invite_member",
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-primary-dark">{es.teamPage.inviteTitle}</h1>

      {puedeInvitar === true ? (
        <Card title={es.teamPage.inviteTitle}>
          <InviteMemberForm spaceId={space.id} spaceSlug={space.slug} />
        </Card>
      ) : (
        <NoPermissionState />
      )}

      <Link href={`/espacios/${space.slug}/equipo`} className="text-sm text-cuotly-green underline">
        {es.teamPage.backToTeam}
      </Link>
    </div>
  );
}
