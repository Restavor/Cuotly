import Link from "next/link";

import { ErrorState } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PANEL_BLOCKS, panelBlockHref, type PanelBlock } from "@/core/platform-admin";
import { es } from "@/i18n/es";
import { euros, gigabytes } from "@/i18n/money";
import { createClient } from "@/lib/supabase/server";
import { panelSummary, type PanelSummary } from "@/services/platform-gateway";

/**
 * El resumen del panel: los doce bloques de §128 (RN-ADM-04), cada uno con
 * su cifra real calculada por `platform_panel_summary()` y un enlace a la
 * pantalla que lo desarrolla. Desde el Hito 21 las incidencias también:
 * las que no están cerradas, con las críticas aparte (RN-SOP-15).
 */
export const dynamic = "force-dynamic";

const ICONS: Readonly<Record<PanelBlock, IconName>> = {
  users: "person",
  spaces: "building",
  space_requests: "request",
  subscriptions: "plans",
  revenue: "finance",
  active_trials: "clock",
  nonpayment: "alert",
  storage: "database",
  activity: "reports",
  incidents: "messages",
  support: "lock",
  audit: "document",
};

function cifra(block: PanelBlock, s: PanelSummary): string {
  switch (block) {
    case "users":
      return String(s.users_total);
    case "spaces":
      return String(s.spaces_total);
    case "space_requests":
      return String(s.requests_pending);
    case "subscriptions":
      return String(s.subscriptions_total);
    case "revenue":
      return euros(s.revenue_month_cents);
    case "active_trials":
      return String(s.spaces_trial);
    case "nonpayment":
      return String(s.overdue_charges);
    case "storage":
      return `${gigabytes(s.storage_bytes_total)} ${es.platformAdmin.unitsGb}`;
    case "activity":
      return String(s.activity_24h);
    case "incidents":
      return String(s.incidents ?? 0);
    case "support":
      return String(s.support_sessions_active);
    case "audit":
      return String(s.platform_audit_total);
  }
}

function detalle(block: PanelBlock, s: PanelSummary): string | null {
  switch (block) {
    case "nonpayment":
      return `${euros(s.overdue_cents)} ${es.platformAdmin.overdueAmount} · ${es.platformAdmin.declaredPending(s.declared_payments_pending)}`;
    case "spaces":
      return `${s.spaces_active} ${es.platformAdmin.spaces.statuses.active.toLowerCase()} · ${s.spaces_archived} ${es.platformAdmin.spaces.statuses.archived_nonpayment.split(" ")[0].toLowerCase()} · ${s.spaces_without_plan} ${es.platformAdmin.spaces.noPlan.toLowerCase()}`;
    case "revenue":
      return `${euros(s.revenue_total_cents)} en total`;
    case "support":
      return `${s.support_sessions_total} en total`;
    case "incidents":
      return es.platformAdmin.incidentsCritical(s.incidents_critical ?? 0);
    case "storage":
      // RN-SUB-13 (decisión 38): los que han llegado al 100 % de lo incluido.
      return es.platformAdmin.storageOverLimit(s.storage_over_limit ?? 0);
    default:
      return null;
  }
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  let summary: PanelSummary;
  try {
    summary = await panelSummary(supabase);
  } catch (fallo) {
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.platformAdmin.title}</h1>
        <p className="text-sm text-text-secondary">{es.platformAdmin.subtitle}</p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PANEL_BLOCKS.map((block) => {
          const href = panelBlockHref(block);
          const label = es.platformAdmin.blocks[block];
          const hint = es.platformAdmin.blockHints[block];
          const extra = detalle(block, summary);

          return (
            <li key={block}>
              <Link
                href={href}
                className="flex h-full items-center gap-4 rounded-[20px] border border-border bg-surface p-5 transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-info/10 text-info"
                >
                  <Icon name={ICONS[block]} className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-2xl font-bold leading-tight text-primary-dark">
                    {cifra(block, summary)}
                  </span>
                  <span className="block text-sm text-text">{label}</span>
                  <span className="mt-0.5 block text-xs text-text-secondary">{extra ?? hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
