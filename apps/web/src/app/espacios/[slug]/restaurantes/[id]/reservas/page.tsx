import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OpenSupportButton } from "@/app/agents/_components/OpenSupportButton";
import { Card, EmptyState, ErrorState, NoPermissionState, PageHeader, StatusBadge } from "@/components/ui";
import { formatCallTime, microsToCents, monthStart } from "@/core/agents/balance";
import { isReservationServiceStatus } from "@/core/app/products";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { enZona, fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadBalancePage } from "@/services/agents/balance-gateway";
import { movementLabel } from "@/services/agents/movement-label";

import { BalanceTeamForms } from "./BalanceTeamForms";

/**
 * La ficha de Reservas de un restaurante, del lado de Restavor (RVR-01; PRD de agents §11.2 y decisión 136: una
 * subruta de la ficha, no una sexta pestaña): el estado del servicio y su historial, el saldo con sus movimientos,
 * «Registrar recarga», «Ajuste» y «Devolver el saldo», lo que ha dado de sí el mes y los incidentes abiertos, y
 * «Abrir como soporte» para quien esté marcado.
 *
 * Lo ve el equipo del espacio (propietario y administradores); las políticas de RLS de cada tabla devuelven cero
 * filas a cualquier otro, así que esta pantalla solo decide qué se pinta. **Nunca enseña datos de comensales**:
 * ni reservas ni llamadas con teléfono, solo cifras (PRD §3.4). Las gestiones con el dinero son de quien tiene
 * `manage_clients`, y el ajuste y la devolución piden además el segundo paso (se comprueba en la base de datos).
 */
export const dynamic = "force-dynamic";

const MINUS = "−";

function signed(cents: number): string {
  if (cents === 0) return formatCentsAsEuros(0);
  return cents > 0 ? `+${formatCentsAsEuros(cents)}` : `${MINUS}${formatCentsAsEuros(-cents)}`;
}

