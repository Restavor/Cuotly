import Link from "next/link";

import { Card, EmptyState, ErrorState, StatusBadge } from "@/components/ui";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { statusSnapshot } from "@/services/support-gateway";

import { AddHolidayForm, DeclareEventForm, ResolveEventForm, RetireHolidayForm } from "./StatusForms";

/**
 * El estado de Cuotly visto desde dentro (RN-SOP-13): declarar y resolver
 * eventos sobre los cinco componentes, y los festivos del horario humano
 * de §132 (RN-SOP-06). Lo que aquí se declara es lo que la página pública
 * enseña; lo medido lo calcula la misma instantánea.
 */
export const dynamic = "force-dynamic";

function cuando(value: string | null | undefined): string {
  return !value ? "—" : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short", timeStyle: "short" });
}

export default async function AdminStatusPage() {
  const supabase = await createClient();
  const t = es.platformAdmin.status;

  let snapshot;
  try {
    snapshot = await statusSnapshot(supabase);
  } catch (fallo) {
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }

  // La tabla la lee la plataforma (política); columnas enumeradas.
  const { data: festivos } = await supabase
    .from("platform_holidays")
    .select("id, holiday_date, name, removed_at, removal_reason")
    .order("holiday_date");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
        <Link href="/estado" className="text-sm text-cuotly-green underline">
          {t.publicLink}
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t.declareTitle}>
          <p className="mb-3 text-sm text-text-secondary">{t.declareHint}</p>
          <DeclareEventForm />
        </Card>

        <Card title={t.openTitle}>
          {snapshot.open_events.length === 0 ? (
            <p className="text-sm text-text-secondary">{t.openEmpty}</p>
          ) : (
            <ul className="space-y-4">
              {snapshot.open_events.map((e) => (
                <li key={e.id} className="rounded-[10px] bg-soft-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={e.severity === "outage" ? "danger" : e.severity === "degraded" ? "warning" : "info"}>
                      {es.statusPage.severities[e.severity]}
                    </StatusBadge>
                    <span className="text-sm font-semibold">{es.statusPage.components[e.component]}</span>
                    <span className="text-xs text-text-secondary">
                      {es.statusPage.since} {cuando(e.started_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text">{e.title}</p>
                  {e.body ? <p className="text-sm text-text-secondary">{e.body}</p> : null}
                  <ResolveEventForm eventId={e.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t.historyTitle}>
        {snapshot.history.length === 0 ? (
          <EmptyState title={t.historyEmpty} />
        ) : (
          <ul className="space-y-2 text-sm">
            {snapshot.history.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-2">
                <span className="text-text-secondary">
                  {cuando(e.started_at)} → {cuando(e.resolved_at)}
                </span>
                <span className="font-semibold">{es.statusPage.components[e.component]}</span>
                <span>{es.statusPage.severities[e.severity]}</span>
                <span>· {e.title}</span>
                {e.resolution_note ? <span className="text-text-secondary">({e.resolution_note})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t.holidaysTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.holidaysHint}</p>
        <AddHolidayForm />
        {!festivos || festivos.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">{t.holidaysEmpty}</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {festivos.map((f) => (
              <li key={f.id} className="rounded-[10px] bg-soft-surface p-3">
                <span className="font-semibold">{f.holiday_date}</span> · {f.name}
                {f.removed_at ? (
                  <span className="ml-2 text-xs text-text-secondary">
                    ({t.retiredLabel}: {f.removal_reason})
                  </span>
                ) : (
                  <div className="mt-2">
                    <RetireHolidayForm holidayId={f.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
