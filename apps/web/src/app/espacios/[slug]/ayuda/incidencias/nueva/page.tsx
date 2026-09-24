import { notFound, redirect } from "next/navigation";

import { Card, NoPermissionState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { NewIncidentForm } from "./NewIncidentForm";

/** RN-SOP-01 · abrir una incidencia: propietario o administrador. */
export const dynamic = "force-dynamic";

export default async function NewIncidentPage({
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

  const { data: space } = await supabase.from("spaces").select("id").eq("slug", slug).maybeSingle();
  if (!space) notFound();

  const t = es.help.newIncident;
  const { data: puede } = await supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "contact_cuotly" });
  if (!puede) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.title}</h1>
        <NoPermissionState title={es.help.incidents.noAccessTitle} description={es.help.incidents.noAccessReason} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>
      <Card>
        <NewIncidentForm spaceId={space.id} slug={slug} helpQuery={(q ?? "").trim()} />
      </Card>
    </div>
  );
}
