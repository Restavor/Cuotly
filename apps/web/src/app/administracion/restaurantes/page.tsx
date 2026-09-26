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
import { isSpaceReadOnly, type SpaceCuotlyState } from "@/core/cuotly-subscription";
import { canDeleteAccounts } from "@/core/platform-admin";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import {
  listEstablishments,
  myPlatformAccess,
  type PlatformEstablishmentRow,
} from "@/services/platform-gateway";

import { ArchiveButton } from "../DeletionForms";

/**
 * Decisión 81 · los restaurantes de todos los espacios, y archivarlos
 * (RN-ADM-17). La lista la da `platform_list_establishments()`, que exige
 * ser de la plataforma con la sesión en dos pasos; los botones se pintan a
 * quien tiene el permiso, y la base lo vuelve a comprobar.
 *
 * Decisión 82 (RN-ADM-25) · aquí solo los que no están archivados, cada
 * uno con su estado, y "Impago" si tiene cobros vencidos: un pausado por
 * impago no es un pausado cualquiera (RN-FIN-13). Los archivados —por
 * Cuotly o por su equipo— están en Archivados.
 */
export const dynamic = "force-dynamic";

type StatusKey = keyof typeof es.space.statuses;

function estado(status: string): string {
  return status in es.space.statuses ? es.space.statuses[status as StatusKey] : status;
}

function tono(row: PlatformEstablishmentRow): "success" | "info" | "warning" | "danger" | "neutral" {
  if (row.has_overdue_debt) return "danger";
  if (row.status === "active") return "success";
  if (row.status === "configuring") return "info";
  if (["paused", "suspended", "ending", "read_only"].includes(row.status)) return "warning";
  return "neutral";
}

export default async function AdminEstablishmentsPage() {
  const supabase = await createClient();
  const t = es.platformAdmin.deletion;
  const tr = t.establishments;

  let rows: readonly PlatformEstablishmentRow[];
  let puedeEliminar = false;
  try {
    const [lista, access] = await Promise.all([listEstablishments(supabase), myPlatformAccess(supabase)]);
    rows = lista.filter((row) => row.status !== "archived");
    puedeEliminar = canDeleteAccounts(access);
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
        <h1 className="text-2xl font-bold text-primary-dark">{tr.title}</h1>
        <p className="text-sm text-text-secondary">{tr.subtitle}</p>
        {!puedeEliminar ? <p className="mt-1 text-sm text-text-secondary">{t.noPermissionHint}</p> : null}
      </header>

      {rows.length === 0 ? (
        <EmptyState title={tr.emptyTitle} description={tr.emptyReason} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{tr.name}</TableHeaderCell>
              <TableHeaderCell>{tr.space}</TableHeaderCell>
              <TableHeaderCell>{tr.status}</TableHeaderCell>
              {puedeEliminar ? <TableHeaderCell>{tr.actions}</TableHeaderCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <span className="block font-medium text-text">{row.name}</span>
                  <span className="block text-xs text-text-secondary">{row.code}</span>
                </TableCell>
                <TableCell>
                  <span className="block text-text">{row.space_name}</span>
                  <span className="block text-xs text-text-secondary">/{row.space_slug}</span>
                  {row.space_status !== null && isSpaceReadOnly(row.space_status as SpaceCuotlyState) ? (
                    <span className="block text-xs text-danger">
                      {tr.spaceStatus(es.platformAdmin.spaces.statuses[row.space_status as SpaceCuotlyState])}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge tone={tono(row)}>{estado(row.status)}</StatusBadge>
                    {row.has_overdue_debt ? (
                      <span title={tr.overdueHint}>
                        <StatusBadge tone="danger">{tr.overdueBadge}</StatusBadge>
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                {puedeEliminar ? (
                  <TableCell>
                    <ArchiveButton
                      kind="establishment"
                      id={row.id}
                      name={row.name}
                      title={t.establishmentTitle(row.name)}
                      hint={t.establishmentHint}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
