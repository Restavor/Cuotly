"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/ui";
import { filterByContext, type GlobalAttentionItem } from "@/core/global-home";
import { es } from "@/i18n/es";

/**
 * G01 · "Necesita tu atención", con el filtro de un solo contexto.
 *
 * El orden llega decidido desde `orderGlobalAttention()` y esta lista no lo
 * toca: pintar en un orden y calcular en otro es la forma más fácil de que
 * la pantalla y las pruebas dejen de hablar de lo mismo. Lo único que hace
 * aquí el navegador es esconder filas, nunca reordenarlas ni recalcular si
 * algo está vencido (CLAUDE.md: el cliente no es la autoridad de nada).
 */
export function AttentionBoard({
  items,
  contexts,
}: {
  items: readonly GlobalAttentionItem[];
  contexts: readonly string[];
}) {
  const [contexto, setContexto] = useState<string | null>(null);
  const t = es.globalContext.home;
  const visibles = filterByContext(items, contexto);

  return (
    <div>
      {contexts.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <FiltroBoton activo={contexto === null} onClick={() => setContexto(null)}>
            {t.allContexts}
          </FiltroBoton>
          {contexts.map((nombre) => (
            <FiltroBoton
              key={nombre}
              activo={contexto === nombre}
              onClick={() => setContexto(nombre)}
            >
              {nombre}
            </FiltroBoton>
          ))}
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {visibles.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              <span className="font-semibold text-text">{item.title}</span>
              <span className="text-sm text-text-secondary">{item.contextName}</span>
              <span className="text-sm text-text">{es.globalContext.kinds[item.kind]}</span>
              {item.overdue ? (
                <StatusBadge tone="danger">{t.overdue}</StatusBadge>
              ) : null}
              <span className="ml-auto text-sm text-text-secondary">
                {item.dueAt !== null
                  ? `${t.dueOn} ${fecha(item.dueAt)}`
                  : item.createdAt !== null
                    ? `${t.since} ${fecha(item.createdAt)}`
                    : t.noDate}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FiltroBoton({
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

/**
 * La fecha, en la zona de quien mira. No lleva hora: en esta lista la hora
 * no cambia ninguna decisión, y ponerla sugeriría una precisión que el
 * plazo laborable no tiene.
 */
function fecha(valor: string): string {
  return new Date(valor).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
