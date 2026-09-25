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
import { canDeleteAccounts } from "@/core/platform-admin";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import {
  listEstablishments,
  myPlatformAccess,
  type PlatformEstablishmentRow,
} from "@/services/platform-gateway";

import { DeleteButton, RestoreButton } from "../DeletionForms";

/**
 * Decisión 81 · los restaurantes de todos los espacios, y eliminarlos o
 * recuperarlos (RN-ADM-17). La lista la da `platform_list_establishments()`,
 * que exige ser de la plataforma con la sesión en dos pasos; los botones
 * se pintan a quien tiene el permiso, y la base lo vuelve a comprobar.
 */
export const dynamic = "force-dynamic";

type StatusKey = keyof typeof es.space.statuses;

function estado(status: string): string {
  return status in es.space.statuses ? es.space.statuses[status as StatusKey] : status;
}

export default async function AdminEstablishmentsPage() {
  const supabase = await createClient();
  const t = es.platformAdmin.deletion;
  const tr = t.establishments;

  let rows: readonly PlatformEstablishmentRow[];
  let puedeEliminar = false;
  try {
    const [lista, access] = await Promise.all([listEstablishments(supabase), myPlatformAccess(supabase)]);
    rows = lista;
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
                </TableCell>
                <TableCell>
                  {row.platform_archived_at ? (
                    <StatusBadge tone="danger">{tr.deletedBadge}</StatusBadge>
                  ) : (
                    <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>
                      {estado(row.status)}
                    </StatusBadge>
                  )}
                </TableCell>
                {puedeEliminar ? (
                  <TableCell>
                    {row.platform_archived_at ? (
                      <RestoreButton
                        kind="establishment"
                        id={row.id}
                        name={row.name}
                        hint={t.restoreEstablishmentHint}
                      />
                    ) : (
                      <DeleteButton
                        kind="establishment"
                        id={row.id}
                        name={row.name}
                        title={t.establishmentTitle(row.name)}
                        hint={t.establishmentHint}
                      />
                    )}
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
