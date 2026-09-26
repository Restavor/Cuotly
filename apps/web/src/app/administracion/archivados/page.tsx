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
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { listArchived, myPlatformAccess, type PlatformArchivedRow } from "@/services/platform-gateway";

import { PermanentDeleteButton, RecoverButton } from "./ArchivedActions";

/**
 * Decisión 82 · Archivados (RN-ADM-22): lo archivado a mano —por Cuotly,
 * por el propietario de un espacio o por el equipo de un restaurante—,
 * separado de lo activo. Cada fila, con Recuperar (un clic) y Eliminar
 * (definitivo, con confirmación).
 *
 * La lista la da `platform_list_archived()`, que exige ser de la
 * plataforma con la sesión en dos pasos; los botones se pintan a quien
 * tiene el permiso fino y la base lo vuelve a comprobar.
 */
export const dynamic = "force-dynamic";

const t = es.platformAdmin.archived;

function dia(value: string | null): string {
  return value === null ? t.noDate : enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short" });
}

function Seccion({
  kind,
  titulo,
  filas,
  vacioTitulo,
  vacioMotivo,
  puedeActuar,
}: {
  kind: PlatformArchivedRow["kind"];
  titulo: string;
  filas: readonly PlatformArchivedRow[];
  vacioTitulo: string;
  vacioMotivo: string;
  puedeActuar: boolean;
}) {
  const esRestaurante = kind === "establishment";
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text">{titulo}</h2>
      {filas.length === 0 ? (
        <EmptyState title={vacioTitulo} description={vacioMotivo} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.name}</TableHeaderCell>
              {esRestaurante ? <TableHeaderCell>{t.space}</TableHeaderCell> : null}
              <TableHeaderCell>{t.archivedBy}</TableHeaderCell>
              <TableHeaderCell>{t.archivedAt}</TableHeaderCell>
              <TableHeaderCell>{t.reason}</TableHeaderCell>
              {puedeActuar ? <TableHeaderCell>{t.actions}</TableHeaderCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {filas.map((row) => (
              <TableRow key={`${row.kind}:${row.id}`}>
                <TableCell>
                  <span className="block font-medium text-text">{row.name}</span>
                  <span className="block text-xs text-text-secondary">
                    {row.kind === "space" ? `/${row.space_slug}` : row.code}
                  </span>
                </TableCell>
                {esRestaurante ? (
                  <TableCell>
                    <span className="block text-text">{row.space_name}</span>
                    <span className="block text-xs text-text-secondary">/{row.space_slug}</span>
                  </TableCell>
                ) : null}
                <TableCell>
                  <StatusBadge tone={row.archived_by === "platform" ? "danger" : "neutral"}>
                    {t.by[row.archived_by]}
                  </StatusBadge>
                </TableCell>
                <TableCell>{dia(row.archived_at)}</TableCell>
                <TableCell>
                  {row.reason ?? <span className="text-text-secondary">{t.noReason}</span>}
                </TableCell>
                {puedeActuar ? (
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <RecoverButton kind={row.kind} id={row.id} />
                      <PermanentDeleteButton kind={row.kind} id={row.id} name={row.name} />
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export default async function AdminArchivedPage() {
  const supabase = await createClient();

  let rows: readonly PlatformArchivedRow[];
  let puedeActuar = false;
  try {
    const [lista, access] = await Promise.all([listArchived(supabase), myPlatformAccess(supabase)]);
    rows = lista;
    puedeActuar = canDeleteAccounts(access);
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
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
        {!puedeActuar ? (
          <p className="mt-1 text-sm text-text-secondary">{es.platformAdmin.deletion.noPermissionHint}</p>
        ) : null}
      </header>

      <Seccion
        kind="space"
        titulo={t.spacesTitle}
        filas={rows.filter((row) => row.kind === "space")}
        vacioTitulo={t.emptySpacesTitle}
        vacioMotivo={t.emptySpacesReason}
        puedeActuar={puedeActuar}
      />
      <Seccion
        kind="establishment"
        titulo={t.establishmentsTitle}
        filas={rows.filter((row) => row.kind === "establishment")}
        vacioTitulo={t.emptyEstablishmentsTitle}
        vacioMotivo={t.emptyEstablishmentsReason}
        puedeActuar={puedeActuar}
      />
    </div>
  );
}
