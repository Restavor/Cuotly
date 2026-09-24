import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";
import { InfoNote } from "@/components/panel/RequestPieces";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { requestHeadline, requestTone } from "@/core/requests";
import { enZona, instanteRelativo } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";

/**
 * R20 · la bandeja de mensajes del restaurante: la conversación general
 * (§66.3) y la de cada solicitud (§66), con la elegida en el centro y su
 * información a la derecha.
 *
 * Qué conversaciones aparecen no lo decide esta pantalla:
 * `list_conversations()` filtra con `can_read_conversation()`, y una
 * `job_internal` no llega jamás a un cliente (RN-MSG-04). Aquí solo se
 * quedan las de este restaurante, porque la función devuelve las de todo
 * lo que la persona puede leer en el espacio. El contador de sin leer lo
 * calcula el servidor: se define contra `messages.sender_id`, que el
 * restaurante no puede leer (CLAUDE.md).
 *
 * No hay "Nuevo mensaje": la conversación general ya existe siempre (se
 * crea al abrir el panel) y es ahí donde se escribe lo que no es una
 * solicitud; una conversación nueva nace de una solicitud.
 */
export const dynamic = "force-dynamic";

const t = es.panelMessages;
type RequestStateKey = keyof typeof es.naming.states.request;

export default async function ClientMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const { c } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, zona, { data: generalId }] = await Promise.all([
    supabase.from("establishments").select("id, space_id, name").eq("id", id).maybeSingle(),
    loadEstablishmentTimezone(supabase, id),
    // La general existe siempre: se crea aquí si todavía no estaba (§66.3).
    supabase.rpc("get_or_create_establishment_conversation", { p_establishment_id: id }),
  ]);
  if (!establishment) notFound();

  const { data: todas } = await supabase.rpc("list_conversations", { p_space_id: establishment.space_id });
  const conversaciones = (todas ?? [])
    .filter((conv) => conv.establishment_id === id && conv.type !== "job_internal")
    .sort((a, b) => {
      // La general primero; luego, la de actividad más reciente.
      if (a.type === "establishment") return -1;
      if (b.type === "establishment") return 1;
      return (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "");
    });

  const requestIds = conversaciones.map((conv) => conv.request_id).filter((r): r is string => Boolean(r));
  const { data: solicitudes } = requestIds.length
    ? await supabase.from("requests").select("id, code, description, state, created_at").in("id", requestIds)
    : { data: [] };
  const solicitud = new Map((solicitudes ?? []).map((r) => [r.id, r]));

  const elegidaId = typeof c === "string" ? c : (generalId ?? conversaciones[0]?.id ?? null);
  const elegida = conversaciones.find((conv) => conv.id === elegidaId) ?? null;
  const conversation = elegida ? await loadConversation(supabase, elegida.id) : null;
  const suSolicitud = elegida?.request_id ? (solicitud.get(elegida.request_id) ?? null) : null;

  const base = `/espacios/${slug}/restaurantes/${id}`;
  const titulo = (conv: (typeof conversaciones)[number]) => {
    if (conv.type === "establishment") return t.general;
    const r = conv.request_id ? solicitud.get(conv.request_id) : undefined;
    return r ? requestHeadline(r.description, 50) || r.code : (conv.request_code ?? t.requestFallback);
  };
  const cuando = (iso: string) => instanteRelativo(iso, zona, new Date(), es.establishmentSheet.today);
  const fecha = (iso: string) => enZona(iso, zona, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {conversaciones.length === 0 ? (
        <Card>
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
          <Card className="p-3! sm:p-3!">
            <nav aria-label={t.listLabel}>
              <ul className="space-y-1">
                {conversaciones.map((conv) => {
                  const activa = conv.id === elegida?.id;
                  return (
                    <li key={conv.id}>
                      <Link
                        href={`${base}/mensajes?c=${conv.id}`}
                        aria-current={activa ? "true" : undefined}
                        className={`flex gap-3 rounded-[10px] p-3 hover:bg-soft-surface ${
                          activa ? "border-l-4 border-cuotly-green bg-soft-surface" : ""
                        }`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-surface text-cuotly-green">
                          <Icon name={conv.type === "establishment" ? "messages" : "request"} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="truncate font-semibold text-text">{titulo(conv)}</span>
                            {conv.unread_count > 0 ? (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-surface">
                                <span className="sr-only">{t.unread(conv.unread_count)}</span>
                                <span aria-hidden="true">{conv.unread_count}</span>
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-sm text-text-secondary">
                            {conv.type === "establishment"
                              ? t.generalHint
                              : (conv.last_message_preview ?? t.noMessages)}
                          </span>
                          {conv.last_message_at ? (
                            <span className="block text-xs text-text-secondary">{cuando(conv.last_message_at)}</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </Card>

          <div className="min-w-0 space-y-3">
            {elegida && conversation ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface p-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-primary-dark">{titulo(elegida)}</h2>
                    <p className="text-sm text-text-secondary">
                      {elegida.last_message_at ? t.lastMessage(cuando(elegida.last_message_at)) : t.noMessages}
                    </p>
                  </div>
                  {suSolicitud ? (
                    <div className="flex flex-col items-end gap-2">
                      <Link
                        href={`${base}/solicitudes/${suSolicitud.id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-cuotly-green"
                      >
                        {t.viewRequest}
                        <Icon name="arrowRight" className="h-4 w-4" />
                      </Link>
                      <StatusBadge tone={requestTone(suSolicitud.state)}>
                        {es.naming.states.request[suSolicitud.state as RequestStateKey] ?? suSolicitud.state}
                      </StatusBadge>
                    </div>
                  ) : null}
                </div>
                <Conversation
                  timeZone={zona}
                  conversationId={elegida.id}
                  establishmentId={id}
                  messages={conversation.messages}
                  readOnly={conversation.readOnly}
                  title={t.title}
                />
              </>
            ) : (
              <Card>
                <EmptyState title={t.notFoundTitle} description={t.notFoundReason} />
              </Card>
            )}
          </div>

          <Card title={t.infoTitle}>
            {suSolicitud ? (
              <div className="space-y-3 text-sm">
                <p className="font-semibold text-text">{requestHeadline(suSolicitud.description, 80) || suSolicitud.code}</p>
                <p className="text-text-secondary">{suSolicitud.code}</p>
                <div>
                  <p className="font-semibold text-text">{t.requestState}</p>
                  <div className="mt-1">
                    <StatusBadge tone={requestTone(suSolicitud.state)}>
                      {es.naming.states.request[suSolicitud.state as RequestStateKey] ?? suSolicitud.state}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-text-secondary">{t.requestSent(fecha(suSolicitud.created_at))}</p>
                </div>
                <Link
                  href={`${base}/solicitudes/${suSolicitud.id}`}
                  className="inline-flex items-center gap-1 font-semibold text-cuotly-green"
                >
                  {t.requestDetails}
                  <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <InfoNote title={t.general}>{t.infoGeneral}</InfoNote>
                <Link
                  href={`${base}/convertir`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-cuotly-green"
                >
                  {t.convert}
                  <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
