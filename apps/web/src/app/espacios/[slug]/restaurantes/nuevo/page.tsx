import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NewEstablishmentForm } from "@/components/NewEstablishmentForm";
import { Card, NoPermissionState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * §20.5 · la opción "Nuevo restaurante" del botón Crear llevaba a un 404
 * desde el Hito 8. El formulario es el mismo del Hito 2 que ya vive en el
 * inicio del espacio; lo que faltaba era la ruta.
 *
 * Que se pinte o no depende de `create_establishment`, pero eso es
 * presentación: quien llegue por URL sin el permiso ve el motivo, y si
 * enviara el formulario de todos modos, `create_establishment_with_group()`
 * se lo niega en el servidor (CLAUDE.md MUST).
 */
export const dynamic = "force-dynamic";

export default async function NewEstablishmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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

  const { data: puedeCrear } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "create_establishment",
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.newEstablishmentPage.title}</h1>
        <p className="text-sm text-text-secondary">{es.newEstablishmentPage.intro}</p>
      </header>

      <Card>
        {puedeCrear ? (
          <NewEstablishmentForm spaceId={space.id} spaceSlug={space.slug} />
        ) : (
          <NoPermissionState
            title={es.states.noPermissionTitle}
            description={es.states.noPermissionDescription}
          />
        )}
      </Card>

      <p className="text-sm">
        <Link href={`/espacios/${slug}/restaurantes`} className="text-cuotly-green underline">
          {es.newEstablishmentPage.back}
        </Link>
      </p>
    </div>
  );
}
