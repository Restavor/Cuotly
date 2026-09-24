"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  Button,
  Card,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import { enZona } from "@/i18n/dates";
import { readableSize } from "@/i18n/money";

import { INITIAL_SERVICE_STATUS } from "./service-status-action-state";
import { createEstablishmentBackup } from "./service-status-actions";

const t = es.establishmentSheet;

export interface BackupRow {
  readonly id: string;
  readonly takenAt: string;
  readonly sizeBytes: number;
  readonly counts: {
    readonly requests?: number;
    readonly menus?: number;
    readonly files?: number;
    readonly conversations?: number;
  };
  /** La del barrido diario (RN-BCK-02), que no la pidió nadie. */
  readonly automatic?: boolean;
  /** Quién la generó a mano, o `null` si su perfil no se puede leer. */
  readonly authorName?: string | null;
}

/**
 * M83 · "Copias de seguridad": la tabla de copias y, a la derecha, el
 * detalle de la elegida (`?copia=`, la más reciente si no hay ninguna)
 * con lo que se puede recuperar de ella, sus limitaciones y su descarga.
 *
 * Lo que esta pantalla dice y el dibujo no: **restaurar es descargar, y lo
 * aplica el equipo a mano** (RN-BCK-04). Va arriba y con todas las letras,
 * porque es lo que separa esta pantalla de la que cualquiera espera: no hay
 * botón de deshacer. Por eso tampoco está "Revisar restauración".
 *
 * Y lo segundo: la copia lleva el **inventario** de los archivos, no los
 * archivos (RN-BCK-09). "Imágenes (archivos exportables)" del dibujo sería
 * prometer de más justo en la pantalla donde más caro sale.
 *
 * Tampoco está la columna "Última ejecución": una copia se genera una vez,
 * y su fecha ya es la primera columna. El estado es siempre "Correcta":
 * una copia se escribe en una transacción y hasta que termina no existe
 * (RN-BCK-08), así que no hay "Pendiente" que enseñar.
 */
export function BackupsBlock({
  establishmentId,
  backups,
  timezone,
  canManage,
  blockHref,
  selectedId = null,
}: {
  establishmentId: string;
  backups: readonly BackupRow[];
  timezone: string;
  canManage: boolean;
  /** La dirección del bloque, con `vista` y `bloque`; se le añade `copia`. */
  blockHref: string;
  /** La copia abierta a la derecha (`?copia=`). */
  selectedId?: string | null;
}) {
  const [state, action, pending] = useActionState(
    createEstablishmentBackup,
    INITIAL_SERVICE_STATUS,
  );

  const elegida = backups.find((copia) => copia.id === selectedId) ?? backups[0] ?? null;
  const cuando = (copia: BackupRow) =>
    enZona(copia.takenAt, timezone, { dateStyle: "medium", timeStyle: "short" });
  const autor = (copia: BackupRow) =>
    copia.automatic ? t.backupsAutomatic : (copia.authorName ?? t.backupsUnknownAuthor);
  const separador = blockHref.includes("?") ? "&" : "?";

  return (
    <Card title={t.backupsTitle}>
      <p className="mb-2 text-sm text-text-secondary">{t.backupsHint}</p>
      <p className="mb-4 rounded-[10px] bg-soft-surface p-3 text-sm text-text">
        {t.backupsNoRestore}
      </p>

      {elegida === null ? (
        <EmptyState title={t.backupsEmptyTitle} description={t.backupsEmptyReason} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.backupsDateColumn}</TableHeaderCell>
                <TableHeaderCell>{t.backupsAuthorColumn}</TableHeaderCell>
                <TableHeaderCell>{t.backupsContentColumn}</TableHeaderCell>
                <TableHeaderCell>{t.backupsSizeColumn}</TableHeaderCell>
                <TableHeaderCell>{t.backupsStateColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {backups.map((copia) => (
                <TableRow key={copia.id} highlight={copia.id === elegida.id}>
                  <TableCell>
                    <Link
                      href={`${blockHref}${separador}copia=${copia.id}`}
                      aria-current={copia.id === elegida.id ? "true" : undefined}
                      className="font-medium text-text underline-offset-2 hover:underline"
                    >
                      {cuando(copia)}
                    </Link>
                  </TableCell>
                  <TableCell>{autor(copia)}</TableCell>
                  <TableCell>
                    <span className="text-text-secondary">
                      {t.backupsContents(
                        copia.counts.requests ?? 0,
                        copia.counts.menus ?? 0,
                        copia.counts.files ?? 0,
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{readableSize(copia.sizeBytes)}</TableCell>
                  <TableCell>
                    <StatusBadge tone="success">{t.backupsStateDone}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <aside
            aria-label={t.backupsDetailTitle}
            className="space-y-4 rounded-[14px] border border-border p-4 text-sm"
          >
            <h3 className="font-semibold text-text">{t.backupsDetailTitle}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-text-secondary">{t.backupsDateColumn}</dt>
              <dd className="text-text">{cuando(elegida)}</dd>
              <dt className="text-text-secondary">{t.backupsAuthorColumn}</dt>
              <dd className="text-text">{autor(elegida)}</dd>
              <dt className="text-text-secondary">{t.backupsSizeColumn}</dt>
              <dd className="text-text">{readableSize(elegida.sizeBytes)}</dd>
              <dt className="text-text-secondary">{t.backupsStateColumn}</dt>
              <dd className="text-text">{t.backupsStateDone}</dd>
            </dl>

            <div>
              <p className="mb-2 font-semibold text-text">{t.backupsRecoverableTitle}</p>
              <ul className="space-y-1.5 text-text-secondary">
                {t
                  .backupsRecoverable({
                    requests: elegida.counts.requests ?? 0,
                    menus: elegida.counts.menus ?? 0,
                    files: elegida.counts.files ?? 0,
                    conversations: elegida.counts.conversations ?? 0,
                  })
                  .map((linea) => (
                    <li key={linea} className="flex items-start gap-2">
                      <Icon name="check" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                      {linea}
                    </li>
                  ))}
              </ul>
            </div>

            <div>
              <p className="mb-2 font-semibold text-text">{t.backupsLimitsTitle}</p>
              <ul className="space-y-1.5 text-text-secondary">
                {t.backupsLimits.map((linea) => (
                  <li key={linea} className="flex items-start gap-2">
                    <Icon name="info" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                    {linea}
                  </li>
                ))}
              </ul>
            </div>

            {/* RN-BCK-05 · la descarga pasa por una ruta que comprueba el
                permiso y deja el apunte de RN-BCK-06; nunca por una
                dirección pública. */}
            <a
              href={`/api/copias/${elegida.id}`}
              download
              className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark"
            >
              <Icon name="download" aria-hidden="true" className="h-4 w-4" />
              {t.backupsDownloadSelected}
            </a>
          </aside>
        </div>
      )}

      {canManage ? (
        <form action={action} className="mt-4 space-y-2">
          <input type="hidden" name="establishmentId" value={establishmentId} />
          {state.error ? (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {state.done ? (
            <p role="status" className="text-sm text-success">
              {t.backupsDone}
            </p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t.servicePending : t.backupsCreate}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
