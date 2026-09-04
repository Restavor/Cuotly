import Link from "next/link";
import { redirect } from "next/navigation";

import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";
import { Card, EmptyState } from "@/components/ui";
import { isClientVisibleConversation, type ConversationType } from "@/core/messages";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * Una conversación abierta desde la bandeja (§66).
 *
 * Es la pantalla de las dos conversaciones que no tenían ninguna: la
 * interna de un trabajo (§66.2) y la general de un restaurante (§66.3).
 * La de solicitud también se puede abrir por aquí, pero desde la bandeja
 * se enlaza igual: la solicitud entera se ve mejor en su propia ficha, y
 * esta pantalla ofrece el enlace.
 *
 * Quién puede abrirla lo decide RLS: `conversations` se filtra con
 * `can_read_conversation()`, así que pedir por URL la conversación interna
 * de un trabajo ajeno devuelve cero filas, y el estado vacío dice por qué
 * (CA-20) en vez de un 404 mudo. Aquí no se comprueba ningún permiso a
 * mano (CLAUDE.md MUST).
 *
 * Lo que sí decide esta pantalla es el AVISO de arriba, y no es
 * decorativo: RN-MSG-04 marca como fallo grave mezclar lo interno con lo
 * que ve el cliente, y quien escribe tiene que saber en cuál de las dos
 * está antes de escribir.
 */
export const dynamic = "force-dynamic";

export default async function ConversationPage({
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

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, type, request_id, job_id, establishment_id")
    .eq("id", id)
    .maybeSingle();

  if (!conversation) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.teamArea.messages.title}</h1>
        <Card>
          <EmptyState
            title={es.teamArea.messages.notFoundTitle}
            description={es.teamArea.messages.notFoundReason}
          />
        </Card>
        <p className="mt-4">
          <Link href={`/espacios/${slug}/mensajes`} className="text-cuotly-green underline">
            {es.teamArea.messages.backToInbox}
          </Link>
        </p>
      </div>
    );
  }

  const type = conversation.type as ConversationType;

  // El establecimiento de la conversación: la de solicitud y la interna de
  // trabajo lo heredan de su dueño, así que se pregunta al servidor en vez
  // de deducirlo aquí de tres maneras distintas.
  const { data: establishmentId } = await supabase.rpc("conversation_establishment_id", {
    p_conversation_id: id,
  });

  const [{ data: request }, { data: job }, { data: establishment }] = await Promise.all([
    conversation.request_id
      ? supabase.from("requests").select("id, code").eq("id", conversation.request_id).maybeSingle()
      : Promise.resolve({ data: null }),
    conversation.job_id
      ? supabase.from("jobs").select("id, code").eq("id", conversation.job_id).maybeSingle()
      : Promise.resolve({ data: null }),
    establishmentId
      ? supabase.from("establishments").select("id, name").eq("id", establishmentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { messages, readOnly } = await loadConversation(supabase, id);

  // RN-MSG-04 · el aviso que separa lo interno de lo que ve el cliente. Se
  // deriva del tipo con la misma función que usa el resto del dominio
  // (`isClientVisibleConversation`), no con un `if` escrito aquí: una
  // segunda regla podría discrepar de la primera, y esta es de las que el
  // PRD llama "un fallo aquí es un fallo grave".
  const loLeeElCliente = isClientVisibleConversation(type);

  const titulo =
    type === "job_internal"
      ? es.teamArea.messages.internalTitle
      : type === "establishment"
        ? es.teamArea.messages.establishmentTitle
        : es.clientArea.conversationTitle;

  const aviso =
    type === "job_internal"
      ? es.teamArea.messages.internalNotice
      : loLeeElCliente
        ? es.teamArea.messages.establishmentNotice
        : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">{establishment?.name ?? "—"}</p>
        <h1 className="text-2xl font-bold text-primary-dark">{titulo}</h1>
      </header>

      {establishmentId ? (
        <Conversation
          conversationId={id}
          establishmentId={establishmentId}
          messages={messages}
          readOnly={readOnly}
          notice={aviso}
        />
      ) : null}

      <Card>
        <ul className="space-y-2 text-sm">
          {request ? (
            <li>
              <Link
                href={`/espacios/${slug}/solicitudes/${request.id}`}
                className="text-cuotly-green underline"
              >
                {es.teamArea.messages.relatedRequest} · {request.code}
              </Link>
            </li>
          ) : null}
          {job ? (
            <li>
              <Link
                href={`/espacios/${slug}/trabajos/${job.id}`}
                className="text-cuotly-green underline"
              >
                {es.teamArea.messages.relatedJob} · {job.code}
              </Link>
            </li>
          ) : null}
          {establishment ? (
            <li>
              <Link
                href={`/espacios/${slug}/restaurantes/${establishment.id}`}
                className="text-cuotly-green underline"
              >
                {es.teamArea.messages.relatedEstablishment} · {establishment.name}
              </Link>
            </li>
          ) : null}
          <li>
            <Link href={`/espacios/${slug}/mensajes`} className="text-cuotly-green underline">
              {es.teamArea.messages.backToInbox}
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
