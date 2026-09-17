import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, NoPermissionState, StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";
import { enZona } from "@/i18n/dates";
import { createClient } from "@/lib/supabase/server";

import { ArchiveChannelButton, ChannelMembersForm, CreateChannelForm } from "./ChannelForms";

/**
 * M76 · los canales de mensajería interna del espacio (§38, RN-CAN).
 *
 * Los canales no están en la bandeja de `/mensajes` a propósito: aquella es
 * la lista de conversaciones **de restaurantes** —solicitudes, trabajos y
 * generales—, cada una con su restaurante y su código, y un canal no tiene
 * ni lo uno ni lo otro. Mezclarlos habría hecho una tabla en la que la
 * mitad de las columnas están vacías la mitad de las veces.
 *
 * Qué canales se ven lo decide `my_channels()`: los míos, y todos si
 * administro el espacio (RN-CAN-08, ver que existe no es leerlo). Lo que se
 * DICE dentro sigue siendo solo de los miembros, y eso lo decide
 * `can_read_conversation()` al abrir uno.
 */
export const dynamic = "force-dynamic";

const t = es.teamArea.channels;

export default async function ChannelsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.title}</h1>
        <NoPermissionState />
      </div>
    );
  }

  const [{ data: channels }, { data: canManage }] = await Promise.all([
    supabase.rpc("my_channels", { p_space_id: space.id }),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_space" }),
  ]);

  const rows = channels ?? [];
  const gestiona = canManage === true;

  // Los miembros de cada canal y la gente del equipo, solo para quien
  // administra: es quien tiene el formulario. A los demás no se les lee la
  // lista del equipo para pintar algo que no van a poder usar.
  const channelIds = rows.map((canal) => canal.id);
  const [{ data: memberRows }, { data: team }] = gestiona
    ? await Promise.all([
        channelIds.length
          ? supabase
              .from("channel_members")
              .select("conversation_id, user_id")
              .in("conversation_id", channelIds)
              .is("revoked_at", null)
          : Promise.resolve({ data: [] }),
        supabase
          .from("space_memberships")
          .select("user_id")
          .eq("space_id", space.id)
          .eq("status", "active"),
      ])
    : [{ data: [] }, { data: [] }];

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

  const miembrosPorCanal = new Map<string, { userId: string; name: string }[]>();
  for (const fila of memberRows ?? []) {
    miembrosPorCanal.set(fila.conversation_id, [
      ...(miembrosPorCanal.get(fila.conversation_id) ?? []),
      { userId: fila.user_id, name: nombre.get(fila.user_id) ?? t.unknownPerson },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t.subtitle}</p>
        <p className="mt-3 text-sm">
          <Link href={`/espacios/${slug}/mensajes`} className="text-cuotly-green underline">
            {es.teamArea.messages.backToInbox}
          </Link>
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        </Card>
      ) : (
        rows.map((canal) => {
          const miembros = miembrosPorCanal.get(canal.id) ?? [];
          const dentro = new Set(miembros.map((m) => m.userId));
          const candidatos = (team ?? [])
            .filter((fila) => !dentro.has(fila.user_id))
            .map((fila) => ({
              id: fila.user_id,
              name: nombre.get(fila.user_id) ?? t.unknownPerson,
            }));

          return (
            <Card key={canal.id} title={canal.name ?? t.untitled}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {canal.archived_at ? (
                  <StatusBadge tone="neutral">{t.archived}</StatusBadge>
                ) : null}
                <span className="text-sm text-text-secondary">
                  {t.memberCount(canal.member_count)}
                </span>
                {canal.last_message_at ? (
                  <span className="text-sm text-text-secondary">
                    {t.lastMessage(
                      enZona(canal.last_message_at, space.timezone, { dateStyle: "short" }),
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-text-secondary">{t.noMessages}</span>
                )}
              </div>

              {/*
                RN-CAN-08 · quien administra el espacio ve que el canal
                existe; abrirlo es otra cosa. A quien no es miembro se le
                dice el motivo en vez de darle un enlace que acaba en una
                pantalla vacía.
              */}
              {canal.i_am_member ? (
                <p className="mb-3 text-sm">
                  <Link
                    href={`/espacios/${slug}/mensajes/${canal.id}`}
                    className="text-cuotly-green underline"
                  >
                    {t.open}
                  </Link>
                  {canal.unread_count ? (
                    <span className="ml-2 text-text-secondary">
                      {t.unread(canal.unread_count)}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mb-3 text-sm text-text-secondary">{t.notMember}</p>
              )}

              {gestiona ? (
                <>
                  <h3 className="mb-2 text-sm font-semibold text-text">{t.membersTitle}</h3>
                  <ChannelMembersForm
                    conversationId={canal.id}
                    candidates={candidatos}
                    members={miembros}
                  />
                  <div className="mt-4">
                    <ArchiveChannelButton
                      conversationId={canal.id}
                      archived={canal.archived_at !== null}
                    />
                  </div>
                </>
              ) : null}
            </Card>
          );
        })
      )}

      {gestiona ? <CreateChannelForm spaceId={space.id} /> : null}
    </div>
  );
}
