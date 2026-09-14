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
import { ProviderMark } from "./ProviderMark";
import { formatMoment, type IntegrationRow, type IntegrationsView } from "./integrations-load";

const t = es.integrations;

/**
 * Vista 17 · "Gestión — Integraciones": una tarjeta por fuente, con la
 * marca, el nombre y de qué trata, la insignia de estado, y en columnas
 * lo que §117 manda enseñar —cuenta de origen, última sincronización,
 * próximo intento— y a la derecha "Comprobar conexión". Debajo de la fila,
 * solo cuando hace falta, lo que la maqueta no dibuja porque en ella todo
 * está conectado: la propiedad, el error con su clase, las credenciales
 * (para el propietario, §126) y los formularios de conectar, cancelar y
 * desconectar.
 *
 * Y debajo de las cinco, las tres tarjetas de plataformas externas
 * (LandingSite, Reservas y Delivery), que no son integraciones (§120,
 * §121) y se dice.
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
      <section aria-label={title} className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-primary-dark">{title}</h3>
          <p className="text-sm text-text-secondary">{hint}</p>
        </div>

        {view.flash ? (
          <p
            role={view.flash === "connected" ? "status" : "alert"}
            data-testid="integration-flash"
            className={`rounded-lg px-3 py-2 text-sm ${
              view.flash === "connected" ? "bg-success/10 text-text" : "bg-warning/10 text-text"
            }`}
          >
            {t.flash[view.flash]}
          </p>
        ) : null}

        {view.establishmentArchived ? <p className="text-sm text-text-secondary">{t.archivedNote}</p> : null}
        {!canManageConnections(view.actor) ? (
          <p className="text-sm text-text-secondary">
            {view.actor.kind === "staff" ? t.workerReadOnly : t.clientReadOnly}
          </p>
        ) : view.actor.kind === "client" ? (
          <p className="text-sm text-text-secondary">{t.clientOwnerHint}</p>
        ) : null}
        {puedeGestionar && !view.vaultConfigured ? (
          <p role="alert" className="text-sm text-danger">
            {t.vaultNotConfigured}
          </p>
        ) : null}
        {puedeGestionar && view.vaultConfigured && !view.oauthConfigured ? (
          <p className="text-sm text-text-secondary">{t.oauthNotConfigured}</p>
        ) : null}

        <ul className="space-y-3">
          {INTEGRATION_PROVIDERS.map((provider) => {
            const row = view.rows.find((r) => r.provider === provider);
            if (!row) return null;
            return (
              <li
                key={provider}
                data-testid={`integration-${provider}`}
                className="rounded-[14px] border border-border bg-surface p-4"
              >
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

        <p className="text-xs text-text-secondary">{t.noSyncNowNote}</p>
      </section>

      <ExternalPlatforms view={view} />
    </>
  );
}

/**
 * Uno de los tres datos de la fila (§117). El valor NO se recorta: una
 * fecha a medias ("15 sept 2026, 1…") no es un dato. Solo la cuenta, que
 * es un correo y puede ser largo, se recorta con su valor completo en el
 * atributo `title`.
 */
