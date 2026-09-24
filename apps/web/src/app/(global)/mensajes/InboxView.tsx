import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink, EmptyState, StatusBadge } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { ContextSide } from "@/core/global-home";
import {
  SIDE_PARAM,
  filterInbox,
  groupInbox,
  inboxContexts,
  unreadBySide,
  type InboxParams,
} from "@/core/global-inbox";
import { CUOTLY_TIMEZONE, instanteRelativo } from "@/i18n/dates";
import { es } from "@/i18n/es";
import type { GlobalConversationRow } from "@/services/global-gateway";

import { InboxFilters } from "./InboxFilters";

const t = es.globalContext.messages;

/** La dirección de la bandeja con los filtros de ahora y lo que cambie. */
function direccion(params: InboxParams, cambios: Partial<Record<"lado" | "c", string | null>>): string {
  const q = new URLSearchParams();
  q.set("lado", cambios.lado ?? SIDE_PARAM[params.side]);
  if (cambios.lado === undefined) {
    if (params.context) q.set("contexto", params.context);
    if (params.q) q.set("q", params.q);
    if (params.unreadOnly) q.set("sinleer", "1");
  }
  const c = cambios.c === undefined ? null : cambios.c;
  if (c) q.set("c", c);
  return `/mensajes?${q.toString()}`;
}

/** Cómo se llama una conversación en la lista, en cada pestaña. */
function nombreEnLista(c: GlobalConversationRow, side: ContextSide): string {
  const que = c.request_code
    ? t.requestItem(c.request_code)
    : c.job_code
      ? t.jobItem(c.job_code)
      : t.general;
  // En Mantenimiento el grupo es el espacio, así que cada fila dice de qué
  // restaurante es; en Restaurantes el grupo ya es el restaurante.
  return side === "maintenance" && c.establishment_name ? `${c.establishment_name} · ${que}` : que;
}

function iconoDe(c: GlobalConversationRow, side: ContextSide): IconName {
  if (c.type === "job_internal") return "team";
  if (c.type === "request") return "request";
  return side === "maintenance" ? "building" : "messages";
}

/**
 * A dónde lleva el botón de la cabecera: al sitio donde vive la
 * conversación. La bandeja reúne, no duplica (RN-GLO-05).
 */
function destino(c: GlobalConversationRow, side: ContextSide): { href: string; label: string } {
  const espacio = `/espacios/${c.space_slug ?? ""}`;
  const panel = `${espacio}/restaurantes/${c.establishment_id ?? ""}`;
  if (side === "restaurant") {
    return c.request_id
      ? { href: `${panel}/solicitudes/${c.request_id}`, label: t.openRequest }
      : { href: `${panel}/mensajes?c=${c.id}`, label: t.openPanel };
  }
  if (c.request_id) return { href: `${espacio}/solicitudes/${c.request_id}`, label: t.openRequest };
  if (c.job_id) return { href: `${espacio}/trabajos/${c.job_id}`, label: t.openJob };
  return { href: panel, label: t.openEstablishment };
}

/**
 * G07 y G08 · la bandeja global con los datos ya leídos. La conversación
 * abierta llega pintada (`conversation`): es el mismo componente que usan
 * las demás pantallas de mensajes, y aquí no se decide nada de ella.
 */
