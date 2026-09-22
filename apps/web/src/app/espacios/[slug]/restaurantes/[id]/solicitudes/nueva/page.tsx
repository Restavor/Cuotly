import { notFound, redirect } from "next/navigation";

import { StatusNotice } from "@/components/establishment/StatusNotice";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { statusEffects } from "@/core/establishment-status";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhoto } from "@/services/establishment-photo";

import { NewRequestDraftForm } from "./NewRequestDraftForm";

/**
 * R06 · Nueva solicitud. Crea un BORRADOR y lleva a R07 para revisarlo y
 * enviarlo (§68): el dibujo tiene los dos pasos, "Revisar solicitud" y
 * luego "Confirmar envío", y así el restaurante ve lo que manda antes de
 * mandarlo, con los adjuntos que quiera añadir.
 *
 * Con el servicio detenido no se ofrece el formulario y se dice por qué
 * (RN-EST-08). Ocultarlo no es el control: `create_request_draft()` y
 * `submit_request()` lo rechazan igual a quien llame a mano (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

const t = es.panelRequests;

export default async function NewClientRequestPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, photoUrl, { data: motivo }] = await Promise.all([
    supabase.from("establishments").select("id, name, status").eq("id", id).maybeSingle(),
    loadEstablishmentPhoto(supabase, supabase.storage, id),
    supabase.rpc("establishment_status_reason", { p_establishment_id: id }),
  ]);

  if (!establishment) notFound();

  const serviceStopped = !statusEffects(establishment.status).serviceRunning;

  return (
    <div className="space-y-6">
      <StatusNotice status={establishment.status} reason={motivo ?? null} />
      <PageHeader title={t.newTitle} subtitle={t.newSubtitle} />
      {serviceStopped ? (
        <Card>
          <EmptyState title={t.stoppedTitle} description={t.stoppedReason} />
        </Card>
      ) : (
        <NewRequestDraftForm
          slug={slug}
          establishmentId={id}
          establishmentName={establishment.name}
          photoUrl={photoUrl}
        />
      )}
    </div>
  );
}
