"use client";

import { useActionState, useState } from "react";

import { Button, Field } from "@/components/ui";
import type { CuotlyPlan } from "@/core/cuotly-subscription";
import { es } from "@/i18n/es";

import { INITIAL_SETTINGS } from "../action-state";
import { cancelCuotlyPlanChange, changeCuotlyPlan } from "./actions";

function nuevaClave(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * RN-SUB-10 · cambiar el plan de Cuotly (M60, "Mejorar a Agency" y
 * "¿Necesitas menos?"). Pasar a Agency es inmediato y cobra la parte
 * proporcional; pasar a Pro se programa para la renovación con los
 * adicionales que hagan falta para que el uso quepa. Qué se cobra y si
 * cabe lo decide `change_cuotly_plan()`; aquí solo se propone el mínimo de
 * adicionales a partir del uso de hoy.
 */
export function ChangeCuotlyPlanForm({
  spaceId,
  target,
  minExtraEstablishments,
  minExtraUsers,
}: {
  spaceId: string;
  target: CuotlyPlan;
  minExtraEstablishments: number;
  minExtraUsers: number;
}) {
  const [state, action, pending] = useActionState(changeCuotlyPlan, INITIAL_SETTINGS);
  const [clave] = useState(nuevaClave);
  const t = es.cuotlySubscription.change;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="newPlan" value={target} />
      <input type="hidden" name="idempotencyKey" value={`plan:${target}:${clave}`} suppressHydrationWarning />
      {target === "pro" ? (
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field
            label={t.extraEstablishments}
            name="extraEstablishments"
            type="number"
            min={minExtraEstablishments}
            defaultValue={String(minExtraEstablishments)}
          />
          <Field
            label={t.extraUsers}
            name="extraUsers"
            type="number"
            min={minExtraUsers}
            defaultValue={String(minExtraUsers)}
          />
        </div>
      ) : null}
      <Button type="submit" pending={pending} className="w-full">
        {pending ? t.pending : target === "agency" ? t.toAgency : t.toPro}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm text-success">
          {target === "agency" ? t.doneAgency : t.donePro}
        </p>
      ) : null}
    </form>
  );
}

/** RN-SUB-10 · el paso a Pro se puede anular mientras no llegue la renovación. */
export function CancelCuotlyPlanChangeForm({ spaceId }: { spaceId: string }) {
  const [state, action, pending] = useActionState(cancelCuotlyPlanChange, INITIAL_SETTINGS);
  const t = es.cuotlySubscription.change;
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="spaceId" value={spaceId} />
      <Button type="submit" variant="secondary" pending={pending}>
        {pending ? t.cancelPending : t.cancel}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