export default async function EstablishmentReservationsPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const supabase = await createClient();
  const t = es.reservationsSpace.sheet;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase.from("spaces").select("id, timezone, reservations_enabled").eq("slug", slug).maybeSingle();
  if (!space || !space.reservations_enabled) notFound();

  const { data: establishment } = await supabase.from("establishments").select("id, name").eq("id", id).eq("space_id", space.id).maybeSingle();
  if (!establishment) notFound();

  const base = `/espacios/${slug}/restaurantes/${id}`;
  const [{ data: canWrite }, assurance, membership, candidates, settings] = await Promise.all([
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_clients" }),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from("space_memberships").select("can_support_reservations").eq("space_id", space.id).eq("user_id", user.id).maybeSingle(),
    supabase.rpc("reservation_support_candidates", { p_query: null }),
    // Todas las columnas se enumeran: esta tabla tiene privilegios de columna (CLAUDE.md).
    supabase
      .from("reservation_settings")
      .select("service_status, activated_at, ending_at, closed_at, data_purged_at")
      .eq("establishment_id", id)
      .maybeSingle(),
  ]);

  if (settings.error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} subtitle={establishment.name} />
        <ErrorState title={t.failedTitle} description={es.reservationsSpace.failedReason} />
      </div>
    );
  }
  if (!settings.data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} subtitle={establishment.name} />
        <EmptyState title={t.notContractedTitle} description={t.notContractedReason} />
        <Link href={base} className="text-sm font-semibold text-cuotly-green underline">
          {t.back}
        </Link>
      </div>
    );
  }

  const status = settings.data.service_status;
  const now = new Date();
  const tz = space.timezone;
  const longDate = (iso: string) => enZona(iso, tz, { day: "numeric", month: "long", year: "numeric" });

  let balance;
  try {
    balance = await loadBalancePage(supabase, id, monthStart(now, tz), 10);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} subtitle={establishment.name} />
        <NoPermissionState description={t.noPermission} />
      </div>
    );
  }

  const [events, incidents] = await Promise.all([
    supabase
      .from("reservation_service_events")
      .select("id, type, created_at")
      .eq("establishment_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("reservation_incidents")
      .select("id, kind, severity, title, detail, created_at")
      .eq("establishment_id", id)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const markedAsSupport = membership.data?.can_support_reservations === true;
  const canOpenSupport = markedAsSupport && (candidates.data ?? []).some((c) => c.establishment_id === id);
  const month = enZona(now.toISOString(), tz, { month: "long" });
  const when = (iso: string) => enZona(iso, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.title} subtitle={establishment.name} />
      <Link href={base} className="inline-flex min-h-11 items-center text-sm font-semibold text-cuotly-green underline">
        {t.back}
      </Link>

      <Card title={t.serviceTitle}>
        <div className="flex flex-wrap items-center gap-3">
          {isReservationServiceStatus(status) ? (
            <StatusBadge tone={status === "active" ? "success" : "warning"}>{es.app.home.agents.status[status]}</StatusBadge>
          ) : null}
          <span className="text-sm text-text-secondary" data-testid="sheet-service-dates">
            {status === "active" || status === "past_due" || status === "paused"
              ? settings.data.activated_at
                ? t.activatedOn(longDate(settings.data.activated_at))
                : null
              : status === "ending" && settings.data.ending_at
                ? t.endingOn(longDate(settings.data.ending_at))
                : status === "closed" && settings.data.closed_at
                  ? t.closedOn(longDate(settings.data.closed_at))
                  : null}
          </span>
        </div>
        {canOpenSupport ? (
          <div className="mt-4">
            <OpenSupportButton establishmentId={id} restaurantName={establishment.name} returnTo={`${base}/reservas`} />
          </div>
        ) : null}
      </Card>

      <Card title={t.eventsTitle}>
        {(events.data ?? []).length === 0 ? (
          <p className="text-sm text-text-secondary">{t.eventsEmpty}</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="sheet-events">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-text">{t.events[e.type] ?? e.type}</span>
                <span className="text-xs text-text-secondary">{fechaCorta(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t.balanceTitle}>
        <p className="text-sm text-text-secondary">{t.balanceNow}</p>
        <p className="text-3xl font-bold text-text" data-testid="sheet-balance">
          {formatCentsAsEuros(balance.balanceCents)}
        </p>
        {balance.minutes !== null ? <p className="mt-1 text-sm text-text-secondary">{es.agents.balance.minutes(balance.minutes)}</p> : null}
        <h3 className="mb-1 mt-5 text-sm font-semibold text-text">{t.thisMonthTitle(month)}</h3>
        <p className="text-sm text-text-secondary" data-testid="sheet-month">
          {balance.spend.calls.count > 0 ? t.callsThisMonth(balance.spend.calls.count, formatCallTime(balance.spend.calls.seconds)) : t.noCalls}
          {" · "}
          {balance.spend.totalCents > 0 ? t.spentThisMonth(formatCentsAsEuros(balance.spend.totalCents)) : t.noSpend}
        </p>
        <p className="mt-1 text-xs text-text-secondary">{t.figuresNote}</p>

        <h3 className="mb-1 mt-5 text-sm font-semibold text-text">{t.movementsTitle}</h3>
        {balance.movements.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.movementsEmpty}</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="sheet-movements">
            {balance.movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-text">{movementLabel(m.kind, m.sourceType)}</span>
                  <span className="block text-xs text-text-secondary">
                    {when(m.createdAt)}
                    {m.note ? ` · ${m.note}` : ""}
                  </span>
                </span>
                <span className="font-semibold text-text">{signed(microsToCents(m.amountMicros))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <BalanceTeamForms
        slug={slug}
        establishmentId={id}
        canWrite={canWrite === true}
        twoFactor={assurance.data?.currentLevel === "aal2"}
        canPayout={status === "ending" || status === "closed"}
      />

      <Card title={t.incidentsTitle}>
        {(incidents.data ?? []).length === 0 ? (
          <p className="text-sm text-text-secondary">{t.incidentsEmpty}</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="sheet-incidents">
            {(incidents.data ?? []).map((i) => (
              <li key={i.id} className="py-2 text-sm">
                <span className="flex items-center gap-2">
                  <StatusBadge tone={i.severity === "error" ? "danger" : "info"}>{t.incidentKinds[i.kind] ?? i.kind}</StatusBadge>
                  <span className="font-semibold text-text">{i.title}</span>
                </span>
                {i.detail ? <span className="mt-1 block text-xs text-text-secondary">{i.detail}</span> : null}
                <span className="block text-xs text-text-secondary">{when(i.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
