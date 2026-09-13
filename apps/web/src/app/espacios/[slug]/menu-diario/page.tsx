import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, ErrorState, NoPermissionState, StatusBadge } from "@/components/ui";
import { menuTone } from "@/core/menu-states";
import { es } from "@/i18n/es";
import { fechaCorta } from "@/i18n/dates";
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
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
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
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.title}</h1>
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
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <Card title={t.queueTitle}>
        {queue.rows === null ? (
          <ErrorState />
        ) : !queue.offered && queue.rows.length === 0 ? (
          <EmptyState title={t.noServiceTitle} description={t.noServiceReason} />
        ) : queue.rows.length === 0 ? (
          <EmptyState title={t.queueEmptyTitle} description={t.queueEmptyReason} />
        ) : (
          <>
            <p className="mb-3 text-sm text-text-secondary">{t.orderHint}</p>
            <ul className="divide-y divide-border">
              {queue.rows.map((row) => (
                <QueueRow key={row.menuId} row={row} base={base} timeZone={space.timezone} assignee={personName} />
              ))}
            </ul>
          </>
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
  const asignado = row.assignedTo
    ? (assignee.get(row.assignedTo) ?? t.assignedToSomeone)
    : row.isAssigned
      ? t.assignedToSomeone
      : t.unassigned;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 space-y-1">
        <Link href={`${base}/${row.menuId}`} className="font-medium text-primary underline-offset-2 hover:underline">
          {row.name}
        </Link>
        <p className="text-sm text-text-secondary">
          {t.detailSubtitle(
            row.establishmentName,
            es.naming.menuKinds[row.kind as MenuKindKey] ?? row.kind,
            fechaCorta(row.targetDate),
          )}
        </p>
        <p className="text-sm text-text-secondary">
          {t.cutoffColumn}: {horaLocal(row.cutoffAt, timeZone)} · {t.assigneeColumn}: {asignado}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
        <StatusBadge tone={menuTone(row.state)}>{es.naming.states.menu[row.state]}</StatusBadge>
      </div>
    </li>
  );
}