function Dato({ label, value, truncate = false }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd
        title={truncate ? value : undefined}
        className={`text-sm text-text ${truncate ? "truncate" : "whitespace-nowrap"}`}
      >
        {value}
      </dd>
    </div>
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
  const puedeComprobar = puedeGestionar && row.integrationId !== null && canRequestCheck(row.status);

  return (
    <div className="space-y-3">
      {/* La fila de la maqueta: marca · nombre · insignia · tres datos · acción. */}
      {/*
        La fila de la maqueta en tres columnas: quién (con su estado) · los
        tres datos de §117 · la acción.

        La insignia va DENTRO de la celda del nombre y no en columna
        propia, aunque la maqueta la dibuje aparte: con el ancho real de la
        ficha, una cuarta columna dejaba a los nombres y a las fechas sin
        sitio y se partían en dos líneas ("Google / Analytics 4", "15 sept
        2026, 1…"), que se lee peor que el estado bajo el nombre. Los tres
        datos van en su propio grid de tres columnas iguales para que las
        cinco filas queden alineadas entre sí: cada `<li>` es su propio
        grid, y con todo al mismo nivel la insignia larga de una fila
        ("Pendiente de autorización") corría las columnas solo de esa.

        Se apila por debajo de `lg`: los tres datos más el botón no caben
        en la anchura de una tableta.
      */}
      <div className="grid items-center gap-x-4 gap-y-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_auto]">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderMark provider={provider} />
          <div className="min-w-0">
            <p className="font-semibold text-text">{info.name}</p>
            <p className="text-xs text-text-secondary">{info.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge
                tone={integrationTone(row.status)}
                icon={row.status === "error" || row.status === "needs_attention" ? "alert" : row.status === "connected" ? "check" : "clock"}
              >
                {t.states[row.status]}
              </StatusBadge>
              {row.isStale ? <StatusBadge tone="warning" icon="clock">{t.staleBadge}</StatusBadge> : null}
              {row.checkPending ? <StatusBadge tone="info" icon="clock">{t.checkPendingBadge}</StatusBadge> : null}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Dato label={t.accountLabel} value={row.accountLabel ?? t.accountNone} truncate />
          <Dato label={t.lastSyncLabel} value={formatMoment(row.lastSyncAt, view.timezone)} truncate />
          <Dato label={t.nextAttemptLabel} value={proximoIntento} truncate />
        </dl>

        <div className="lg:justify-self-end">
          {puedeComprobar ? <CheckButton integrationId={row.integrationId!} disabled={row.checkPending} /> : null}
        </div>
      </div>

      {/* Lo que la maqueta no dibuja y hace falta decir. */}
      <div className="space-y-2 text-sm lg:pl-[52px]">
        <p className="text-xs text-text-secondary">
          {t.frequency[integrationSyncFrequency(provider)]}
          {row.externalPropertyId ? (
            <>
              {" · "}
              {t.propertyLabel}: <span className="break-all text-text">{row.externalPropertyId}</span>
            </>
          ) : null}
        </p>

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

        {/*
          El formulario va plegado: la maqueta dibuja las cinco fuentes
          conectadas, y cinco formularios abiertos a la vez convierten una
          lista de cinco filas en una pantalla de scroll. Es un `<details>`
          y no un estado de React para que siga funcionando sin JavaScript
          (CA-22), igual que el de desconectar.
        */}
        {puedeCredencial && esOAuth && (necesitaAutorizar || necesitaReautorizar) ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-cuotly-green">
              {necesitaReautorizar ? t.reauthorize : t.connectOAuth}
            </summary>
            <div className="mt-2">
              <OAuthConnectForm
                establishmentId={establishmentId}
                provider={provider}
                slug={slug}
                returnTo={returnTo}
                defaultProperty={defaultProperty}
                label={necesitaReautorizar ? t.reauthorize : t.connectOAuth}
              />
            </div>
          </details>
        ) : null}

        {puedeCredencial && !esOAuth && (provider === "clarity" || provider === "pagespeed") ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-cuotly-green">
              {necesitaAutorizar ? t.connectApiKey : t.replaceApiKey}
            </summary>
            <div className="mt-2">
              <ApiKeyForm
                establishmentId={establishmentId}
                provider={provider}
                defaultProperty={defaultProperty}
                replacing={!necesitaAutorizar}
              />
            </div>
          </details>
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

/**
 * Vista 17, abajo · LandingSite con su proyecto y su última publicación
 * (la de Menú Diario, que es manual, §121), y Reservas y Delivery como
 * "plataforma externa utilizada". Las dos últimas no tienen campo en la
 * ficha todavía (§120, decisión 25g): se dice en vez de pintar "Abrir
 * enlace" sin enlace.
 */
function ExternalPlatforms({ view }: { view: IntegrationsView }) {
  const proyecto = view.domain ?? view.websiteUrl;
  return (
    <section aria-label={t.platformsTitle} className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-primary-dark">{t.platformsTitle}</h3>
        <p className="text-sm text-text-secondary">{t.platformsHint}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <Card>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary">
              <Icon name="externalLink" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text">{view.webPlatform ?? t.webPlatformLabel}</p>
              <p className="text-xs text-text-secondary">{t.webPlatformNote}</p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-text-secondary">{t.webPlatformProject}</dt>
                  <dd className="truncate text-sm text-text">{proyecto ?? t.webPlatformNone}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-text-secondary">{t.webPlatformLastPublication}</dt>
                  <dd className="text-sm text-text">
                    {view.lastWebPublication.kind === "published" ? (
                      formatMoment(view.lastWebPublication.at, view.timezone)
                    ) : (
                      <span className="text-text-secondary">
                        {view.lastWebPublication.kind === "none"
                          ? t.webPlatformLastPublicationNone
                          : es.emptyReasons.error}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-text-secondary">{t.landingSiteNote}</p>
            </div>
            {view.websiteUrl ? (
              <a
                href={view.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-border px-3 py-2 text-sm font-semibold text-cuotly-green hover:bg-soft-surface"
              >
                {t.openSite}
                <Icon name="externalLink" aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </Card>
        {[
          { key: "reservations", title: t.reservationsTitle, icon: "calendar" as const },
          { key: "delivery", title: t.deliveryTitle, icon: "job" as const },
        ].map((plataforma) => (
          <Card key={plataforma.key}>
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary">
                <Icon name={plataforma.icon} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-text">{plataforma.title}</p>
                <p className="text-xs text-text-secondary">{t.externalPlatformNote}</p>
                <p className="mt-2 text-xs text-text-secondary">{t.externalPlatformNone}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
