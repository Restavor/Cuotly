"use client";

import { useActionState } from "react";

import { Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import { INITIAL_PRIORITY } from "./action-state";
import { moveRequestPriority } from "./actions";

const t = es.clientArea.priority;

export interface PriorityRow {
  readonly id: string;
  readonly description: string;
  readonly state: string;
}

/**
 * El restaurante ordena sus cambios pendientes por importancia.
 *
 * Sube y baja en vez de escribir un número: con números hay que teclear
 * cinco casillas sin repetir ninguna, y el servidor rechaza —con razón—
 * cualquier lista con un empate. Con dos flechas no se puede escribir un
 * orden inválido, así que el error no llega a existir.
 *
 * Cada flecha manda la lista ENTERA y la posición que se mueve, no "pon
 * esta la 3": el servidor reescribe 1..N de una vez, y dos personas
 * ordenando a la vez no pueden dejar dos segundos ni un hueco.
 *
 * Es un formulario de servidor: sin JavaScript sigue funcionando (CA-22).
 */
export function PriorityList({
  establishmentId,
  rows,
  canOrder,
  reasonWhyNot,
}: {
  establishmentId: string;
  rows: readonly PriorityRow[];
  canOrder: boolean;
  /** Por qué no se puede ordenar, cuando no se puede. Nunca un hueco (CA-20). */
  reasonWhyNot: string;
}) {
  const action = moveRequestPriority.bind(null, establishmentId);
  const [state, formAction] = useActionState(action, INITIAL_PRIORITY);
  const orden = rows.map((row) => row.id).join(",");

  return (
    <Card title={t.title}>
      <p className="mb-4 text-sm text-text-secondary">{t.hint}</p>

      {rows.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : (
        <>
          <ol className="divide-y divide-border border-y border-border">
            {rows.map((row, indice) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                {/*
                  El puesto, grande: es el dato de esta pantalla. "1" no es
                  un adorno, es lo que el restaurante está diciendo.
                */}
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-soft-surface text-sm font-bold text-primary-dark"
                >
                  {indice + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">
                    {t.position(indice + 1, rows.length)}
                    {": "}
                    {row.description}
                  </span>
                  <span className="block text-xs text-text-secondary">
                    {es.naming.states.request[
                      row.state as keyof typeof es.naming.states.request
                    ] ?? row.state}
                  </span>
                </span>

                {canOrder ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <form action={formAction}>
                      <input type="hidden" name="orden" value={orden} />
                      <input type="hidden" name="desde" value={indice} />
                      <input type="hidden" name="hacia" value="arriba" />
                      <button
                        type="submit"
                        disabled={indice === 0}
                        aria-label={t.moveUp(row.description)}
                        title={t.moveUp(row.description)}
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border text-text-secondary transition-colors hover:bg-soft-surface hover:text-text disabled:cursor-not-allowed disabled:text-border focus:outline focus:outline-2 focus:outline-cuotly-green"
                      >
                        <Icon name="chevronDown" aria-hidden="true" className="h-4 w-4 rotate-180" />
                      </button>
                    </form>

                    <form action={formAction}>
                      <input type="hidden" name="orden" value={orden} />
                      <input type="hidden" name="desde" value={indice} />
                      <input type="hidden" name="hacia" value="abajo" />
                      <button
                        type="submit"
                        disabled={indice === rows.length - 1}
                        aria-label={t.moveDown(row.description)}
                        title={t.moveDown(row.description)}
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border text-text-secondary transition-colors hover:bg-soft-surface hover:text-text disabled:cursor-not-allowed disabled:text-border focus:outline focus:outline-2 focus:outline-cuotly-green"
                      >
                        <Icon name="chevronDown" aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </form>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>

          {canOrder ? null : (
            <p className="mt-3 text-sm text-text-secondary">{reasonWhyNot}</p>
          )}

          {state.error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {state.error}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
