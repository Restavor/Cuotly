import { randomUUID } from "node:crypto";

import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, ErrorState, NoPermissionState, PageHeader, StatusBadge } from "@/components/ui";
import { isReservationServiceStatus } from "@/core/app/products";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { NewReservationRequestForm } from "./NewReservationRequestForm";

/**
 * Reservas en el espacio (PRD de agents §11.2, APP-04): las solicitudes de
 * contratación de los restaurantes y los que ya tienen Reservas. Solo en los
 * espacios que ofrecen Reservas (`spaces.reservations_enabled`).
 *
 * En esta fase la lista **solo muestra** y permite «Crear solicitud para este
 * restaurante». Aprobar y rechazar (con motivo) son de la Fase E, y la pantalla
 * lo dice en vez de pintar botones que no hacen nada.
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
    .select("id, reservations_enabled")
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

  // Todas las columnas se enumeran: estas tablas tienen privilegios de columna (CLAUDE.md).
  const [requests, settings, establishments] = await Promise.all([
    supabase
      .from("reservation_service_requests")
      .select("id, establishment_id, status, rejection_reason, terms_accepted_at, created_at")
      .eq("space_id", space.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reservation_settings")
      .select("establishment_id, service_status, activated_at, created_at")
      .eq("space_id", space.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("establishments")
      .select("id, name")
      .eq("space_id", space.id)
      .neq("status", "archived")
      .order("name"),
  ]);

  if (requests.error || settings.error || establishments.error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} subtitle={t.subtitle} />
        <ErrorState title={t.failedTitle} description={t.failedReason} />
      </div>
    );
  }

  const nombre = new Map((establishments.data ?? []).map((e) => [e.id, e.name]));
  const solicitudes = requests.data ?? [];
  const contratadas = (settings.data ?? []).filter((s) => s.service_status !== "closed");

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
    ...contratadas.map((s) => s.establishment_id),
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
              </li>
            ))}
          </ul>
        )}
        {/* Sin botones que no hacen nada: aprobar y rechazar llegan con la Fase E. */}
        <p className="mt-4 text-sm text-text-secondary">{t.requests.decideLater}</p>
      </Card>

      <Card title={t.running.title}>
        {contratadas.length === 0 ? (
          <EmptyState title={t.running.emptyTitle} description={t.running.emptyReason} />
        ) : (
          <ul className="divide-y divide-border">
            {contratadas.map((s) => (
              <li key={s.establishment_id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">
                  {nombre.get(s.establishment_id) ?? t.requests.unknownRestaurant}
                </span>
                {isReservationServiceStatus(s.service_status) ? (
                  <StatusBadge tone={s.service_status === "active" ? "success" : "warning"}>
                    {es.app.home.agents.status[s.service_status]}
                  </StatusBadge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
