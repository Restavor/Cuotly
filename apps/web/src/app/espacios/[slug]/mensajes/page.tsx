import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
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
    .select("id, name, slug")
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
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.teamArea.messages.title}</h1>
        <NoPermissionState />
      </div>
    );
  }

  const { data: conversations } = await supabase.rpc("list_conversations", {
    p_space_id: space.id,
  });

  const rows = conversations ?? [];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-primary-dark">{es.teamArea.messages.title}</h1>
      <p className="mb-6 text-sm text-text-secondary">{es.teamArea.messages.subtitle}</p>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={es.teamArea.messages.emptyTitle}
            description={es.teamArea.messages.emptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.messages.subjectColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.messages.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.messages.lastMessageColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.messages.dateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.messages.unreadColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((conversation) => {
                // La solicitud y el trabajo tienen código; la conversación
                // general de un restaurante no cuelga de nada que lo
                // tenga, y ahí el restaurante ya es todo el asunto.
                const codigo = conversation.request_code ?? conversation.job_code;

                return (
                <TableRow key={conversation.id}>
                  <TableCell>
                    <Link
                      href={`/espacios/${slug}/mensajes/${conversation.id}`}
                      className="text-cuotly-green underline"
                    >
                      {TITULO_POR_TIPO[conversation.type] ?? conversation.type}
                    </Link>
                    {codigo ? <span className="text-text-secondary">{` · ${codigo}`}</span> : null}
                  </TableCell>
                  <TableCell>{conversation.establishment_name ?? "—"}</TableCell>
                  <TableCell>
                    {/*
                      Cuando no hay ningún mensaje se dice eso mismo, no se
                      deja la celda vacía: una conversación recién abierta y
                      una sin cargar se parecen demasiado (CA-20).
                    */}
                    {conversation.last_message_preview ?? es.teamArea.messages.noMessagesYet}
                  </TableCell>
                  <TableCell>
                    {conversation.last_message_at
                      ? new Intl.DateTimeFormat("es-ES", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(conversation.last_message_at))
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {conversation.unread_count > 0 ? (
                      <StatusBadge tone="info">{conversation.unread_count}</StatusBadge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
