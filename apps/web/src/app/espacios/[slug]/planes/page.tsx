import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { commitmentIsCurrent } from "@/core/plans";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * HU-07 · "asignar un plan y servicios a un establecimiento y ver su ciclo
 * de consumo vigente". Es el destino "Planes" del menú (§20.2), que hasta
 * hoy devolvía 404 aunque el servidor entero llevara desde la migración 40
 * sabiendo cambiar de plan.
 *
 * Esta es la lista: qué tiene contratado cada restaurante y cuándo renueva.
 * Las acciones —asignar, cambiar, programar, contratar— viven en la ficha
 * de cada uno, que es donde hay contexto suficiente para no equivocarse de
 * restaurante al cobrar una diferencia.
 *
 * Qué filas se ven lo decide RLS, no esta página: `subscriptions`,
 * `plan_commitments` y `consumption_cycles` filtran por pertenencia al
 * espacio. Un cliente no es miembro del espacio y no llega aquí.
 */
export const dynamic = "force-dynamic";

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function dia(instant: string | null): string {
  return instant === null ? "—" : instant.slice(0, 10);
}

export default async function PlansPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.plansPage.title}</h1>
        <NoPermissionState
          title={es.plansPage.noAccessTitle}
          description={es.plansPage.noAccessReason}
        />
      </div>
    );
  }

  // `plan_commitments` tiene privilegios de columna (migración 40): aquí y
  // en todo el proyecto sus columnas se enumeran, porque `select *` sobre
  // esa tabla devuelve 403.
  const [{ data: establishments }, { data: subscriptions }, { data: commitments }, { data: cycles }] =
    await Promise.all([
      supabase
        .from("establishments")
        .select("id, name, code")
        .eq("space_id", space.id)
        .order("name", { ascending: true }),
      supabase
        .from("subscriptions")
        .select("id, establishment_id, kind, status, plans (name, price_cents), services (name)")
        .eq("space_id", space.id)
        .eq("status", "active"),
      supabase
        .from("plan_commitments")
        .select("subscription_id, ends_at")
        .eq("space_id", space.id)
        .order("started_at", { ascending: false }),
      supabase
        .from("consumption_cycles")
        .select("subscription_id, cycle_end")
        .eq("space_id", space.id)
        .order("cycle_start", { ascending: false }),
    ]);

  const ahora = new Date();
  const activas = subscriptions ?? [];

  // La permanencia vigente es la de `started_at` más reciente (el libro es
  // inmutable: nunca se actualiza una fila, se añade otra).
  const permanenciaPorSuscripcion = new Map<string, string>();
  for (const fila of commitments ?? []) {
    if (!permanenciaPorSuscripcion.has(fila.subscription_id)) {
      permanenciaPorSuscripcion.set(fila.subscription_id, fila.ends_at);
    }
  }

  const cicloPorSuscripcion = new Map<string, string>();
  for (const fila of cycles ?? []) {
    if (!cicloPorSuscripcion.has(fila.subscription_id)) {
      cicloPorSuscripcion.set(fila.subscription_id, fila.cycle_end);
    }
  }

  const filas = (establishments ?? []).map((establishment) => {
    const suyas = activas.filter((s) => s.establishment_id === establishment.id);
    const plan = suyas.find((s) => s.kind === "plan");
    const servicios = suyas.filter((s) => s.kind === "service");
    const permanencia = plan ? (permanenciaPorSuscripcion.get(plan.id) ?? null) : null;

    return {
      id: establishment.id,
      name: establishment.name,
      code: establishment.code,
      planName: plan?.plans?.name ?? null,
      planPriceCents: plan?.plans?.price_cents ?? null,
      services: servicios.map((s) => s.services?.name).filter((n): n is string => Boolean(n)),
      commitmentEndsAt: permanencia,
      commitmentCurrent: commitmentIsCurrent(ahora, permanencia === null ? null : new Date(permanencia)),
      renewsAt: plan ? (cicloPorSuscripcion.get(plan.id) ?? null) : null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.plansPage.title}</h1>
        <p className="text-sm text-text-secondary">{es.plansPage.subtitle}</p>
      </header>

      <Card>
        {filas.length === 0 ? (
          <EmptyState title={es.plansPage.emptyTitle} description={es.plansPage.emptyReason} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.plansPage.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.plansPage.planColumn}</TableHeaderCell>
                <TableHeaderCell>{es.plansPage.servicesColumn}</TableHeaderCell>
                <TableHeaderCell>{es.plansPage.commitmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.plansPage.renewsColumn}</TableHeaderCell>
                <TableHeaderCell>{es.plansPage.manageLink}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.map((fila) => (
                <TableRow key={fila.id}>
                  <TableCell>
                    {fila.name} · {fila.code}
                  </TableCell>
                  <TableCell>
                    {fila.planName === null ? (
                      // P6 · no tener plan es un dato, no un hueco.
                      <span className="text-text-secondary">{es.plansPage.noPlan}</span>
                    ) : (
                      `${fila.planName} · ${euros(fila.planPriceCents ?? 0)}`
                    )}
                  </TableCell>
                  <TableCell>
                    {fila.services.length === 0 ? es.plansPage.noServices : fila.services.join(" · ")}
                  </TableCell>
                  <TableCell>
                    {fila.commitmentEndsAt === null
                      ? es.plansPage.noCommitment
                      : fila.commitmentCurrent
                        ? `${es.plansPage.commitmentUntil} ${dia(fila.commitmentEndsAt)}`
                        : es.plansPage.commitmentOver}
                  </TableCell>
                  <TableCell>
                    {fila.renewsAt === null ? es.plansPage.noCycle : dia(fila.renewsAt)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/espacios/${slug}/planes/${fila.id}`}
                      className="text-cuotly-green underline"
                    >
                      {es.plansPage.manageLink}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <p className="text-sm text-text-secondary">{es.plansPage.noPlanHint}</p>
      </Card>
    </div>
  );
}
