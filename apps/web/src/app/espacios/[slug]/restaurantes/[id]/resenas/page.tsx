import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, NoPermissionState } from "@/components/ui";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadEstablishmentTimezone } from "../timezone-load";

/**
 * RN-INT-10 a 12 (migración 117, decisión 60) · las reseñas de Google del
 * restaurante. Es a donde apunta el aviso de una reseña nueva.
 *
 * **La lista no se recorta ni se ordena por puntuación**: se leen por
 * fecha, como pasaron, y una reseña baja se marca en vez de subirla
 * arriba. Reordenarlas por gravedad convertiría la pantalla en un
 * ranking de quejas, y lo que el equipo necesita es saber qué ha pasado
 * y en qué orden.
 *
 * **Las columnas se enumeran** (CLAUDE.md): `select *` sobre una tabla
 * con privilegios de columna devuelve 403, y aunque `reviews` no tenga
 * hoy ninguna revocada —su autor es un cliente del restaurante, no
 * alguien del equipo— enumerarlas es la costumbre que evita el 403 del
 * día que alguien añada una.
 *
 * **Cuando no hay ninguna, se dice por qué**, y son cuatro motivos
 * distintos: el plan no la incluye, la ficha no está conectada, la
 * conexión no guardó la cuenta de Google, o no ha llegado ninguna
 * todavía. Un "sin reseñas" a secas dejaría al equipo sin saber si el
 * producto falla o el restaurante no tiene reseñas.
 */
export const dynamic = "force-dynamic";

export default async function EstablishmentReviewsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, code, space_id")
    .eq("id", id)
    .maybeSingle();

  if (!establishment) notFound();

  /*
    La puerta es `can_read_establishment()` y **no** `is_space_member()`,
    y la diferencia importa: RN-INT-12 le manda al restaurante el aviso de
    una reseña baja, y ese aviso enlaza aquí. Con la puerta del equipo, el
    restaurante pulsaría su propio aviso para que le dijeran que no puede
    entrar.

    La barrera de verdad es la RLS de `reviews`, que usa esta misma
    función: quien llegue sin poder leer el restaurante no vería ni una
    fila aunque esta comprobación no existiera. Esto solo sirve para
    decirle el motivo en vez de enseñarle una lista vacía (CA-20, P6).
  */
  const { data: puedeLeer } = await supabase.rpc("can_read_establishment", {
    p_establishment_id: id,
  });

  if (!puedeLeer) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.reviewsPage.title}</h1>
        <NoPermissionState
          title={es.reviewsPage.noAccessTitle}
          description={es.reviewsPage.noAccessReason}
        />
      </div>
    );
  }

  const zona = await loadEstablishmentTimezone(supabase, id);

  const [{ data: reviews }, { data: plan }, { data: conexion }] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, rating, comment, author_name, reviewed_at, reply_comment, replied_at")
      .eq("establishment_id", id)
      .order("reviewed_at", { ascending: false })
      .limit(100),
    // Si el plan la concede. Se lee del plan vigente y no de
    // `establishment_watches_reviews()`, que es interna a propósito.
    supabase
      .from("subscriptions")
      .select("plans(watches_reviews)")
      .eq("establishment_id", id)
      .eq("kind", "plan")
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1),
    supabase
      .from("integrations")
      .select("status, external_property_id")
      .eq("establishment_id", id)
      .eq("provider", "business_profile")
      .maybeSingle(),
  ]);

  const filas = reviews ?? [];
  const fichaPlan = (plan ?? [])[0] as { plans?: unknown } | undefined;
  const planRow = Array.isArray(fichaPlan?.plans) ? fichaPlan?.plans[0] : fichaPlan?.plans;
  const vigila = (planRow as { watches_reviews?: boolean } | undefined)?.watches_reviews === true;

  const conectada = conexion?.status === "connected" || conexion?.status === "syncing";
  const conCuenta = /accounts\/[^/]+\/locations\/[^/]+/.test(conexion?.external_property_id ?? "");

  // El orden importa: se dice el primer motivo que impide que haya
  // reseñas, no el último, porque es el que hay que resolver primero.
  const motivo = !vigila
    ? es.reviewsPage.emptyNotWatched
    : !conectada
      ? es.reviewsPage.emptyNotConnected
      : !conCuenta
        ? es.reviewsPage.emptyNeedsAccount
        : es.reviewsPage.emptyNoneYet;

  const umbral = 3;

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:p-8">
      <header>
        <p className="text-sm text-text-secondary">
          {establishment.code} · {establishment.name}
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.reviewsPage.title}</h1>
        <p className="text-sm text-text-secondary">{es.reviewsPage.subtitle}</p>
      </header>

      <Card>
        {filas.length === 0 ? (
          <EmptyState title={es.reviewsPage.emptyTitle} description={motivo} />
        ) : (
          <ul className="divide-y divide-border">
            {filas.map((review) => (
              <li key={review.id} className="py-4">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold text-text">
                    {es.reviewsPage.stars(review.rating)}
                  </span>
                  {/* RN-INT-11 · la baja se marca donde está, no se sube
                      arriba: la lista es el relato por fechas. */}
                  {review.rating <= umbral ? (
                    <span className="rounded-[6px] bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                      {es.reviewsPage.lowBadge}
                    </span>
                  ) : null}
                  <span className="text-sm text-text-secondary">
                    {enZona(review.reviewed_at, zona, { dateStyle: "short" })}
                  </span>
                  {review.author_name ? (
                    <span className="text-sm text-text-secondary">· {review.author_name}</span>
                  ) : null}
                  {review.replied_at ? (
                    <span className="text-xs text-text-secondary">· {es.reviewsPage.reply}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-text">
                  {review.comment ?? (
                    <span className="text-text-secondary">{es.reviewsPage.noComment}</span>
                  )}
                </p>
                {review.reply_comment ? (
                  <p className="mt-2 border-l-2 border-border pl-3 text-sm text-text-secondary">
                    {review.reply_comment}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
