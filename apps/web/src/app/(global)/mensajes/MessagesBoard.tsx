"use client";

import Link from "next/link";
import { useState } from "react";

import { EmptyState, StatusBadge } from "@/components/ui";
import type { ContextSide } from "@/core/global-home";
import { es } from "@/i18n/es";
import type { GlobalConversationRow } from "@/services/global-gateway";

/**
 * G07 y G08 · la bandeja global, con sus dos pestañas, su selector de
 * contexto y su filtro de no leídas.
 *
 * Es cliente porque las tres cosas son un filtro sobre una lista que ya
 * llegó entera del servidor. No se pide nada más al cambiar de pestaña: lo
 * que se ve es lo mismo, repartido.
 */
export function MessagesBoard({
  conversations,
}: {
  conversations: readonly GlobalConversationRow[];
}) {
  const t = es.globalContext.messages;
  const [lado, setLado] = useState<ContextSide>(
    conversations.some((c) => c.side === "maintenance") ? "maintenance" : "restaurant",
  );
  const [contexto, setContexto] = useState<string | null>(null);
  const [soloSinLeer, setSoloSinLeer] = useState(false);

  const delLado = conversations.filter((c) => c.side === lado);
  const contextos = [
    ...new Set(
      delLado.map((c) => nombreDeContexto(c, lado)).filter((nombre): nombre is string => nombre !== null),
    ),
  ];

  const visibles = delLado
    .filter((c) => contexto === null || nombreDeContexto(c, lado) === contexto)
    .filter((c) => !soloSinLeer || (c.unread_count ?? 0) > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pestana activo={lado === "maintenance"} onClick={() => elegir("maintenance")}>
          {t.tabMaintenance}
        </Pestana>
        <Pestana activo={lado === "restaurant"} onClick={() => elegir("restaurant")}>
          {t.tabRestaurants}
        </Pestana>

        <button
          type="button"
          onClick={() => setSoloSinLeer((v) => !v)}
          aria-pressed={soloSinLeer}
          className={`ml-auto rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
            soloSinLeer
              ? "border-primary bg-primary text-surface"
              : "border-border bg-surface text-text hover:border-cuotly-green"
          }`}
        >
          {soloSinLeer ? t.showAll : t.onlyUnread}
        </button>
      </div>

      {contextos.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Pildora activo={contexto === null} onClick={() => setContexto(null)}>
            {t.allContexts}
          </Pildora>
          {contextos.map((nombre) => (
            <Pildora key={nombre} activo={contexto === nombre} onClick={() => setContexto(nombre)}>
              {nombre}
            </Pildora>
          ))}
        </div>
      ) : null}

      {visibles.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          description={soloSinLeer ? t.emptyUnread : t.emptyReason}
        />
      ) : (
        <ul className="divide-y divide-border">
          {visibles.map((c) => (
            <li key={c.id}>
              <Link
                href={enlace(c)}
                className="block py-3 hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-text">
                    {c.request_code ?? c.job_code ?? c.establishment_name ?? ""}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {nombreDeContexto(c, lado) ?? ""}
                  </span>
                  {c.is_read_only ? <StatusBadge tone="neutral">{t.readOnly}</StatusBadge> : null}
                  {(c.unread_count ?? 0) > 0 ? (
                    <StatusBadge tone="info">{`${c.unread_count} ${t.unreadOne}`}</StatusBadge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {c.last_message_preview ?? t.noMessagesYet}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  function elegir(nuevo: ContextSide) {
    setLado(nuevo);
    // El contexto elegido es de la pestaña que se deja: arrastrarlo dejaría
    // la lista vacía sin que se entienda por qué.
    setContexto(null);
  }
}

/**
 * De dónde es cada conversación. En la pestaña del equipo, del espacio; en
 * la del restaurante, del restaurante — que es lo que esa persona
 * reconoce, y además el cliente no lee `spaces` (P7).
 */
function nombreDeContexto(c: GlobalConversationRow, lado: ContextSide): string | null {
  return lado === "maintenance" ? c.space_name : c.establishment_name;
}

/**
 * A dónde lleva. Las conversaciones son las mismas de siempre y viven donde
 * siempre: esta bandeja reúne, no duplica (RN-GLO-05).
 */
function enlace(c: GlobalConversationRow): string {
  const espacio = `/espacios/${c.space_slug ?? ""}`;
  if (c.side === "restaurant" && c.establishment_id) {
    return c.request_id
      ? `${espacio}/restaurantes/${c.establishment_id}/solicitudes/${c.request_id}`
      : `${espacio}/restaurantes/${c.establishment_id}`;
  }
  if (c.request_id) return `${espacio}/solicitudes/${c.request_id}`;
  if (c.job_id) return `${espacio}/trabajos/${c.job_id}`;
  return `${espacio}/mensajes`;
}

function Pestana({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
        activo ? "border-primary text-primary-dark" : "border-transparent text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function Pildora({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
        activo
          ? "border-primary bg-primary text-surface"
          : "border-border bg-surface text-text hover:border-cuotly-green"
      }`}
    >
      {children}
    </button>
  );
}