export function InboxView({
  rows,
  params,
  selected,
  conversation,
}: {
  rows: readonly GlobalConversationRow[];
  params: InboxParams;
  selected: GlobalConversationRow | null;
  conversation: ReactNode;
}) {
  const side = params.side;
  const visibles = filterInbox(rows, params);
  const grupos = groupInbox(visibles, side);
  const contextos = inboxContexts(rows, side);
  const sinLeer = unreadBySide(rows);
  const ahora = new Date();

  const pestana = (lado: ContextSide, etiqueta: string, icono: IconName) => {
    const activa = lado === side;
    return (
      <Link
        href={direccion(params, { lado: SIDE_PARAM[lado] })}
        aria-current={activa ? "page" : undefined}
        className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm sm:px-5 transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
          activa
            ? "border-cuotly-green bg-cuotly-green/5 font-semibold text-primary-dark"
            : "border-transparent font-medium text-text-secondary hover:text-text"
        }`}
      >
        <Icon name={icono} className="h-5 w-5" />
        {etiqueta}
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
            activa ? "bg-primary-dark text-surface" : "bg-soft-surface text-text"
          }`}
        >
          <span className="sr-only">{t.unread(sinLeer[lado])}</span>
          <span aria-hidden="true">{sinLeer[lado]}</span>
        </span>
      </Link>
    );
  };

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
      <nav aria-label={t.tabsLabel} className="flex overflow-x-auto border-b border-border">
        {pestana("maintenance", t.tabMaintenance, "building")}
        {pestana("restaurant", t.tabRestaurants, "dailyMenu")}
      </nav>

      <InboxFilters submitLabel={t.apply}>
        <input type="hidden" name="lado" value={SIDE_PARAM[side]} />
        <label className="flex min-w-0 items-center gap-2 text-sm text-text-secondary">
          {side === "maintenance" ? t.contextSpace : t.contextPanel}:
          <select
            name="contexto"
            defaultValue={params.context ?? ""}
            className="min-w-0 max-w-full rounded-field sm:min-w-48 border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <option value="">{t.allContexts}</option>
            {contextos.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
            className="w-full rounded-field border border-border bg-surface py-1.5 pl-9 pr-3 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
          />
        </div>
        <label className="relative inline-flex cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            role="switch"
            name="sinleer"
            value="1"
            defaultChecked={params.unreadOnly}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-cuotly-green peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cuotly-green" />
          <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform peer-checked:translate-x-5" />
          {t.onlyUnread}
        </label>
      </InboxFilters>

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="border-b border-border p-3 lg:border-b-0 lg:border-r">
          {grupos.length === 0 ? (
            <EmptyState
              title={t.emptyTitle}
              description={
                rows.some((r) => r.side === side)
                  ? params.unreadOnly && params.q === null && params.context === null
                    ? t.emptyUnread
                    : t.emptyFiltered
                  : t.emptyReason
              }
            />
          ) : (
            grupos.map((grupo) => (
              <details key={grupo.key} open className="group mb-2 border-b border-border pb-2 last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[10px] px-2 py-2 hover:bg-soft-surface [&::-webkit-details-marker]:hidden">
                  <Icon
                    name="chevronDown"
                    className="h-4 w-4 text-text-secondary -rotate-90 transition-transform group-open:rotate-0"
                  />
                  <Icon name={side === "maintenance" ? "building" : "dailyMenu"} className="h-5 w-5 text-primary-dark" />
                  <span className="flex-1 truncate text-sm font-semibold text-text">{grupo.name}</span>
                  <span className="rounded-full bg-soft-surface px-2 text-xs font-semibold text-text">
                    {grupo.rows.length}
                  </span>
                </summary>
                <ul className="mt-1 space-y-1">
                  {grupo.rows.map((c) => {
                    const activa = c.id === selected?.id;
                    const pendientes = c.unread_count ?? 0;
                    return (
                      <li key={c.id}>
                        <Link
                          href={direccion(params, { c: c.id })}
                          aria-current={activa ? "true" : undefined}
                          className={`flex gap-3 rounded-[10px] p-2.5 transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green ${
                            activa ? "bg-cuotly-green/10" : ""
                          }`}
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cuotly-green/15 text-primary-dark">
                            <Icon name={iconoDe(c, side)} className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-semibold text-text">
                                  {nombreEnLista(c, side)}
                                </span>
                                {c.type === "job_internal" ? (
                                  <span className="shrink-0 rounded-full bg-info/15 px-2 text-[11px] font-semibold text-primary-dark">
                                    {t.internal}
                                  </span>
                                ) : null}
                              </span>
                              {c.last_message_at ? (
                                <span className="shrink-0 text-xs text-text-secondary">
                                  {instanteRelativo(c.last_message_at, CUOTLY_TIMEZONE, ahora, t.today)}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 flex items-center justify-between gap-2">
                              <span className="truncate text-sm text-text-secondary">
                                {c.last_message_preview ?? t.noMessagesYet}
                              </span>
                              {pendientes > 0 ? (
                                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-surface">
                                  <span className="sr-only">{t.unread(pendientes)}</span>
                                  <span aria-hidden="true">{pendientes}</span>
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))
          )}
        </div>

        {/*
          En el teléfono, sin conversación elegida no hay columna derecha:
          la lista es la pantalla, y el "Elige una conversación" solo
          empujaba hacia abajo un hueco vacío (página 5 del diseño móvil).
        */}
        <div className={`min-w-0 p-4 ${params.selected === null ? "hidden lg:block" : ""}`}>
          {params.selected === null ? (
            <EmptyState title={t.pickTitle} description={t.pickReason} />
          ) : selected === null ? (
            <EmptyState title={t.notFoundTitle} description={t.notFoundReason} />
          ) : (
            <Cabecera c={selected} side={side}>
              {conversation}
            </Cabecera>
          )}
        </div>
      </div>
    </div>
  );
}

function Cabecera({ c, side, children }: { c: GlobalConversationRow; side: ContextSide; children: ReactNode }) {
  const ir = destino(c, side);
  const titulo =
    side === "maintenance"
      ? t.headerMaintenance(c.space_name ?? "", c.establishment_name ?? "")
      : t.headerRestaurant(c.establishment_name ?? "");
  const tipo =
    c.type === "request"
      ? `${t.typeRequest}${c.request_code ? ` · ${c.request_code}` : ""}`
      : c.type === "job_internal"
        ? `${t.typeJob}${c.job_code ? ` · ${c.job_code}` : ""}`
        : t.typeEstablishment;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3 border-b border-border pb-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cuotly-green/15 text-primary-dark">
          <Icon name={iconoDe(c, side)} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-primary-dark">{titulo}</h2>
          <p className="text-sm text-text-secondary">{tipo}</p>
        </div>
        {c.is_read_only ? <StatusBadge tone="neutral">{t.readOnly}</StatusBadge> : null}
        <ButtonLink href={ir.href} variant="secondary" size="sm">
          {ir.label}
          <Icon name="chevronRight" className="h-4 w-4" />
        </ButtonLink>
      </div>
      {/*
        RN-MSG-04 · quien escribe tiene que saber antes de escribir si el
        restaurante lo va a leer. Solo lo necesita el equipo: el restaurante
        solo ve conversaciones que son con él.
      */}
      {side === "maintenance" ? (
        <p className="flex items-center gap-2 rounded-[10px] bg-cuotly-green/5 px-3 py-2 text-sm text-text">
          <Icon name="info" className="h-5 w-5 shrink-0 text-primary-dark" />
          {c.type === "job_internal" ? t.internalNotice : t.sharedNotice}
        </p>
      ) : null}
      {children}
    </div>
  );
}
