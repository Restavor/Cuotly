import { IncidentCard } from "@/components/request/IncidentCard";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { loadSubscriptionTerms } from "@/app/espacios/[slug]/planes/terms-load";
import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";
import {
  AttachmentRow,
  InfoNote,
  RequestTimeline,
  SummaryItem,
  SummaryRow,
  type TimelineView,
} from "@/components/panel/RequestPieces";
import { Card, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { isChangeCategory } from "@/core/classification-rules";
import { requestTimeline } from "@/core/client-requests";
import { isDraft } from "@/core/request-draft";
import {
  cancelRequestAvailability,
  consumptionEstimate,
  requestHeadline,
  requestTone,
} from "@/core/requests";
import { loadEstablishmentTimezone } from "../../timezone-load";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { AcceptRequestButton } from "../../AcceptRequestButton";
import { ClientQuoteCard } from "../../facturacion/ClientQuoteCard";
import {
  AcceptRevisedForm,
  CancelRequestForm,
  DeclineRequestForm,
  ProvideInformationForm,
  RequestCorrectionForm,
} from "./ClientRequestActions";

/**
 * R08 a R12 · una solicitud, vista por el restaurante que la pidió
 * (HU-13, HU-14, HU-35, RN-COR-01), con el diseño definitivo: el resumen
 * y el camino con sus fechas (R08), la clasificación propuesta con el
 * consumo de su plan (R09), el presupuesto (R10), el resultado (R11) y la
 * corrección o la cancelación (R12). Es UNA pantalla que cambia según el
 * estado, como en el dibujo, y no cinco rutas.
 *
 * Lo que el dibujo pinta y aquí no está, porque no existe: la foto de la
 * solicitud, el "Antes / Después" de R11 (nadie guarda la imagen
 * anterior) y la lista de "Qué incluye" de R09 y R10 (no hay columna que
 * la sostenga; lo que el equipo escribe al clasificar es
 * `validated_summary`, y eso es lo que se enseña). "Ver cambio publicado"
 * lleva a la web del restaurante, que es donde está: no se guarda la
 * dirección exacta de cada cambio.
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

export default async function ClientRequestDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string; requestId: string }>;
}) {
  const { slug, id, requestId } = await params;
  const supabase = await createClient();
  const t = es.panelRequests;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, code, description, context, state, created_at, validated_category, validated_summary, validated_at, accepted_at, rejected_at, rejected_reason, priority, priority_reason, created_by_team, on_behalf_reason, kind, incident_outcome, incident_note, incident_resolved_at",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!request) notFound();

  // §68 · un borrador no es una solicitud que enseñar: es una que todavía
  // se está revisando, y su pantalla es otra (R07).
  if (isDraft(request.state)) {
    redirect(`/espacios/${slug}/restaurantes/${id}/solicitudes/${requestId}/borrador`);
  }

  // El trabajo NO se lee de la tabla: el cliente no puede, y es
  // deliberado. `jobs_select` es `is_space_member(space_id) and
  // can_read_job(id)` — la fila entera es organización interna (P7) y
  // lleva cuatro identidades del equipo. `client_request_job()`
  // (migración 43) contesta solo lo que le corresponde saber, y
  // `client_request_milestones()` (migración 127) sus fechas, las dos sin
  // ninguna identidad.
  const [{ data: jobRows }, { data: hitos }, { data: conversationId }] = await Promise.all([
    supabase.rpc("client_request_job", { p_request_id: requestId }),
    supabase.rpc("client_request_milestones", { p_request_id: requestId }),
    // La conversación se crea al abrirla si no existía: es la de esta
    // solicitud, no un hilo suelto (§66).
    supabase.rpc("get_or_create_request_conversation", { p_request_id: requestId }),
  ]);
  const job = jobRows?.[0] ?? null;
  const hito = hitos?.[0] ?? null;

  // RN-MSG-06 · abrir la conversación es haberla leído; lo marca
  // `loadConversation()`, el mismo cargador que usa la pantalla del equipo.
  const conversation = conversationId ? await loadConversation(supabase, conversationId) : null;

  // §84 · el presupuesto de esta solicitud, si lo hay, sin identidades.
  // Mientras exista uno, la aceptación de la solicitud ES la del
  // presupuesto: el botón de aceptar el alcance no se ofrece porque
  // `accept_request()` lo va a rechazar (CA-20).
  const [
    { data: quoteRows },
    { data: canAnswerQuotes },
    zona,
    { data: establishment },
    { data: links },
    { data: bolsas },
    { data: suscripciones },
  ] = await Promise.all([
    supabase.rpc("client_request_quote", { p_request_id: requestId }),
    supabase.rpc("client_can_accept_terms", { p_establishment_id: id }),
    // El restaurante no puede leer `spaces`: la zona sale de
    // `establishment_timezone()` (migración 83).
    loadEstablishmentTimezone(supabase, id),
    supabase.from("establishments").select("id, website_url").eq("id", id).maybeSingle(),
    // Los adjuntos de la solicitud, filtrados por `can_read_file()`.
    supabase.from("file_links").select("file_id").eq("entity_type", "request").eq("entity_id", requestId),
    // R09 · la bolsa del ciclo, la misma que cuenta `accept_request()`.
    supabase.rpc("establishment_cycle_allowance", { p_establishment_id: id }),
    supabase
      .from("subscriptions")
      .select("id, kind")
      .eq("establishment_id", id)
      .eq("status", "active")
      .eq("kind", "plan"),
  ]);

  const fileIds = [...new Set((links ?? []).map((l) => l.file_id))];
  // `files` tiene privilegios de columna: se enumeran (CLAUDE.md).
  const { data: files } = fileIds.length
    ? await supabase.from("files").select("id, name").in("id", fileIds)
    : { data: [] };
  const adjuntos = files ?? [];

  const quoteRow = quoteRows?.[0] ?? null;
  const quote =
    quoteRow === null || quoteRow.preparing || quoteRow.quote_id === null
      ? null
      : {
          id: quoteRow.quote_id,
          code: quoteRow.code ?? "",
          concept: quoteRow.concept ?? "",
          description: quoteRow.description,
          baseCents: quoteRow.base_cents ?? 0,
          taxCents: quoteRow.tax_cents ?? 0,
          totalCents: quoteRow.total_cents ?? 0,
          status: quoteRow.status ?? "sent",
          requiresPaymentBeforeStart: quoteRow.requires_payment_before_start ?? true,
          decidedByTeam: quoteRow.decided_by_team ?? false,
          decisionReason: quoteRow.decision_reason,
        };
  const quotePreparing = quoteRow?.preparing === true;

  const state = request.state;
  const fecha = (iso: string) => enZona(iso, zona, { day: "numeric", month: "short", year: "numeric" });
  const fechaHora = (iso: string) =>
    enZona(iso, zona, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // R12 · si se puede cancelar, y si no, cuál de los tres motivos es. Lo
  // decide `cancel_request()`; esto solo sirve para decirlo antes de
  // pulsar en vez de ofrecer un botón que va a fallar (CA-20).
  const cancelacion = cancelRequestAvailability({ state, hasJob: job !== null });
  const correctionAvailable = job !== null && job.state === "published" && !job.free_correction_used;

  const resultado = ["published", "closed", "correction_requested", "in_correction"].includes(state);
  // RN-REQ-10 · una incidencia no se acepta a secas: si cuesta algo, se
  // acepta su presupuesto; si no, ya está en marcha. `accept_request()` lo
  // rechazaría, así que no se ofrece el botón (CA-20).
  const esIncidencia = request.kind === "incident";
  const aceptarClasificacion = state === "pending_client_acceptance" && quoteRow === null && !esIncidencia;

  const pasos: TimelineView[] = requestTimeline({
    state,
    createdAt: request.created_at,
    submittedAt: hito?.submitted_at ?? null,
    validatedAt: request.validated_at,
    acceptedAt: request.accepted_at,
    rejectedAt: request.rejected_at,
    startedAt: hito?.started_at ?? null,
    publishedAt: hito?.published_at ?? null,
    closedAt: hito?.closed_at ?? null,
    cancelledAt: hito?.cancelled_at ?? null,
  }).map((p) => ({
    key: p.key,
    status: p.status,
    label: t.steps[p.key],
    dateLabel: p.at === null ? null : fechaHora(p.at),
    note:
      p.key === "waiting"
        ? state === "needs_information"
          ? t.waitingInfo
          : t.waitingAcceptance
        : null,
  }));

  const enviada = pasos[0]?.dateLabel ?? null;
  const categoria =
    request.validated_category === null
      ? t.unclassified
      : (es.naming.categories[request.validated_category as CategoryKey] ?? request.validated_category);
  const prioridad =
    request.priority === "high" || request.priority === "medium" || request.priority === "low"
      ? es.clientArea.priorityLevels[request.priority]
      : "—";
  const estadoBadge = (
    <StatusBadge tone={requestTone(state)}>
      {es.naming.states.request[state as RequestStateKey] ?? state}
    </StatusBadge>
  );

  // R09 · el plan y lo que queda de esa categoría en el ciclo.
  const planes = (
    await Promise.all((suscripciones ?? []).map((s) => loadSubscriptionTerms(supabase, s.id)))
  )
    .map((terms) => terms?.subjectName ?? null)
    .filter((n): n is string => n !== null && n.trim() !== "");
  const plan = planes[0] ?? null;
  // RN-REQ-10 · una incidencia no gasta de la bolsa: no hay consumo que enseñar.
  const estimacion =
    !esIncidencia && request.validated_category !== null && isChangeCategory(request.validated_category)
      ? consumptionEstimate(
          request.validated_category,
          (bolsas ?? []).flatMap((b) => (isChangeCategory(b.category) ? [{ ...b, category: b.category }] : [])),
        )
      : null;
  const bolsa = (bolsas ?? []).find((b) => b.category === request.validated_category) ?? null;

  const ultimoDelEquipo = [...(conversation?.messages ?? [])]
    .reverse()
    .find((m) => !m.isMine && m.senderDisplay === "maintenance_team");

  const subtitulo = aceptarClasificacion
    ? t.detailSubtitleAccept
    : quote !== null && quote.status === "sent"
      ? t.detailSubtitleQuote
      : resultado
        ? t.detailSubtitleResult
        : t.detailSubtitle;

  const pedirAclaracion = (
    <Link
      href="#mensajes-solicitud"
      className="inline-flex w-full items-center justify-center rounded-[10px] border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
    >
      {t.askClarification}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={requestHeadline(request.description, 70) || request.code} subtitle={subtitulo}>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span>{request.code}</span>
          {estadoBadge}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t.summaryTitle}>
            <SummaryRow>
              <SummaryItem label={t.columnType}>{categoria}</SummaryItem>
              <SummaryItem label={t.sentLabel}>{enviada ?? t.noDate}</SummaryItem>
              <SummaryItem label={t.priorityLabel}>{prioridad}</SummaryItem>
              <SummaryItem label={t.columnState}>{estadoBadge}</SummaryItem>
            </SummaryRow>
            <p className="mt-4 text-sm font-semibold text-text">{t.originalTitle}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{request.description}</p>
            {request.context ? (
              <>
                <p className="mt-3 text-sm font-semibold text-text">{t.whereLabel}</p>
                <p className="mt-1 text-sm text-text-secondary">{request.context}</p>
              </>
            ) : null}
            {request.priority_reason ? (
              <p className="mt-3 text-xs text-text-secondary">
                {t.priorityLabel}: {request.priority_reason}
              </p>
            ) : null}
            {/* RN-REQ-08 · la creó el equipo en su nombre: se le dice, y cómo
                se la pidió. Firma el equipo, nunca una persona (P7). */}
            {request.created_by_team ? (
              <div className="mt-4 flex gap-3 rounded-[10px] border border-info/30 bg-info/10 p-4">
                <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-primary-dark" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary-dark">{t.onBehalfTitle}</p>
                  {request.on_behalf_reason ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                      {t.onBehalfReason(request.on_behalf_reason)}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Card>

          {resultado ? (
            <Card title={t.trackingTitleResult}>
              <RequestTimeline steps={pasos} orientation="horizontal" />
            </Card>
          ) : null}

          {/* RN-REQ-09 a 11 · que es una incidencia y lo que se decidió. */}
          <IncidentCard
            kind={request.kind}
            outcome={request.incident_outcome}
            note={request.incident_note}
            resolvedAt={request.incident_resolved_at}
            audience="client"
            timeZone={zona}
          />

          {/* R09 · RN-CLS-03: hasta que el equipo no valida, aquí no hay nada que leer. */}
          {request.validated_summary && !resultado ? (
            <Card title={t.proposalTitle}>
              <div className="flex flex-wrap gap-4 rounded-[10px] bg-soft-surface p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface text-cuotly-green">
                  <Icon name="request" className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-text">{t.proposalUnits(categoria)}</p>
                  {estimacion?.kind === "included" ? (
                    <>
                      <p className="text-sm font-semibold text-cuotly-green">
                        {plan ? t.proposalIncluded(plan) : t.proposalIncludedNoName}
                      </p>
                      <p className="text-sm text-text-secondary">{t.proposalNoCost}</p>
                    </>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-text">{request.validated_summary}</p>
                </div>
              </div>

              {aceptarClasificacion && estimacion !== null ? (
                <div className="mt-4 rounded-[10px] border border-border p-4">
                  <p className="text-sm font-semibold text-text">{t.consumptionTitle}</p>
                  {estimacion.kind === "included" && bolsa !== null ? (
                    <div className="mt-2 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto]">
                      <div>
                        <ProgressBar
                          percent={
                            bolsa.included > 0
                              ? Math.round(((bolsa.included - bolsa.remaining) / bolsa.included) * 100)
                              : 0
                          }
                          label={t.consumptionTitle}
                        />
                        <p className="mt-1 text-sm text-text">
                          {t.consumptionUsed(bolsa.included - bolsa.remaining, bolsa.included)}
                        </p>
                      </div>
                      <div className="text-sm">
                        <p className="text-text-secondary">{t.consumptionIfAccepted}</p>
                        <p className="font-semibold text-text">
                          {t.consumptionUsed(bolsa.included - bolsa.remaining + 1, bolsa.included)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-text-secondary">
                      {estimacion.kind === "exhausted"
                        ? t.consumptionExhausted(estimacion.included)
                        : estimacion.kind === "budgeted"
                          ? t.consumptionBudgeted
                          : t.consumptionUnknown}
                    </p>
                  )}
                </div>
              ) : null}
            </Card>
          ) : null}

          {request.rejected_reason ? (
            <Card title={es.naming.states.request.rejected}>
              <p className="whitespace-pre-wrap text-text">{request.rejected_reason}</p>
            </Card>
          ) : null}

          {state === "needs_information" ? <ProvideInformationForm requestId={requestId} /> : null}

          {/* R10 · el presupuesto. */}
          {quotePreparing ? (
            <Card title={es.quotesClient.preparingTitle}>
              <p className="text-sm text-text-secondary">{es.quotesClient.preparingReason}</p>
            </Card>
          ) : null}
          {quote ? <ClientQuoteCard quote={quote} canAnswer={canAnswerQuotes === true} /> : null}

          {/* R12 · la corrección mínima gratuita (RN-COR-01). */}
          {correctionAvailable ? <RequestCorrectionForm jobId={job.job_id} /> : null}
          {job !== null && job.free_correction_used ? (
            <Card title={es.clientArea.correctionUsedTitle}>
              <p className="text-sm text-text-secondary">{es.clientArea.correctionUsedReason}</p>
            </Card>
          ) : null}

          <Card title={t.filesTitle(adjuntos.length)}>
            {adjuntos.length === 0 ? (
              <p className="text-sm text-text-secondary">{t.filesEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {adjuntos.map((f) => (
                  <AttachmentRow key={f.id} fileId={f.id} name={f.name} />
                ))}
              </ul>
            )}
          </Card>

          <section id="mensajes-solicitud" className="scroll-mt-20">
            {conversationId && conversation ? (
              <Conversation
                timeZone={zona}
                conversationId={conversationId}
                establishmentId={id}
                messages={conversation.messages}
                readOnly={conversation.readOnly}
                title={t.messagesTitle}
              />
            ) : null}
          </section>
        </div>

        <div className="space-y-6">
          {resultado ? (
            <>
              <Card title={t.teamTitle}>
                {ultimoDelEquipo ? (
                  <div className="flex gap-3 rounded-[10px] bg-soft-surface p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-cuotly-green">
                      <Icon name="settings" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      {/* P7 · el equipo firma siempre como equipo. */}
                      <p className="text-sm font-semibold text-text">{es.clientArea.maintenanceTeam}</p>
                      <p className="text-xs text-text-secondary">{fechaHora(ultimoDelEquipo.createdAt)}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-text">{ultimoDelEquipo.body}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">{t.teamNoMessage}</p>
                )}
              </Card>
              <Card title={t.webTitle}>
                {state === "correction_requested" || state === "in_correction" ? (
                  <div className="mb-4">
                    <InfoNote title={es.panelRequests.importantTitle}>{t.correctionInfo}</InfoNote>
                  </div>
                ) : (
                  <p className="mb-4 text-sm text-text-secondary">{t.webPublished}</p>
                )}
                {establishment?.website_url ? (
                  <a
                    href={establishment.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
                  >
                    {t.viewPublished}
                    <Icon name="externalLink" className="h-4 w-4" />
                  </a>
                ) : (
                  <p className="text-sm text-text-secondary">{t.webNoUrl}</p>
                )}
              </Card>
            </>
          ) : (
            <Card title={t.trackingTitle}>
              <RequestTimeline steps={pasos} orientation="vertical" />
            </Card>
          )}

          {aceptarClasificacion ? (
            <Card title={t.extraTitle}>
              <dl className="divide-y divide-border text-sm">
                <div className="pb-3">
                  <dt className="text-text-secondary">{t.extraPlan}</dt>
                  <dd className="font-semibold text-text">{plan ?? t.extraPlanUnknown}</dd>
                </div>
                {bolsa !== null ? (
                  <>
                    <div className="py-3">
                      <dt className="text-text-secondary">{t.extraIncluded}</dt>
                      <dd className="font-semibold text-text">{t.extraIncludedValue(bolsa.included)}</dd>
                    </div>
                    <div className="pt-3">
                      <dt className="text-text-secondary">{t.extraRenews}</dt>
                      <dd className="font-semibold text-text">
                        {(bolsas ?? [])[0] ? fecha((bolsas ?? [])[0].renews_at) : "—"}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              {estimacion?.kind === "included" ? (
                <p className="mt-4 flex gap-2 rounded-[10px] bg-soft-surface p-3 text-sm text-text">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                  {t.includedNote}
                </p>
              ) : null}
              <div className="mt-4 space-y-3">
                {job === null ? (
                  <AcceptRequestButton requestId={requestId} />
                ) : (
                  <AcceptRevisedForm requestId={requestId} />
                )}
                {pedirAclaracion}
              </div>
            </Card>
          ) : quote !== null && quote.status === "sent" ? (
            <Card title={t.scopeTitle}>
              <p className="whitespace-pre-wrap text-sm text-text">
                {quote.description ?? request.validated_summary ?? "—"}
              </p>
              <div className="mt-4">{pedirAclaracion}</div>
            </Card>
          ) : null}

          {state === "pending_client_acceptance" ? <DeclineRequestForm requestId={requestId} /> : null}

          {/* R12, A14 · cancelar. No se esconde cuando no se puede: dice por
              qué, que es lo que deja saber qué hacer en su lugar. */}
          <CancelRequestForm requestId={requestId} availability={cancelacion} />
        </div>
      </div>
    </div>
  );
}
