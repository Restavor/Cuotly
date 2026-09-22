"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { filterByContext, type GlobalAttentionItem } from "@/core/global-home";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";

/**
 * G01 · "Necesita tu atención", con el filtro de un solo contexto.
 *
 * Es la página 1 del diseño definitivo móvil: cada fila lleva su icono, el
 * nombre de la cosa, de qué contexto es, una etiqueta con lo que le pasa y
 * **un botón para abrirla**. Hasta el 20/09/2026 era una fila de texto sin
 * botón y con la misma frase escrita dos veces —"Fuera de plazo" salía como
 * tipo y otra vez como etiqueta—, que es lo que se veía en el móvil.
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
  const [contexto, setContexto] = useState<string>("");
  const t = es.globalContext.home;
  const visibles = filterByContext(items, contexto === "" ? null : contexto);

  return (
    <div>
      {/*
        El diseño pone aquí un desplegable "Todos mis contextos". Con un
        solo contexto no se dibuja: un filtro de un elemento no filtra nada
        y ocupa la línea que necesita el título.
      */}
      {contexts.length > 1 ? (
        <div className="mb-3 flex justify-end">
          <label className="sr-only" htmlFor="filtro-contexto">
            {t.allContexts}
          </label>
          <select
            id="filtro-contexto"
            value={contexto}
            onChange={(evento) => setContexto(evento.target.value)}
            className="rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-medium text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <option value="">{t.allContexts}</option>
            {contexts.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <ul className="space-y-2">
        {visibles.map((item) => (
          <li
            key={item.key}
            className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface px-3.5 py-3 sm:flex-nowrap"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary-dark">
              <Icon
                name={item.side === "maintenance" ? "job" : "request"}
                className="h-5 w-5"
              />
            </span>

            <div className="min-w-0 flex-1 basis-40">
              <p className="truncate text-sm font-semibold text-text">{item.title}</p>
              <p className="truncate text-xs text-text-secondary">{item.contextName}</p>
            </div>

            {/*
              Una sola etiqueta y no dos: si está fuera de plazo, eso es
              lo que hay que leer; si no, lo que le pasa, y al lado la
              fecha. Antes se escribían las dos y en un móvil salía
              "Fuera de plazo Fuera de plazo".
            */}
            <StatusBadge tone={item.overdue ? "danger" : "info"} icon={item.overdue ? "alert" : "clock"}>
              {item.overdue ? t.overdue : es.globalContext.kinds[item.kind]}
              {" · "}
              {item.dueAt !== null
                ? `${t.dueOn} ${fechaCorta(item.dueAt)}`
                : item.createdAt !== null
                  ? `${t.since} ${fechaCorta(item.createdAt)}`
                  : t.noDate}
            </StatusBadge>

            {/*
              El botón del diseño. Va en la fila y no envolviendo la fila
              entera: un enlace que ocupa toda la tarjeta no se puede
              seleccionar con el dedo sin abrirlo.
            */}
            <Link
              href={item.href}
              className="inline-flex shrink-0 items-center gap-1 rounded-field bg-primary px-3.5 py-2 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              {t.openItem}
              <Icon name="chevronRight" className="h-4 w-4" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
