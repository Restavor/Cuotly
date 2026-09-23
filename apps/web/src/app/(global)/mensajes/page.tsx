import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";
import { ErrorState, PageHeader } from "@/components/ui";
import { readInboxParams } from "@/core/global-inbox";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myConversations } from "@/services/global-gateway";

import { loadEstablishmentTimezone } from "../../espacios/[slug]/restaurantes/[id]/timezone-load";
import { InboxView } from "./InboxView";

/**
 * G07 y G08 · la bandeja global (RN-GLO-05).
 *
 * Reúne, no duplica: son **las mismas** conversaciones de RN-MSG, con las
 * mismas políticas, los mismos diez minutos de edición y la misma
 * imposibilidad de borrar. Aquí no se abre ninguna conversación nueva, y la
 * que se abre a la derecha es el mismo componente `Conversation` de las
 * demás pantallas, con lo que carga `loadConversation()`: quién firma cada
 * mensaje lo sigue decidiendo el servidor (P7).
 *
 * La dirección es el estado: `?lado=`, `?contexto=`, `?q=`, `?sinleer=1` y
 * `?c=` la conversación abierta. **No se abre ninguna sola**, aunque el
 * dibujo enseñe una: abrir una conversación la marca como leída
 * (RN-MSG-06), y marcar leído lo que nadie ha abierto borraría el aviso sin
 * que lo haya visto nadie.
 */
export const dynamic = "force-dynamic";

export default async function GlobalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const conversaciones = await myConversations(supabase).catch(() => null);
  const t = es.globalContext.messages;

  if (conversaciones === null) {
    return (
      <div className="space-y-4">
        <PageHeader title={t.title} subtitle={t.subtitle} />
        <ErrorState title={t.failedTitle} description={t.failedReason} />
      </div>
    );
  }

  const params = readInboxParams(await searchParams, conversaciones);
  // La elegida tiene que ser de la pestaña que se mira: una del otro lado
  // se abriría con el aviso equivocado (compartida o interna).
  const elegida =
    params.selected === null
      ? null
      : (conversaciones.find((c) => c.id === params.selected && c.side === params.side) ?? null);

  let abierta = null;
  if (elegida && elegida.establishment_id) {
    const [conversation, zona] = await Promise.all([
      loadConversation(supabase, elegida.id),
      loadEstablishmentTimezone(supabase, elegida.establishment_id),
    ]);
    abierta = (
      <Conversation
        timeZone={zona}
        conversationId={elegida.id}
        establishmentId={elegida.establishment_id}
        messages={conversation.messages}
        readOnly={conversation.readOnly}
        bare
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <InboxView rows={conversaciones} params={params} selected={elegida} conversation={abierta} />
      <p className="text-sm text-text-secondary">{t.sameConversations}</p>
    </div>
  );
}
