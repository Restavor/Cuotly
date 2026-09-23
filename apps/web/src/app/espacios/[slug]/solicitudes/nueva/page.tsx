import { randomUUID } from "node:crypto";

import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, NoPermissionState, PageHeader } from "@/components/ui";
import { statusEffects } from "@/core/establishment-status";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhotos } from "@/services/establishment-photo";

import { NewTeamRequestForm, type OnBehalfEstablishment } from "./NewTeamRequestForm";

/**
 * M77 · Nueva solicitud en nombre de un restaurante (RN-REQ-08, decisión
 * 73). El restaurante lo pidió fuera de Cuotly y el propietario o un
 * administrador del espacio lo deja escrito aquí.
 *
 * Quién puede lo decide `create_request_on_behalf()`, que exige
 * `manage_requests`. Esta página pregunta lo mismo para no enseñar un
 * formulario que va a fallar, y dice por qué (CA-20); no es el control
 * (CLAUDE.md).
 *
 * Solo se ofrecen los restaurantes con el servicio en marcha: con el
 * servicio detenido el servidor rechaza la solicitud (RN-EST-08), y la
 * pantalla dice cuántos se quedan fuera y por qué en vez de esconderlos
 * sin más.
 *
 * `?restaurante=` preselecciona uno: es a donde lleva el botón desde la
 * bandeja filtrada por restaurante.
 */
export const dynamic = "force-dynamic";

const t = es.teamArea.requests.onBehalf;

export default async function NewTeamRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ restaurante?: string }>;
}) {
  const { slug } = await params;
  const { restaurante } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase.from("spaces").select("id").eq("slug", slug).maybeSingle();
  if (!space) notFound();

  const { data: puede } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_requests",
  });

  if (!puede) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState description={t.noPermissionReason} />
      </div>
    );
  }

  const [{ data: establishments }, { data: groups }] = await Promise.all([
    supabase
      .from("establishments")
      .select("id, name, code, status, group_id")
      .eq("space_id", space.id)
      .order("name"),
    supabase.from("groups").select("id, name").eq("space_id", space.id),
  ]);

  const todos = establishments ?? [];
  const enMarcha = todos.filter((e) => statusEffects(e.status).serviceRunning);
  const detenidos = todos.length - enMarcha.length;

  const fotos = await loadEstablishmentPhotos(
    supabase,
    supabase.storage,
    enMarcha.map((e) => e.id),
  );
  const grupo = new Map((groups ?? []).map((g) => [g.id, g.name]));

  const opciones: OnBehalfEstablishment[] = enMarcha.map((e) => ({
    id: e.id,
    name: e.name,
    code: e.code,
    groupName: e.group_id ? (grupo.get(e.group_id) ?? null) : null,
    photoUrl: fotos.get(e.id) ?? null,
  }));

  const preseleccionado = opciones.some((e) => e.id === restaurante) ? (restaurante ?? "") : "";

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {detenidos > 0 ? <p className="text-sm text-text-secondary">{t.stoppedHidden(detenidos)}</p> : null}

      {opciones.length === 0 ? (
        <Card>
          <EmptyState title={t.noEstablishmentsTitle} description={t.noEstablishmentsReason} />
        </Card>
      ) : (
        <NewTeamRequestForm
          slug={slug}
          establishments={opciones}
          defaultEstablishmentId={preseleccionado}
          idempotencyKey={randomUUID()}
        />
      )}
    </div>
  );
}
