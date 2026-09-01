import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { jobTone } from "../page";
import {
  AssignJobForm,
  BlockJobForm,
  PublishJobForm,
  StartJobForm,
  UnblockJobForm,
  type Candidate,
} from "./JobActions";

/**
 * Detalle de un trabajo para el equipo (HU-17 a HU-20).
 *
 * Qué acciones se ofrecen depende del estado, pero eso es presentación: si
 * alguien llamara a `start_job()` sobre un trabajo sin asignar, la función
 * lanza. Aquí no se autoriza nada (CLAUDE.md MUST).
 *
 * Los candidatos y su orden salen de `list_job_candidates()`, que aplica
 * el orden determinista del PRD. No se reordena ni se pondera nada aquí:
 * CLAUDE.md prohíbe inventar la fórmula ponderada.
 */
export const dynamic = "force-dynamic";

type JobStateKey = keyof typeof es.naming.states.job;
type CategoryKey = keyof typeof es.naming.categories;

export default async function TeamJobDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, space_id, code, state, category, assigned_to, establishment_id, request_id, started_at, published_at, correction_window_ends_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: establishment }, { data: request }] = await Promise.all([
    supabase.from("establishments").select("id, name").eq("id", job.establishment_id).maybeSingle(),
    supabase.from("requests").select("id, code, description").eq("id", job.request_id).maybeSingle(),
  ]);

  // Los candidatos solo se piden cuando hacen falta: la función exige
  // permiso de asignación y lanza a quien no lo tenga.
  let candidates: Candidate[] = [];
  if (job.state === "pending_assignment") {
    const { data: rows } = await supabase.rpc("list_job_candidates", { p_job_id: id });
    const ids = (rows ?? []).map((r) => r.worker_id);
    const { data: people } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const name = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));
    candidates = (rows ?? []).map((r) => ({
      workerId: r.worker_id,
      name: name.get(r.worker_id) ?? r.worker_id,
      loadPoints: r.active_load_points,
      jobCount: r.active_job_count,
    }));
  }

  const blocked = job.state === "blocked_by_client" || job.state === "authorized_pause";
  const hasActions =
    job.state === "pending_assignment" ||
    job.state === "assigned" ||
    job.state === "in_progress" ||
    blocked;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">
          {job.code} · {establishment?.name ?? "—"}
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.teamArea.jobs.detailTitle}</h1>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge tone={jobTone(job.state)}>
            {es.naming.states.job[job.state as JobStateKey] ?? job.state}
          </StatusBadge>
          {job.category ? (
            <span className="text-sm text-text-secondary">
              {es.naming.categories[job.category as CategoryKey] ?? job.category}
            </span>
          ) : null}
        </div>
      </header>

      {request ? (
        <Card title={es.teamArea.requests.descriptionColumn}>
          <p className="whitespace-pre-wrap text-text">{request.description}</p>
          <p className="mt-3 text-sm">
            <Link
              href={`/espacios/${slug}/solicitudes/${request.id}`}
              className="text-cuotly-green underline"
            >
              {request.code}
            </Link>
          </p>
        </Card>
      ) : null}

      {job.state === "pending_assignment" ? (
        <AssignJobForm jobId={id} candidates={candidates} />
      ) : null}

      {job.state === "assigned" ? <StartJobForm jobId={id} /> : null}

      {job.state === "in_progress" ? (
        <>
          <PublishJobForm jobId={id} spaceId={job.space_id} />
          <BlockJobForm jobId={id} />
        </>
      ) : null}

      {blocked ? <UnblockJobForm jobId={id} /> : null}

      {hasActions ? null : (
        <Card title={es.teamArea.jobs.noActionTitle}>
          <p className="text-sm text-text-secondary">{es.teamArea.jobs.noActionReason}</p>
        </Card>
      )}
    </main>
  );
}
