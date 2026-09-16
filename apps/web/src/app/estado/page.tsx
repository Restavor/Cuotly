import Link from "next/link";

import { Logo } from "@/components/Logo";
import { StatusBadge } from "@/components/ui";
import { type StatusSeverity, componentDisplayState } from "@/core/support";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { statusSnapshot } from "@/services/support-gateway";

/**
 * La página pública de estado (§133, §157, RN-SOP-12). Se lee sin sesión:
 * `platform_status_snapshot()` es la única función del proyecto abierta a
 * `anon`, y devuelve recuentos agregados y lo declarado, sin nada de
 * ningún espacio ni quién lo declaró.
 *
 * De cada componente se dice de dónde sale su estado. Autenticación y
 * archivos no se miden desde la base y aquí no se les inventa un
 * "operativo": se dice "sin medición automática" (CLAUDE.md, P6).
 */
export const dynamic = "force-dynamic";

function cuando(value: string | null | undefined): string {
  return !value ? "—" : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" });
}

function tono(state: ReturnType<typeof componentDisplayState>): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (state) {
    case "operational":
      return "success";
    case "degraded":
    case "maintenance":
      return "warning";
    case "outage":
      return "danger";
    case "unmeasured":
      return "neutral";
  }
}

function detalleMedido(component: string, detail: Readonly<Record<string, unknown>>): string | null {
  const t = es.statusPage.measuredDetails;
  if (detail.reason === "responds") return t.responds;
  if (detail.reason === "nothing_connected") return t.nothingConnected;
  if (component === "notifications") return t.deliveries(Number(detail.dead_24h ?? 0), Number(detail.stuck_over_1h ?? 0));
  if (component === "integrations") return t.integrations(Number(detail.failing ?? 0), Number(detail.connected ?? 0));
  return null;
}

export default async function PublicStatusPage() {
  const supabase = await createClient();
  const t = es.statusPage;

  let snapshot;
  try {
    snapshot = await statusSnapshot(supabase);
  } catch {
    snapshot = null;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Logo />
      <h1 className="mt-4 text-2xl font-bold text-primary-dark">{t.title}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t.subtitle}</p>

      {snapshot === null ? (
        <p role="status" className="rounded-[10px] bg-danger/10 p-3 text-sm text-text">
          {t.loadError}
        </p>
      ) : (
        <>
          <p className="mb-4 text-xs text-text-secondary">
            {t.generatedAt}: {cuando(snapshot.generated_at)}
          </p>

          <ul className="space-y-3">
            {snapshot.components.map((c) => {
              const declared = (c.declared ?? []).map((d) => ({ severity: d.severity as StatusSeverity }));
              const state = componentDisplayState({
                component: c.component,
                measured: c.measured,
                measuredState: c.measured_state,
                declared,
              });
              const medido = c.measured ? detalleMedido(c.component, c.measured_detail) : null;
              return (
                <li key={c.component} className="rounded-[20px] border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-semibold text-text">{t.components[c.component]}</span>
                    <StatusBadge tone={tono(state)}>{t.states[state]}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    {c.measured ? `${t.sourceMeasured}${medido ? `: ${medido}` : ""}` : t.sourceUnmeasured}
                  </p>
                  {(c.declared ?? []).map((d) => (
                    <p key={d.started_at} className="mt-2 rounded-[10px] bg-soft-surface p-2 text-sm">
                      <span className="font-semibold">{t.sourceDeclared}</span> · {t.severities[d.severity]}
                      {d.security ? <> · <span className="font-semibold text-danger">{t.securityLabel}</span></> : null} · {d.title}
                      {d.body ? ` — ${d.body}` : ""} <span className="text-xs text-text-secondary">({t.since} {cuando(d.started_at)})</span>
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-primary-dark">{t.supportTitle}</h2>
            <p className="text-sm text-text">{snapshot.support_open_now ? t.supportOpen : t.supportClosed}</p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-primary-dark">{t.historyTitle}</h2>
            {snapshot.history.length === 0 ? (
              <p className="text-sm text-text-secondary">{t.historyEmpty}</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {snapshot.history.map((e) => (
                  <li key={e.id}>
                    <span className="text-text-secondary">
                      {cuando(e.started_at)} → {cuando(e.resolved_at)}
                    </span>{" "}
                    <span className="font-semibold">{t.components[e.component]}</span> · {t.severities[e.severity]}
                    {e.security ? <> · <span className="font-semibold text-danger">{t.securityLabel}</span></> : null} · {e.title}
                    {e.resolution_note ? <span className="text-text-secondary"> ({e.resolution_note})</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="mt-10">
        <Link href="/" className="text-sm text-cuotly-green underline">
          {t.backToApp}
        </Link>
      </p>
    </main>
  );
}
