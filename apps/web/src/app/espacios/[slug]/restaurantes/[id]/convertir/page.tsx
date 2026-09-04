import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, EmptyState } from "@/components/ui";
import { resolveAuthorLabel } from "@/core/messages";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { ConvertConversationForm, type ConvertibleMessage } from "./ConvertConversationForm";

/**
 * §68 · RN-MSG-10 — el primer paso de "Convertir en solicitud": elegir los
 * mensajes relevantes de la conversación general del restaurante (§66.3).
 *
 * Por qué es una pantalla propia y no un botón dentro de la conversación:
 * elegir mensajes obliga a poner una casilla en cada uno, y el componente
 * `Conversation` lo montan cuatro pantallas —las dos de solicitud, la
 * interna de trabajo y la general—. Meter ahí un modo "elegir" que solo
 * vale en una de las cuatro es la clase de bifurcación que acaba
 * enseñando la casilla donde no toca.
 *
 * Y vive bajo el restaurante, no bajo `/mensajes`, porque convertir es del
 * lado del CLIENTE: `create_request_draft()` exige
 * `can_write_establishment()`, que a propósito deja fuera al equipo de
 * mantenimiento ("el equipo no crea solicitudes en nombre del cliente,
 * solo las valida"). La bandeja `/mensajes` es del equipo.
 *
 * Ningún permiso se comprueba aquí: la conversación la filtra RLS y la
 * conversión la vuelve a comprobar el servidor.
 */
export const dynamic = "force-dynamic";

export default async function ConvertConversationPage({
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

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!establishment) notFound();

  // La misma conversación que enseña la ficha del restaurante: hay
  // exactamente una general por restaurante (§66.3).
  const { data: conversationId } = await supabase.rpc("get_or_create_establishment_conversation", {
    p_establishment_id: id,
  });

  if (!conversationId) notFound();

  // A propósito NO se usa `loadConversation()`: ese cargador marca la
  // conversación como leída (RN-MSG-06), y entrar aquí a elegir mensajes
  // no es haber leído el hilo — el separador de "Mensajes nuevos" tiene
  // que seguir donde estaba cuando se vuelva a la conversación.
  const { data: rows } = await supabase.rpc("list_conversation_messages", {
    p_conversation_id: conversationId,
  });

  const mensajes = rows ?? [];

  // RN-MSG-09 · cuántos adjuntos lleva cada mensaje, para que quien elige
  // sepa qué archivos se va a llevar el borrador. Qué archivos se ven lo
  // decide `can_read_file()` en la política de `file_links`.
  const { data: links } = mensajes.length
    ? await supabase
        .from("file_links")
        .select("file_id, entity_id")
        .eq("entity_type", "message")
        .in(
          "entity_id",
          mensajes.map((message) => message.id),
        )
    : { data: [] };

  const adjuntosPorMensaje = new Map<string, number>();
  for (const link of links ?? []) {
    adjuntosPorMensaje.set(link.entity_id, (adjuntosPorMensaje.get(link.entity_id) ?? 0) + 1);
  }

  const fecha = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

  // RN-MSG-02 · quién firma cada mensaje sale de la misma función del
  // dominio que usa la conversación, no de un `if` escrito aquí: al
  // restaurante, la persona del equipo no se le nombra nunca.
  //
  // `hasResolvedName: false` siempre, y a propósito: esta pantalla no
  // resuelve ningún nombre. Es la del cliente —convertir exige
  // `can_write_establishment()`, que deja fuera al equipo— y por el
  // camino seguro: sin nombre resuelto, lo del equipo se firma como
  // "Equipo de mantenimiento".
  const convertibles: ConvertibleMessage[] = mensajes.map((message) => {
    const etiqueta = resolveAuthorLabel({
      isMine: message.is_mine,
      senderDisplay: message.sender_display,
      hasResolvedName: false,
    });

    return {
      id: message.id,
      body: message.body,
      author:
        etiqueta === "you"
          ? es.clientArea.you
          : etiqueta === "establishment"
            ? es.space.messages.establishmentSide
            : es.clientArea.maintenanceTeam,
      createdAt: fecha.format(new Date(message.created_at)),
      attachments: adjuntosPorMensaje.get(message.id) ?? 0,
    };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">{establishment.name}</p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.clientArea.convertTitle}</h1>
        <p className="mt-2 text-sm text-text-secondary">{es.clientArea.convertSubtitle}</p>
      </header>

      {convertibles.length === 0 ? (
        <Card>
          <EmptyState
            title={es.clientArea.convertEmptyTitle}
            description={es.clientArea.convertEmptyReason}
          />
        </Card>
      ) : (
        <ConvertConversationForm
          slug={slug}
          establishmentId={id}
          conversationId={conversationId}
          messages={convertibles}
        />
      )}

      <p>
        <Link href={`/espacios/${slug}/restaurantes/${id}`} className="text-cuotly-green underline">
          {es.clientArea.convertBack}
        </Link>
      </p>
    </div>
  );
}
