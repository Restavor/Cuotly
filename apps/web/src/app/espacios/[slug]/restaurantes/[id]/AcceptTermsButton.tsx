"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { acceptTerms, type AcceptTermsState } from "./actions";

const INITIAL: AcceptTermsState = { error: null, accepted: false };

/**
 * Maqueta 13 · "Acepto la versión N". Un formulario con una acción: la
 * versión que se acepta viaja escondida y es la VIGENTE que la pantalla
 * acaba de enseñar — si entre leerla y pulsar se publicara otra, el
 * servidor rechaza la vieja con su mensaje, que es lo que debe pasar.
 */
export function AcceptTermsButton({
  subscriptionId,
  versionId,
  version,
}: {
  subscriptionId: string;
  versionId: string;
  version: number;
}) {
  const [state, action, pending] = useActionState(acceptTerms, INITIAL);
  const t = es.clientArea.terms;

  return (
    <form action={action} className="shrink-0 text-right">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <input type="hidden" name="versionId" value={versionId} />
      <Button type="submit" disabled={pending || state.accepted}>
        {pending ? t.acceptPending : t.acceptSubmit(version)}
      </Button>
      {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
      {state.accepted ? <p className="mt-1 text-xs text-cuotly-green">{t.acceptDone}</p> : null}
    </form>
  );
}
