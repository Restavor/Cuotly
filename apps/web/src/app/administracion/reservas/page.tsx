import { Card, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { OpenSupportButton } from "@/app/agents/_components/OpenSupportButton";

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

  return (
    <div className="space-y-6">
      <PageHeader title={t.platformTitle} subtitle={t.sectionBody} />
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
