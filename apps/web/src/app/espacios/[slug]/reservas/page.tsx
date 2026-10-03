import { randomUUID } from "node:crypto";
import Link from "next/link";

import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, ErrorState, NoPermissionState, PageHeader, StatusBadge } from "@/components/ui";
import { hasDebt, type PaymentInfo } from "@/core/agents/payment-info";
import { isReservationServiceStatus } from "@/core/app/products";
import { daysLeftToDownload } from "@/core/reservations/lifecycle";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { enZona, fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadPaymentInfo } from "@/services/agents/billing-gateway";

import { OpenSupportButton } from "@/app/agents/_components/OpenSupportButton";
import { PaymentDetailsForm } from "./_components/PaymentDetailsForm";
import { RequestDecision } from "./_components/RequestDecision";
import { ServiceActions } from "./_components/ServiceActions";
import { NewReservationRequestForm } from "./NewReservationRequestForm";

/**
 * Reservas en el espacio (PRD de agents §11.2, APP-04): las solicitudes de
 * contratación de los restaurantes y los que ya tienen Reservas. Solo en los
 * espacios que ofrecen Reservas (`spaces.reservations_enabled`).
 *
 * Fase A: «Crear solicitud para este restaurante». Fase E (COB-01 y COB-02): aprobar y rechazar (con
 * motivo), los datos para pagar de cada restaurante con su enlace a Finanzas (donde se registra el pago),
 * dar de baja, cerrar a mano y reactivar, y los datos de pago de Reservas (decisión 132).
 *
 * Quién ve esto lo deciden las políticas de RLS de las tres tablas y quién crea,
 * `create_reservation_request_on_behalf()`; la comprobación de aquí solo evita
 * enseñar un formulario que va a fallar (CLAUDE.md: no es el control).
 */
export const dynamic = "force-dynamic";

