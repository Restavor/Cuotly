"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { dismissDuplicateAction, reservationCommandAction } from "../actions";
import { announceLocalChange } from "./local-change";

/**
 * Los botones de una fila de Hoy que cambian algo desde la propia lista (RES-01, RES-07,
 * RES-08): Confirmar y Rechazar un grupo pendiente, «No es duplicada» y «Cancelar una».
 * Cada uno llama a una acción de servidor que vuelve a comprobar el permiso y el estado;
 * esto solo los pinta y enseña por qué una orden no se hizo.
 */
export function RowActions({
  establishmentId,
  reservationId,
  date,
  pending,
  duplicatePartnerId,
  fichaHref,
  rejectHref,
}: {
  establishmentId: string;
  reservationId: string;
  date: string;
  pending: boolean;
  /** La otra reserva del par, si esta es una posible duplicada. */
  duplicatePartnerId: string | null;
  fichaHref: string;
  /** Rechazar pide el motivo en la ficha: lleva allí con el diálogo abierto. */
  rejectHref: string;
}) {
  const t = es.agents.agenda.today;
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(task: () => Promise<{ ok: boolean; message: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      announceLocalChange(establishmentId, { kind: "date", date, reason: "changed" });
      router.refresh();
    });
  }

  return (
    <>
      {error ? (
        <p role="alert" className="w-full text-right text-sm text-danger">
          {error}
        </p>
      ) : null}
      {pending ? (
        <>
          <Link
            href={rejectHref}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-soft-surface"
          >
            {t.reject}
          </Link>
          <Button
            type="button"
            className="min-h-[44px]"
            pending={busy}
            onClick={() => run(() => reservationCommandAction({ establishmentId, reservationId, command: "confirm", date }))}
          >
            {busy ? t.working : t.confirm}
          </Button>
        </>
      ) : null}
      {duplicatePartnerId ? (
        <>
          <Link
            href={`${fichaHref}?cancelar=1`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-soft-surface"
          >
            {t.cancelOne}
          </Link>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px]"
            pending={busy}
            onClick={() =>
              run(() =>
                dismissDuplicateAction({ establishmentId, reservationA: reservationId, reservationB: duplicatePartnerId, date }),
              )
            }
          >
            {busy ? t.working : t.notDuplicate}
          </Button>
        </>
      ) : null}
    </>
  );
}
