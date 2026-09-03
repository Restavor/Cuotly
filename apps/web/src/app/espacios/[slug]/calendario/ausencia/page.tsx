import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, NoPermissionState } from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { RequestAbsenceForm } from "../CalendarForms";

/**
 * HU-30 · pedir una ausencia. Es el destino "Pedir una ausencia" del botón
 * Crear (§20.5), que hasta ahora llevaba a un 404.
 *
 * Quién puede pedirla lo decide `request_absence()` en el servidor
 * (capacidad `perform_jobs`). Aquí se consulta la misma capacidad solo
 * para no enseñar un formulario que iba a fallar: quien llegue por URL sin
 * ella ve el estado "sin permiso" y, si aun así enviara el formulario, la
 * función del servidor lo rechaza igual (CLAUDE.md MUST).
 */
export const dynamic = "force-dynamic";

export default async function NewAbsencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: realizaTrabajos } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "perform_jobs",
  });

  const hoy = todayInTimeZone(new Date(), space.timezone);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-primary-dark">{es.calendar.newAbsenceTitle}</h1>

      {realizaTrabajos === true ? (
        <Card title={es.calendar.newAbsenceTitle} className="space-y-3">
          <p className="text-sm text-text-secondary">{es.calendar.newAbsenceIntro}</p>
          <RequestAbsenceForm spaceId={space.id} defaultDay={hoy} />
        </Card>
      ) : (
        <NoPermissionState description={es.calendar.availabilityNotWorker} />
      )}

      <Link href={`/espacios/${space.slug}/calendario`} className="text-sm text-cuotly-green underline">
        {es.calendar.back}
      </Link>
    </div>
  );
}
