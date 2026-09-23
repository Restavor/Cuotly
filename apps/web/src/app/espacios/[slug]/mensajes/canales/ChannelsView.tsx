import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar, Card, EmptyState, PageHeader, StatusBadge, Tabs } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

const t = es.teamArea.channels;

export type ChannelRow = {
  readonly id: string;
  readonly name: string | null;
  readonly member_count: number;
  readonly unread_count: number | null;
  readonly i_am_member: boolean;
  readonly archived_at: string | null;
};

export type ChannelPane =
  | { readonly kind: "pick" }
  | { readonly kind: "not_found" }
  | { readonly kind: "create"; readonly form: ReactNode }
  | {
      readonly kind: "channel";
      readonly channel: ChannelRow;
      readonly members: readonly { readonly userId: string; readonly name: string }[];
      /** El formulario de miembros y archivar, si se está gestionando. */
      readonly manage: ReactNode | null;
      /** La conversación, o `null` si quien mira no es miembro. */
      readonly conversation: ReactNode | null;
    };

/**
 * M76 · los canales internos (§38, RN-CAN) como el dibujo: la lista del
 * espacio a la izquierda y el canal elegido a la derecha.
 *
 * Las pestañas son las de Mensajes; el aviso de arriba es RN-CAN-02 (el
 * restaurante no entra en un canal, nunca), dicho antes de escribir.
 */
export function ChannelsView({
  slug,
  spaceName,
  channels,
  selectedId,
  canManage,
  pane,
}: {
  slug: string;
  spaceName: string;
  channels: readonly ChannelRow[];
  selectedId: string | null;
  canManage: boolean;
  pane: ChannelPane;
}) {
  const base = `/espacios/${slug}/mensajes/canales`;
  const activos = channels.filter((c) => c.archived_at === null);
  const archivados = channels.filter((c) => c.archived_at !== null);
  // En un teléfono no caben las dos columnas: se ve la lista o el canal,
  // como en cualquier aplicación de mensajería, y el canal lleva su flecha
  // para volver.
  const abierto = pane.kind !== "pick";

  return (
    <div className="space-y-6">
      <PageHeader title={es.teamArea.messages.title} subtitle={t.subtitle} />

      <Tabs
        label={es.teamArea.messages.title}
        active="canales"
        tabs={[
          {
            key: "conversaciones",
            label: es.teamArea.messages.tabConversations,
            href: `/espacios/${slug}/mensajes`,
          },
          { key: "canales", label: t.title, href: base },
        ]}
      />

      <p className="flex items-center gap-2.5 rounded-card border border-info/30 bg-info/10 px-4 py-3 text-sm font-medium text-text">
        <Icon name="info" className="h-5 w-5 shrink-0 text-primary-dark" />
        {t.notice}
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className={`p-0! overflow-hidden ${abierto ? "hidden lg:block" : ""}`}>
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
            <h2 className="truncate text-base font-semibold text-primary-dark">
              {t.listTitle(spaceName)}
            </h2>
            {canManage ? (
              <Link
                href={`${base}?nuevo=1`}
                aria-label={t.newChannel}
                title={t.newChannel}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-cuotly-green hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                <Icon name="plus" className="h-5 w-5" />
              </Link>
            ) : null}
          </header>

          {channels.length === 0 ? (
            <div className="p-3">
              <EmptyState title={t.emptyTitle} description={t.emptyReason} />
            </div>
          ) : (
            <>
              <ListaDeCanales canales={activos} base={base} selectedId={selectedId} />
              {archivados.length === 0 ? null : (
                <details open={archivados.some((c) => c.id === selectedId)} className="border-t border-border">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-text-secondary hover:text-text">
                    {t.archivedSection(archivados.length)}
                  </summary>
                  <ListaDeCanales canales={archivados} base={base} selectedId={selectedId} />
                </details>
              )}
            </>
          )}
        </Card>

        <Card className={`p-0! overflow-hidden lg:min-h-[28rem] ${abierto ? "" : "hidden lg:block"}`}>
          <Panel pane={pane} base={base} canManage={canManage} />
        </Card>
      </div>
    </div>
  );
}

