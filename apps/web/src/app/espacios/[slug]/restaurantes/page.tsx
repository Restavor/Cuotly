import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
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

/**
 * Los restaurantes del espacio, para el equipo. Es el destino
 * "Restaurantes" del menú (§20.2), que hasta ahora no existía, y la
 * puerta de entrada al libro de consumos de HU-25.
 *
 * No es la ficha del PRD §15.2 —cinco pestañas, datos fiscales, notas
 * internas—: eso sigue pendiente y se dice en voz alta en la pantalla en
 * vez de simularlo (CLAUDE.md MUST NOT: nada de rellenos).
 *
 * Qué filas se ven lo decide RLS sobre `establishments`, no esta página:
 * un trabajador ve los que tenga autorizados y un cliente los suyos.
 */
export const dynamic = "force-dynamic";

type StatusKey = keyof typeof es.space.statuses;

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "suspended" || status === "archived") return "danger";
  if (status === "paused" || status === "ending" || status === "read_only") return "warning";
  return "neutral";
}

export default async function TeamEstablishmentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">
          {es.teamArea.establishments.title}
        </h1>
        <NoPermissionState
          title={es.teamArea.ledger.noAccessTitle}
          description={es.teamArea.ledger.noAccessReason}
        />
      </div>
    );
  }

  const { data: establishments } = await supabase
    .from("establishments")
    .select("id, name, code, status")
    .eq("space_id", space.id)
    .order("name", { ascending: true });

  const rows = establishments ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">
          {es.teamArea.establishments.title}
        </h1>
        <p className="text-sm text-text-secondary">{es.teamArea.establishments.subtitle}</p>
      </header>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={es.teamArea.establishments.emptyTitle}
            description={es.teamArea.establishments.emptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.establishments.nameColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.establishments.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.establishments.statusColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.establishments.ledgerLink}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((establishment) => (
                <TableRow key={establishment.id}>
                  <TableCell>{establishment.name}</TableCell>
                  <TableCell>{establishment.code}</TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(establishment.status)}>
                      {es.space.statuses[establishment.status as StatusKey] ?? establishment.status}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/espacios/${slug}/restaurantes/${establishment.id}/consumos`}
                      className="text-cuotly-green underline"
                    >
                      {es.teamArea.establishments.ledgerLink}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/*
        P6 · lo que falta se nombra, no se disimula. La ficha completa del
        PRD §15.2 no está construida todavía.
      */}
      <Card title={es.teamArea.establishments.pendingSheetTitle}>
        <p className="text-sm text-text-secondary">
          {es.teamArea.establishments.pendingSheetReason}
        </p>
      </Card>
    </div>
  );
}
