import Link from "next/link";
import { redirect } from "next/navigation";

import { AttachmentRow, InfoNote, SummaryItem, SummaryRow } from "@/components/panel/RequestPieces";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { isDraft } from "@/core/request-draft";
import { requestHeadline } from "@/core/requests";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { CopyDraftForm } from "./CopyDraftForm";
import { AddDraftFileForm, RemoveDraftFileButton } from "./DraftFileForms";
import { DraftScopeForm } from "./DraftScopeForm";
import { SubmitDraftForm } from "./SubmitDraftForm";

/**
 * R07 y §68 · RN-MSG-10 — la revisión del borrador antes de enviarlo, con
 * el diseño definitivo: el resumen con "Editar contenido", los adjuntos,
 * la caja de "El equipo revisará tu solicitud", copiar a otro restaurante
 * del grupo y el pie con "Cancelar" y "Confirmar envío". Aquí llegan los
 * borradores de R06 y los que salen de una conversación.
 *
 * "`Convertir en solicitud` crea un borrador con mensajes y adjuntos
 * relevantes. **Antes de enviar se revisa alcance, destinatario y
 * archivos**." Los tres apartados de esta pantalla son esos tres, en ese
 * orden, y salen de `DRAFT_REVIEW_POINTS` en el dominio para que no pueda
 * faltar ninguno.
 *
 * El del medio —el destinatario— no tiene formulario, y no es un olvido:
 * una solicitud es de un restaurante, y el borrador sale de la
 * conversación general de ese mismo restaurante. Revisarlo es
 * confirmarlo. Moverlo a otro sería inventar una regla que el PRD no
 * tiene: lo más parecido que existe es RN-REQ-04 ("copiar y pegar dentro
 * del mismo grupo"), que es otra operación y ya está hecha. La pantalla lo
 * dice en vez de callarlo (CA-20).
 *
 * Tampoco hay "descartar el borrador": ningún estado de PRD §9.2 lo
 * recoge y CLAUDE.md prohíbe el borrado físico. Está anotado como
 * pendiente en el ROADMAP, no improvisado aquí.
 *
 * Ningún permiso se comprueba en este archivo. RLS decide qué solicitud se
 * ve, y cada acción la vuelve a autorizar el servidor: quien no pueda
 * escribir en el restaurante —el equipo de mantenimiento, o el rol
 * Consulta— ve la pantalla y recibe el motivo al intentar cambiar algo,
 * que es lo contrario de esconder el botón (CLAUDE.md MUST).
 */
export const dynamic = "force-dynamic";

