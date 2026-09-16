import Link from "next/link";

import {
  EmptyState,
  ErrorState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { canManageSubscriptions, canOpenSupport } from "@/core/platform-admin";
import { isSpaceReadOnly, type SpaceCuotlyState } from "@/core/cuotly-subscription";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros, gigabytes } from "@/i18n/money";
import { createClient } from "@/lib/supabase/server";
import { listSpaces, myPlatformAccess, type PlatformSpaceRow } from "@/services/platform-gateway";

import { ReactivateForm, StartSupportForm } from "./SpaceActions";

/**
 * Espacios, suscripciones, pruebas activas, impagos y almacenamiento
 * (§128): la misma fila de `platform_list_spaces()` mirada desde cinco
 * sitios (RN-ADM-04). Y desde aquí se abre Modo soporte (RN-ADM-06): el
 * formulario se pinta a quien tiene el permiso, y `start_support_session()`
 * lo vuelve a comprobar.
 */
export const dynamic = "force-dynamic";

function dia(value: string | null): string {
  return value === null ? "—" : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short" });
}

function tono(status: SpaceCuotlyState): "success" | "info" | "danger" {
  if (status === "active") return "success";
  if (status === "trial") return "info";
  return "danger";
}

export default async function AdminSpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const supabase = await createClient();

  let spaces: readonly PlatformSpaceRow[];
  let puedeSoporte = false;
  let puedeSuscripciones = false;
  try {
    const [rows, access] = await Promise.all([listSpaces(supabase), myPlatformAccess(supabase)]);
    spaces = rows;
    puedeSoporte = canOpenSupport(access);
    puedeSuscripciones = canManageSubscriptions(access);
  } catch (fallo) {
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }

  const t = es.platformAdmin.spaces;
  const visibles =
    filtro === "prueba"
      ? spaces.filter((s) => s.cuotly_status === "trial")
      : filtro === "impago"
        ? spaces.filter((s) => s.overdue_cents > 0 || s.cuotly_status === "archived_nonpayment")
        : spaces;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
        {!puedeSoporte ? (
          <p className="mt-1 text-sm text-text-secondary">{es.platformAdmin.support.noPermissionHint}</p>
        ) : null}
      </header>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/administracion/espacios" className="text-cuotly-green underline">
          {es.platformAdmin.blocks.spaces}
        </Link>
        <Link href="/administracion/espacios?filtro=prueba" className="text-cuotly-green underline">
          {es.platformAdmin.blocks.active_trials}
        </Link>
        <Link href="/administracion/espacios?filtro=impago" className="text-cuotly-green underline">
          {es.platformAdmin.blocks.nonpayment}
        </Link>
      </nav>

      {visibles.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.name}</TableHeaderCell>
              <TableHeaderCell>{t.status}</TableHeaderCell>
              <TableHeaderCell>{t.plan}</TableHeaderCell>
              <TableHeaderCell>{t.owners}</TableHeaderCell>
              <TableHeaderCell>{t.usage}</TableHeaderCell>
              <TableHeaderCell>{t.storage}</TableHeaderCell>
              <TableHeaderCell>{t.debt}</TableHeaderCell>
              <TableHeaderCell>{t.actions}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibles.map((row) => {
              const status = row.cuotly_status as SpaceCuotlyState | null;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="block font-medium text-text">{row.name}</span>
                    <span className="block text-xs text-text-secondary">/{row.slug}</span>
                    {row.support_active ? (
                      <StatusBadge tone="info" icon="lock">
                        {t.supportActive}
                      </StatusBadge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {status === null ? (
                      <span className="text-sm text-text-secondary" title={t.noPlanHint}>
                        {t.noPlan}
                      </span>
                    ) : (
                      <>
                        <StatusBadge tone={tono(status)}>{t.statuses[status]}</StatusBadge>
                        <span className="mt-1 block text-xs text-text-secondary">
                          {status === "trial"
                            ? `${t.trialEnds} ${dia(row.cuotly_trial_ends_at)}`
                            : isSpaceReadOnly(status)
                              ? `${t.reactivateBy} ${dia(row.cuotly_reactivation_deadline_at)}`
                              : `${t.period} ${dia(row.current_period_end)}`}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.cuotly_plan === null
                      ? "—"
                      : es.cuotlySubscription.plans[row.cuotly_plan as "pro" | "agency"]}
                    {row.pending_plan ? (
                      <span className="block text-xs text-text-secondary">
                        {es.cuotlySubscription.pendingPlanLabel}{" "}
                        {es.cuotlySubscription.plans[row.pending_plan as "pro" | "agency"]}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.owner_emails ?? "—"}</TableCell>
                  <TableCell>{t.usageValue(row.active_establishments, row.internal_users)}</TableCell>
                  <TableCell>
                    {row.storage_limit_bytes === null ? (
                      <span title={t.storageNoLimit}>
                        {gigabytes(row.storage_bytes)} {es.platformAdmin.unitsGb}
                      </span>
                    ) : (
                      <>
                        {t.storageOf(gigabytes(row.storage_bytes), gigabytes(row.storage_limit_bytes))}
                        {row.storage_bytes >= row.storage_limit_bytes ? (
                          <StatusBadge tone="danger">{t.storageAt100}</StatusBadge>
                        ) : row.storage_bytes * 100 >= row.storage_limit_bytes * 80 ? (
                          <StatusBadge tone="warning">{t.storageAt80}</StatusBadge>
                        ) : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.outstanding_cents > 0 ? euros(row.outstanding_cents) : "—"}
                    {row.overdue_cents > 0 ? (
                      <span className="block text-xs text-danger">
                        {euros(row.overdue_cents)} {es.platformAdmin.overdueAmount}
                      </span>
                    ) : null}
                    {row.has_pending_declaration ? (
                      <StatusBadge tone="info">{t.declaredPending}</StatusBadge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      {puedeSoporte ? (
                        <StartSupportForm spaceId={row.id} spaceSlug={row.slug} spaceName={row.name} />
                      ) : null}
                      {puedeSuscripciones && status !== null && isSpaceReadOnly(status) ? (
                        <ReactivateForm spaceId={row.id} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
