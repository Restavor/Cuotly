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
 * Tablero de trabajos del equipo (HU-16 a HU-23, PRD §20.4).
 *
 * Qué trabajos se ven lo decide RLS: un trabajador ve los suyos y los de
 * sus establecimientos autorizados; propietario y administradores, todos.
 */
export const dynamic = "force-dynamic";

type JobStateKey = keyof typeof es.naming.states.job;
type CategoryKey = keyof typeof es.naming.categories;

export function jobTone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "published" || state === "completed") return "success";
  if (state === "blocked_by_client" || state === "authorized_pause") return "warning";
  // La base no admite un `cancelled` a secas: son los dos de RN-JOB-04,
  // según si se canceló antes o después de Comenzar. Comparar con
  // "cancelled" no acertaba nunca y un trabajo cancelado salía en gris.
  if (state === "cancelled_before_start" || state === "cancelled_after_start") return "danger";
  if (state === "in_progress" || state === "in_correction") return "info";
  if (state === "reassignment_requested") return "warning";
  return "neutral";
}

export default async function TeamJobsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug")
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
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.teamArea.jobs.title}</h1>
        <NoPermissionState />
      </div>
    );
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, code, state, category, assigned_to, establishment_id, created_at")
    .eq("space_id", space.id)
    .order("created_at", { ascending: false });

  const rows = jobs ?? [];

  const [{ data: establishments }, { data: people }] = await Promise.all([
    supabase.from("establishments").select("id, name").eq("space_id", space.id),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const establishmentName = new Map((establishments ?? []).map((e) => [e.id, e.name]));
  const personName = new Map(
    (people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]),
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-primary-dark">{es.teamArea.jobs.title}</h1>
      <p className="mb-6 text-sm text-text-secondary">{es.teamArea.jobs.subtitle}</p>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={es.teamArea.jobs.emptyTitle}
            description={es.teamArea.jobs.emptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.jobs.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.assigneeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.categoryColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Link
                      href={`/espacios/${slug}/trabajos/${job.id}`}
                      className="text-cuotly-green underline"
                    >
                      {job.code}
                    </Link>
                  </TableCell>
                  <TableCell>{establishmentName.get(job.establishment_id) ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={jobTone(job.state)}>
                      {es.naming.states.job[job.state as JobStateKey] ?? job.state}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {job.assigned_to
                      ? (personName.get(job.assigned_to) ?? "—")
                      : es.teamArea.jobs.unassigned}
                  </TableCell>
                  <TableCell>
                    {job.category
                      ? (es.naming.categories[job.category as CategoryKey] ?? job.category)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
