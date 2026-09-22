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
import { Card, NoPermissionState, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { isQuoteState, quoteTone } from "@/core/quotes";
import { cancelRequestAvailability, listPosition, requestHeadline } from "@/core/requests";
import { loadTeamRequests } from "../list-query";
import { DEFAULT_TIMEZONE } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { SubtasksAndEvidence } from "@/components/request/SubtasksAndEvidence";
import { loadRequestDetail } from "./detail-load";
import {
  CorrectClassificationForm,
  RetryAnalysisForm,
  CancelRequestForClientForm,
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

  const { request, establishment, proposal, counter, estimate, job, quote, canManage } = detail;
  const state = request.state;

  // §84 · presupuestar se ofrece entre la validación interna y la
  // aceptación del restaurante, que es donde `create_quote()` lo admite.
  const sePuedePresupuestar =
    canManage &&
    quote === null &&
    (state === "pending_internal_validation" || state === "pending_client_acceptance");
  const euros = (cents: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

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

  // CLAUDE.md · las fechas de la solicitud, en la zona del espacio.
  const { data: space } = await supabase
    .from("spaces")
    .select("timezone")
    .eq("id", request.space_id)
    .maybeSingle();
  const zona = space?.timezone ?? DEFAULT_TIMEZONE;
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
    <div className="space-y-6">
      <RequestHeader
        headline={requestHeadline(request.description)}
        code={request.code}
        state={state}
        establishmentName={establishment?.name ?? null}
        backHref={listaHref}
        pager={pager}
      />

      {/*
        M26 · tres columnas: lo que pidió el restaurante, la clasificación
        con sus botones, y el historial de la solicitud. En pantallas
        estrechas se apilan en ese orden.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0 space-y-4">
          <ClientRequestCard timeZone={zona}
            request={request}
            establishmentName={establishment?.name ?? null}
            attachments={detail.attachments}
            attachmentsFailed={detail.attachmentsFailed}
          />

          {/*
            RN-REQ-07 · las subtareas y las evidencias del trabajo, en solo
            lectura (decisión 64). El mismo bloque que el panel de la ficha
            del restaurante, con los mismos datos: la solicitud enseña esto
            esté donde esté, y dos versiones acabarían contando cosas
            distintas de las mismas tareas.

            Va aquí, debajo de la solicitud, y no al lado del enlace al
            trabajo: son el detalle de LO QUE SE PIDIÓ, no una acción
            pendiente de la columna de decisiones.
          */}
          <Card title={es.establishmentSheet.openRequestJob}>
            <SubtasksAndEvidence
              jobId={job?.id ?? null}
              jobHref={job === null ? null : `/espacios/${slug}/trabajos/${job.id}`}
              tasks={detail.jobTasks}
              evidence={detail.evidence}
              timeZone={zona}
            />
          </Card>

        </div>

        <div className="min-w-0 space-y-4">
          {/*
            Maqueta 05 · el panel de los tres pasos va ENCIMA de la
            clasificación y de los botones: dice dónde está la solicitud
            antes de pedir que se decida sobre ella.
          */}
          <ValidationStatusCard timeZone={zona} request={request} proposal={proposal} />

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

          {/*
            R12 · cancelar por el restaurante, que llama y se arrepiente.
            Solo mientras no haya trabajo: a partir de ahí la cancelación es
            la del trabajo, la que devuelve el consumo, y vive en su ficha.
            `cancel_request()` lo vuelve a comprobar; esto es no ofrecer un
            botón que iba a decir que no (CA-20).
          */}
          {canManage && cancelRequestAvailability({ state, hasJob: job !== null }).available ? (
            <CancelRequestForClientForm requestId={id} />
          ) : null}

          {/*
            §84 · el presupuesto de la solicitud. Solo a quien puede verlos:
            a un trabajador `quotes_select` le devuelve nada, y decirle
            "sin presupuesto" sería afirmar lo que no se sabe.
          */}
          {quote !== null ? (
            <Card title={es.teamArea.requests.quoteTitle}>
              <p className="flex flex-wrap items-center gap-2 text-sm text-text">
                <span className="font-semibold">{es.teamArea.requests.quoteLine(quote.code, euros(quote.totalCents))}</span>
                <StatusBadge tone={isQuoteState(quote.status) ? quoteTone(quote.status) : "neutral"}>
                  {isQuoteState(quote.status) ? es.naming.states.quote[quote.status] : quote.status}
                </StatusBadge>
              </p>
              {quote.status === "draft" || quote.status === "sent" ? (
                <p className="mt-1 text-sm text-text-secondary">{es.teamArea.requests.quoteWaitingHint}</p>
              ) : null}
              <p className="mt-2 text-sm">
                <Link
                  href={`/espacios/${slug}/finanzas/presupuestos/${quote.id}`}
                  className="text-cuotly-green underline"
                >
                  {es.teamArea.requests.quoteOpenLink}
                </Link>
              </p>
            </Card>
          ) : sePuedePresupuestar ? (
            <Card title={es.teamArea.requests.quoteTitle}>
              <p className="text-sm text-text-secondary">{es.teamArea.requests.quoteNone}</p>
              <p className="mt-2 text-sm">
                <Link
                  href={`/espacios/${slug}/finanzas/presupuestos/nuevo?solicitud=${id}`}
                  className="text-cuotly-green underline"
                >
                  {es.teamArea.requests.quoteCreateLink}
                </Link>
              </p>
            </Card>
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

        <div className="min-w-0 space-y-4 lg:col-span-2 xl:col-span-1">
          <RequestHistoryCard timeZone={zona} entries={detail.history} />
        </div>
      </div>

      {conversationId && conversation ? (
        <Conversation
            timeZone={zona}
          conversationId={conversationId}
          establishmentId={request.establishment_id}
          messages={conversation.messages}
          readOnly={conversation.readOnly}
        />
      ) : null}
    </div>
  );
}
