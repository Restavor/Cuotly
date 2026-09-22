import { notFound, redirect } from "next/navigation";

import {
  ButtonLink,
  Card,
  EmptyState,
  EntityCell,
  ErrorState,
  NoPermissionState,
  PageHeader,
  PersonCell,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { menuTone } from "@/core/menu-states";
import { es } from "@/i18n/es";
import { enZona, fechaCorta } from "@/i18n/dates";
import { createClient } from "@/lib/supabase/server";

import { loadMenuQueue, type MenuQueueRow } from "./queue-load";

/**
 * La cola de Menú Diario del equipo (Fase 2, Hito 11; §20.4, RN-MEN-06/07).
 *
 * Lo que hay que publicar, por fecha objetivo y hora de corte, con la
 * garantía y "pasada de hora" (§62) calculadas por el servidor y por
 * `src/core/daily-menu.ts`. Qué filas ve cada cual lo decide
 * `team_menu_queue()` con las mismas funciones que RLS: un trabajador ve
 * los menús de sus restaurantes autorizados; quién está asignado, solo
 * quien gestiona o el propio asignado (RN-ASG-17).
 */
export const dynamic = "force-dynamic";

const t = es.dailyMenuTeam;

type MenuKindKey = keyof typeof es.naming.menuKinds;

function horaLocal(iso: string, timeZone: string): string {
  return enZona(iso, timeZone, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TeamDailyMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: membership } = await supabase
    .from("space_memberships")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState />
      </div>
    );
  }

  const queue = await loadMenuQueue(supabase, space.id, space.timezone);

  const assigneeIds = [...new Set((queue.rows ?? []).map((r) => r.assignedTo).filter((id): id is string => id !== null))];
  const { data: people } = assigneeIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", assigneeIds)
    : { data: [] };
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));

  const base = `/espacios/${slug}/menu-diario`;

  return (
    <div className="space-y-6">
      {/*
        Página 70 (M12) · título y subtítulo, y la cola como tabla:
        restaurante, menú, fecha objetivo y corte, responsable, estado y
        "Ver detalle". El "Programar menú" del dibujo no va: la publicación
        la pide el restaurante (RN-MEN-06) y el equipo la publica desde el
        detalle. Las pestañas Pendientes / Programados / Publicados tampoco:
        esta cola es lo pendiente, que es lo que el equipo tiene que hacer;
        lo publicado se ve en el historial de cada restaurante.
      */}
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <Card title={t.queueTitle}>
        {queue.rows === null ? (
          <ErrorState />
        ) : !queue.offered && queue.rows.length === 0 ? (
          <EmptyState title={t.noServiceTitle} description={t.noServiceReason} />
        ) : queue.rows.length === 0 ? (
          <EmptyState title={t.queueEmptyTitle} description={t.queueEmptyReason} />
        ) : (
          <Table
            footer={
              <TableFooter>
                <span>{t.orderHint}</span>
              </TableFooter>
            }
          >
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{t.menuColumn}</TableHeaderCell>
                <TableHeaderCell>{t.dateColumn}</TableHeaderCell>
                <TableHeaderCell>{t.cutoffColumn}</TableHeaderCell>
                <TableHeaderCell>{t.assigneeColumn}</TableHeaderCell>
                <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.ui.table.view}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {queue.rows.map((row) => (
                <QueueRow key={row.menuId} row={row} base={base} timeZone={space.timezone} assignee={personName} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function QueueRow({
  row,
  base,
  timeZone,
  assignee,
}: {
  row: MenuQueueRow;
  base: string;
  timeZone: string;
  assignee: Map<string, string>;
}) {
  const asignado = row.assignedTo ? (assignee.get(row.assignedTo) ?? null) : null;

  return (
    <TableRow>
      <TableCell>
        <span className="font-semibold">{row.establishmentName}</span>
      </TableCell>
      <TableCell>
        <EntityCell
          title={row.name}
          subtitle={es.naming.menuKinds[row.kind as MenuKindKey] ?? row.kind}
        />
      </TableCell>
      <TableCell>
        <span className="whitespace-nowrap">{fechaCorta(row.targetDate)}</span>
      </TableCell>
      <TableCell>
        <span className="whitespace-nowrap">{horaLocal(row.cutoffAt, timeZone)}</span>
      </TableCell>
      <TableCell>
        {asignado !== null ? (
          <PersonCell name={asignado} />
        ) : (
          <span className="text-text-secondary">
            {row.isAssigned ? t.assignedToSomeone : t.unassigned}
          </span>
        )}
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={menuTone(row.state)}>{es.naming.states.menu[row.state]}</StatusBadge>
          {row.pendingCorrections > 0 ? (
            <StatusBadge tone="warning">{t.correctionsPending(row.pendingCorrections)}</StatusBadge>
          ) : null}
          {row.overdue ? (
            <StatusBadge tone="danger">{t.overdueShort}</StatusBadge>
          ) : row.guaranteed === true ? (
            <StatusBadge tone="info">{t.guaranteedShort}</StatusBadge>
          ) : row.guaranteed === false ? (
            <StatusBadge tone="neutral">{t.notGuaranteedShort}</StatusBadge>
          ) : null}
        </span>
      </TableCell>
      <TableCell>
        <ButtonLink href={`${base}/${row.menuId}`} variant="outline" size="sm">
          {es.ui.table.viewDetail}
        </ButtonLink>
      </TableCell>
    </TableRow>
  );
}