export default async function RequestDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string; requestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id, requestId } = await params;
  const { adjunto } = await searchParams;
  const supabase = await createClient();
  const t = es.panelRequests;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: request } = await supabase
    .from("requests")
    .select("id, code, description, context, state, establishment_id, source_conversation_id, priority, priority_reason")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) {
    return (
      <div className="space-y-6">
        <PageHeader title={es.clientArea.draftTitle} />
        <Card>
          <EmptyState
            title={es.clientArea.draftNotFoundTitle}
            description={es.clientArea.draftNotFoundReason}
          />
        </Card>
        <p>
          <Link href={`/espacios/${slug}/restaurantes/${id}/solicitudes`} className="text-cuotly-green underline">
            {t.backToList}
          </Link>
        </p>
      </div>
    );
  }

  // Enviada ya no es un borrador: esta pantalla no tiene nada que enseñar
  // de ella y su ficha sí. El estado lo decide el servidor; aquí solo se
  // mira para elegir a dónde llevar.
  if (!isDraft(request.state)) {
    redirect(`/espacios/${slug}/restaurantes/${id}/solicitudes/${requestId}`);
  }

  const [{ data: establishment }, { data: versions }, { data: links }] = await Promise.all([
    supabase
      .from("establishments")
      .select("id, name, group_id")
      .eq("id", request.establishment_id)
      .maybeSingle(),
    supabase
      .from("request_versions")
      .select("version_number")
      .eq("request_id", requestId)
      .order("version_number", { ascending: false })
      .limit(1),
    // Los adjuntos del borrador: los que arrastró la conversión y los que
    // se hayan añadido aquí. Se leen de `file_links`, cuya política es
    // `can_read_file()`, así que un archivo que no corresponda no vuelve.
    supabase
      .from("file_links")
      .select("file_id")
      .eq("entity_type", "request")
      .eq("entity_id", requestId),
  ]);

  const fileIds = [...new Set((links ?? []).map((link) => link.file_id))];

  // `files` tiene privilegios de columna (CLAUDE.md), así que las columnas
  // se enumeran: `select *` devolvería 403.
  const { data: files } = fileIds.length
    ? await supabase.from("files").select("id, name").in("id", fileIds)
    : { data: [] };

  const version = versions?.[0]?.version_number ?? 1;

  // R07 · a dónde se puede copiar. RN-REQ-04 lo limita al mismo grupo, así
  // que un restaurante sin grupo no tiene hermanos y la tarjeta lo dirá.
  // Lo que vuelve de aquí ya viene filtrado por RLS: solo los que esta
  // persona puede ver. Que además pueda ESCRIBIR en ellos lo decide
  // `copy_paste_request()`, que es quien manda.
  const { data: hermanos } = establishment?.group_id
    ? await supabase
        .from("establishments")
        .select("id, name")
        .eq("group_id", establishment.group_id)
        .neq("id", request.establishment_id)
        .order("name")
    : { data: [] };

  const lista = files ?? [];
  const prioridad =
    request.priority === "high" || request.priority === "medium" || request.priority === "low"
      ? es.clientArea.priorityLevels[request.priority]
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.reviewTitle}
        subtitle={t.reviewSubtitle}
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-soft-surface px-3 py-1.5 text-sm font-medium text-text">
            <Icon name="document" className="h-4 w-4" />
            {t.draftBadge}
          </span>
        }
      >
        <p className="mt-1 text-xs text-text-secondary">{request.code}</p>
      </PageHeader>

      {adjunto === "fallo" ? (
        <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {t.attachFailed}
        </p>
      ) : null}

      <Card>
        {/* §68, punto 1 · alcance; punto 2 · destinatario, que se revisa y
            no se cambia: una solicitud es siempre de un restaurante. */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-primary-dark">{t.summaryTitle}</h2>
        </div>

        <SummaryRow>
          <SummaryItem label={t.columnRequest}>{requestHeadline(request.description, 60)}</SummaryItem>
          <SummaryItem label={t.typeLabel}>{t.unclassified}</SummaryItem>
          <SummaryItem label={t.priorityLabel}>
            {prioridad ?? <span className="text-danger">{t.priorityMissing}</span>}
          </SummaryItem>
          <SummaryItem label={t.restaurantLabel}>{establishment?.name ?? "—"}</SummaryItem>
        </SummaryRow>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <p className="text-sm font-semibold text-text">{es.clientArea.newDescriptionLabel}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{request.description}</p>
            {request.context ? (
              <>
                <p className="mt-3 text-sm font-semibold text-text">{t.whereLabel}</p>
                <p className="mt-1 text-sm text-text-secondary">{request.context}</p>
              </>
            ) : null}
          </div>
          <div className="sm:border-l sm:border-border sm:pl-4">
            <p className="text-sm font-semibold text-text">{t.priorityLabel}</p>
            <p className="mt-1 text-sm text-text-secondary">{request.priority_reason ?? "—"}</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-text-secondary">
          {t.recipientLine(establishment?.name ?? "—")}
          {request.source_conversation_id ? (
            <>
              {" · "}
              {es.clientArea.draftFromConversation}{" "}
              <Link href={`/espacios/${slug}/restaurantes/${id}#mensajes`} className="text-cuotly-green underline">
                {es.clientArea.draftOpenConversation}
              </Link>
            </>
          ) : null}
        </p>

        <div className="mt-4">
          <DraftScopeForm
            requestId={requestId}
            description={request.description}
            context={request.context}
            priority={request.priority}
            priorityReason={request.priority_reason}
            version={version}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* §68, punto 3 · archivos. */}
        <Card title={t.filesTitle(lista.length)}>
          {lista.length === 0 ? (
            <EmptyState
              title={es.clientArea.draftFilesEmptyTitle}
              description={es.clientArea.draftFilesEmptyReason}
            />
          ) : (
            <ul className="space-y-2">
              {lista.map((file) => (
                <AttachmentRow
                  key={file.id}
                  fileId={file.id}
                  name={file.name}
                  action={<RemoveDraftFileButton requestId={requestId} fileId={file.id} />}
                />
              ))}
            </ul>
          )}
          <AddDraftFileForm requestId={requestId} establishmentId={id} />
        </Card>

        <div>
          <InfoNote title={t.teamWillReviewTitle}>{t.teamWillReviewBody}</InfoNote>
        </div>
      </div>

      {/* R07 · RN-REQ-04. Va antes de enviar porque copiar un borrador ya
          enviado no es esta operación: lo que se copia es el borrador. */}
      <CopyDraftForm slug={slug} requestId={requestId} siblings={hermanos ?? []} />

      <SubmitDraftForm
        slug={slug}
        establishmentId={id}
        requestId={requestId}
        cancelHref={`/espacios/${slug}/restaurantes/${id}/solicitudes`}
      />
    </div>
  );
}
