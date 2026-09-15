import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, ErrorState, StatusBadge } from "@/components/ui";
import { CLIENT_CONTEXT_KEYS, type IncidentPriority, isIncidentState } from "@/core/support";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { platformIncident, platformIncidentMessages } from "@/services/support-gateway";

import { priorityTone, stateTone } from "../tone";
import { IncidentForms } from "./IncidentForms";

/**
 * Una incidencia vista desde Cuotly (RN-SOP-07): todo lo que el espacio
 * escribió, el contexto técnico que se recogió, el hilo con quién escribió
 * cada mensaje —Cuotly sí lo ve— y los botones que la tabla de
 * transiciones permite.
 */
export const dynamic = "force-dynamic";

function cuando(value: string | null): string {
  return value === null ? "—" : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" });
}

export default async function AdminIncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let row;
  let mensajes;
  try {
    row = await platformIncident(supabase, id);
    if (row === null) notFound();
    mensajes = await platformIncidentMessages(supabase, id);
  } catch (fallo) {
    if (fallo instanceof Error && fallo.message === "NEXT_NOT_FOUND") throw fallo;
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }
  if (row === null) notFound();

  // Columnas enumeradas: `incident_attachments` tiene `uploaded_by` revocada.
  const { data: adjuntos } = await supabase
    .from("incident_attachments")
    .select("id, name, content_type, size_bytes, uploader_side, created_at")
    .eq("incident_id", id)
    .order("created_at");

  const t = es.platformAdmin.incidents;
  const estado = isIncidentState(row.status) ? row.status : null;
  const contexto = CLIENT_CONTEXT_KEYS.map((k) => [k, row.client_context[k]] as const).filter(([, v]) => v);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/administracion/incidencias" className="text-sm text-cuotly-green underline">
          {t.backToList}
        </Link>
        <h1 className="text-2xl font-bold text-primary-dark">
          {t.detailTitle} · {row.space_name}
        </h1>
        <div className="flex flex-wrap gap-2">
          {estado ? <StatusBadge tone={stateTone(estado)}>{es.incidents.states[estado]}</StatusBadge> : null}
          <StatusBadge tone={priorityTone(row.priority as IncidentPriority | null)}>
            {row.priority === null ? es.incidents.noPriority : es.incidents.priorities[row.priority as IncidentPriority]}
          </StatusBadge>
          <StatusBadge tone="neutral">{es.incidents.kinds[row.kind]}</StatusBadge>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t.description}>
          <p className="whitespace-pre-wrap text-sm text-text">{row.description}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-text-secondary">{t.category}</dt>
            <dd>{es.incidents.categories[row.category as keyof typeof es.incidents.categories] ?? row.category}</dd>
            {row.impact ? (
              <>
                <dt className="text-text-secondary">{es.help.incidents.impact}</dt>
                <dd>{es.incidents.impacts[row.impact as keyof typeof es.incidents.impacts] ?? row.impact}</dd>
              </>
            ) : null}
            <dt className="text-text-secondary">{t.openedBy}</dt>
            <dd>{row.opened_by_name ?? row.opened_by_email}</dd>
            <dt className="text-text-secondary">{t.openedAt}</dt>
            <dd>{cuando(row.opened_at)}</dd>
            <dt className="text-text-secondary">{t.device}</dt>
            <dd>{row.device ?? "—"}</dd>
            <dt className="text-text-secondary">{t.appVersion}</dt>
            <dd>{row.app_version ?? "—"}</dd>
            <dt className="text-text-secondary">{t.attention}</dt>
            <dd>
              {row.kind === "error"
                ? `${t.firstResponse(row.first_response_minutes)} · ${t.resolution(row.resolution_minutes)}`
                : "—"}
            </dd>
          </dl>
          {row.status_reason ? (
            <p className="mt-4 rounded-[10px] bg-soft-surface p-3 text-sm">
              <span className="font-semibold">{t.statusReason}:</span> {row.status_reason}
            </p>
          ) : null}
          {row.help_query ? (
            <p className="mt-2 text-sm text-text-secondary">
              {t.helpQuery}: «{row.help_query}»
            </p>
          ) : null}
          <div className="mt-4">
            <p className="text-xs font-semibold text-text-secondary">{t.clientContext}</p>
            {contexto.length === 0 ? (
              <p className="text-xs text-text-secondary">{t.clientContextEmpty}</p>
            ) : (
              <ul className="mt-1 text-xs text-text">
                {contexto.map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-4">
            <Link href={`/administracion/espacios`} className="text-sm text-cuotly-green underline">
              {t.openSpace}
            </Link>
          </p>
        </Card>

        <Card title={t.thread}>
          {mensajes.length === 0 ? (
            <p className="text-sm text-text-secondary">{t.threadEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {mensajes.map((m) => (
                <li key={m.id} className="rounded-[10px] bg-soft-surface p-3 text-sm">
                  <p className="text-xs text-text-secondary">
                    {m.author_side === "platform" ? t.sidePlatform : t.sideSpace} · {m.author_name ?? m.author_email} ·{" "}
                    {cuando(m.created_at)}
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
                    <span className="text-xs text-text-secondary">
                      ({Math.ceil(a.size_bytes / 1024)} KB · {a.uploader_side === "platform" ? t.sidePlatform : t.sideSpace})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            {estado ? <IncidentForms incidentId={row.id} state={estado} /> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
