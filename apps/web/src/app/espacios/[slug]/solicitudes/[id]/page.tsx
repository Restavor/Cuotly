import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";
import {
  AfterValidateNote,
  ClassificationCard,
  ClientRequestCard,
  ValidationStatusCard,
  RequestHeader,
  RequestHistoryCard,
} from "@/components/request/Detail";
import { Card, NoPermissionState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { listPosition, requestHeadline } from "@/core/requests";
import { loadTeamRequests } from "../list-query";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadRequestDetail } from "./detail-load";
import {
  CorrectClassificationForm,
  RetryAnalysisForm,
  RejectRequestForm,
  RequestInformationForm,
  ValidateProposalForm,
} from "./RequestActions";

/**
 * Detalle de una solicitud para el equipo (HU-11, HU-12, HU-13, HU-14),
 * con la forma de la maqueta 05 · "Solicitudes — Validación interna": lo
 * que pidió el restaurante a un lado, la propuesta de clasificación con su
 * plazo y sus dos botones al otro, y el historial debajo.
 *
 * Las acciones que se ofrecen dependen del estado, pero eso es
 * **presentación**: quien decide si una acción es legal es el servidor.
 * Cada botón llama a la función que hace cumplir su regla, y si el estado
 * no la admite, la función lanza y el error se enseña. Esta pantalla no
 * puede autorizar nada por su cuenta (CLAUDE.md MUST).
 *
 * `?corregir=1` abre el formulario largo de corrección. Va en la dirección
 * y no en un estado del navegador para que el botón de volver lo cierre y
 * para que la pantalla entera siga funcionando sin JavaScript (CA-22).
 */
export const dynamic = "force-dynamic";

