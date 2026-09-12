import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, NoPermissionState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { PublishConditionsForm } from "../PlanForms";

/**
 * Maqueta 13 · las condiciones de cada plan y servicio del espacio, con su
 * versión vigente y el formulario para publicar la siguiente.
 *
 * **Publicar es versionar (RN-DAT-07, P4).** No hay "editar": la versión
 * que hay la aceptaron restaurantes tal cual, y §104 de la maestra pide
 * conservar la versión aceptada. Publicar una nueva deja a esos
 * restaurantes con la nueva pendiente, y su ficha lo dice.
 *
 * Qué se ve lo decide `conditions_catalogue()` (cero filas a quien no es
 * del espacio); quién publica lo decide `publish_*_conditions()`
 * (`manage_space`). Aquí `manage_space` se consulta solo para no pintar
 * un formulario que el servidor va a rechazar.
 */
export const dynamic = "force-dynamic";

function dia(instant: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(instant));
}

export default async function ConditionsCataloguePage({
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
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const t = es.plansPage.terms;

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.catalogueTitle}</h1>
        <NoPermissionState
          title={es.plansPage.noAccessTitle}
          description={es.plansPage.noAccessReason}
        />
      </div>
    );
  }

  const [{ data: canPublish }, { data: catalogue }] = await Promise.all([
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_space" }),
    supabase.rpc("conditions_catalogue", { p_space_id: space.id }),
  ]);

  const filas = catalogue ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-1">
        <Link href={`/espacios/${slug}/planes`} className="text-sm text-cuotly-green underline">
          {es.plansPage.backToList}
        </Link>
        <h1 className="text-2xl font-bold text-primary-dark">{t.catalogueTitle}</h1>
        <p className="text-sm text-text-secondary">{t.catalogueSubtitle}</p>
        {canPublish ? null : (
          <p className="text-sm text-text-secondary">{t.catalogueNoAccessReason}</p>
        )}
      </header>

      {filas.length === 0 ? (
        <EmptyState title={es.plansPage.emptyTitle} description={es.plansPage.emptyReason} />
      ) : (
        filas.map((fila) => (
          <Card
            key={`${fila.subject_type}:${fila.subject_id}`}
            title={`${fila.subject_type === "service" ? t.subjectService : t.subjectPlan} · ${fila.subject_name}`}
          >
            {fila.version === null || fila.published_at === null || fila.conditions === null ? (
              // P6 · no tener condiciones es un dato con motivo, no un hueco.
              <EmptyState title={t.noVersion} description={t.noVersionReason} />
            ) : (
              <details className="group">
                <summary className="cursor-pointer text-sm font-semibold text-primary-dark">
                  {t.currentVersion(fila.version, dia(fila.published_at))} · {t.readCurrent}
                </summary>
                {/*
                  El texto se pinta tal cual lo escribió el espacio, con
                  sus saltos de línea. Sin HTML: son condiciones, no una
                  página.
                */}
                <p className="mt-3 whitespace-pre-wrap text-sm text-text">{fila.conditions}</p>
              </details>
            )}

            {canPublish ? (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-sm font-semibold text-text">{t.publishTitle}</p>
                <PublishConditionsForm
                  subjectType={fila.subject_type === "service" ? "service" : "plan"}
                  subjectId={fila.subject_id}
                />
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}