export default async function SpaceReservationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const t = es.reservationsSpace;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, timezone, reservations_enabled, payment_iban, payment_bizum_phone, payment_note")
    .eq("slug", slug)
    .maybeSingle();
  if (!space || !space.reservations_enabled) notFound();

  const { data: puede } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_clients",
  });
  if (!puede) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState description={t.noPermissionReason} />
      </div>
    );
  }

  // Solo el propietario del espacio cambia los datos de pago (decisión 132).
  const { data: esPropietario } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_space",
  });

  // Todas las columnas se enumeran: estas tablas tienen privilegios de columna (CLAUDE.md).
  const [requests, settings, establishments, membership, candidates] = await Promise.all([
    supabase
      .from("reservation_service_requests")
      .select("id, establishment_id, status, rejection_reason, terms_accepted_at, created_at")
      .eq("space_id", space.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reservation_settings")
      .select("establishment_id, service_status, activated_at, ending_at, closed_at, data_purged_at, created_at")
      .eq("space_id", space.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("establishments")
      .select("id, name")
      .eq("space_id", space.id)
      .neq("status", "archived")
      .order("name"),
    // Fase D (PRD de agents §3.4): ¿estás marcado como soporte de Reservas en este espacio?
    supabase
      .from("space_memberships")
      .select("can_support_reservations")
      .eq("space_id", space.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    // Los restaurantes de este espacio que se pueden abrir como soporte (solo si estás marcado).
    supabase.rpc("reservation_support_candidates", { p_query: null }),
  ]);

  if (requests.error || settings.error || establishments.error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} subtitle={t.subtitle} />
        <ErrorState title={t.failedTitle} description={t.failedReason} />
      </div>
    );
  }

  const marcadoComoSoporte = membership.data?.can_support_reservations === true;
  const abribles = (candidates.data ?? []).filter((c) => c.space_slug === slug);
  const nombre = new Map((establishments.data ?? []).map((e) => [e.id, e.name]));
  const solicitudes = requests.data ?? [];
  // Las cerradas siguen a la vista mientras se pueden descargar o reactivar (30 días); después, ya no.
  const contratadas = (settings.data ?? []).filter((s) => s.service_status !== "closed" || s.data_purged_at === null);
  // Reservas abiertas con deuda no se cuentan para «ya tiene Reservas»: una cerrada sí puede volver a pedirla.
  const enMarcha = (settings.data ?? []).filter((s) => s.service_status !== "closed");

  // Lo que debe cada restaurante, para enseñarlo y llevar a registrar el pago (se registra en Finanzas, que ya existe).
  const deudas = new Map<string, PaymentInfo>();
  await Promise.all(
    contratadas
      .filter((s) => s.service_status !== "closed")
      .map(async (s) => {
        try {
          const info = await loadPaymentInfo(supabase, s.establishment_id);
          if (info && hasDebt(info)) deudas.set(s.establishment_id, info);
        } catch {
          // Sin el dato no se enseña deuda: no se inventa ni un cero.
        }
      }),
  );

  // El apunte "requested" dice si la creó el equipo en nombre del restaurante
  // (su `data.on_behalf`): quién fue es identidad del equipo y no se lee.
  const ids = solicitudes.map((s) => s.id);
  const apuntes = ids.length
    ? await supabase
        .from("reservation_service_events")
        .select("request_id, data")
        .in("request_id", ids)
        .eq("type", "requested")
    : { data: [] };
  const enSuNombre = new Set(
    (apuntes.data ?? [])
      .filter((a) => (a.data as { on_behalf?: boolean } | null)?.on_behalf === true)
      .map((a) => a.request_id),
  );

  // A quién se le puede crear una: sin Reservas en marcha ni solicitud abierta.
  const ocupados = new Set<string>([
    ...enMarcha.map((s) => s.establishment_id),
    ...solicitudes.filter((s) => s.status === "requested").map((s) => s.establishment_id),
  ]);
  const candidatos = (establishments.data ?? []).filter((e) => !ocupados.has(e.id));

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <Card title={t.create.title}>
        <p className="mb-3 text-sm text-text-secondary">{t.create.body}</p>
        {candidatos.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.create.nobody}</p>
        ) : (
          <NewReservationRequestForm
            slug={slug}
            candidates={candidatos}
            idempotencyKey={randomUUID()}
          />
        )}
      </Card>

      <Card title={t.requests.title}>
        {solicitudes.length === 0 ? (
          <EmptyState title={t.requests.emptyTitle} description={t.requests.emptyReason} />
        ) : (
          <ul className="divide-y divide-border">
            {solicitudes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-text">
                    {nombre.get(s.establishment_id) ?? t.requests.unknownRestaurant}
                  </span>
                  <span className="block text-xs text-text-secondary">
                    {t.requests.sentOn(fechaCorta(s.created_at))}
                    {" · "}
                    {s.terms_accepted_at === null ? t.requests.notAccepted : t.requests.accepted}
                    {enSuNombre.has(s.id) ? ` · ${t.requests.onBehalf}` : ""}
                  </span>
                  {s.status === "rejected" && s.rejection_reason ? (
                    <span className="block text-xs text-text-secondary">{s.rejection_reason}</span>
                  ) : null}
                </span>
                <StatusBadge
                  tone={s.status === "approved" ? "success" : s.status === "rejected" ? "danger" : "info"}
                >
                  {t.requests.status[s.status as "requested" | "approved" | "rejected"] ?? s.status}
                </StatusBadge>
                {s.status === "requested" ? <RequestDecision slug={slug} requestId={s.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={es.agents.support.sectionTitle}>
        <p className="mb-3 text-sm text-text-secondary">{es.agents.support.sectionBody}</p>
        {!marcadoComoSoporte ? (
          <p className="text-sm text-text-secondary" data-testid="support-not-marked">
            {es.agents.support.noneMarked}
          </p>
        ) : abribles.length === 0 ? (
          <EmptyState title={t.running.emptyTitle} description={t.running.emptyReason} />
        ) : (
          <ul className="divide-y divide-border">
            {abribles.map((c) => (
              <li key={c.establishment_id} className="flex flex-wrap items-center gap-3 py-3" data-testid="support-candidate">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">{c.name}</span>
                <OpenSupportButton establishmentId={c.establishment_id} restaurantName={c.name} returnTo={`/espacios/${slug}/reservas`} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PaymentDetailsForm
        slug={slug}
        spaceId={space.id}
        initial={{ iban: space.payment_iban, bizumPhone: space.payment_bizum_phone, note: space.payment_note }}
        canEdit={esPropietario === true}
      />

      <Card title={t.running.title}>
        {contratadas.length === 0 ? (
          <EmptyState title={t.running.emptyTitle} description={t.running.emptyReason} />
        ) : (
          <ul className="divide-y divide-border">
            {contratadas.map((s) => {
              const deuda = deudas.get(s.establishment_id);
              return (
                <li key={s.establishment_id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`running-${s.establishment_id}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-text">
                      {nombre.get(s.establishment_id) ?? t.requests.unknownRestaurant}
                    </span>
                    {deuda ? (
                      <span className="block text-xs text-text-secondary" data-testid={`debt-${s.establishment_id}`}>
                        {t.running.pending(
                          formatCentsAsEuros(deuda.outstandingCents),
                          enZona(deuda.dueAt, space.timezone, { day: "numeric", month: "long", year: "numeric" }),
                        )}
                      </span>
                    ) : null}
                    {s.service_status === "ending" && s.ending_at ? (
                      <span className="block text-xs text-text-secondary">
                        {t.running.endingOn(enZona(s.ending_at, space.timezone, { day: "numeric", month: "long", year: "numeric" }))}
                      </span>
                    ) : null}
                    {s.service_status === "closed" ? (
                      <span className="block text-xs text-text-secondary">
                        {s.data_purged_at !== null || s.closed_at === null
                          ? t.running.closedPurged
                          : t.running.closedUntil(daysLeftToDownload(new Date(s.closed_at), new Date()))}
                      </span>
                    ) : null}
                  </span>
                  {isReservationServiceStatus(s.service_status) ? (
                    <StatusBadge tone={s.service_status === "active" ? "success" : "warning"}>
                      {es.app.home.agents.status[s.service_status]}
                    </StatusBadge>
                  ) : null}
                  {deuda ? (
                    <Link href={`/espacios/${slug}/finanzas/cobros/${deuda.chargeId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-cuotly-green underline">
                      {t.running.registerPayment}
                    </Link>
                  ) : null}
                  <ServiceActions
                    slug={slug}
                    establishmentId={s.establishment_id}
                    status={s.service_status}
                    endingAt={s.ending_at}
                    closedAt={s.closed_at}
                    dataPurged={s.data_purged_at !== null}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
