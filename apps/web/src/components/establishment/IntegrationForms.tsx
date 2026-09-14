"use client";

import { useActionState } from "react";

import { Button, Field } from "@/components/ui";
import type { IntegrationProvider } from "@/core/integrations";
import { es } from "@/i18n/es";

import { INITIAL_INTEGRATION_ACTION } from "@/app/espacios/[slug]/restaurantes/[id]/integraciones/action-state";
import {
  cancelIntegrationConnection,
  disconnectIntegration,
  requestIntegrationCheck,
  saveApiKey,
  startOAuthConnection,
} from "@/app/espacios/[slug]/restaurantes/[id]/integraciones/actions";

const t = es.integrations;

/**
 * Los formularios del bloque de integraciones (maqueta 17). Se pintan
 * solo a quien puede (RN-INT-05), y eso es cortesía: cada función de la
 * base vuelve a comprobar el permiso con la sesión de quien envía, y la
 * credencial la guarda `store_integration_credential()` con el actor por
 * parámetro (§126). Ocultar un botón no es un control de acceso
 * (CLAUDE.md).
 */

function Aviso({ error, done, hecho }: { error: string | null; done: boolean; hecho: string }) {
  if (error) {
    return (
      <p role="alert" className="mt-1 text-xs text-danger">
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="mt-1 text-xs text-text-secondary">
        {hecho}
      </p>
    );
  }
  return null;
}

/** RN-INT-02 · conectar por OAuth: el formulario manda al servidor, que firma el state y redirige a Google. */
export function OAuthConnectForm({
  establishmentId,
  provider,
  slug,
  returnTo,
  defaultProperty,
  label,
}: {
  establishmentId: string;
  provider: Extract<IntegrationProvider, "ga4" | "search_console" | "business_profile">;
  slug: string;
  returnTo: string;
  defaultProperty: string | null;
  label: string;
}) {
  return (
    <form action={startOAuthConnection} className="space-y-2">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Field
        id={`${provider}-property`}
        name="propertyId"
        label={t.propertyField[provider]}
        defaultValue={defaultProperty ?? ""}
        required
      />
      <p className="text-xs text-text-secondary">{t.oauthRedirectNote}</p>
      <Button type="submit" variant="secondary">
        {label}
      </Button>
    </form>
  );
}

/** RN-INT-02/§126 · una clave API: solo el propietario del espacio llega a ver este formulario. */
export function ApiKeyForm({
  establishmentId,
  provider,
  defaultProperty,
  replacing,
}: {
  establishmentId: string;
  provider: Extract<IntegrationProvider, "clarity" | "pagespeed">;
  defaultProperty: string | null;
  replacing: boolean;
}) {
  const [state, action, pending] = useActionState(saveApiKey, INITIAL_INTEGRATION_ACTION);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <input type="hidden" name="provider" value={provider} />
      <Field
        id={`${provider}-property`}
        name="propertyId"
        label={t.propertyField[provider]}
        defaultValue={defaultProperty ?? ""}
        required={provider === "pagespeed"}
      />
      <Field
        id={`${provider}-api-key`}
        name="apiKey"
        type="password"
        label={t.apiKeyField[provider]}
        autoComplete="off"
        required
      />
      <p className="text-xs text-text-secondary">{t.apiKeyHint}</p>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.savePending : replacing ? t.replaceApiKey : t.saveApiKey}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={t.apiKeySaved} />
    </form>
  );
}

export function CheckButton({ integrationId, disabled }: { integrationId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(requestIntegrationCheck, INITIAL_INTEGRATION_ACTION);
  return (
    <form action={action}>
      <input type="hidden" name="integrationId" value={integrationId} />
      <Button type="submit" variant="secondary" disabled={pending || disabled || state.done}>
        {pending ? t.checkPending : t.check}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={t.checkRequested} />
    </form>
  );
}

export function CancelButton({ integrationId }: { integrationId: string }) {
  const [state, action, pending] = useActionState(cancelIntegrationConnection, INITIAL_INTEGRATION_ACTION);
  return (
    <form action={action}>
      <input type="hidden" name="integrationId" value={integrationId} />
      <Button type="submit" variant="secondary" disabled={pending || state.done}>
        {pending ? t.cancelPending : t.cancel}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={t.states.not_connected} />
    </form>
  );
}

/** RN-INT-06 · desconectar revoca; el motivo (opcional) va a la auditoría. */
export function DisconnectForm({ integrationId }: { integrationId: string }) {
  const [state, action, pending] = useActionState(disconnectIntegration, INITIAL_INTEGRATION_ACTION);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="integrationId" value={integrationId} />
      <p className="text-xs text-text-secondary">{t.disconnectConfirm}</p>
      <Field id={`${integrationId}-reason`} name="reason" label={t.disconnectReasonLabel} />
      <Button type="submit" variant="danger" disabled={pending || state.done}>
        {pending ? t.disconnectPending : t.disconnect}
      </Button>
      <Aviso error={state.error} done={state.done} hecho={t.states.disconnected} />
    </form>
  );
}
