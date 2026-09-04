import { notFound, redirect } from "next/navigation";

import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";
import { Card, StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { AcceptRequestButton } from "../../AcceptRequestButton";
import {
  AcceptRevisedForm,
  DeclineRequestForm,
  ProvideInformationForm,
  RequestCorrectionForm,
} from "./ClientRequestActions";

/**
 * Una solicitud, vista por el restaurante que la pidió (HU-13, HU-14,
 * HU-35, RN-COR-01).
 *
 * Lo que se ve y lo que se puede hacer lo decide el servidor: RLS filtra
 * las filas, las funciones validan cada acción y
 * `list_conversation_messages()` decide quién aparece como autor. Esta
 * pantalla elige qué formularios pintar según el estado, y nada más — si
 * alguien llamara a la acción equivocada, la función lanza.
 */
export const dynamic = "force-dynamic";

type RequestStateKey = keyof typeof es.naming.states.request;
type CategoryKey = keyof typeof es.naming.categories;

function tone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "published" || state === "closed" || state === "accepted") return "success";
  if (state === "pending_client_acceptance" || state === "needs_information") return "warning";
  if (state.startsWith("cancelled") || state === "rejected") return "danger";
  if (state === "in_progress" || state === "in_correction") return "info";
  return "neutral";
}

export default async function ClientRequestDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, code, description, context, state, created_at, validated_category, validated_summary, rejected_reason",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!request) notFound();

  // El trabajo NO se lee de la tabla: el cliente no puede, y es
  // deliberado. `jobs_select` es `is_space_member(space_id) and
  // can_read_job(id)`, la misma forma que `assignments`, `blocks`,
  // `tasks` y los `state_events` de trabajo — la fila entera es
  // organización interna (P7) y lleva cuatro identidades del equipo
  // (`assigned_to`, `started_by`, `published_by`, `cancelled_by`) que el
  // cliente no puede ver (CA-04).
  //
  // Leerla desde aquí devolvía SIEMPRE null para el restaurante, y con
  // ella se decide si se le ofrece la corrección gratuita: el flujo de
  // RN-COR-01 era inalcanzable desde la interfaz. `client_request_job()`
  // (migración 20260902000043) contesta solo lo que le corresponde saber,
  // sin ninguna identidad.
  const { data: jobRows } = await supabase.rpc("client_request_job", {
    p_request_id: requestId,
  });
  const job = jobRows?.[0] ?? null;

  // La conversación se crea al abrirla si no existía: es la de esta
  // solicitud, no un hilo suelto (§66).
  const { data: conversationId } = await supabase.rpc("get_or_create_request_conversation", {
    p_request_id: requestId,
  });

  // RN-MSG-06 · abrir la conversación es haberla leído; lo marca
  // `loadConversation()`, que es el mismo cargador que usa la pantalla del
  // equipo. Antes esto estaba copiado, y la copia decidía "es mío" mirando
  // `sender_display === "client"`, con lo que el mensaje de un compañero
  // del local aparecía firmado como "Tú".
  const conversation = conversationId ? await loadConversation(supabase, conversationId) : null;

  const state = request.state;
  const correctionAvailable =
    job !== null && job.state === "published" && !job.free_correction_used;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">{request.code}</p>
        <h1 className="text-2xl font-bold text-primary-dark">
          {es.clientArea.requestDetailTitle}
        </h1>
        <div className="mt-2">
          <StatusBadge tone={tone(state)}>
            {es.naming.states.request[state as RequestStateKey] ?? state}
          </StatusBadge>
        </div>
      </header>

      <Card title={es.clientArea.descriptionColumn}>
        <p className="whitespace-pre-wrap text-text">{request.description}</p>
        {request.context ? (
          <p className="mt-3 text-sm text-text-secondary">{request.context}</p>
        ) : null}
      </Card>

      {/* RN-CLS-03: hasta que el equipo no valida, aquí no hay nada que leer. */}
      {request.validated_summary ? (
        <Card title={es.clientArea.proposalTitle}>
          <p className="whitespace-pre-wrap text-text">{request.validated_summary}</p>
          {request.validated_category ? (
            <p className="mt-3 text-sm text-text-secondary">
              {es.clientArea.proposalCategory}:{" "}
              {es.naming.categories[request.validated_category as CategoryKey] ??
                request.validated_category}
            </p>
          ) : null}
        </Card>
      ) : null}

      {request.rejected_reason ? (
        <Card title={es.naming.states.request.rejected}>
          <p className="whitespace-pre-wrap text-text">{request.rejected_reason}</p>
        </Card>
      ) : null}

      {state === "needs_information" ? <ProvideInformationForm requestId={requestId} /> : null}

      {/*
        Las dos aceptaciones ocurren en el MISMO estado
        (`pending_client_acceptance`) y lo que las separa es si ya existe
        trabajo: la primera lo crea (`accept_request`), la segunda es una
        nueva aceptación después de que el equipo cambiara el alcance
        (`accept_revised_request`, RN-SLA-08), que reinicia el plazo de
        inicio conservando los intentos anteriores.

        Poner esto en un estado propio inventado —"revisada, pendiente de
        aceptar"— habría dejado el botón inalcanzable: ese estado no
        existe en el servidor.
      */}
      {state === "pending_client_acceptance" ? (
        <>
          {job === null ? (
            <Card title={es.clientArea.acceptTitle}>
              <AcceptRequestButton requestId={requestId} />
            </Card>
          ) : (
            <AcceptRevisedForm requestId={requestId} />
          )}
          <DeclineRequestForm requestId={requestId} />
        </>
      ) : null}

      {correctionAvailable ? <RequestCorrectionForm jobId={job.job_id} /> : null}

      {job !== null && job.free_correction_used ? (
        <Card title={es.clientArea.correctionUsedTitle}>
          <p className="text-sm text-text-secondary">{es.clientArea.correctionUsedReason}</p>
        </Card>
      ) : null}

      {conversationId && conversation ? (
        <Conversation
          conversationId={conversationId}
          establishmentId={id}
          messages={conversation.messages}
          readOnly={conversation.readOnly}
        />
      ) : null}
    </div>
  );
}
