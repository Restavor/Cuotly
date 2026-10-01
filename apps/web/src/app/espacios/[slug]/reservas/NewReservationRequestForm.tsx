"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { reservationRequestInitialState } from "./action-state";
import { createReservationRequest } from "./actions";

export interface ReservationCandidate {
  readonly id: string;
  readonly name: string;
}

/**
 * RN-APP-03 · el formulario de "Crear solicitud para este restaurante". Solo
 * ofrece los restaurantes que pueden tener una solicitud: sin Reservas
 * contratada y sin otra solicitud abierta. El servidor lo vuelve a comprobar.
 */
export function NewReservationRequestForm({
  slug,
  candidates,
  idempotencyKey,
}: {
  slug: string;
  candidates: readonly ReservationCandidate[];
  idempotencyKey: string;
}) {
  const t = es.reservationsSpace.create;
  const [state, action, pending] = useActionState(
    createReservationRequest,
    reservationRequestInitialState,
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="min-w-[240px] flex-1">
        <label htmlFor="establishmentId" className="mb-1.5 block text-sm font-semibold text-text">
          {t.restaurantLabel}
        </label>
        <select
          id="establishmentId"
          name="establishmentId"
          defaultValue={state.establishmentId}
          className="w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green/20"
        >
          <option value="">{t.choose}</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" pending={pending}>
        {t.submit}
      </Button>
      {state.error === null ? null : (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.done ? (
        <p role="status" className="w-full text-sm text-success">
          {t.created}
        </p>
      ) : null}
    </form>
  );
}
