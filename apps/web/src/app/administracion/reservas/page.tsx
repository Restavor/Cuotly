import { Card, EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import { formatMicrosAsEuros } from "@/core/agents/balance";
import { localDateOf } from "@/core/reservations/dates";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { listMessagingRates, listReservationsSpaces } from "@/services/agents/platform-reservations-gateway";
import { stripeStatus } from "@/services/agents/stripe";

import { OpenSupportButton } from "@/app/agents/_components/OpenSupportButton";
import { MessagingRateForm, ReservationsEnabledForm } from "./_components/PlatformReservationsForms";

/**
 * Administración › Reservas (soporte) (PRD de agents §11.3): «Abrir Reservas como soporte» para quien tenga
 * `platform_roles.can_support` (o sea el propietario de la plataforma), con el segundo paso hecho. Busca un restaurante
 * con Reservas y abre su sesión de soporte, con motivo. Lo comprueba `open_reservation_support_session()`; esto solo
 * lista lo que esa función dejaría abrir (`reservation_support_candidates()`).
 */
export const dynamic = "force-dynamic";

export default async function AdminReservationsSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().slice(0, 80);
  const t = es.agents.support;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reservation_support_candidates", { p_query: query === "" ? null : query });

  // Lo de Reservas que solo decide la plataforma (§11.3): los espacios que la ofrecen, Stripe y las tarifas. Si una
  // lectura falla se dice; no se pinta una lista vacía como si no hubiera nada.
  const p = es.agents.platform;
  const [spaces, rates] = await Promise.all([
    listReservationsSpaces(supabase).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    ),
    listMessagingRates(supabase).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    ),
  ]);
  const stripe = stripeStatus();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";
  const today = localDateOf(new Date(), CUOTLY_TIMEZONE);

  return (
    <div className="space-y-6">
      <PageHeader title={t.platformTitle} subtitle={t.sectionBody} />

      <Card title={p.spacesTitle}>
        <p className="mb-3 text-sm text-text-secondary">{p.spacesHelp}</p>
        {!spaces.ok ? (
          <ErrorState title={es.platformAdmin.loadErrorTitle} description={es.reservationsSpace.failedReason} />
        ) : spaces.value.length === 0 ? (
          <EmptyState title={p.spacesEmpty} description={p.spacesHelp} />
        ) : (
          <ul className="divide-y divide-border" data-testid="platform-spaces">
            {spaces.value.map((space) => (
              <li key={space.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">{space.name}</span>
                <StatusBadge tone={space.reservationsEnabled ? "success" : "neutral"}>{space.reservationsEnabled ? p.on : p.off}</StatusBadge>
                <ReservationsEnabledForm spaceId={space.id} enabled={space.reservationsEnabled} spaceName={space.name} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={p.stripeTitle}>
        <div data-testid="stripe-status">
          {stripe.ready ? (
            <StatusBadge tone="success">{p.stripeReady(p.stripeModes[stripe.mode ?? "test"])}</StatusBadge>
          ) : (
            <>
              <StatusBadge tone="info">{p.stripeNotReady}</StatusBadge>
              <p className="mt-2 text-sm text-text-secondary">
                {p.stripeMissingLine(p.stripeMissing(stripe.hasSecretKey && stripe.mode !== null, stripe.hasWebhookSecret))}
              </p>
            </>
          )}
          {site ? <p className="mt-2 text-xs text-text-secondary">{p.stripeWebhook(`${site}/api/agents/webhooks/stripe`)}</p> : null}
          <p className="mt-1 text-xs text-text-secondary">{p.stripeNeverShown}</p>
        </div>
      </Card>

      <Card title={p.ratesTitle}>
        <p className="mb-3 text-sm text-text-secondary">{p.ratesHelp}</p>
        {!rates.ok ? (
          <ErrorState title={es.platformAdmin.loadErrorTitle} description={es.reservationsSpace.failedReason} />
        ) : rates.value.length === 0 ? (
          <p className="mb-4 text-sm text-text-secondary" data-testid="rates-empty">
            {p.ratesEmpty}
          </p>
        ) : (
          <ul className="mb-4 divide-y divide-border" data-testid="rates-list">
            {rates.value.map((rate) => (
              <li key={rate.id} className="py-2 text-sm text-text">
                {p.rateRow(p.channels[rate.channel], rate.country, formatMicrosAsEuros(rate.priceMicros), enZona(`${rate.validFrom}T12:00:00Z`, CUOTLY_TIMEZONE, { dateStyle: "short" }))}
              </li>
            ))}
          </ul>
        )}
        <MessagingRateForm today={today} />
      </Card>

      <form method="get" className="flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          aria-label={t.platformSearch}
          placeholder={t.platformSearch}
          maxLength={80}
          className="min-h-11 w-full rounded-field border border-border bg-surface px-3.5 text-[15px] text-text outline-none focus:border-cuotly-green"
        />
        <button
          type="submit"
          className="min-h-11 shrink-0 rounded-field border border-border bg-surface px-4 text-sm font-semibold hover:bg-soft-surface"
        >
          {es.search.title}
        </button>
      </form>

      {error ? (
        <ErrorState title={es.platformAdmin.loadErrorTitle} description={error.message} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title={t.platformEmpty} description={t.noneMarked} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(data ?? []).map((c) => (
              <li key={c.establishment_id} className="flex flex-wrap items-center gap-3 py-3" data-testid="support-candidate">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-text">{c.name}</span>
                  <span className="block text-xs text-text-secondary">{c.city ?? ""}</span>
                </span>
                <OpenSupportButton establishmentId={c.establishment_id} restaurantName={c.name} returnTo="/administracion/reservas" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