function ListaDeCanales({
  canales,
  base,
  selectedId,
}: {
  canales: readonly ChannelRow[];
  base: string;
  selectedId: string | null;
}) {
  return (
    <ul className="py-1">
      {canales.map((canal) => {
        const activo = canal.id === selectedId;
        const sinLeer = canal.unread_count ?? 0;
        return (
          <li key={canal.id}>
            <Link
              href={`${base}?canal=${canal.id}`}
              aria-current={activo ? "page" : undefined}
              className={`flex items-center gap-3 px-4 py-3 transition-colors focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-cuotly-green ${
                activo ? "bg-cuotly-green/10" : "hover:bg-soft-surface"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-primary-dark"
              >
                <Icon name="messages" className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm text-text ${sinLeer > 0 ? "font-bold" : "font-semibold"}`}>
                  {canal.name ?? t.untitled}
                </span>
                <span className="block truncate text-xs text-text-secondary">
                  {t.memberCount(canal.member_count)}
                  {canal.i_am_member ? null : ` · ${t.notMemberShort}`}
                </span>
              </span>
              {sinLeer > 0 ? (
                <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary-dark px-1.5 text-xs font-bold text-surface">
                  <span className="sr-only">{t.unread(sinLeer)}</span>
                  <span aria-hidden="true">{sinLeer}</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Panel({ pane, base, canManage }: { pane: ChannelPane; base: string; canManage: boolean }) {
  if (pane.kind === "pick") {
    return (
      <div className="p-5">
        <EmptyState title={t.pickTitle} description={t.pickReason} />
      </div>
    );
  }
  const volver = (
    <Link
      href={base}
      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-cuotly-green lg:hidden"
    >
      <Icon name="arrowLeft" className="h-4 w-4" />
      {t.backToList}
    </Link>
  );
  if (pane.kind === "not_found") {
    return (
      <div className="p-5">
        {volver}
        <EmptyState title={t.notFoundTitle} description={t.notFoundReason} />
      </div>
    );
  }
  if (pane.kind === "create") {
    return (
      <div className="p-5">
        {volver}
        {pane.form}
      </div>
    );
  }

  const { channel, members } = pane;
  const visibles = members.slice(0, 3);
  const resto = members.length - visibles.length;
  const gestionando = pane.manage !== null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <Link
          href={base}
          aria-label={t.backToList}
          title={t.backToList}
          className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-soft-surface hover:text-text lg:hidden"
        >
          <Icon name="arrowLeft" className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 truncate text-lg font-semibold text-primary-dark">
            {channel.name ?? t.untitled}
            {channel.archived_at ? <StatusBadge tone="neutral">{t.archived}</StatusBadge> : null}
          </h2>
          <p className="text-sm text-text-secondary">{t.memberCount(channel.member_count)}</p>
        </div>
        {visibles.length === 0 ? null : (
          <span className="flex items-center" title={members.map((m) => m.name).join(", ")}>
            <span className="sr-only">{members.map((m) => m.name).join(", ")}</span>
            <span aria-hidden="true" className="flex -space-x-1.5">
              {visibles.map((m) => (
                <span key={m.userId} className="rounded-full ring-2 ring-surface">
                  <Avatar name={m.name} size={32} />
                </span>
              ))}
            </span>
            {resto > 0 ? (
              <span aria-hidden="true" className="ml-1.5 text-xs font-semibold text-text-secondary">
                {`+${resto}`}
              </span>
            ) : null}
          </span>
        )}
        {canManage ? (
          <Link
            href={gestionando ? `${base}?canal=${channel.id}` : `${base}?canal=${channel.id}&gestionar=1`}
            aria-label={gestionando ? t.backToChannel : t.manage}
            title={gestionando ? t.backToChannel : t.manage}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-soft-surface hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <Icon name={gestionando ? "close" : "more"} className="h-5 w-5" />
          </Link>
        ) : null}
      </header>

      <div className="flex-1 p-5">
        {gestionando ? (
          pane.manage
        ) : pane.conversation === null ? (
          <EmptyState
            icon="lock"
            title={t.notMemberTitle}
            description={canManage ? `${t.notMember} ${t.notMemberManage}` : t.notMember}
          />
        ) : (
          <div className="space-y-3">
            {channel.archived_at ? (
              <p className="rounded-[10px] bg-soft-surface px-3 py-2 text-sm text-text-secondary">
                {t.archivedNotice}
              </p>
            ) : null}
            {pane.conversation}
            {channel.archived_at ? null : <p className="text-xs text-text-secondary">{t.noAttachments}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
