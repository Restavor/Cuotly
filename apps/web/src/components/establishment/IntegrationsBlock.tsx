import { Card, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import {
  INTEGRATION_PROVIDERS,
  canCancelConnection,
  canDisconnect,
  canManageConnections,
  canProvideCredential,
  canRequestCheck,
  canSeeCredentialMetadata,
  integrationSyncFrequency,
  integrationTone,
} from "@/core/integrations";
import { es } from "@/i18n/es";
import { isOAuthProvider } from "@/services/google-oauth";

import { ApiKeyForm, CancelButton, CheckButton, DisconnectForm, OAuthConnectForm } from "./IntegrationForms";
import { formatMoment, type IntegrationRow, type IntegrationsView } from "./integrations-load";

const t = es.integrations;

/**
 * Maqueta 17 · "Gestión — Integraciones": una fila por fuente, con lo que
 * §117 manda enseñar (cuenta, última sincronización, próximo intento,
 * error) y las acciones de quien mira. Y debajo, las plataformas
 * externas, que no son integraciones (§120, §121) y se dice.
 *
 * Qué botones se pintan lo decide `src/core/integrations.ts` a partir del
 * actor y el estado (RN-INT-05); qué botones FUNCIONAN lo decide la base.
 * No hay "Sincronizar ahora" (RN-INT-03), y se explica por qué.
 *
 * Es un componente de servidor: los formularios de dentro son de cliente
 * y llevan la acción; el resto es lectura.
 */
export function IntegrationsBlock({
  view,
  establishmentId,
  slug,
  returnTo,
  title,
  hint,
}: {
  view: IntegrationsView;
  establishmentId: string;
  slug: string;
  returnTo: string;
  title: string;
  hint: string;
}) {
  const puedeGestionar = canManageConnections(view.actor) && !view.establishmentArchived;
  const veCredenciales = canSeeCredentialMetadata(view.actor);

  return (
    <>
      <Card title={title}>
        <p className="mb-3 text-sm text-text-secondary">{hint}</p>

        {view.flash ? (
          <p
            role={view.flash === "connected" ? "status" : "alert"}
            data-testid="integration-flash"
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              view.flash === "connected" ? "bg-success/10 text-text" : "bg-warning/10 text-text"
            }`}
          >
            {t.flash[view.flash]}
          </p>
        ) : null}

        {view.establishmentArchived ? (
          <p className="mb-3 text-sm text-text-secondary">{t.archivedNote}</p>
        ) : null}
        {!canManageConnections(view.actor) ? (
          <p className="mb-3 text-sm text-text-secondary">
            {view.actor.kind === "staff" ? t.workerReadOnly : t.clientReadOnly}
          </p>
        ) : view.actor.kind === "client" ? (
          <p className="mb-3 text-sm text-text-secondary">{t.clientOwnerHint}</p>
        ) : null}
        {puedeGestionar && !view.vaultConfigured ? (
          <p role="alert" className="mb-3 text-sm text-danger">
            {t.vaultNotConfigured}
          </p>
        ) : null}
        {puedeGestionar && view.vaultConfigured && !view.oauthConfigured ? (
          <p className="mb-3 text-sm text-text-secondary">{t.oauthNotConfigured}</p>
        ) : null}

        <ul className="divide-y divide-border">
          {INTEGRATION_PROVIDERS.map((provider) => {
            const row = view.rows.find((r) => r.provider === provider);
            if (!row) return null;
            return (
              <li key={provider} data-testid={`integration-${provider}`} className="py-4">
                <IntegrationRowView
                  row={row}
                  view={view}
                  establishmentId={establishmentId}
                  slug={slug}
                  returnTo={returnTo}
                  puedeGestionar={puedeGestionar}
                  veCredenciales={veCredenciales}
                />
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-xs text-text-secondary">{t.noSyncNowNote}</p>
      </Card>

      <Card title={t.platformsTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.platformsHint}</p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-soft-surface p-3">
            <dt className="text-xs text-text-secondary">{t.webPlatformLabel}</dt>
            <dd className="text-sm text-text">
              {view.webPlatform ?? view.websiteUrl ?? t.webPlatformNone}
              {view.websiteUrl ? (
                <a
                  href={view.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 inline-flex items-center gap-1 text-cuotly-green underline"
                >
                  {t.openSite}
                  <Icon name="externalLink" aria-hidden="true" className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </dd>
            <dd className="mt-1 text-xs text-text-secondary">{t.landingSiteNote}</dd>
          </div>
          <div className="rounded-lg bg-soft-surface p-3">
            <dt className="text-xs text-text-secondary">{t.reservationsLabel}</dt>
            <dd className="text-sm text-text-secondary">{t.reservationsNone}</dd>
          </div>
        </dl>
      </Card>
    </>
  );
}

function IntegrationRowView({
  row,
  view,
  establishmentId,
  slug,
  returnTo,
  puedeGestionar,
  veCredenciales,
}: {
  row: IntegrationRow;
  view: IntegrationsView;
  establishmentId: string;
  slug: string;
  returnTo: string;
  puedeGestionar: boolean;
  veCredenciales: boolean;
}) {
  const provider = row.provider;
  const info = t.providers[provider];
  const esOAuth = isOAuthProvider(provider);
  const puedeCredencial =
    puedeGestionar && view.vaultConfigured && canProvideCredential(view.actor, row.authKind) && (!esOAuth || view.oauthConfigured);
  const necesitaAutorizar = row.status === "not_connected" || row.status === "disconnected" || row.status === "pending_authorization";
  const necesitaReautorizar = row.status === "needs_attention" && row.lastFailureKind === "authorization";
  const defaultProperty = row.externalPropertyId ?? (provider === "pagespeed" ? view.websiteUrl : null);
  const proximoIntento =
    row.nextAttemptAt !== null
      ? formatMoment(row.nextAttemptAt, view.timezone)
      : row.status === "needs_attention"
        ? t.nextAttemptWaitingPerson
        : t.nextAttemptNone;

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div>
        <p className="font-semibold text-text">{info.name}</p>
        <p className="text-xs text-text-secondary">{info.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge tone={integrationTone(row.status)} icon={row.status === "error" || row.status === "needs_attention" ? "alert" : row.status === "connected" ? "check" : "clock"}>
            {t.states[row.status]}
          </StatusBadge>
          {row.isStale ? <StatusBadge tone="warning" icon="clock">{t.staleBadge}</StatusBadge> : null}
          {row.checkPending ? <StatusBadge tone="info" icon="clock">{t.checkPendingBadge}</StatusBadge> : null}
        </div>
        <p className="mt-2 text-xs text-text-secondary">{t.frequency[integrationSyncFrequency(provider)]}</p>
      </div>

      <div className="space-y-2">
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-text-secondary">{t.accountLabel}</dt>
            <dd className="text-text">{row.accountLabel ?? t.accountNone}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t.lastSyncLabel}</dt>
            <dd className="text-text">{formatMoment(row.lastSyncAt, view.timezone)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">{t.nextAttemptLabel}</dt>
            <dd className="text-text">{proximoIntento}</dd>
          </div>
          {row.externalPropertyId ? (
            <div className="sm:col-span-3">
              <dt className="text-xs text-text-secondary">{t.propertyLabel}</dt>
              <dd className="break-all text-text">{row.externalPropertyId}</dd>
            </div>
          ) : null}
        </dl>

        {row.lastError ? (
          <p role="status" className="text-sm text-danger">
            <span className="font-semibold">{t.errorLabel}:</span> {row.lastError}
            {row.lastFailureKind ? (
              <span className="block text-xs text-text-secondary">{t.failureKinds[row.lastFailureKind]}</span>
            ) : null}
          </p>
        ) : null}
        {row.externalRevocationPending ? (
          <p className="text-xs text-text-secondary">{t.revocationPendingNote}</p>
        ) : null}

        {veCredenciales && row.credentials.length > 0 ? (
          <details className="text-xs text-text-secondary">
            <summary className="cursor-pointer">{t.credentialsTitle}</summary>
            <p className="mt-1">{t.credentialsHint}</p>
            <ul className="mt-1 list-disc pl-5">
              {row.credentials.map((c, i) => (
                <li key={`${c.createdAt}-${i}`}>
                  {t.credentialKinds[c.kind]} · {t.credentialKeyVersion(c.keyVersion)} ·{" "}
                  {c.status === "active" ? t.credentialActive : c.status === "replaced" ? t.credentialReplaced : t.credentialRevoked} ·{" "}
                  {formatMoment(c.createdAt, view.timezone)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {puedeGestionar && row.integrationId !== null && canRequestCheck(row.status) ? (
          <CheckButton integrationId={row.integrationId} disabled={row.checkPending} />
        ) : null}

        {puedeCredencial && esOAuth && (necesitaAutorizar || necesitaReautorizar) ? (
          <OAuthConnectForm
            establishmentId={establishmentId}
            provider={provider}
            slug={slug}
            returnTo={returnTo}
            defaultProperty={defaultProperty}
            label={necesitaReautorizar ? t.reauthorize : t.connectOAuth}
          />
        ) : null}

        {puedeCredencial && !esOAuth && (provider === "clarity" || provider === "pagespeed") ? (
          <ApiKeyForm
            establishmentId={establishmentId}
            provider={provider}
            defaultProperty={defaultProperty}
            replacing={!necesitaAutorizar}
          />
        ) : null}
        {puedeGestionar && view.vaultConfigured && !canProvideCredential(view.actor, row.authKind) && (necesitaAutorizar || necesitaReautorizar) ? (
          <p className="text-xs text-text-secondary">{esOAuth ? t.onlyOwnersAuthorize : t.onlySpaceOwnerKeys}</p>
        ) : null}

        {puedeGestionar && row.integrationId !== null && canCancelConnection(row.status) ? (
          <CancelButton integrationId={row.integrationId} />
        ) : null}
        {puedeGestionar && row.integrationId !== null && canDisconnect(row.status) ? (
          <details>
            <summary className="cursor-pointer text-sm text-danger">{t.disconnect}</summary>
            <div className="mt-2">
              <DisconnectForm integrationId={row.integrationId} />
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
