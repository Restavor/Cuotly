import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { NewEstablishmentForm } from "@/components/establishment/NewForm";
import { NoPermissionState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * Maqueta 02 · el alta de un restaurante (§20.5, RN-EST-06).
 *
 * Que se pinte el formulario o no depende de `create_establishment`, pero
 * eso es presentación: quien llegue por URL sin el permiso ve el motivo, y
 * si enviara el formulario de todos modos,
 * `create_establishment_with_data()` se lo niega en el servidor
 * (CLAUDE.md MUST). Desde la migración 58 no hay otro camino:
 * `establishments` se quedó sin política de INSERT.
 *
 * La clave de idempotencia se genera aquí, en el servidor, y viaja al
 * formulario en un campo oculto. Es una por carga de la página —y la
 * página es `force-dynamic`—, así que dos altas seguidas llevan claves
 * distintas y un doble clic sobre la misma lleva la misma.
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

  // Los grupos y los planes que este espacio tiene de verdad. No hay
  // ninguna opción de relleno: si no hay planes, el formulario lo dice y
  // no ofrece un desplegable vacío (CLAUDE.md, CA-20).
  const [{ data: groups }, { data: plans }] = puedeCrear
    ? await Promise.all([
        supabase.from("groups").select("id, name").eq("space_id", space.id).order("name"),
        supabase.from("plans").select("id, name").eq("space_id", space.id).order("price_cents"),
      ])
    : [{ data: null }, { data: null }];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.newEstablishmentPage.title}</h1>
        <p className="text-sm text-text-secondary">{es.newEstablishmentPage.intro}</p>
      </header>

      {puedeCrear ? (
        <NewEstablishmentForm
          spaceId={space.id}
          spaceSlug={space.slug}
          groups={groups ?? []}
          plans={plans ?? []}
          idempotencyKey={randomUUID()}
        />
      ) : (
        <NoPermissionState
          title={es.states.noPermissionTitle}
          description={es.states.noPermissionDescription}
        />
      )}

      <p className="text-sm">
        <Link href={`/espacios/${slug}/restaurantes`} className="text-cuotly-green underline">
          {es.newEstablishmentPage.back}
        </Link>
      </p>
    </div>
  );
}
