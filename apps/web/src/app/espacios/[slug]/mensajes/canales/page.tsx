import { notFound, redirect } from "next/navigation";

import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";
import { NoPermissionState, PageHeader } from "@/components/ui";
import { DEFAULT_TIMEZONE } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { ArchiveChannelButton, ChannelMembersForm, CreateChannelForm } from "./ChannelForms";
import { ChannelsView, type ChannelPane } from "./ChannelsView";

/**
 * M76 · los canales de mensajería interna del espacio (§38, RN-CAN).
 *
 * Los canales no están en la bandeja de `/mensajes` a propósito: aquella es
 * la lista de conversaciones **de restaurantes** —solicitudes, trabajos y
 * generales—, cada una con su restaurante y su código, y un canal no tiene
 * ni lo uno ni lo otro. Aquí van en dos columnas, como el dibujo: la lista
 * y el canal elegido (`?canal=`).
 *
 * Qué canales se ven lo decide `my_channels()`: los míos, y todos si
 * administro el espacio (RN-CAN-08, ver que existe no es leerlo). Lo que se
 * DICE dentro sigue siendo solo de los miembros, y eso lo decide
 * `can_read_conversation()`: la conversación solo se carga si soy miembro.
 *
 * **No se abre ninguno solo.** Abrir un canal marca leído lo que haya
 * dentro (RN-MSG-06), y abrir el primero por defecto lo marcaría sin que
 * nadie lo haya elegido. Es el mismo criterio que la bandeja global (G07).
 */
export const dynamic = "force-dynamic";

const t = es.teamArea.channels;

export default async function ChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ canal?: string; gestionar?: string; nuevo?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState />
      </div>
    );
  }

  const [{ data: channels }, { data: canManage }] = await Promise.all([
    supabase.rpc("my_channels", { p_space_id: space.id }),
    // RN-CAN-04 · crear, gestionar miembros y archivar. El servidor lo
    // vuelve a comprobar en cada función; aquí solo se decide qué se ofrece.
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_space" }),
  ]);

  const rows = channels ?? [];
  const gestiona = canManage === true;
  const zona = space.timezone ?? DEFAULT_TIMEZONE;
  const elegido = query.canal ? (rows.find((c) => c.id === query.canal) ?? null) : null;

  let pane: ChannelPane;
  if (query.nuevo === "1" && gestiona) {
    pane = { kind: "create", form: <CreateChannelForm spaceId={space.id} /> };
  } else if (!query.canal) {
    pane = { kind: "pick" };
  } else if (elegido === null) {
    pane = { kind: "not_found" };
  } else {
    // Los miembros del canal elegido: `channel_members` lo lee cualquiera
    // del espacio (migración 100), y el equipo sí se ve entre sí. Al
    // restaurante no le llega nada de esto: no entra en un canal (RN-CAN-02).
    const { data: memberRows } = await supabase
      .from("channel_members")
      .select("user_id")
      .eq("conversation_id", elegido.id)
      .is("revoked_at", null);

    const gestionando = gestiona && query.gestionar === "1";
    const { data: team } = gestionando
      ? await supabase
          .from("space_memberships")
          .select("user_id")
          .eq("space_id", space.id)
          .eq("status", "active")
      : { data: [] };

    const personIds = [
      ...new Set([
        ...(memberRows ?? []).map((fila) => fila.user_id),
        ...(team ?? []).map((fila) => fila.user_id),
      ]),
    ];
    const { data: people } = personIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", personIds)
      : { data: [] };
    const nombre = new Map(
      (people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email] as const),
    );

    const miembros = (memberRows ?? []).map((fila) => ({
      userId: fila.user_id,
      name: nombre.get(fila.user_id) ?? t.unknownPerson,
    }));
    const dentro = new Set(miembros.map((m) => m.userId));
    const candidatos = (team ?? [])
      .filter((fila) => !dentro.has(fila.user_id))
      .map((fila) => ({ id: fila.user_id, name: nombre.get(fila.user_id) ?? t.unknownPerson }));

    let conversation = null;
    if (elegido.i_am_member && !gestionando) {
      const { messages, readOnly } = await loadConversation(supabase, elegido.id);
      conversation = (
        <Conversation
          bare
          timeZone={zona}
          conversationId={elegido.id}
          // RN-CAN-01 · un canal no es de ningún restaurante: sin adjuntos.
          establishmentId={null}
          messages={messages}
          // RN-CAN-05 · archivado se lee y no se escribe.
          readOnly={readOnly || elegido.archived_at !== null}
          emptyTitle={t.emptyMessagesTitle}
          emptyReason={t.emptyMessagesReason}
        />
      );
    }

    pane = {
      kind: "channel",
      channel: elegido,
      members: miembros,
      conversation,
      manage: gestionando ? (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-text">{t.membersTitle}</h3>
            <ChannelMembersForm
              conversationId={elegido.id}
              candidates={candidatos}
              members={miembros}
            />
          </section>
          <ArchiveChannelButton
            conversationId={elegido.id}
            archived={elegido.archived_at !== null}
          />
        </div>
      ) : null,
    };
  }

  return (
    <ChannelsView
      slug={slug}
      spaceName={space.name}
      channels={rows}
      selectedId={elegido?.id ?? null}
      canManage={gestiona}
      pane={pane}
    />
  );
}
