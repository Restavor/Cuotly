import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { AcceptRequestButton } from "./AcceptRequestButton";
import { NewRequestForm } from "./NewRequestForm";

/**
 * El restaurante, visto por su cliente (PRD §20.2). Es la pantalla a la
 * que lleva el selector de contexto de HU-02 cuando quien entra no es del
 * equipo de mantenimiento.
 *
 * Todo lo que se ve aquí lo filtra RLS: si esta página pidiera un
 * restaurante ajeno, la base de datos devolvería cero filas y la pantalla
 * sería un 404. No hay ninguna comprobación de permisos escrita en este
 * archivo, y es a propósito — la que vale está en el servidor.
 *
 * `select` enumera columnas siempre: `requests` y compañía tienen
 * privilegios de columna para que el cliente no vea la identidad del
 * equipo, así que `select *` devolvería 403 (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

const SERVICE_STOPPED = ["paused", "suspended", "read_only", "archived"];

type StatusKey = keyof typeof es.space.statuses;
type RequestStateKey = keyof typeof es.naming.states.request;
type CategoryKey = keyof typeof es.naming.categories;

function toneForState(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "published" || state === "closed" || state === "accepted") return "success";
  if (state === "pending_client_acceptance" || state === "needs_information") return "warning";
  if (state.startsWith("cancelled") || state === "rejected") return "danger";
  if (state === "in_progress" || state === "in_correction") return "info";
  return "neutral";
}

export default async function ClientEstablishmentPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, code, status")
    .eq("id", id)
    .maybeSingle();

  if (!establishment) {
    notFound();
  }

  const [{ data: allowance }, { data: requests }] = await Promise.all([
    supabase.rpc("establishment_cycle_allowance", { p_establishment_id: id }),
    supabase
      .from("requests")
      .select("id, code, description, state, created_at, validated_category")
      .eq("establishment_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const rows = requests ?? [];
  const pending = rows.filter((r) => r.state === "pending_client_acceptance");
  const serviceStopped = SERVICE_STOPPED.includes(establishment.status);
  const statusKey = establishment.status as StatusKey;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">{establishment.code}</p>
        <h1 className="text-2xl font-bold text-primary-dark">{establishment.name}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          {es.clientArea.statusLabel}:{" "}
          <StatusBadge tone={serviceStopped ? "warning" : "success"}>
            {es.space.statuses[statusKey] ?? establishment.status}
          </StatusBadge>
        </p>
        <p className="mt-3 text-sm">
          <Link
            href={`/espacios/${slug}/restaurantes/${id}/facturacion`}
            className="text-cuotly-green underline"
          >
            {es.clientArea.billingLink}
          </Link>
        </p>
      </header>

      {serviceStopped ? (
        <Card title={es.clientArea.serviceStoppedTitle}>
          <p className="text-sm text-text-secondary">{es.clientArea.serviceStoppedReason}</p>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <Card title={es.clientArea.acceptTitle}>
          <div className="space-y-4">
            {pending.map((request) => (
              <div key={request.id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-text">{request.description}</p>
                  {request.validated_category ? (
                    <p className="text-sm text-text-secondary">
                      {es.clientArea.acceptCategory(
                        es.naming.categories[request.validated_category as CategoryKey] ??
                          request.validated_category,
                      )}
                    </p>
                  ) : null}
                </div>
                <AcceptRequestButton requestId={request.id} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title={es.clientArea.allowanceTitle}>
        {allowance && allowance.length > 0 ? (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {allowance.map((line) => (
                <li key={line.category} className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs text-text-secondary">
                    {es.naming.categories[line.category as CategoryKey] ?? line.category}
                  </p>
                  <p className="text-lg font-semibold text-primary-dark">
                    {line.remaining}{" "}
                    <span className="text-sm font-normal text-text-secondary">
                      {es.clientArea.allowanceOf(line.included)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-text-secondary">
              {es.clientArea.allowanceRenews(
                new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(
                  new Date(allowance[0].renews_at),
                ),
              )}
            </p>
          </>
        ) : (
          <EmptyState
            title={es.clientArea.allowanceEmptyTitle}
            description={es.clientArea.allowanceEmptyReason}
          />
        )}
      </Card>

      {serviceStopped ? null : <NewRequestForm establishmentId={id} />}

      <Card title={es.clientArea.requestsTitle}>
        {rows.length === 0 ? (
          <EmptyState
            title={es.clientArea.requestsEmptyTitle}
            description={es.clientArea.requestsEmptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.clientArea.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.descriptionColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.dateColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Link
                      href={`/espacios/${slug}/restaurantes/${id}/solicitudes/${request.id}`}
                      className="text-cuotly-green underline"
                    >
                      {request.code}
                    </Link>
                  </TableCell>
                  <TableCell>{request.description}</TableCell>
                  <TableCell>
                    <StatusBadge tone={toneForState(request.state)}>
                      {es.naming.states.request[request.state as RequestStateKey] ?? request.state}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                      new Date(request.created_at),
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </main>
  );
}
