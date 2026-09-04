import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, EmptyState } from "@/components/ui";
import { isDraft } from "@/core/request-draft";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { AddDraftFileForm, RemoveDraftFileButton } from "./DraftFileForms";
import { DraftScopeForm } from "./DraftScopeForm";
import { SubmitDraftForm } from "./SubmitDraftForm";

/**
 * §68 · RN-MSG-10 — la revisión del borrador, que es lo que faltaba para
 * dar por terminado §66.
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
}: {
  params: Promise<{ slug: string; id: string; requestId: string }>;
}) {
  const { slug, id, requestId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: request } = await supabase
    .from("requests")
    .select("id, code, description, context, state, establishment_id, source_conversation_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.clientArea.draftTitle}</h1>
        <Card>
          <EmptyState
            title={es.clientArea.draftNotFoundTitle}
            description={es.clientArea.draftNotFoundReason}
          />
        </Card>
        <p className="mt-4">
          <Link href={`/espacios/${slug}/restaurantes/${id}`} className="text-cuotly-green underline">
            {es.clientArea.convertBack}
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
    supabase.from("establishments").select("id, name").eq("id", request.establishment_id).maybeSingle(),
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">{request.code}</p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.clientArea.draftTitle}</h1>
        <p className="mt-2 text-sm text-text-secondary">{es.clientArea.draftSubtitle}</p>

        {/* De dónde salió, para poder volver al hilo y comprobar lo que se
            arrastró. Solo aparece si salió de una conversación: las de
            HU-10 no tienen origen que enseñar. */}
        {request.source_conversation_id ? (
          <p className="mt-3 text-sm">
            {es.clientArea.draftFromConversation}
            {" · "}
            <Link href={`/espacios/${slug}/restaurantes/${id}`} className="text-cuotly-green underline">
              {es.clientArea.draftOpenConversation}
            </Link>
          </p>
        ) : null}
      </header>

      {/* §68, punto 1 · alcance. */}
      <DraftScopeForm
        requestId={requestId}
        description={request.description}
        context={request.context}
        version={version}
      />

      {/* §68, punto 2 · destinatario. Se revisa, no se cambia. */}
      <Card title={es.clientArea.draftRecipientTitle}>
        <p className="font-medium text-text">{establishment?.name ?? "—"}</p>
        <p className="mt-1 text-sm text-text-secondary">{es.clientArea.draftRecipientTeam}</p>
        <p className="mt-3 text-sm text-text-secondary">{es.clientArea.draftRecipientFixed}</p>
      </Card>

      {/* §68, punto 3 · archivos. */}
      <Card title={es.clientArea.draftFilesTitle}>
        <p className="mb-3 text-sm text-text-secondary">{es.clientArea.draftFilesHint}</p>

        {(files ?? []).length === 0 ? (
          <EmptyState
            title={es.clientArea.draftFilesEmptyTitle}
            description={es.clientArea.draftFilesEmptyReason}
          />
        ) : (
          <ul className="space-y-2">
            {(files ?? []).map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-4 rounded-lg bg-soft-surface p-3"
              >
                {/* RN-ARC-08: el enlace no apunta al objeto sino a una ruta
                    que comprueba el permiso y firma una URL de unos minutos. */}
                <a href={`/api/archivos/${file.id}`} className="text-cuotly-green underline">
                  {file.name}
                </a>
                <RemoveDraftFileButton requestId={requestId} fileId={file.id} />
              </li>
            ))}
          </ul>
        )}

        <AddDraftFileForm requestId={requestId} establishmentId={id} />
      </Card>

      <SubmitDraftForm slug={slug} establishmentId={id} requestId={requestId} />

      <p>
        <Link href={`/espacios/${slug}/restaurantes/${id}`} className="text-cuotly-green underline">
          {es.clientArea.convertBack}
        </Link>
      </p>
    </div>
  );
}
