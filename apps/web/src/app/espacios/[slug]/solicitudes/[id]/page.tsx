import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { requestTone } from "../page";
import {
  BeginAnalysisForm,
  RejectRequestForm,
  RequestInformationForm,
  ValidateClassificationForm,
} from "./RequestActions";

/**
 * Detalle de una solicitud para el equipo (HU-12, HU-13, HU-14).
 *
 * Las acciones que se ofrecen dependen del estado, pero eso es
 * **presentación**: quien decide si una acción es legal es el servidor.
 * Cada botón llama a la función que hace cumplir su regla, y si el estado
 * no la admite, la función lanza y el error se enseña. Esta pantalla no
 * puede autorizar nada por su cuenta (CLAUDE.md MUST).
 */
export const dynamic = "force-dynamic";

type RequestStateKey = keyof typeof es.naming.states.request;
type CategoryKey = keyof typeof es.naming.categories;

export default async function TeamRequestDetailPage({
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

  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, code, description, context, state, created_at, validated_category, validated_summary, establishment_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!request) notFound();

  const [{ data: establishment }, { data: job }] = await Promise.all([
    supabase
      .from("establishments")
      .select("id, name, code")
      .eq("id", request.establishment_id)
      .maybeSingle(),
    supabase.from("jobs").select("id, code, state").eq("request_id", id).maybeSingle(),
  ]);

  // La propuesta de la IA vive en `classifications` y solo la lee el
  // equipo (RN-CLS-04). Si no hay ninguna, no se inventa: el formulario
  // sale vacío y quien valida escribe el resumen.
  const { data: classification } = await supabase
    .from("classifications")
    .select("proposed_category, proposed_summary")
    .eq("request_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const state = request.state;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">
          {request.code} · {establishment?.name ?? "—"}
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.teamArea.requests.detailTitle}</h1>
        <div className="mt-2">
          <StatusBadge tone={requestTone(state)}>
            {es.naming.states.request[state as RequestStateKey] ?? state}
          </StatusBadge>
        </div>
      </header>

      <Card title={es.teamArea.requests.descriptionColumn}>
        <p className="whitespace-pre-wrap text-text">{request.description}</p>
        {request.context ? (
          <p className="mt-3 text-sm text-text-secondary">
            {es.teamArea.requests.contextLabel}: {request.context}
          </p>
        ) : null}
        {request.validated_category ? (
          <p className="mt-3 text-sm text-text-secondary">
            {es.teamArea.requests.categoryColumn}:{" "}
            {es.naming.categories[request.validated_category as CategoryKey] ??
              request.validated_category}
          </p>
        ) : null}
      </Card>

      {state === "received" ? <BeginAnalysisForm requestId={id} /> : null}

      {state === "analyzing" || state === "pending_internal_validation" ? (
        <ValidateClassificationForm
          requestId={id}
          suggestedCategory={classification?.proposed_category ?? null}
          suggestedSummary={classification?.proposed_summary ?? null}
        />
      ) : null}

      {state === "received" || state === "analyzing" || state === "pending_internal_validation" ? (
        <>
          <RequestInformationForm requestId={id} />
          <RejectRequestForm requestId={id} />
        </>
      ) : null}

      {state === "pending_client_acceptance" ? (
        <Card title={es.teamArea.requests.waitingClient}>
          <p className="text-sm text-text-secondary">
            {es.teamArea.requests.waitingClientReason}
          </p>
        </Card>
      ) : null}

      {job ? (
        <Card>
          <Link href={`/espacios/${slug}/trabajos/${job.id}`} className="text-cuotly-green underline">
            {es.teamArea.requests.jobLink} · {job.code}
          </Link>
        </Card>
      ) : null}
    </main>
  );
}
