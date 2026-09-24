import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, NoPermissionState, StatusBadge } from "@/components/ui";
import {
  type IncidentImpact,
  type IncidentKind,
  type IncidentState,
  incidentPriorityFor,
} from "@/core/support";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { priorityTone, stateTone } from "../../../../../administracion/incidencias/tone";
import { SpaceIncidentForms } from "./SpaceIncidentForms";

/**
 * Una incidencia vista desde el espacio (RN-SOP-07): el hilo enseña de qué
 * lado vino cada mensaje —"Cuotly" o "Tu espacio"— y nunca quién de Cuotly
 * lo escribió: esa columna está revocada, y aquí ni se pide.
 */
export const dynamic = "force-dynamic";

export default async function SpaceIncidentDetailPage({
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

  const { data: space } = await supabase
    .from("spaces")
    .select("id, timezone, cuotly_plan")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const t = es.help.incidents;
  const { data: puede } = await supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "contact_cuotly" });
  if (!puede) {
    return (
      <div className="mx-auto max-w-3xl sm:p-8">
        <NoPermissionState title={t.noAccessTitle} description={t.noAccessReason} />
      </div>
    );
  }

  const { data: inc } = await supabase
    .from("incidents")
    .select(
      "id, kind, category, impact, status, status_reason, description, device, app_version, help_query, opened_at, first_platform_response_at, resolved_at, closed_at",
    )
    .eq("id", id)
    .eq("space_id", space.id)
    .maybeSingle();
  if (!inc) notFound();

  // Columnas enumeradas: `author_id`, `actor_id` y `uploaded_by` están revocadas (RN-SOP-07).
  const [{ data: mensajes }, { data: eventos }, { data: adjuntos }] = await Promise.all([
    supabase.from("incident_messages").select("id, author_side, body, created_at").eq("incident_id", id).order("created_at"),
    supabase
      .from("incident_events")
      .select("id, from_status, to_status, actor_side, reason, occurred_at")
      .eq("incident_id", id)
      .order("occurred_at"),
    supabase
      .from("incident_attachments")
      .select("id, name, size_bytes, uploader_side, created_at")
      .eq("incident_id", id)
      .order("created_at"),
  ]);

  const estado = inc.status as IncidentState;
  const prioridad = incidentPriorityFor(inc.kind as IncidentKind, (inc.impact as IncidentImpact | null) ?? null, space.cuotly_plan);
  const cuando = (v: string | null) => (v ? enZona(v, space.timezone, { dateStyle: "short", timeStyle: "short" }) : "—");
  const base = `/espacios/${slug}/ayuda/incidencias`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:p-8">
      <header className="space-y-2">
        <Link href={base} className="text-sm text-cuotly-green underline">
          {t.backToList}
        </Link>
        <h1 className="text-2xl font-bold text-primary-dark">
          {t.detailTitle} · {es.incidents.categories[inc.category as keyof typeof es.incidents.categories] ?? inc.category}
        </h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={stateTone(estado)}>{es.incidents.states[estado]}</StatusBadge>
          <StatusBadge tone={priorityTone(prioridad)}>
            {prioridad === null ? es.incidents.noPriority : es.incidents.priorities[prioridad]}
          </StatusBadge>
          <StatusBadge tone="neutral">{es.incidents.kinds[inc.kind as IncidentKind]}</StatusBadge>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={t.description}>
          <p className="whitespace-pre-wrap text-sm text-text">{inc.description}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-text-secondary">{t.openedAt}</dt>
            <dd>{cuando(inc.opened_at)}</dd>
            {inc.impact ? (
              <>
                <dt className="text-text-secondary">{t.impact}</dt>
                <dd>{es.incidents.impacts[inc.impact as IncidentImpact]}</dd>
              </>
            ) : null}
          </dl>
          {inc.status_reason ? (
            <p className="mt-4 rounded-[10px] bg-soft-surface p-3 text-sm">
              <span className="font-semibold">{t.statusReason}:</span> {inc.status_reason}
            </p>
          ) : null}
          {eventos && eventos.length > 0 ? (
            <ul className="mt-4 space-y-1 text-xs text-text-secondary">
              {eventos.map((e) => (
                <li key={e.id}>
                  {cuando(e.occurred_at)} · {es.incidents.sides[e.actor_side as "space" | "platform"]} ·{" "}
                  {es.incidents.states[e.to_status as IncidentState]}
                  {e.reason ? ` — ${e.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card title={t.thread}>
          {!mensajes || mensajes.length === 0 ? (
            <p className="text-sm text-text-secondary">{t.threadEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {mensajes.map((m) => (
                <li key={m.id} className="rounded-[10px] bg-soft-surface p-3 text-sm">
                  <p className="text-xs text-text-secondary">
                    {m.author_side === "platform" ? t.cuotly : t.you} · {cuando(m.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-text">{m.body}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <p className="text-xs font-semibold text-text-secondary">{t.attachmentsTitle}</p>
            {!adjuntos || adjuntos.length === 0 ? (
              <p className="text-xs text-text-secondary">{t.attachmentsEmpty}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {adjuntos.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/incidencias/adjunto?id=${a.id}`} className="text-cuotly-green underline">
                      {a.name}
                    </a>{" "}
                    <span className="text-xs text-text-secondary">({Math.ceil(a.size_bytes / 1024)} KB)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <SpaceIncidentForms incidentId={inc.id} spaceId={space.id} slug={slug} state={estado} />
          </div>
        </Card>
      </div>
    </div>
  );
}
