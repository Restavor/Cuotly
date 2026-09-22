import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, NoPermissionState, PageHeader, Tabs } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * La bandeja del equipo (§66, RN-MSG-03, RN-MSG-06).
 *
 * Era el último destino del menú de §20.2 sin construir. No es la
 * conversación de una solicitud —esa la monta `Conversation` desde el
 * Hito 4— sino la lista de TODAS las conversaciones que quien mira puede
 * leer: las de solicitud, las internas de cada trabajo (§66.2) y las
 * generales de cada restaurante (§66.3), que hasta ahora existían en la
 * base de datos y no se veían por ningún sitio.
 *
 * Qué filas aparecen no lo decide esta pantalla: `list_conversations()`
 * filtra con `can_read_conversation()`, la misma función que sostiene la
 * política de la tabla. Un trabajador ve las de sus establecimientos y
 * trabajos autorizados; propietario y administradores, las del espacio
 * entero; y una `job_internal` no llega jamás a un cliente (RN-MSG-04).
 * Aquí no hay ni un filtro de permisos escrito a mano, y es a propósito.
 *
 * El contador de sin leer tampoco se calcula aquí, y no por comodidad: se
 * define contra `messages.sender_id`, una columna que no es legible con un
 * SELECT normal (CLAUDE.md MUST NOT). Solo puede salir del servidor.
 */
export const dynamic = "force-dynamic";

const TITULO_POR_TIPO: Readonly<Record<string, string>> = {
  request: es.teamArea.messages.typeRequest,
  job_internal: es.teamArea.messages.typeJobInternal,
  establishment: es.teamArea.messages.typeEstablishment,
};

export default async function TeamInboxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();

  if (!space) notFound();

  // Sin pertenecer al espacio no hay bandeja que enseñar. La comprobación
  // que vale la hace el servidor —`list_conversations()` devolvería cero
  // filas igual—, pero decir "sin acceso" es más honesto que enseñar una
  // lista vacía como si no hubiera conversaciones (CA-20).
  const { data: membership } = await supabase
    .from("space_memberships")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return (
      <div className="space-y-6">
        <PageHeader title={es.teamArea.messages.title} />
        <NoPermissionState />
      </div>
    );
  }

  const { data: conversations } = await supabase.rpc("list_conversations", {
    p_space_id: space.id,
  });

  const rows = conversations ?? [];
  const t = es.teamArea.messages;

  return (
    <div className="space-y-6">
      {/*
        Página 73 (M14) · título, subtítulo y las pestañas "Clientes /
        Internos". Las conversaciones de aquí son las de solicitudes,
        trabajos y restaurantes; los **canales** del equipo (§38, RN-CAN)
        son la otra pestaña, con su propia pantalla: aquí cada fila tiene
        su restaurante y su código, y un canal no tiene ni lo uno ni lo
        otro.

        El "Nuevo mensaje" del dibujo no va: una conversación nace de una
        solicitud, de un trabajo o de un restaurante, no de un botón.
      */}
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <Tabs
        label={t.title}
        active="conversaciones"
        tabs={[
          { key: "conversaciones", label: t.tabConversations, href: `/espacios/${slug}/mensajes` },
          {
            key: "canales",
            label: es.teamArea.channels.title,
            href: `/espacios/${slug}/mensajes/canales`,
          },
        ]}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        ) : (
          <ul className="-mx-2 divide-y divide-border">
            {rows.map((conversation) => {
              // La solicitud y el trabajo tienen código; la conversación
              // general de un restaurante no cuelga de nada que lo
              // tenga, y ahí el restaurante ya es todo el asunto.
              const codigo = conversation.request_code ?? conversation.job_code;
              const sinLeer = conversation.unread_count > 0;

              return (
                <li key={conversation.id}>
                  <Link
                    href={`/espacios/${slug}/mensajes/${conversation.id}`}
                    className={`flex items-start gap-3 rounded-[12px] px-3 py-3 transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green ${
                      sinLeer ? "bg-cuotly-green/5" : ""
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-soft-surface text-primary-dark"
                    >
                      <Icon
                        name={conversation.type === "job_internal" ? "job" : conversation.type === "request" ? "request" : "building"}
                        className="h-5 w-5"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`truncate text-sm ${sinLeer ? "font-bold" : "font-semibold"} text-text`}>
                          {conversation.establishment_name ?? "—"}
                        </span>
                        <span className="shrink-0 text-xs text-text-secondary">
                          {conversation.last_message_at
                            ? enZona(conversation.last_message_at, space.timezone, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : null}
                        </span>
                      </span>
                      <span className="block truncate text-sm text-text">
                        {TITULO_POR_TIPO[conversation.type] ?? conversation.type}
                        {codigo ? <span className="text-text-secondary">{` · ${codigo}`}</span> : null}
                      </span>
                      {/*
                        Cuando no hay ningún mensaje se dice eso mismo, no se
                        deja la línea vacía: una conversación recién abierta y
                        una sin cargar se parecen demasiado (CA-20).
                      */}
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs text-text-secondary">
                          {conversation.last_message_preview ?? t.noMessagesYet}
                        </span>
                        {sinLeer ? (
                          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cuotly-green px-1.5 text-[11px] font-bold text-surface">
                            {conversation.unread_count}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