export default async function TeamRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ corregir?: string; restaurante?: string }>;
}) {
  const { slug, id } = await params;
  // `?restaurante=` dice de qué lista se viene. Es lo que hace posible el
  // paginador: sin saber la lista, "1 de 3" sería sobre una lista
  // inventada.
  const { corregir, restaurante } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await loadRequestDetail(supabase, id);
  if (detail === null) notFound();

  const { request, establishment, proposal, counter, estimate, job, canManage } = detail;
  const state = request.state;

  // Un restaurante SÍ puede leer su propia solicitud (RLS se la deja), así
  // que puede llegar a esta dirección. No se le enseña esta pantalla: no
  // porque no pueda ver la fila, sino porque casi todo lo que hay aquí
  // —la propuesta, el reloj interno, el historial— le vuelve vacío, y una
  // pantalla vacía se lee como "todavía no hay nada", que es mentira
  // (CA-20). Se le lleva a la suya, que enseña lo que sí es suyo.
  const { data: esDelEquipo } = await supabase.rpc("is_space_member", {
    p_space_id: request.space_id,
  });

  if (!esDelEquipo) {
    redirect(`/espacios/${slug}/restaurantes/${request.establishment_id}/solicitudes/${id}`);
  }

  // La misma conversación que ve el restaurante (§66). Quién aparece como
  // autor lo decide el servidor: a este lado sí le dice la persona.
  const { data: conversationId } = await supabase.rpc("get_or_create_request_conversation", {
    p_request_id: id,
  });

  const conversation = conversationId ? await loadConversation(supabase, conversationId) : null;

  const base = `/espacios/${slug}/solicitudes/${id}`;
  const enValidacion = state === "analyzing" || state === "pending_internal_validation";

  // Sin propuesta que validar no hay atajo posible: el formulario largo es
  // la única forma, y sale abierto (RN-CLS-03 exige que alguien decida la
  // categoría, y aquí no hay ninguna que aceptar de un botón).
  const corrigiendo = corregir === "1" || proposal === null;

    /*
    El paginador de la maqueta 05. La lista y su orden salen de
    `loadTeamRequests()`, el MISMO sitio del que los lee la bandeja: es lo
    que impide que el "siguiente" de aquí lleve a otro sitio que el
    siguiente de allí. La posición la calcula `listPosition()`, con sus
    tests.

    Si esta solicitud no está en esa lista —enlace directo, o el filtro la
    excluye— no se pinta paginador: "1 de 1" fingiría un recorrido.
  */
  const hermanas = await loadTeamRequests(supabase, request.space_id, restaurante);
  const posicion = listPosition(
    hermanas.map((hermana) => hermana.id),
    id,
  );

  const sufijo = restaurante === undefined ? "" : `?restaurante=${restaurante}`;
  const listaHref =
    restaurante === undefined
      ? `/espacios/${slug}/solicitudes`
      : `/espacios/${slug}/solicitudes?restaurante=${restaurante}`;

  const pager =
    posicion === null
      ? undefined
      : {
          index: posicion.index,
          total: posicion.total,
          previousHref:
            posicion.previousId === null
              ? null
              : `/espacios/${slug}/solicitudes/${posicion.previousId}${sufijo}`,
          nextHref:
            posicion.nextId === null
              ? null
              : `/espacios/${slug}/solicitudes/${posicion.nextId}${sufijo}`,
        };

return (
    <div className="mx-auto max-w-6xl space-y-6">
      <RequestHeader
        headline={requestHeadline(request.description)}
        code={request.code}
        state={state}
        establishmentName={establishment?.name ?? null}
        backHref={listaHref}
        pager={pager}
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="space-y-6">
          <ClientRequestCard
            request={request}
            establishmentName={establishment?.name ?? null}
            attachments={detail.attachments}
            attachmentsFailed={detail.attachmentsFailed}
          />

          <RequestHistoryCard entries={detail.history} />
        </div>

        <div className="space-y-6">
          {/*
            Maqueta 05 · el panel de los tres pasos va ENCIMA de la
            clasificación y de los botones: dice dónde está la solicitud
            antes de pedir que se decida sobre ella.
          */}
          <ValidationStatusCard request={request} proposal={proposal} />

          <ClassificationCard
            request={request}
            proposal={proposal}
            estimate={estimate}
            counter={counter}
            /*
              Fuera del tramo de validación la tarjeta no lleva botones:
              lo que enseña ya está decidido. Y dentro, a quien no puede
              validar se le dice por qué en vez de dejarle el hueco: el
              control no es esto —`validate_classification()` comprueba
              `manage_requests` pase lo que pase aquí—, es no ofrecerle un
              botón que le va a decir que no (CLAUDE.md).
            */
            actions={
              !enValidacion ? null : canManage ? (
                <>
                  {corrigiendo ? (
                    <CorrectClassificationForm
                      requestId={id}
                      suggestedCategory={proposal?.category ?? null}
                      suggestedSummary={proposal?.summary ?? null}
                      cancelHref={proposal === null ? null : base}
                    />
                  ) : (
                    <ValidateProposalForm
                      requestId={id}
                      category={proposal.category}
                      summary={proposal.summary}
                      correctHref={`${base}?corregir=1`}
                    />
                  )}
                  <AfterValidateNote />
                </>
              ) : (
                <div className="mt-4">
                  <NoPermissionState
                    title={es.teamArea.requests.noManageTitle}
                    description={es.teamArea.requests.noManageReason}
                  />
                </div>
              )
            }
          />

          {/*
            El botón de reintentar SOLO aquí: "Recibida" es, desde que la
            clasificación es automática (RN-CLS-01), el estado en el que se
            queda una solicitud cuyo análisis falló. En el camino normal
            esta pantalla nunca lo enseña.

            Y solo a quien puede ejecutarlo. Que no se vea no es el control
            de acceso —el control está en `begin_request_analysis()` y en
            `record_classification()`, migración 20260902000044—: es no
            ofrecerle a un trabajador un botón que le va a decir que no.
          */}
          {state === "received" && canManage ? <RetryAnalysisForm requestId={id} /> : null}

          {(state === "received" || enValidacion) && canManage ? (
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

          {request.rejected_reason ? (
            <Card title={es.naming.states.request.rejected}>
              <p className="whitespace-pre-wrap text-sm text-text">{request.rejected_reason}</p>
            </Card>
          ) : null}

          {job ? (
            <Card>
              <Link
                href={`/espacios/${slug}/trabajos/${job.id}`}
                className="flex items-center gap-2 text-sm font-semibold text-cuotly-green underline"
              >
                <Icon name="job" className="h-[18px] w-[18px]" />
                {es.teamArea.requests.jobLink} · {job.code}
              </Link>
            </Card>
          ) : null}
        </div>
      </div>

      {conversationId && conversation ? (
        <Conversation
          conversationId={conversationId}
          establishmentId={request.establishment_id}
          messages={conversation.messages}
          readOnly={conversation.readOnly}
        />
      ) : null}
    </div>
  );
}
