"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SETTINGS } from "../ajustes/action-state";
import { confirmOnboardingStep } from "./actions";

/**
 * RN-CIC-02 · "este paso lo he mirado y lo doy por bueno". No finge que
 * el dato exista: lo que queda registrado es que una persona lo confirmó,
 * con su nombre y la fecha, y la lista lo enseña así.
 */
export function ConfirmStepButton({ spaceId, step }: { spaceId: string; step: string }) {
  const [state, action, pending] = useActionState(confirmOnboardingStep, INITIAL_SETTINGS);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="step" value={step} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.onboarding.confirmPending : es.onboarding.confirmSubmit}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
